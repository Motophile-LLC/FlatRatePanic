import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT_DIR = process.cwd();
const RAW_DIR = path.join(ROOT_DIR, 'raw-sheets');
const OUT_CHARACTERS_DIR = path.join(ROOT_DIR, 'public', 'sprites', 'characters');
const MANIFEST_PATH = path.join(ROOT_DIR, 'public', 'sprites', 'manifest.json');
const TARGET_HEIGHT = 512;

const DEFAULT_POSES = [
  'idle',
  'wrenching',
  'panicked',
  'electrocuted',
  'facepalm',
  'celebrate',
];

function parseCliArgs(argv) {
  const options = {
    chromaKey: null,
    tolerance: 72,
    mode: null,
    cols: null,
    rows: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--chroma-key' && argv[i + 1]) {
      options.chromaKey = argv[++i];
    } else if (arg === '--tolerance' && argv[i + 1]) {
      options.tolerance = Number(argv[++i]) || 72;
    } else if (arg === '--mode' && argv[i + 1]) {
      options.mode = argv[++i];
    } else if (arg === '--cols' && argv[i + 1]) {
      options.cols = Number(argv[++i]) || null;
    } else if (arg === '--rows' && argv[i + 1]) {
      options.rows = Number(argv[++i]) || null;
    }
  }

  return options;
}

function parseHexColor(hex) {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function isGreenDominantKey(keyRgb) {
  return keyRgb[1] > 180 && keyRgb[1] > keyRgb[0] + 60 && keyRgb[1] > keyRgb[2] + 60;
}

function matchesChromaKey(r, g, b, keyRgb, tolerance, isGreenKey) {
  const dr = r - keyRgb[0];
  const dg = g - keyRgb[1];
  const db = b - keyRgb[2];
  const dist = Math.sqrt(dr * dr + dg * dg + db * db);
  if (dist <= tolerance) return true;

  if (isGreenKey) {
    // Handles slightly shaded or anti-aliased bright neon green screen fills without touching whites/blacks/skin
    const greenExcess = g - Math.max(r, b);
    if (g > 115 && greenExcess > 48 && r < 145 && b < 145) {
      return true;
    }
  }
  return false;
}

function removeChromaKeyAndDespill(rgbaBuffer, width, height, keyRgb, tolerance) {
  const isGreenKey = isGreenDominantKey(keyRgb);
  const total = width * height;
  const visited = new Uint8Array(total);
  const bgMask = new Uint8Array(total);

  const isKeyPixel = (idx) => {
    const off = idx * 4;
    if (rgbaBuffer[off + 3] < 20) return true;
    return matchesChromaKey(
      rgbaBuffer[off],
      rgbaBuffer[off + 1],
      rgbaBuffer[off + 2],
      keyRgb,
      tolerance,
      isGreenKey,
    );
  };

  // Flood fill from outer edges first, plus enclosed bright chroma islands
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const enqueue = (idx) => {
    if (!visited[idx] && isKeyPixel(idx)) {
      visited[idx] = 1;
      bgMask[idx] = 1;
      queue[tail++] = idx;
    }
  };

  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    enqueue(y * width);
    enqueue(y * width + (width - 1));
  }

  while (head < tail) {
    const idx = queue[head++];
    const x = idx % width;
    const y = (idx - x) / width;
    if (x > 0) enqueue(idx - 1);
    if (x < width - 1) enqueue(idx + 1);
    if (y > 0) enqueue(idx - width);
    if (y < height - 1) enqueue(idx + width);
  }

  // Also clear pure enclosed chroma key pockets (e.g. between arms/legs)
  for (let i = 0; i < total; i++) {
    if (bgMask[i]) {
      rgbaBuffer[i * 4 + 3] = 0;
      continue;
    }
    if (isKeyPixel(i)) {
      rgbaBuffer[i * 4 + 3] = 0;
      bgMask[i] = 1;
    }
  }

  // Soft edge feather + green spill suppression on 1px boundary around foreground
  if (isGreenKey) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const off = idx * 4;
        if (rgbaBuffer[off + 3] === 0) continue;

        const touchesBg =
          bgMask[idx - 1] ||
          bgMask[idx + 1] ||
          bgMask[idx - width] ||
          bgMask[idx + width];

        if (touchesBg) {
          const r = rgbaBuffer[off];
          const g = rgbaBuffer[off + 1];
          const b = rgbaBuffer[off + 2];
          const maxRb = Math.max(r, b);
          if (g > maxRb + 16) {
            rgbaBuffer[off + 1] = Math.min(g, maxRb + 8);
            if (g - maxRb > 34) {
              rgbaBuffer[off + 3] = Math.round(rgbaBuffer[off + 3] * 0.45);
            }
          }
        }
      }
    }
  }
}

function findTrimBounds(rgbaBuffer, width, height, x0, y0, x1, y1, alphaThreshold = 20) {
  let minX = x1;
  let minY = y1;
  let maxX = x0 - 1;
  let maxY = y0 - 1;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const a = rgbaBuffer[(y * width + x) * 4 + 3];
      if (a >= alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function detectConnectedComponents(rgbaBuffer, width, height) {
  const total = width * height;
  const visited = new Uint8Array(total);
  const stack = new Int32Array(total);
  const rawBoxes = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (visited[start] || rgbaBuffer[start * 4 + 3] < 24) continue;

      let sp = 0;
      stack[sp++] = start;
      visited[start] = 1;

      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let pixelCount = 0;

      while (sp > 0) {
        const idx = stack[--sp];
        const cx = idx % width;
        const cy = (idx - cx) / width;
        pixelCount++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [
          cx > 0 ? idx - 1 : -1,
          cx < width - 1 ? idx + 1 : -1,
          cy > 0 ? idx - width : -1,
          cy < height - 1 ? idx + width : -1,
        ];

        for (const n of neighbors) {
          if (n >= 0 && !visited[n] && rgbaBuffer[n * 4 + 3] >= 24) {
            visited[n] = 1;
            stack[sp++] = n;
          }
        }
      }

      if (pixelCount >= 35) {
        rawBoxes.push({
          left: minX,
          top: minY,
          right: maxX,
          bottom: maxY,
          area: pixelCount,
        });
      }
    }
  }

  // Merge nearby small floating elements (sweat drops, lightning sparks) into closest large character box
  const majorBoxes = rawBoxes.filter((b) => b.area >= (width * height) * 0.006);
  const minorBoxes = rawBoxes.filter((b) => b.area < (width * height) * 0.006);

  for (const minor of minorBoxes) {
    const mx = (minor.left + minor.right) / 2;
    const my = (minor.top + minor.bottom) / 2;
    let best = null;
    let bestDist = Infinity;

    for (const major of majorBoxes) {
      const dx = Math.max(major.left - mx, 0, mx - major.right);
      const dy = Math.max(major.top - my, 0, my - major.bottom);
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = major;
      }
    }

    if (best && bestDist < Math.max(width, height) * 0.09) {
      best.left = Math.min(best.left, minor.left);
      best.top = Math.min(best.top, minor.top);
      best.right = Math.max(best.right, minor.right);
      best.bottom = Math.max(best.bottom, minor.bottom);
    }
  }

  // Sort top-to-bottom rows, left-to-right columns
  majorBoxes.sort((a, b) => {
    const rowDiff = a.top - b.top;
    if (Math.abs(rowDiff) > height * 0.16) return rowDiff;
    return a.left - b.left;
  });

  return majorBoxes.map((b) => ({
    left: b.left,
    top: b.top,
    width: b.right - b.left + 1,
    height: b.bottom - b.top + 1,
  }));
}

async function readSheetConfig(characterId) {
  const cfgPath = path.join(RAW_DIR, `${characterId}.config.json`);
  try {
    const raw = await fs.readFile(cfgPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function processSheet(fileName, cliOptions) {
  const characterId = path.basename(fileName, '.png');
  const fullPath = path.join(RAW_DIR, fileName);
  const config = await readSheetConfig(characterId);

  const { data, info } = await sharp(fullPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgba = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const { width, height } = info;

  // Detect whether image already has meaningful alpha or needs chroma key removal
  let transparentCount = 0;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] < 16) transparentCount++;
  }
  const alreadyTransparent = transparentCount / (width * height) > 0.12;

  const chromaHex = cliOptions.chromaKey || config.chromaKey || null;
  const tolerance = config.tolerance ?? cliOptions.tolerance;

  if (!alreadyTransparent || chromaHex) {
    const keyRgb = chromaHex
      ? parseHexColor(chromaHex)
      : [rgba[0], rgba[1], rgba[2]];
    removeChromaKeyAndDespill(rgba, width, height, keyRgb, tolerance);
  }

  const mode = cliOptions.mode || config.mode || 'grid';
  const poses = Array.isArray(config.poses) && config.poses.length > 0 ? config.poses : DEFAULT_POSES;

  let regions = [];

  if (mode === 'coords' && Array.isArray(config.coords)) {
    regions = config.coords.map((c, idx) => ({
      pose: c.pose || poses[idx] || `pose_${idx}`,
      box: { left: c.x, top: c.y, width: c.width, height: c.height },
    }));
  } else if (mode === 'components') {
    const boxes = detectConnectedComponents(rgba, width, height);
    regions = boxes.slice(0, poses.length).map((box, idx) => ({
      pose: poses[idx] || `pose_${idx}`,
      box,
    }));
  } else {
    const cols = cliOptions.cols || config.cols || (poses.length <= 2 ? 2 : poses.length <= 4 ? 2 : 3);
    const rows = cliOptions.rows || config.rows || Math.ceil(poses.length / cols);
    const cellW = Math.floor(width / cols);
    const cellH = Math.floor(height / rows);

    for (let i = 0; i < poses.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      if (row >= rows) break;

      const x0 = col * cellW;
      const y0 = row * cellH;
      const x1 = col === cols - 1 ? width : (col + 1) * cellW;
      const y1 = row === rows - 1 ? height : (row + 1) * cellH;
      const trimmed = findTrimBounds(rgba, width, height, x0, y0, x1, y1);
      if (trimmed) {
        regions.push({ pose: poses[i], box: trimmed });
      }
    }
  }

  const charOutDir = path.join(OUT_CHARACTERS_DIR, characterId);
  await fs.mkdir(charOutDir, { recursive: true });

  const processedCleanSheet = sharp(Buffer.from(rgba), {
    raw: { width, height, channels: 4 },
  });

  const charManifest = {};

  for (const { pose, box } of regions) {
    const clampedLeft = Math.max(0, Math.min(width - 1, box.left));
    const clampedTop = Math.max(0, Math.min(height - 1, box.top));
    const clampedW = Math.max(1, Math.min(width - clampedLeft, box.width));
    const clampedH = Math.max(1, Math.min(height - clampedTop, box.height));

    const tightBox =
      findTrimBounds(
        rgba,
        width,
        height,
        clampedLeft,
        clampedTop,
        clampedLeft + clampedW,
        clampedTop + clampedH,
      ) ?? { left: clampedLeft, top: clampedTop, width: clampedW, height: clampedH };

    const extracted = await processedCleanSheet
      .clone()
      .extract({
        left: tightBox.left,
        top: tightBox.top,
        width: tightBox.width,
        height: tightBox.height,
      })
      .toBuffer({ resolveWithObject: true });

    const trimW = extracted.info.width;
    const trimH = extracted.info.height;
    const scale = (TARGET_HEIGHT - 16) / Math.max(1, trimH);
    const resizedW = Math.max(1, Math.round(trimW * scale));
    const resizedH = TARGET_HEIGHT - 16;

    // Anchor at bottom-center with symmetric horizontal padding (even canvas width)
    const canvasW = Math.max(128, Math.ceil((resizedW + 24) / 2) * 2);
    const leftOffset = Math.floor((canvasW - resizedW) / 2);
    const topOffset = TARGET_HEIGHT - resizedH - 4;

    const resizedPng = await sharp(extracted.data, {
      raw: {
        width: trimW,
        height: trimH,
        channels: extracted.info.channels,
      },
    })
      .resize(resizedW, resizedH, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
      .png()
      .toBuffer();

    const outFileName = `${pose}.png`;
    const outPath = path.join(charOutDir, outFileName);

    await sharp({
      create: {
        width: canvasW,
        height: TARGET_HEIGHT,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: resizedPng, left: leftOffset, top: topOffset }])
      .png({ compressionLevel: 9 })
      .toFile(outPath);

    charManifest[pose] = {
      frame: `/sprites/characters/${characterId}/${outFileName}`,
      width: canvasW,
      height: TARGET_HEIGHT,
      anchor: 'bottom-center',
    };
  }

  return { characterId, charManifest };
}

async function main() {
  const cliOptions = parseCliArgs(process.argv.slice(2));
  await fs.mkdir(RAW_DIR, { recursive: true });
  await fs.mkdir(OUT_CHARACTERS_DIR, { recursive: true });

  const entries = await fs.readdir(RAW_DIR);
  const pngFiles = entries.filter((f) => f.toLowerCase().endsWith('.png')).sort();

  const manifest = {
    generatedAt: new Date().toISOString(),
    targetHeight: TARGET_HEIGHT,
    characters: {},
  };

  if (pngFiles.length === 0) {
    console.log('[slice-sprites] No PNG sheets found in ./raw-sheets — writing empty manifest.');
    await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    return;
  }

  for (const pngFile of pngFiles) {
    console.log(`[slice-sprites] Processing ${pngFile}...`);
    const { characterId, charManifest } = await processSheet(pngFile, cliOptions);
    manifest.characters[characterId] = charManifest;
    console.log(
      `[slice-sprites] Extracted ${Object.keys(charManifest).length} poses for "${characterId}": ${Object.keys(charManifest).join(', ')}`,
    );
  }

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`[slice-sprites] Manifest written to ${MANIFEST_PATH}`);
}

main().catch((err) => {
  console.error('[slice-sprites] Fatal error:', err);
  process.exitCode = 1;
});

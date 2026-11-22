import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT_DIR = process.cwd();
const RAW_DIR = path.join(ROOT_DIR, 'raw-sheets');
const OUT_BG_DIR = path.join(ROOT_DIR, 'public', 'backgrounds');
const OUT_PROPS_DIR = path.join(ROOT_DIR, 'public', 'sprites', 'props');
const OUT_TOOLS_DIR = path.join(OUT_PROPS_DIR, 'tools');
const MANIFEST_PATH = path.join(ROOT_DIR, 'public', 'sprites', 'manifest.json');

const PROP_HEIGHT = 512;
const TOOL_HEIGHT = 256;

const PROP_CELLS = [
  { id: 'motorcycle-lift', col: 0, row: 0 },
  { id: 'tool-chest', col: 1, row: 0 },
  { id: 'oil-pan', col: 0, row: 1 },
  { id: 'breaker-box', col: 1, row: 1 },
];

const TOOL_CELLS = [
  { id: 'torque_wrench', col: 0, row: 0 },
  { id: 'impact_gun', col: 1, row: 0 },
  { id: 'propane_torch', col: 2, row: 0 },
  { id: 'ez_out', col: 0, row: 1 },
  { id: 'multimeter', col: 1, row: 1 },
  { id: 'brake_cleaner', col: 2, row: 1 },
];

function colorDist(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Flood-fills pure chroma-key #00FF00 background from image borders, strips pure
 * enclosed green pockets (scissor frame gaps, caster cutouts), and runs 2-pass
 * boundary green-fringe removal + despill so black comic ink edges render cleanly.
 */
function stripChromaGreen(rgba, w, h) {
  const total = w * h;
  const corners = [2 * w + 2, 2 * w + (w - 3), (h - 3) * w + 2, (h - 3) * w + (w - 3)];
  let sr = 0;
  let sg = 255;
  let sb = 0;
  let count = 0;
  for (const idx of corners) {
    const r = rgba[idx * 4];
    const g = rgba[idx * 4 + 1];
    const b = rgba[idx * 4 + 2];
    if (g > Math.max(r, b) + 70) {
      sr += r;
      sg += g;
      sb += b;
      count += 1;
    }
  }
  if (count > 0) {
    sr = Math.round(sr / count);
    sg = Math.round(sg / count);
    sb = Math.round(sb / count);
  }

  const visited = new Uint8Array(total);
  const bgMask = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const isOuterGreen = (idx) => {
    const off = idx * 4;
    if (rgba[off + 3] < 20) return true;
    const r = rgba[off];
    const g = rgba[off + 1];
    const b = rgba[off + 2];
    const greenExcess = g - Math.max(r, b);
    return (
      colorDist(r, g, b, sr, sg, sb) <= 105 ||
      (g > 95 && greenExcess > 38 && r < 145 && b < 145)
    );
  };

  const isPureEnclosedGreen = (idx) => {
    const off = idx * 4;
    const r = rgba[off];
    const g = rgba[off + 1];
    const b = rgba[off + 2];
    const greenExcess = g - Math.max(r, b);
    return g > 105 && greenExcess > 46 && r < 112 && b < 112;
  };

  const enqueue = (idx) => {
    if (!visited[idx] && isOuterGreen(idx)) {
      visited[idx] = 1;
      bgMask[idx] = 1;
      queue[tail++] = idx;
    }
  };

  for (let x = 0; x < w; x++) {
    enqueue(x);
    enqueue((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    enqueue(y * w);
    enqueue(y * w + (w - 1));
  }

  while (head < tail) {
    const idx = queue[head++];
    const x = idx % w;
    const y = (idx - x) / w;
    if (x > 0) enqueue(idx - 1);
    if (x < w - 1) enqueue(idx + 1);
    if (y > 0) enqueue(idx - w);
    if (y < h - 1) enqueue(idx + w);
  }

  // Flood-fill inner enclosed chroma pockets seeded by pure neon green pixels
  for (let i = 0; i < total; i++) {
    if (!bgMask[i] && isPureEnclosedGreen(i)) {
      visited[i] = 1;
      bgMask[i] = 1;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const idx = queue[head++];
    const x = idx % w;
    const y = (idx - x) / w;
    const neighbors = [
      x > 0 ? idx - 1 : -1,
      x < w - 1 ? idx + 1 : -1,
      y > 0 ? idx - w : -1,
      y < h - 1 ? idx + w : -1,
    ];
    for (const n of neighbors) {
      if (n >= 0 && !visited[n] && isOuterGreen(n)) {
        visited[n] = 1;
        bgMask[n] = 1;
        queue[tail++] = n;
      }
    }
  }

  for (let i = 0; i < total; i++) {
    if (bgMask[i]) {
      rgba[i * 4 + 3] = 0;
    }
  }

  // Two boundary passes to strip JPEG-compressed neon-green anti-aliased fringe & despill rims
  for (let pass = 0; pass < 2; pass++) {
    const newlyCleared = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        if (bgMask[idx]) continue;
        const touchesBg =
          bgMask[idx - 1] ||
          bgMask[idx + 1] ||
          bgMask[idx - w] ||
          bgMask[idx + w];
        if (!touchesBg) continue;

        const off = idx * 4;
        const r = rgba[off];
        const g = rgba[off + 1];
        const b = rgba[off + 2];
        const maxRb = Math.max(r, b);
        const greenExcess = g - maxRb;

        if (g > 72 && greenExcess > 24 && maxRb < 130) {
          newlyCleared.push(idx);
        } else if (greenExcess > 6) {
          rgba[off + 1] = maxRb;
          if (greenExcess > 18) {
            rgba[off + 3] = Math.round(rgba[off + 3] * 0.55);
          }
        }
      }
    }
    for (const idx of newlyCleared) {
      bgMask[idx] = 1;
      rgba[idx * 4 + 3] = 0;
    }
  }
}

function findTrimBounds(rgba, w, h, x0, y0, x1, y1, alphaThreshold = 32) {
  let minX = x1;
  let minY = y1;
  let maxX = x0 - 1;
  let maxY = y0 - 1;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const a = rgba[(y * w + x) * 4 + 3];
      if (a >= alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

async function resolveSheetPath(candidates) {
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next candidate
    }
  }
  return null;
}

async function extractGridSheet({
  sourceCandidates,
  cols,
  rows,
  cells,
  outDir,
  webPrefix,
  targetHeight,
}) {
  const sheetPath = await resolveSheetPath(sourceCandidates);
  if (!sheetPath) {
    throw new Error(`Missing source sheet. Checked: ${sourceCandidates.join(', ')}`);
  }

  const { data, info } = await sharp(sheetPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgba = new Uint8ClampedArray(data);
  stripChromaGreen(rgba, info.width, info.height);

  await fs.mkdir(outDir, { recursive: true });
  const cellW = Math.floor(info.width / cols);
  const cellH = Math.floor(info.height / rows);
  const manifestEntries = {};

  const fullCleaned = Buffer.from(rgba);

  for (const cell of cells) {
    const x0 = cell.col * cellW;
    const y0 = cell.row * cellH;
    const x1 = cell.col === cols - 1 ? info.width : (cell.col + 1) * cellW;
    const y1 = cell.row === rows - 1 ? info.height : (cell.row + 1) * cellH;

    const bounds = findTrimBounds(rgba, info.width, info.height, x0, y0, x1, y1, 32);
    if (!bounds) {
      throw new Error(`Empty chroma-key bounds for cell ${cell.id} in ${sheetPath}`);
    }

    const pad = 2;
    const left = Math.max(0, bounds.left - pad);
    const top = Math.max(0, bounds.top - pad);
    const right = Math.min(info.width, bounds.left + bounds.width + pad);
    const bottom = Math.min(info.height, bounds.top + bounds.height + pad);
    const extractW = right - left;
    const extractH = bottom - top;

    const scale = targetHeight / extractH;
    const outWidth = Math.max(1, Math.round(extractW * scale));
    const outPath = path.join(outDir, `${cell.id}.png`);

    await sharp(fullCleaned, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .extract({ left, top, width: extractW, height: extractH })
      .resize({ height: targetHeight, kernel: sharp.kernel.lanczos3 })
      .png({ compressionLevel: 9 })
      .toFile(outPath);

    manifestEntries[cell.id] = {
      frame: `${webPrefix}/${cell.id}.png`,
      width: outWidth,
      height: targetHeight,
    };
  }

  return manifestEntries;
}

async function main() {
  await fs.mkdir(OUT_BG_DIR, { recursive: true });

  const widePath = await resolveSheetPath([
    path.join(RAW_DIR, 'shop-stage-wide.jpg'),
    path.join(RAW_DIR, 'shop-stage-wide.png'),
  ]);
  if (!widePath) {
    throw new Error('Missing raw-sheets/shop-stage-wide.{jpg,png}');
  }

  await sharp(widePath)
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(path.join(OUT_BG_DIR, 'shop-stage-wide.jpg'));

  const props = await extractGridSheet({
    sourceCandidates: [
      path.join(RAW_DIR, 'shop-props.png'),
      path.join(RAW_DIR, 'shop-props.jpg'),
    ],
    cols: 2,
    rows: 2,
    cells: PROP_CELLS,
    outDir: OUT_PROPS_DIR,
    webPrefix: '/sprites/props',
    targetHeight: PROP_HEIGHT,
  });

  const tools = await extractGridSheet({
    sourceCandidates: [
      path.join(RAW_DIR, 'shop-tools.png'),
      path.join(RAW_DIR, 'shop-tools.jpg'),
    ],
    cols: 3,
    rows: 2,
    cells: TOOL_CELLS,
    outDir: OUT_TOOLS_DIR,
    webPrefix: '/sprites/props/tools',
    targetHeight: TOOL_HEIGHT,
  });

  let existingManifest = {};
  try {
    const raw = await fs.readFile(MANIFEST_PATH, 'utf8');
    existingManifest = JSON.parse(raw);
  } catch {
    existingManifest = {};
  }

  const nextManifest = {
    ...existingManifest,
    props,
    tools,
  };

  await fs.mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(nextManifest, null, 2)}\n`, 'utf8');

  console.log(
    `Sliced shop-stage-wide.jpg, ${Object.keys(props).length} props, and ${Object.keys(tools).length} tools into public/sprites/manifest.json`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

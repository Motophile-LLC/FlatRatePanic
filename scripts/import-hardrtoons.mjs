import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ASSETS_DIR = 'D:\\HardRToons\\Assets';
const ROOT_DIR = process.cwd();
const OUT_SPRITES_DIR = path.join(ROOT_DIR, 'public', 'sprites');
const OUT_CHARACTERS_DIR = path.join(OUT_SPRITES_DIR, 'characters');
const OUT_BIKES_DIR = path.join(OUT_SPRITES_DIR, 'bikes');
const OUT_PORTRAITS_DIR = path.join(OUT_SPRITES_DIR, 'portraits');
const OUT_BG_DIR = path.join(ROOT_DIR, 'public', 'backgrounds');
const MANIFEST_PATH = path.join(OUT_SPRITES_DIR, 'manifest.json');

const TARGET_HEIGHT = 512;

function getLum(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function getChroma(r, g, b) {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function colorDist(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Flood-fills outer background starting from crop edges using adaptive gradient tolerance,
 * then clears enclosed background pockets (arm gaps, leg gaps, wheel spokes) while keeping
 * small white details (eyes, teeth) and protected regions intact.
 */
function stripBackdrop(rgba, w, h, opts = {}) {
  const {
    borderTol = 44,
    stepTol = 14,
    minBgLum = 175,
    maxChroma = 32,
    innerPocketDist = 26,
    minPocketArea = 180,
    protectHeadEyes = true,
    protectedRect = null,
    tintMode = null,
    shadowStripBottomFrac = 0,
  } = opts;

  const total = w * h;
  // Sample top-left and top-right corners (inset by 4px) so heads/tires never skew background color
  const samples = [4 * w + 4, 4 * w + (w - 5)];
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (const idx of samples) {
    sr += rgba[idx * 4];
    sg += rgba[idx * 4 + 1];
    sb += rgba[idx * 4 + 2];
  }
  sr = Math.round(sr / samples.length);
  sg = Math.round(sg / samples.length);
  sb = Math.round(sb / samples.length);

  const visited = new Uint8Array(total);
  const bgMask = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const isBorderSeed = (idx) => {
    const off = idx * 4;
    const r = rgba[off];
    const g = rgba[off + 1];
    const b = rgba[off + 2];
    const lum = getLum(r, g, b);
    const chroma = getChroma(r, g, b);
    return lum >= minBgLum && chroma <= maxChroma && colorDist(r, g, b, sr, sg, sb) <= borderTol;
  };

  const enqueueSeed = (idx) => {
    if (!visited[idx] && isBorderSeed(idx)) {
      visited[idx] = 1;
      bgMask[idx] = 1;
      queue[tail++] = idx;
    }
  };

  for (let x = 0; x < w; x++) {
    enqueueSeed(x);
    enqueueSeed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    enqueueSeed(y * w);
    enqueueSeed(y * w + (w - 1));
  }

  while (head < tail) {
    const idx = queue[head++];
    const x = idx % w;
    const y = (idx - x) / w;
    const off = idx * 4;
    const pr = rgba[off];
    const pg = rgba[off + 1];
    const pb = rgba[off + 2];

    const neighbors = [
      x > 0 ? idx - 1 : -1,
      x < w - 1 ? idx + 1 : -1,
      y > 0 ? idx - w : -1,
      y < h - 1 ? idx + w : -1,
    ];

    for (const n of neighbors) {
      if (n < 0 || visited[n]) continue;
      const noff = n * 4;
      const nr = rgba[noff];
      const ng = rgba[noff + 1];
      const nb = rgba[noff + 2];
      const lum = getLum(nr, ng, nb);
      const chroma = getChroma(nr, ng, nb);

      if (
        lum >= minBgLum &&
        chroma <= maxChroma &&
        (colorDist(nr, ng, nb, sr, sg, sb) <= borderTol ||
          colorDist(nr, ng, nb, pr, pg, pb) <= stepTol)
      ) {
        visited[n] = 1;
        bgMask[n] = 1;
        queue[tail++] = n;
      }
    }
  }

  // Optional bottom cast-shadow cleanup (for bikes standing on grey floor shadows)
  if (shadowStripBottomFrac > 0) {
    const startY = Math.floor(h * (1 - shadowStripBottomFrac));
    const shadowQueue = new Int32Array(total);
    let shHead = 0;
    let shTail = 0;
    const shVisited = new Uint8Array(total);

    for (let y = startY; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (!bgMask[idx]) continue;
        const neighbors = [
          x > 0 ? idx - 1 : -1,
          x < w - 1 ? idx + 1 : -1,
          y > 0 ? idx - w : -1,
          y < h - 1 ? idx + w : -1,
        ];
        for (const n of neighbors) {
          if (n < 0 || bgMask[n] || shVisited[n]) continue;
          const noff = n * 4;
          const r = rgba[noff];
          const g = rgba[noff + 1];
          const b = rgba[noff + 2];
          const lum = getLum(r, g, b);
          const chroma = getChroma(r, g, b);
          // Cast shadow on light backdrop: neutral grey 125..215 without strong color
          if (lum >= 122 && lum <= 220 && chroma <= 18) {
            shVisited[n] = 1;
            shadowQueue[shTail++] = n;
          }
        }
      }
    }

    while (shHead < shTail) {
      const idx = shadowQueue[shHead++];
      bgMask[idx] = 1;
      const x = idx % w;
      const y = (idx - x) / w;
      if (y < startY) continue;
      const neighbors = [
        x > 0 ? idx - 1 : -1,
        x < w - 1 ? idx + 1 : -1,
        y > startY ? idx - w : -1,
        y < h - 1 ? idx + w : -1,
      ];
      for (const n of neighbors) {
        if (n < 0 || bgMask[n] || shVisited[n]) continue;
        const noff = n * 4;
        const r = rgba[noff];
        const g = rgba[noff + 1];
        const b = rgba[noff + 2];
        const lum = getLum(r, g, b);
        const chroma = getChroma(r, g, b);
        if (lum >= 122 && lum <= 220 && chroma <= 18) {
          shVisited[n] = 1;
          shadowQueue[shTail++] = n;
        }
      }
    }
  }

  // Pass 2: clear enclosed background pockets (e.g. between legs, under arms, wheel spokes)
  const compVisited = new Uint8Array(total);
  const stack = new Int32Array(total);
  const headLimitY = protectHeadEyes ? Math.floor(h * 0.26) : -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = y * w + x;
      if (bgMask[start] || compVisited[start]) continue;

      const off = start * 4;
      if (
        getChroma(rgba[off], rgba[off + 1], rgba[off + 2]) > maxChroma ||
        colorDist(rgba[off], rgba[off + 1], rgba[off + 2], sr, sg, sb) > innerPocketDist
      ) {
        continue;
      }

      let sp = 0;
      stack[sp++] = start;
      compVisited[start] = 1;
      const pixels = [];
      let minY = y;
      let inProtected = false;

      while (sp > 0) {
        const idx = stack[--sp];
        pixels.push(idx);
        const cx = idx % w;
        const cy = (idx - cx) / w;
        if (cy < minY) minY = cy;
        if (
          protectedRect &&
          cx >= protectedRect.x0 * w &&
          cx <= protectedRect.x1 * w &&
          cy >= protectedRect.y0 * h &&
          cy <= protectedRect.y1 * h
        ) {
          inProtected = true;
        }

        const neighbors = [
          cx > 0 ? idx - 1 : -1,
          cx < w - 1 ? idx + 1 : -1,
          cy > 0 ? idx - w : -1,
          cy < h - 1 ? idx + w : -1,
        ];
        for (const n of neighbors) {
          if (n < 0 || bgMask[n] || compVisited[n]) continue;
          const noff = n * 4;
          if (
            getChroma(rgba[noff], rgba[noff + 1], rgba[noff + 2]) <= maxChroma &&
            colorDist(rgba[noff], rgba[noff + 1], rgba[noff + 2], sr, sg, sb) <= innerPocketDist
          ) {
            compVisited[n] = 1;
            stack[sp++] = n;
          }
        }
      }

      if (
        !inProtected &&
        pixels.length >= minPocketArea &&
        !(protectHeadEyes && minY < headLimitY && pixels.length < 1200)
      ) {
        for (const p of pixels) {
          bgMask[p] = 1;
        }
      }
    }
  }

  // Apply alpha + optional pose tinting (for panicked / electrocuted variants)
  for (let i = 0; i < total; i++) {
    const off = i * 4;
    if (bgMask[i]) {
      rgba[off + 3] = 0;
      continue;
    }

    if (tintMode === 'panicked') {
      rgba[off] = Math.min(255, Math.round(rgba[off] * 1.15 + 22));
      rgba[off + 1] = Math.round(rgba[off + 1] * 0.85);
      rgba[off + 2] = Math.round(rgba[off + 2] * 0.82);
    } else if (tintMode === 'electrocuted') {
      // Charred soot look with electric cyan highlight punch
      const lum = getLum(rgba[off], rgba[off + 1], rgba[off + 2]);
      if (lum > 180) {
        rgba[off] = 220;
        rgba[off + 1] = 248;
        rgba[off + 2] = 255;
      } else {
        rgba[off] = Math.max(0, Math.round(rgba[off] * 0.62));
        rgba[off + 1] = Math.max(0, Math.round(rgba[off + 1] * 0.68 + 12));
        rgba[off + 2] = Math.min(255, Math.round(rgba[off + 2] * 0.82 + 28));
      }
    }
  }

  // Soften 1px alpha halo against outline edges
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const off = idx * 4;
      if (rgba[off + 3] === 0) continue;
      const touchesBg =
        bgMask[idx - 1] || bgMask[idx + 1] || bgMask[idx - w] || bgMask[idx + w];
      if (touchesBg && getLum(rgba[off], rgba[off + 1], rgba[off + 2]) > 165) {
        rgba[off + 3] = Math.round(rgba[off + 3] * 0.45);
      }
    }
  }
}

function findTrimBounds(rgba, w, h) {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] >= 24) {
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

async function extractCutout(sourceFile, region, outPath, options = {}) {
  const {
    targetHeight = TARGET_HEIGHT,
    anchor = 'bottom-center',
    flop = false,
    maskRects = [],
    stripOpts = {},
  } = options;

  const srcPath = path.join(ASSETS_DIR, sourceFile);
  const extracted = sharp(srcPath).extract(region);
  const withAlpha = flop ? extracted.flop().ensureAlpha() : extracted.ensureAlpha();
  const { data, info } = await withAlpha.raw().toBuffer({ resolveWithObject: true });

  const rgba = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  for (const rect of maskRects) {
    const rx0 = Math.max(0, Math.floor(rect.x0 * info.width));
    const rx1 = Math.min(info.width, Math.ceil(rect.x1 * info.width));
    const ry0 = Math.max(0, Math.floor(rect.y0 * info.height));
    const ry1 = Math.min(info.height, Math.ceil(rect.y1 * info.height));
    for (let y = ry0; y < ry1; y++) {
      for (let x = rx0; x < rx1; x++) {
        const off = (y * info.width + x) * 4;
        rgba[off] = 240;
        rgba[off + 1] = 240;
        rgba[off + 2] = 234;
      }
    }
  }
  stripBackdrop(rgba, info.width, info.height, stripOpts);

  const trim = findTrimBounds(rgba, info.width, info.height);
  if (!trim) {
    throw new Error(`Empty cutout for ${outPath}`);
  }

  const trimmedBuf = await sharp(Buffer.from(rgba), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .extract(trim)
    .png()
    .toBuffer();

  const innerH = targetHeight - 16;
  const scale = innerH / Math.max(1, trim.height);
  const resizedW = Math.max(1, Math.round(trim.width * scale));
  const canvasW = Math.max(128, Math.ceil((resizedW + 24) / 2) * 2);
  const leftOffset = Math.floor((canvasW - resizedW) / 2);
  const topOffset = anchor === 'center' ? Math.floor((targetHeight - innerH) / 2) : targetHeight - innerH - 4;

  const resizedPng = await sharp(trimmedBuf)
    .resize(resizedW, innerH, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await sharp({
    create: {
      width: canvasW,
      height: targetHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resizedPng, left: leftOffset, top: topOffset }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  return { width: canvasW, height: targetHeight };
}

async function main() {
  await fs.mkdir(OUT_CHARACTERS_DIR, { recursive: true });
  await fs.mkdir(OUT_BIKES_DIR, { recursive: true });
  await fs.mkdir(OUT_PORTRAITS_DIR, { recursive: true });
  await fs.mkdir(OUT_BG_DIR, { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: 'D:\\HardRToons\\Assets',
    targetHeight: TARGET_HEIGHT,
    characters: {
      mechanic: {},
      'service-writer': {},
      'shop-buddy': {},
    },
    bikes: {},
    portraits: {},
  };

  // 1. Mechanic (Dick_Color_Sheet.jpeg — 2400x1792)
  const dickSpecs = [
    ['idle', { left: 95, top: 185, width: 560, height: 1490 }, {}],
    ['celebrate', { left: 655, top: 210, width: 650, height: 1465 }, {}],
    ['facepalm', { left: 1345, top: 190, width: 410, height: 1485 }, {}],
    ['wrenching', { left: 1745, top: 175, width: 610, height: 760 }, {}],
    ['panicked', { left: 1745, top: 175, width: 610, height: 760 }, { tintMode: 'panicked' }],
    ['electrocuted', { left: 1745, top: 175, width: 610, height: 760 }, { tintMode: 'electrocuted' }],
  ];
  for (const [pose, region, stripOpts] of dickSpecs) {
    const outPath = path.join(OUT_CHARACTERS_DIR, 'mechanic', `${pose}.png`);
    const dims = await extractCutout('Dick_Color_Sheet.jpeg', region, outPath, {
      stripOpts: { borderTol: 42, innerPocketDist: 28, minPocketArea: 180, ...stripOpts },
    });
    manifest.characters.mechanic[pose] = {
      frame: `/sprites/characters/mechanic/${pose}.png`,
      width: dims.width,
      height: dims.height,
      anchor: 'bottom-center',
    };
  }

  // 2. Service Writer (Apprentice_Color_Sheet.jpeg — 2400x1792)
  const apprenticeSpecs = [
    ['calm', { left: 760, top: 195, width: 570, height: 1480 }],
    ['pacing', { left: 1380, top: 180, width: 420, height: 1495 }],
  ];
  for (const [pose, region] of apprenticeSpecs) {
    const outPath = path.join(OUT_CHARACTERS_DIR, 'service-writer', `${pose}.png`);
    const dims = await extractCutout('Apprentice_Color_Sheet.jpeg', region, outPath, {
      stripOpts: { borderTol: 42, innerPocketDist: 28, minPocketArea: 180 },
    });
    manifest.characters['service-writer'][pose] = {
      frame: `/sprites/characters/service-writer/${pose}.png`,
      width: dims.width,
      height: dims.height,
      anchor: 'bottom-center',
    };
  }

  // 3. Shop Buddy (DynaBro_Color_Sheet.jpeg — 1376x768)
  const dynaSpecs = [
    ['idle', { left: 85, top: 22, width: 315, height: 678 }, false],
    ['talking', { left: 435, top: 22, width: 320, height: 678 }, false],
    ['borrowing', { left: 435, top: 22, width: 320, height: 678 }, true],
    ['dismissed', { left: 795, top: 22, width: 325, height: 678 }, false],
  ];
  for (const [pose, region, flop] of dynaSpecs) {
    const outPath = path.join(OUT_CHARACTERS_DIR, 'shop-buddy', `${pose}.png`);
    const dims = await extractCutout('DynaBro_Color_Sheet.jpeg', region, outPath, {
      flop,
      stripOpts: { borderTol: 40, innerPocketDist: 28, minPocketArea: 90 },
    });
    manifest.characters['shop-buddy'][pose] = {
      frame: `/sprites/characters/shop-buddy/${pose}.png`,
      width: dims.width,
      height: dims.height,
      anchor: 'bottom-center',
    };
  }

  // 4. Hand-Drawn Bikes (1376x768)
  const bikeSpecs = [
    [
      'club-dyna',
      'Bike_ClubStyle_Dyna.jpeg',
      { left: 10, top: 215, width: 702, height: 477 },
      {
        maskRects: [
          { x0: 0.81, x1: 1.0, y0: 0.0, y1: 0.45 },
          { x0: 0.86, x1: 1.0, y0: 0.42, y1: 0.64 },
        ],
        stripOpts: {
          borderTol: 52,
          stepTol: 16,
          minBgLum: 185,
          innerPocketDist: 32,
          minPocketArea: 110,
          protectHeadEyes: false,
          shadowStripBottomFrac: 0.08,
        },
      },
    ],
    [
      'bigwheel-bagger',
      'Bike_BigWheel_Bagger.jpeg',
      { left: 18, top: 22, width: 685, height: 438 },
      {
        stripOpts: {
          borderTol: 56,
          stepTol: 18,
          minBgLum: 162,
          maxChroma: 20,
          innerPocketDist: 28,
          minPocketArea: 120,
          protectHeadEyes: false,
          shadowStripBottomFrac: 0.14,
        },
      },
    ],
    [
      'track-bagger',
      'Bike_Track_Bagger.jpeg',
      { left: 18, top: 132, width: 760, height: 538 },
      {
        stripOpts: {
          borderTol: 48,
          minBgLum: 180,
          innerPocketDist: 28,
          minPocketArea: 120,
          protectHeadEyes: false,
          protectedRect: { x0: 0.02, x1: 0.2, y0: 0.44, y1: 0.72 },
          shadowStripBottomFrac: 0.12,
        },
      },
    ],
  ];
  for (const [bikeId, file, region, extra] of bikeSpecs) {
    const outPath = path.join(OUT_BIKES_DIR, `${bikeId}.png`);
    const dims = await extractCutout(file, region, outPath, extra);
    manifest.bikes[bikeId] = {
      frame: `/sprites/bikes/${bikeId}.png`,
      width: dims.width,
      height: dims.height,
      anchor: 'bottom-center',
    };
  }

  // 5. Portraits for HUD / Tickets / Modals
  const portraitSpecs = [
    ['dick-front', 'Dick_Color_Sheet.jpeg', { left: 195, top: 185, width: 375, height: 455 }, 256],
    ['dick-wtf', 'Dick_Color_Sheet.jpeg', { left: 1765, top: 1135, width: 575, height: 540 }, 256],
    ['apprentice-duh', 'Apprentice_Color_Sheet.jpeg', { left: 1790, top: 180, width: 540, height: 685 }, 256],
    ['dynabro', 'DynaBro_Color_Sheet.jpeg', { left: 1140, top: 35, width: 210, height: 245 }, 256],
    ['customer-1', 'Customer_Color_Sheet.jpeg', { left: 1765, top: 195, width: 585, height: 730 }, 256],
    ['customer-2', 'Customer_02_Color_Sheet.jpeg', { left: 1775, top: 170, width: 565, height: 700 }, 256],
    ['customer-3', 'Customer_03_Color_Sheet.jpeg', { left: 1795, top: 140, width: 540, height: 675 }, 256],
  ];
  for (const [id, file, region, size] of portraitSpecs) {
    const outPath = path.join(OUT_PORTRAITS_DIR, `${id}.png`);
    const dims = await extractCutout(file, region, outPath, {
      targetHeight: size,
      anchor: 'center',
      stripOpts: { borderTol: 54, maxChroma: 40, innerPocketDist: 32, minPocketArea: 140 },
    });
    manifest.portraits[id] = {
      frame: `/sprites/portraits/${id}.png`,
      width: dims.width,
      height: dims.height,
    };
  }

  // 6. Optimize Shop Backgrounds
  const bgSpecs = [
    ['exterior-storefront.jpg', 'BG_01_Exterior_Storefront.jpeg', 1024],
    ['interior-bay.jpg', 'BG_02_Interior_Bay.jpeg', 1200],
    ['service-counter.jpg', 'BG_03_Service_Counter.jpeg', 1200],
  ];
  for (const [outName, srcName, maxWidth] of bgSpecs) {
    await sharp(path.join(ASSETS_DIR, srcName))
      .resize({ width: maxWidth, withoutEnlargement: true })
      .jpeg({ quality: 86, mozjpeg: true })
      .toFile(path.join(OUT_BG_DIR, outName));
  }

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log('[import-hardrtoons] Imported all characters, bikes, portraits & backgrounds cleanly!');
}

main().catch((err) => {
  console.error('[import-hardrtoons] Failed:', err);
  process.exitCode = 1;
});

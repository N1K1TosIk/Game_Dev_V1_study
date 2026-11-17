import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function png(width, height, pixels) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset, width * height * 4)
      .copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function canvas(width, height) {
  const pixels = new Uint8Array(width * height * 4);
  const set = (x, y, color, alpha = 255) => {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= width || py >= height || alpha <= 0) return;
    const index = (py * width + px) * 4;
    pixels[index] = (color >> 16) & 255;
    pixels[index + 1] = (color >> 8) & 255;
    pixels[index + 2] = color & 255;
    pixels[index + 3] = alpha;
  };
  const rect = (x, y, w, h, color, alpha = 255) => {
    for (let py = y; py < y + h; py += 1) {
      for (let px = x; px < x + w; px += 1) set(px, py, color, alpha);
    }
  };
  const disc = (cx, cy, radius, color, alpha = 255) => {
    for (let py = cy - radius; py <= cy + radius; py += 1) {
      for (let px = cx - radius; px <= cx + radius; px += 1) {
        if ((px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2) set(px, py, color, alpha);
      }
    }
  };
  return { pixels, set, rect, disc };
}

function sized(width, height, draw) {
  const art = canvas(width, height);
  draw(art);
  return { width, height, pixels: art.pixels };
}

const grass = sized(32, 32, ({ rect, set }) => {
  rect(0, 0, 32, 32, 0x2f7a4a);
  const specks = [
    [2, 3, 0x3d955c], [9, 6, 0x24643c], [18, 2, 0x48a868], [27, 8, 0x215838],
    [5, 14, 0x3a8a56], [14, 18, 0x245c38], [23, 15, 0x52b874], [30, 20, 0x1f5434],
    [7, 26, 0x348252], [16, 28, 0x46a066], [25, 25, 0x236038], [12, 11, 0x2c7048],
  ];
  specks.forEach(([x, y, color]) => rect(x, y, 2, 2, color));
  [[4, 8], [20, 22], [28, 4]].forEach(([x, y]) => {
    set(x, y, 0xc6ee86);
    set(x, y - 1, 0x8fce62);
    set(x + 1, y - 2, 0xd8f6a4);
  });
});

const pathEdge = sized(32, 32, ({ rect }) => {
  rect(0, 0, 32, 32, 0x6e5844);
  rect(0, 0, 32, 5, 0x8a7058);
  rect(0, 27, 32, 5, 0x8a7058);
  rect(0, 13, 32, 6, 0x4a382c);
});

const path = sized(32, 32, ({ rect, set }) => {
  rect(0, 0, 32, 32, 0xc4a888);
  rect(0, 0, 32, 2, 0x8a7058);
  rect(0, 30, 32, 2, 0x8a7058);
  rect(0, 0, 2, 32, 0x8a7058);
  rect(30, 0, 2, 32, 0x8a7058);
  [[4, 5], [16, 8], [8, 18], [20, 20]].forEach(([x, y]) => rect(x, y, 7, 5, 0xd8c2a4));
  [[6, 7], [18, 10], [10, 20], [22, 22]].forEach(([x, y]) => set(x, y, 0xf0e0c8));
  [[11, 14], [24, 6]].forEach(([x, y]) => rect(x, y, 3, 2, 0x7a624c));
});

const slot = sized(32, 32, ({ rect, disc, set }) => {
  disc(15.5, 15.5, 14, 0x24343a);
  disc(15.5, 15.5, 11, 0x1a282e);
  rect(15, 8, 2, 16, 0x8fbf9a);
  rect(8, 15, 16, 2, 0x8fbf9a);
  [[6, 6], [24, 6], [6, 24], [24, 24]].forEach(([x, y]) => set(x, y, 0xd5e7c8));
});

function drawHeroSide(art, cape) {
  const { rect, set } = art;
  if (cape) {
    rect(6, 16, 8, 20, 0x8d3b4a);
    rect(4, 20, 4, 14, 0xc45b68);
  }
  rect(14, 30, 5, 10, 0x0e4448);
  rect(13, 39, 6, 3, 0x08322e);
  rect(18, 18, 14, 14, 0x1f8f86);
  rect(20, 20, 10, 5, 0x40d9bd);
  rect(28, 8, 10, 10, 0xf0d0a0);
  rect(28, 8, 10, 3, 0x146962);
  set(35, 13, 0x08322e);
  set(36, 13, 0xe8fff6);
  rect(24, 29, 5, 11, 0x0e4448);
  rect(27, 39, 7, 3, 0x08322e);
  rect(32, 23, 10, 3, 0xf4fff8);
  rect(40, 21, 3, 7, 0xc9ddd4);
}

function hero(art) {
  drawHeroSide(art, false);
}

function heroCape(art) {
  drawHeroSide(art, true);
}

const UNIT = 48;

function drawSideUnit(art, frame, spec) {
  const { rect, set } = art;
  const bob = frame % 2 === 0 ? 0 : -1;
  const front = [5, 2, -4, -1][frame];
  const back = [-4, -1, 5, 2][frame];
  const hip = 31 + bob;
  const bodyTop = hip - spec.bodyH;
  const headTop = bodyTop - spec.headH + 3;
  const cx = spec.cx;
  rect(cx - 4 + back, hip, 4, 41 - hip, spec.dark);
  rect(cx - 5 + back, 41, 6, 3, spec.boot);
  rect(cx, bodyTop, spec.bodyW, spec.bodyH, spec.body);
  rect(cx + 1, bodyTop + 2, Math.max(4, spec.bodyW - 6), 4, spec.accent);
  const headX = cx + spec.bodyW - spec.headW + 1;
  rect(headX, headTop, spec.headW, spec.headH, spec.skin);
  rect(headX, headTop, spec.headW, 3, spec.helm);
  set(headX + spec.headW - 3, headTop + 5, 0x1a120c);
  set(headX + spec.headW - 2, headTop + 5, 0xfff8ee);
  rect(cx + 2 + front, hip - 1, 4, 42 - hip, spec.dark);
  rect(cx + 1 + front, 41, 7, 3, spec.boot);
  spec.mark?.(art, cx, bodyTop, headX, headTop);
}

function sideUnit(frame, spec) {
  return sized(UNIT, UNIT, (art) => drawSideUnit(art, frame, spec));
}

const unitSpecs = {
  scout: {
    body: 0xe5c36d, accent: 0xf0d48a, skin: 0xf6e2b8, dark: 0x8a6230, boot: 0x3a2a18, helm: 0xc4a24a,
    bodyW: 12, bodyH: 12, headW: 9, headH: 8, cx: 16,
    mark: (art, cx, bodyTop) => {
      art.rect(cx + 10, bodyTop + 5, 12, 2, 0x6b5340);
      art.rect(cx + 20, bodyTop + 3, 3, 6, 0xd8d0c4);
    },
  },
  raider: {
    body: 0xe89562, accent: 0xffb27a, skin: 0xf0c098, dark: 0x8a4030, boot: 0x3a2218, helm: 0xa84838,
    bodyW: 12, bodyH: 12, headW: 9, headH: 8, cx: 16,
    mark: (art, cx, bodyTop) => {
      art.rect(cx + 8, bodyTop + 2, 3, 12, 0xd0d4dc);
      art.rect(cx + 6, bodyTop + 1, 7, 3, 0xf2f4f8);
    },
  },
  brute: {
    body: 0xc97067, accent: 0xdea098, skin: 0xe8b0a4, dark: 0x5c302c, boot: 0x3a1614, helm: 0x8a4038,
    bodyW: 18, bodyH: 14, headW: 12, headH: 10, cx: 12,
    mark: (art, cx, bodyTop) => {
      art.rect(cx - 5, bodyTop + 4, 5, 6, 0xa85a54);
      art.rect(cx + 16, bodyTop + 2, 4, 14, 0x6b5340);
      art.rect(cx + 14, bodyTop + 14, 8, 4, 0x5c4030);
    },
  },
  boss: {
    body: 0xc17193, accent: 0xe0a0bc, skin: 0xf0c0d0, dark: 0x6e3450, boot: 0x4a1830, helm: 0xf2c6da,
    bodyW: 18, bodyH: 15, headW: 12, headH: 10, cx: 12,
    mark: (art, cx, bodyTop, headX, headTop) => {
      art.rect(headX + 1, headTop - 4, 10, 4, 0xf2c6da);
      art.rect(headX + 2, headTop - 6, 2, 3, 0xffe4f0);
      art.rect(headX + 8, headTop - 6, 2, 3, 0xffe4f0);
      art.rect(cx + 16, bodyTop + 4, 3, 12, 0x6e3450);
      art.rect(cx + 14, bodyTop + 2, 8, 3, 0xf2c6da);
    },
  },
};

function towerKeep(wall, dark, light, windowColor) {
  return sized(48, 48, ({ rect }) => {
    rect(6, 36, 36, 8, dark);
    rect(8, 38, 32, 4, light);
    rect(12, 18, 24, 20, wall);
    rect(14, 20, 20, 6, light);
    rect(12, 12, 6, 8, wall);
    rect(21, 12, 6, 8, wall);
    rect(30, 12, 6, 8, wall);
    rect(20, 28, 8, 10, dark);
    rect(15, 22, 5, 4, windowColor);
    rect(28, 22, 5, 4, windowColor);
  });
}

function towerBarrel(body, tip) {
  return sized(28, 12, ({ rect }) => {
    rect(0, 4, 6, 4, 0x3a2a22);
    rect(4, 3, 16, 6, body);
    rect(6, 4, 8, 2, tip);
    rect(18, 2, 8, 8, tip);
    rect(24, 4, 3, 4, 0x1a120c);
  });
}

function pointingHand() {
  return sized(32, 40, ({ rect, set }) => {
    rect(10, 2, 12, 8, 0x8d3b4a);
    rect(11, 8, 10, 10, 0xf0d0a0);
    rect(13, 10, 6, 6, 0xffe4c4);
    rect(8, 12, 4, 4, 0xf0d0a0);
    rect(14, 16, 4, 14, 0xf0d0a0);
    rect(15, 28, 2, 6, 0xe0b888);
    set(16, 20, 0xc89870);
  });
}

function flyerFrame(frame) {
  return sized(UNIT, UNIT, (art) => {
    drawSideUnit(art, frame, {
      body: 0x7eb6d8, accent: 0xb7e4f6, skin: 0xe8f6ff, dark: 0x3a6480, boot: 0x2a4458, helm: 0x9fd0ea,
      bodyW: 12, bodyH: 11, headW: 9, headH: 8, cx: 18,
    });
    const lift = [8, 4, 0, 4][frame];
    const wingY = 16 - lift;
    art.rect(4, wingY, 14, 4, 0xd8f4ff);
    art.rect(6, wingY - 3, 8, 3, 0x9fd0ea);
    art.rect(30, wingY + 2, 12, 3, 0xd8f4ff);
    art.set(8, wingY + 1, 0xffffff);
  });
}

function facingUnit(spec, fromBack) {
  return sized(UNIT, UNIT, (art) => {
    const { rect, set } = art;
    const bodyW = Math.max(16, spec.bodyW + 2);
    const bodyLeft = 24 - Math.floor(bodyW / 2);
    const bodyTop = 30 - spec.bodyH;
    const headW = spec.headW + 2;
    const headLeft = 24 - Math.floor(headW / 2);
    const headTop = bodyTop - spec.headH + 2;
    rect(bodyLeft + 2, 32, 5, 10, spec.dark);
    rect(bodyLeft + bodyW - 7, 32, 5, 10, spec.dark);
    rect(bodyLeft + 1, 41, 6, 3, spec.boot);
    rect(bodyLeft + bodyW - 7, 41, 6, 3, spec.boot);
    rect(bodyLeft, bodyTop, bodyW, spec.bodyH + 2, spec.body);
    rect(bodyLeft + 2, bodyTop + 3, bodyW - 4, 4, spec.accent);
    rect(headLeft, headTop, headW, spec.headH, fromBack ? spec.helm : spec.skin);
    rect(headLeft, headTop, headW, 3, spec.helm);
    if (fromBack) {
      rect(bodyLeft + 4, bodyTop + 8, bodyW - 8, 5, spec.dark);
    } else {
      set(headLeft + 3, headTop + 5, 0x1a120c);
      set(headLeft + headW - 4, headTop + 5, 0x1a120c);
    }
    if (spec.helm === 0xf2c6da) rect(headLeft, headTop - 4, headW, 3, 0xf2c6da);
  });
}

const sprites = {
  'tile-grass.png': grass,
  'tile-path.png': path,
  'tile-path-edge.png': pathEdge,
  'tile-slot.png': slot,
  'hero.png': sized(48, 48, hero),
  'hero-cape.png': sized(48, 48, heroCape),
  'base.png': sized(48, 64, ({ rect }) => {
    rect(6, 18, 36, 40, 0x347e73);
    rect(10, 8, 28, 16, 0x4ea88d);
    rect(16, 28, 16, 18, 0xbaffdc);
    rect(4, 54, 40, 6, 0x1d4e46);
    rect(8, 12, 8, 6, 0xd0fff0);
    rect(32, 12, 8, 6, 0xd0fff0);
    rect(20, 22, 8, 4, 0x1d4e46);
  }),
  'tower-cannon.png': towerKeep(0xc77b54, 0x6d3d2c, 0xffbd75, 0x3a2018),
  'tower-cannon-barrel.png': towerBarrel(0x8a4e34, 0xffbd75),
  'tower-rapid.png': towerKeep(0x4ea88d, 0x1d4e46, 0x8ef5c8, 0x163832),
  'tower-rapid-barrel.png': towerBarrel(0x1d4e46, 0x8ef5c8),
  'tower-cryo.png': towerKeep(0x598fc2, 0x2a4a68, 0x8bdcff, 0xd8f4ff),
  'tower-cryo-barrel.png': towerBarrel(0x2a4a68, 0x8bdcff),
  'tower-homing.png': towerKeep(0xc4a24a, 0x6a5420, 0xf3e27a, 0x3a3010),
  'tower-homing-barrel.png': towerBarrel(0x6a5420, 0xf3e27a),
  ...Object.fromEntries(['scout', 'raider', 'brute', 'boss'].flatMap((kind) => (
    [0, 1, 2, 3].map((frame) => [`enemy-${kind}-${frame}.png`, sideUnit(frame, unitSpecs[kind])])
  ))),
  ...Object.fromEntries([0, 1, 2, 3].map((frame) => [`enemy-flyer-${frame}.png`, flyerFrame(frame)])),
  ...Object.fromEntries(['scout', 'raider', 'brute', 'boss'].flatMap((kind) => [
    [`enemy-${kind}-front.png`, facingUnit(unitSpecs[kind], false)],
    [`enemy-${kind}-back.png`, facingUnit(unitSpecs[kind], true)],
  ])),
  'hand.png': pointingHand(),
  'projectile-homing.png': sized(16, 16, ({ rect }) => {
    rect(1, 6, 9, 4, 0xf3e27a);
    rect(9, 5, 5, 6, 0xfff6c4);
    rect(4, 4, 4, 2, 0xc4a24a);
    rect(4, 10, 4, 2, 0xc4a24a);
  }),
};

for (const [name, art] of Object.entries(sprites)) {
  const file = png(art.width, art.height, art.pixels);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, name), file);
}

console.log(`wrote ${Object.keys(sprites).length} sprites to ${outDir}`);

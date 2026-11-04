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

function hero(art) {
  const { rect, set } = art;
  rect(11, 8, 10, 12, 0x1f8f86);
  rect(12, 9, 8, 6, 0x40d9bd);
  rect(14, 10, 5, 2, 0xe8fff6);
  rect(18, 13, 10, 3, 0xf4fff8);
  rect(26, 12, 3, 5, 0xc9ddd4);
  rect(10, 18, 12, 6, 0x146962);
  rect(11, 24, 4, 5, 0x0e4448);
  rect(17, 24, 4, 5, 0x0e4448);
  set(13, 12, 0x08322e);
  set(16, 12, 0x08322e);
}

function heroCape(art) {
  hero(art);
  art.rect(6, 9, 5, 16, 0x8d3b4a);
  art.rect(5, 11, 3, 12, 0xc45b68);
  art.rect(8, 8, 4, 3, 0xf0d0a0);
}

function enemy(art, body, accent, eye) {
  const { rect, set } = art;
  rect(8, 10, 16, 12, body);
  rect(10, 8, 12, 4, accent);
  rect(11, 13, 3, 3, eye);
  rect(18, 13, 3, 3, eye);
  set(12, 14, 0x1a120c);
  set(19, 14, 0x1a120c);
  rect(9, 22, 4, 5, 0x2a211c);
  rect(19, 22, 4, 5, 0x2a211c);
}

const sprites = {
  'tile-grass.png': grass,
  'tile-path.png': path,
  'tile-slot.png': slot,
  'hero.png': sized(32, 32, hero),
  'hero-cape.png': sized(32, 32, heroCape),
  'enemy-scout.png': sized(32, 32, (art) => enemy(art, 0xe5c36d, 0xf0d48a, 0xfff6d8)),
  'enemy-flyer.png': sized(32, 32, (art) => {
    enemy(art, 0x7eb6d8, 0xb7e4f6, 0xf4fbff);
    art.rect(2, 12, 6, 3, 0xd8f4ff);
    art.rect(24, 12, 6, 3, 0xd8f4ff);
    art.rect(4, 10, 3, 2, 0x9fd0ea);
    art.rect(25, 10, 3, 2, 0x9fd0ea);
  }),
  'enemy-raider.png': sized(32, 32, (art) => {
    enemy(art, 0xe89562, 0xffb27a, 0xffe0c8);
    art.rect(6, 14, 4, 2, 0xffd0a4);
  }),
  'enemy-brute.png': sized(40, 40, ({ rect, set }) => {
    rect(8, 10, 24, 18, 0xc97067);
    rect(12, 6, 16, 6, 0xdea098);
    rect(13, 16, 5, 4, 0xffe4dc);
    rect(22, 16, 5, 4, 0xffe4dc);
    set(15, 18, 0x3a1614);
    set(24, 18, 0x3a1614);
    rect(10, 28, 6, 7, 0x5c302c);
    rect(24, 28, 6, 7, 0x5c302c);
    rect(6, 14, 4, 8, 0xa85a54);
    rect(30, 14, 4, 8, 0xa85a54);
  }),
  'enemy-boss.png': sized(48, 48, ({ rect, set }) => {
    rect(10, 14, 28, 22, 0xc17193);
    rect(14, 8, 20, 8, 0xe0a0bc);
    rect(16, 20, 6, 5, 0xffe4f0);
    rect(26, 20, 6, 5, 0xffe4f0);
    set(18, 22, 0x4a1830);
    set(28, 22, 0x4a1830);
    rect(12, 36, 8, 8, 0x6e3450);
    rect(28, 36, 8, 8, 0x6e3450);
    rect(6, 16, 5, 14, 0x9a5878);
    rect(37, 16, 5, 14, 0x9a5878);
    rect(20, 4, 8, 5, 0xf2c6da);
  }),
  'base.png': sized(48, 64, ({ rect }) => {
    rect(6, 18, 36, 40, 0x347e73);
    rect(10, 8, 28, 16, 0x4ea88d);
    rect(16, 28, 16, 18, 0xbaffdc);
    rect(4, 54, 40, 6, 0x1d4e46);
    rect(8, 12, 8, 6, 0xd0fff0);
    rect(32, 12, 8, 6, 0xd0fff0);
    rect(20, 22, 8, 4, 0x1d4e46);
  }),
  'tower-cannon.png': sized(40, 40, ({ rect, disc }) => {
    disc(16, 20, 11, 0xc77b54);
    disc(16, 20, 6, 0x6d3d2c);
    rect(18, 17, 18, 6, 0xffbd75);
    rect(32, 15, 5, 10, 0x8a4e34);
  }),
  'tower-rapid.png': sized(40, 40, ({ rect, disc }) => {
    disc(16, 20, 11, 0x4ea88d);
    disc(16, 20, 6, 0x1d4e46);
    rect(18, 14, 16, 4, 0x8ef5c8);
    rect(18, 22, 16, 4, 0x8ef5c8);
  }),
  'tower-cryo.png': sized(40, 40, ({ rect, disc }) => {
    disc(16, 20, 11, 0x598fc2);
    disc(16, 20, 6, 0xd8f4ff);
    rect(20, 17, 16, 6, 0x8bdcff);
    rect(14, 8, 4, 6, 0xeaf8ff);
  }),
  'tower-homing.png': sized(40, 40, ({ rect, disc }) => {
    disc(16, 20, 11, 0xc4a24a);
    disc(16, 20, 6, 0x6a5420);
    rect(20, 17, 14, 6, 0xf3e27a);
    rect(30, 15, 6, 3, 0xfff6c4);
    rect(30, 22, 6, 3, 0xfff6c4);
  }),
};

for (const [name, art] of Object.entries(sprites)) {
  const file = png(art.width, art.height, art.pixels);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, name), file);
}

console.log(`wrote ${Object.keys(sprites).length} sprites to ${outDir}`);

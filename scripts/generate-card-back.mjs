// Generates textures/card-back.png: a procedural, deterministic card back (own work).
//
// Built from arithmetic only, with Node built-ins (zlib, fs), so the file's provenance is this
// script and nothing else. It contains no Star Wars, Decipher or Wizards of the Coast artwork and
// is not derived from any card scan. Re-running it reproduces the committed bytes exactly.
//
//   node scripts/generate-card-back.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WIDTH = 250;
const HEIGHT = 350; // 5:7, the usual trading-card aspect ratio

const NAVY = [22, 28, 48];
const DEEP = [14, 18, 32];
const GOLD = [201, 162, 74];
const DIM_GOLD = [96, 80, 46];

function pixel(x, y) {
  const cx = (WIDTH - 1) / 2;
  const cy = (HEIGHT - 1) / 2;
  const edge = Math.min(x, y, WIDTH - 1 - x, HEIGHT - 1 - y);

  if (edge < 6) return DEEP; // outer margin
  if (edge < 9) return GOLD; // outer rule
  if (edge < 13) return NAVY;
  if (edge < 14) return DIM_GOLD; // inner rule

  const dx = x - cx;
  const dy = y - cy;
  const radius = Math.sqrt(dx * dx + dy * dy);
  if (radius >= 52 && radius < 56) return GOLD; // medallion ring
  if (radius >= 44 && radius < 46) return DIM_GOLD;
  if (radius < 44) {
    // an eight-point star inside the medallion
    const angle = Math.atan2(dy, dx);
    const spoke = Math.abs(Math.cos(angle * 4));
    return radius < 12 + 28 * spoke ** 3 ? GOLD : DEEP;
  }

  // diagonal lattice across the field
  const u = (x + y) % 22;
  const v = (x - y + 1000 * 22) % 22;
  if (u === 0 || v === 0) return DIM_GOLD;
  return NAVY;
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const raw = Buffer.alloc(HEIGHT * (1 + WIDTH * 3));
for (let y = 0; y < HEIGHT; y++) {
  const row = y * (1 + WIDTH * 3);
  raw[row] = 0; // filter: none
  for (let x = 0; x < WIDTH; x++) {
    const [r, g, b] = pixel(x, y);
    raw[row + 1 + x * 3] = r;
    raw[row + 2 + x * 3] = g;
    raw[row + 3 + x * 3] = b;
  }
}

const header = Buffer.alloc(13);
header.writeUInt32BE(WIDTH, 0);
header.writeUInt32BE(HEIGHT, 4);
header[8] = 8; // bit depth
header[9] = 2; // colour type: RGB
header[10] = 0;
header[11] = 0;
header[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0))
]);

const target = join(dirname(fileURLToPath(import.meta.url)), "..", "textures", "card-back.png");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, png);
console.log(`wrote ${target} (${png.length} bytes)`);

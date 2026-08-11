/**
 * The icon, defined once and rendered twice.
 *
 * The mark is the silhouette of a spike week: a flat run, a sharp peak, a fall,
 * with the peak itself picked out in the accent colour. That is the one thing
 * the tool is for, and it survives being sixteen pixels across.
 *
 * The geometry lives here rather than in an SVG file so that the vector and the
 * raster cannot drift apart: this script emits the SVG, the PNG sizes and the
 * Windows icon from the same numbers. It also means no rasteriser has to be
 * installed to build the project, which matters because the dependency budget
 * is typescript and esbuild.
 *
 * Called by tools/build.ts, so the icon is part of the build rather than a step
 * someone has to remember.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { at } from "../src/model/array.ts";

/** Everything below is in a 32 by 32 space and scales to any output size. */
const CANVAS = 32;
const TILE_RADIUS = 7;
const STROKE_WIDTH = 3;

const SURFACE = [0x10, 0x13, 0x16] as const;
const MARK = [0xe6, 0xea, 0xee] as const;
const ACCENT = [0x5f, 0xd0, 0x8a] as const;

/**
 * A price line: a nearly level run in, a sharp rise, a faster fall, a low tail.
 * The asymmetry is what stops it reading as a plain chevron, and the ends stay
 * flat so it is a chart rather than a letter V.
 *
 * The spike itself carries the accent and the approaches do not, which reads at
 * sixteen pixels where a separate marker at the apex only made a blob.
 */
const APPROACH: readonly (readonly [number, number])[] = [
  [5, 20.5],
  [11, 19],
];
const SPIKE: readonly (readonly [number, number])[] = [
  [11, 19],
  [16, 7.5],
  [20.5, 15.5],
];
const TAIL: readonly (readonly [number, number])[] = [
  [20.5, 15.5],
  [27, 18.5],
];

/** Four by four coverage sampling; at these sizes the cost is milliseconds. */
const SUPERSAMPLE = 4;

const PNG_SIZES = [16, 32, 48, 64, 128, 256];
const ICO_SIZES = [16, 32, 48, 256];

/** Android asks for 512 for the icon it puts on a home screen. */
const MASKABLE_SIZE = 512;

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function insideRoundedTile(x: number, y: number): boolean {
  const inner = TILE_RADIUS;
  const cx = Math.min(Math.max(x, inner), CANVAS - inner);
  const cy = Math.min(Math.max(y, inner), CANVAS - inner);
  if (x >= inner && x <= CANVAS - inner) {
    return y >= 0 && y <= CANVAS;
  }
  if (y >= inner && y <= CANVAS - inner) {
    return x >= 0 && x <= CANVAS;
  }
  return Math.hypot(x - cx, y - cy) <= inner;
}

function insidePolyline(points: readonly (readonly [number, number])[], x: number, y: number): boolean {
  const half = STROKE_WIDTH / 2;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = at(points, i);
    const b = at(points, i + 1);
    if (distanceToSegment(x, y, at(a, 0), at(a, 1), at(b, 0), at(b, 1)) <= half) {
      return true;
    }
  }
  return false;
}

/**
 * A launcher mask crops the icon to its own shape, so a maskable variant fills
 * the square edge to edge; rounded corners here would leave transparent wedges
 * showing through a square mask. The mark sits inside the middle 70 per cent,
 * which is within the safe zone a circular mask leaves.
 */
function renderMaskable(size: number): Uint8Array {
  return render(size, true);
}

/** Straight alpha RGBA, painted tile then mark then peak. */
function render(size: number, fullBleed = false): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  const step = CANVAS / size / SUPERSAMPLE;
  const origin = step / 2;
  const samples = SUPERSAMPLE * SUPERSAMPLE;

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      let tile = 0;
      let mark = 0;
      let peak = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const x = (column * CANVAS) / size + origin + sx * step;
          const y = (row * CANVAS) / size + origin + sy * step;
          if (!fullBleed && !insideRoundedTile(x, y)) {
            continue;
          }
          tile += 1;
          if (insidePolyline(SPIKE, x, y)) {
            peak += 1;
          } else if (insidePolyline(APPROACH, x, y) || insidePolyline(TAIL, x, y)) {
            mark += 1;
          }
        }
      }

      const alpha = tile / samples;
      const offset = (row * size + column) * 4;
      if (alpha === 0) {
        continue;
      }
      const markShare = mark / samples;
      const peakShare = peak / samples;
      const surfaceShare = Math.max(0, alpha - markShare - peakShare);
      for (let channel = 0; channel < 3; channel += 1) {
        const value =
          (at(SURFACE, channel) * surfaceShare +
            at(MARK, channel) * markShare +
            at(ACCENT, channel) * peakShare) /
          alpha;
        pixels[offset + channel] = Math.round(value);
      }
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }
  return pixels;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 12);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i += 1) {
    out[4 + i] = type.charCodeAt(i);
  }
  out.set(body, 8);
  view.setUint32(body.length + 8, crc32(out.subarray(4, body.length + 8)));
  return out;
}

function encodePng(size: number, pixels: Uint8Array): Uint8Array {
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, size);
  headerView.setUint32(4, size);
  header[8] = 8; // bit depth
  header[9] = 6; // truecolour with alpha
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = size * 4;
  const raw = new Uint8Array((stride + 1) * size);
  for (let row = 0; row < size; row += 1) {
    raw[row * (stride + 1)] = 0; // no per-row filter
    raw.set(pixels.subarray(row * stride, (row + 1) * stride), row * (stride + 1) + 1);
  }

  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [
    signature,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

/** An ICO holding PNG payloads, which Windows has accepted since Vista. */
function encodeIco(entries: readonly { readonly size: number; readonly png: Uint8Array }[]): Uint8Array {
  const headerLength = 6 + entries.length * 16;
  const total = entries.reduce((sum, entry) => sum + entry.png.length, headerLength);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, entries.length, true);

  let offset = headerLength;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = at(entries, index);
    const base = 6 + index * 16;
    out[base] = entry.size >= 256 ? 0 : entry.size;
    out[base + 1] = entry.size >= 256 ? 0 : entry.size;
    out[base + 2] = 0;
    out[base + 3] = 0;
    view.setUint16(base + 4, 1, true);
    view.setUint16(base + 6, 32, true);
    view.setUint32(base + 8, entry.png.length, true);
    view.setUint32(base + 12, offset, true);
    out.set(entry.png, offset);
    offset += entry.png.length;
  }
  return out;
}

function colour(rgb: readonly number[]): string {
  return `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function path(points: readonly (readonly [number, number])[], stroke: readonly number[]): string {
  const d = points.map(([x, y]) => `${x} ${y}`).join(" L");
  return (
    `<path d="M${d}" fill="none" stroke="${colour(stroke)}" stroke-width="${STROKE_WIDTH}" ` +
    `stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

function markSvg(): string {
  return (
    `<rect width="${CANVAS}" height="${CANVAS}" rx="${TILE_RADIUS}" fill="${colour(SURFACE)}"/>` +
    path(APPROACH, MARK) +
    path(TAIL, MARK) +
    path(SPIKE, ACCENT)
  );
}

function iconSvg(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" ` +
    `width="${CANVAS}" height="${CANVAS}" role="img" aria-label="kabucast">` +
    `${markSvg()}</svg>\n`
  );
}

function logoSvg(): string {
  const height = CANVAS;
  const width = 168;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `width="${width}" height="${height}" role="img" aria-label="kabucast">` +
    `${markSvg()}` +
    `<text x="42" y="22.5" fill="${colour(MARK)}" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" ` +
    `font-size="20" font-weight="600" letter-spacing="-0.4">kabucast</text>` +
    `</svg>\n`
  );
}

export function writeIcons(): { readonly svg: string; readonly icoBytes: number } {
  mkdirSync("docs/img", { recursive: true });
  mkdirSync("dist", { recursive: true });

  const svg = iconSvg();
  writeFileSync("docs/img/icon.svg", svg);
  writeFileSync("docs/img/logo.svg", logoSvg());
  writeFileSync("dist/icon.svg", svg);

  const rendered = new Map<number, Uint8Array>();
  for (const size of new Set([...PNG_SIZES, ...ICO_SIZES])) {
    rendered.set(size, encodePng(size, render(size)));
  }

  for (const size of PNG_SIZES) {
    writeFileSync(`dist/icon-${size}.png`, rendered.get(size) ?? new Uint8Array(0));
  }
  writeFileSync("docs/img/icon-256.png", rendered.get(256) ?? new Uint8Array(0));
  writeFileSync(
    `dist/icon-maskable-${MASKABLE_SIZE}.png`,
    encodePng(MASKABLE_SIZE, renderMaskable(MASKABLE_SIZE)),
  );

  const ico = encodeIco(
    ICO_SIZES.map((size) => ({ size, png: rendered.get(size) ?? new Uint8Array(0) })),
  );
  writeFileSync("dist/kabucast.ico", ico);

  return { svg, icoBytes: ico.length };
}

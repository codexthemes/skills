import zlib from 'node:zlib';

/**
 * Pixel-truth readability checks. Computed-style analysis cannot judge text
 * that sits over artwork or transparent layers, so we screenshot the real
 * page and measure the actual backdrop pixels around each text element.
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  pixels: Uint8Array;
}

export interface TextSample {
  text: string;
  path: string;
  color: string;
  size: number;
  rect: { x: number; y: number; width: number; height: number };
}

export interface ReadabilityResult {
  text: string;
  path: string;
  ratio: number;
  color: string;
  backdrop: string;
  size: number;
}

export function parseColor(value: string): Rgba | null {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1]!.split(',').map((part) => Number(part.trim()));
  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null;
  return { r: parts[0]!, g: parts[1]!, b: parts[2]!, a: parts.length > 3 ? parts[3]! : 1 };
}

function luminance(color: Rgba): number {
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

export function contrastRatio(a: Rgba, b: Rgba): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Minimal PNG decoder for Chromium screenshots: 8-bit RGB/RGBA, non-interlaced. */
export function decodePng(buffer: Buffer): DecodedImage {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length < 8 || signature.some((byte, index) => buffer[index] !== byte)) {
    throw new Error('Not a PNG file');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
      if (data[12] !== 0) throw new Error('Interlaced PNG is not supported');
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`Unsupported PNG format (bit depth ${bitDepth}, color type ${colorType})`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const pixels = new Uint8Array(width * height * 4);
  const previous = new Uint8Array(stride);
  const current = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart]!;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[rowStart + 1 + x]!;
      const left = x >= bpp ? current[x - bpp]! : 0;
      const up = previous[x]!;
      const upLeft = x >= bpp ? previous[x - bpp]! : 0;
      let decoded = value;
      if (filter === 1) decoded = (value + left) & 0xff;
      else if (filter === 2) decoded = (value + up) & 0xff;
      else if (filter === 3) decoded = (value + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) decoded = (value + paeth(left, up, upLeft)) & 0xff;
      else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}`);
      current[x] = decoded;
    }
    for (let x = 0; x < width; x += 1) {
      const source = x * bpp;
      const target = (y * width + x) * 4;
      pixels[target] = current[source]!;
      pixels[target + 1] = current[source + 1]!;
      pixels[target + 2] = current[source + 2]!;
      pixels[target + 3] = bpp === 4 ? current[source + 3]! : 255;
    }
    previous.set(current);
  }
  return { width, height, pixels };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * Median color of a ring of pixels just outside the element's box — an
 * approximation of the backdrop the text is read against that is robust to
 * glyph pixels inside the box.
 */
export function ringBackdrop(
  image: DecodedImage,
  rect: { x: number; y: number; width: number; height: number },
  scale: number,
  pad = 3,
): Rgba | null {
  const points: Array<[number, number]> = [];
  const left = Math.round((rect.x - pad) * scale);
  const right = Math.round((rect.x + rect.width + pad) * scale);
  const top = Math.round((rect.y - pad) * scale);
  const bottom = Math.round((rect.y + rect.height + pad) * scale);
  const stepX = Math.max(1, Math.floor((right - left) / 24));
  const stepY = Math.max(1, Math.floor((bottom - top) / 12));
  for (let x = left; x <= right; x += stepX) {
    points.push([x, top], [x, bottom]);
  }
  for (let y = top; y <= bottom; y += stepY) {
    points.push([left, y], [right, y]);
  }
  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];
  for (const [x, y] of points) {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
    const index = (y * image.width + x) * 4;
    reds.push(image.pixels[index]!);
    greens.push(image.pixels[index + 1]!);
    blues.push(image.pixels[index + 2]!);
  }
  if (reds.length < 8) return null;
  return { r: median(reds), g: median(greens), b: median(blues), a: 1 };
}

/** Judge sampled text elements against the real screenshot pixels. */
export function judgeSamples(
  image: DecodedImage,
  samples: TextSample[],
  viewportWidth: number,
): ReadabilityResult[] {
  const scale = image.width / viewportWidth;
  const results: ReadabilityResult[] = [];
  for (const sample of samples) {
    const textColor = parseColor(sample.color);
    if (!textColor) continue;
    const backdrop = ringBackdrop(image, sample.rect, scale);
    if (!backdrop) continue;
    const composedText = textColor.a < 1
      ? {
          r: textColor.r * textColor.a + backdrop.r * (1 - textColor.a),
          g: textColor.g * textColor.a + backdrop.g * (1 - textColor.a),
          b: textColor.b * textColor.a + backdrop.b * (1 - textColor.a),
          a: 1,
        }
      : textColor;
    results.push({
      text: sample.text,
      path: sample.path,
      ratio: Math.round(contrastRatio(composedText, backdrop) * 100) / 100,
      color: sample.color,
      backdrop: `rgb(${backdrop.r}, ${backdrop.g}, ${backdrop.b})`,
      size: sample.size,
    });
  }
  return results.sort((a, b) => a.ratio - b.ratio);
}

/** In-page collector: visible text elements with their rects and colors. */
export const textSamplerSource = `(() => {
  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 5 || rect.height < 5) return false;
    if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.15;
  };
  const hasOwnText = (el) => [...el.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim().length > 1);
  const describe = (el) => {
    const parts = [];
    let node = el;
    for (let depth = 0; node && depth < 3; depth += 1) {
      let part = node.tagName.toLowerCase();
      const cls = [...node.classList].slice(0, 2).join('.');
      if (cls) part += '.' + cls;
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  };
  const samples = [];
  const elements = document.querySelectorAll('main *, aside *, header *, [role="menu"] *, [role="dialog"] *');
  for (const el of elements) {
    if (samples.length >= 200) break;
    if (!hasOwnText(el) || !isVisible(el)) continue;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    samples.push({
      text: [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').slice(0, 40),
      path: describe(el),
      color: style.color,
      size: parseFloat(style.fontSize) || 0,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    });
  }
  return JSON.stringify({ samples, viewportWidth: innerWidth });
})()`;

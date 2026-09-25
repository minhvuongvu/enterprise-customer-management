/**
 * Generates the performance lab's image fixtures (apps/web/public/labs/images).
 *
 *   node perf/generate-lab-images.ts
 *
 * One photograph-like picture - gradients and grain, which compress the way
 * photographs do, unlike flat illustrations - in the formats and widths a
 * page would choose between:
 *
 *  - `photo-original.png`  1200 px, lossless: what a CMS upload often is;
 *  - `photo-{400,800,1600}.webp`  the responsive set NgOptimizedImage picks from.
 *
 * Drawn in a headless Chromium canvas, so no image library is needed, and
 * seeded, so a re-run produces the same pixels. The files are committed; this
 * script exists so they can be reproduced, not so they are built.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(import.meta.dirname, '../apps/web/public/labs/images');
const WIDTHS = [400, 800, 1600];
const ASPECT = 2 / 3;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();

const draw = async (width: number, type: string, quality: number): Promise<Buffer> => {
  const dataUrl = await page.evaluate(
    ({ width, height, type, quality }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d')!;
      // Deterministic pseudo-random numbers (mulberry32).
      let seed = 42;
      const random = (): number => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const sky = context.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, '#1d3b6a');
      sky.addColorStop(0.55, '#e8a15c');
      sky.addColorStop(1, '#2c1d18');
      context.fillStyle = sky;
      context.fillRect(0, 0, width, height);
      for (let hill = 0; hill < 4; hill++) {
        context.fillStyle = `rgba(${30 + hill * 20}, ${40 + hill * 15}, ${35 + hill * 10}, 0.85)`;
        context.beginPath();
        context.moveTo(0, height);
        for (let x = 0; x <= width; x += width / 40) {
          context.lineTo(
            x,
            height * (0.55 + hill * 0.1) +
              Math.sin(x / (width / (3 + hill)) + hill) * height * 0.05,
          );
        }
        context.lineTo(width, height);
        context.fill();
      }
      // Grain: what makes lossless formats expensive and lossy ones worthwhile.
      const pixels = context.getImageData(0, 0, width, height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const noise = (random() - 0.5) * 12;
        pixels.data[i] += noise;
        pixels.data[i + 1] += noise;
        pixels.data[i + 2] += noise;
      }
      context.putImageData(pixels, 0, 0);
      return canvas.toDataURL(type, quality);
    },
    { width, height: Math.round(width * ASPECT), type, quality },
  );
  return Buffer.from(dataUrl.split(',')[1], 'base64');
};

writeFileSync(join(OUT, 'photo-original.png'), await draw(1200, 'image/png', 1));
for (const width of WIDTHS) {
  writeFileSync(join(OUT, `photo-${width}.webp`), await draw(width, 'image/webp', 0.75));
}
await browser.close();
console.log(`Wrote ${WIDTHS.length + 1} images to ${OUT}`);

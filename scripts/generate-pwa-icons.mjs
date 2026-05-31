import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const sourcePath = resolve(repoRoot, 'app/icons/family-tracker-source.png');
const outputs = [
  { size: 180, path: resolve(repoRoot, 'app/icons/family-tracker-icon-180.png') },
  { size: 192, path: resolve(repoRoot, 'app/icons/family-tracker-icon-192.png') },
  { size: 512, path: resolve(repoRoot, 'app/icons/family-tracker-icon-512.png') },
];

function assertPng(path) {
  const signature = [...readFileSync(path).subarray(0, 8)];
  const expected = [137, 80, 78, 71, 13, 10, 26, 10];
  if (signature.some((byte, index) => byte !== expected[index])) {
    throw new Error(`${path} is not a PNG file`);
  }
}

assertPng(sourcePath);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const sourceUrl = `data:image/png;base64,${readFileSync(sourcePath).toString('base64')}`;

  for (const output of outputs) {
    const dataUrl = await page.evaluate(async ({ sourceUrl, size }) => {
      const image = new Image();
      image.src = sourceUrl;
      await image.decode();

      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, size, size);
      return canvas.toDataURL('image/png');
    }, { sourceUrl, size: output.size });

    mkdirSync(dirname(output.path), { recursive: true });
    writeFileSync(output.path, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`Generated ${output.path}`);
  }
} finally {
  await browser.close();
}

import assert from 'node:assert/strict';
import { wavFixture } from './fixtures.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('crash', () => errors.push('page crashed'));
  await page.addInitScript(() => {
    window.testMilliseconds = 0;
    performance.now = () => window.testMilliseconds;
    const arc = CanvasRenderingContext2D.prototype.arc;
    CanvasRenderingContext2D.prototype.arc = function (x, y, ...rest) {
      if (this.canvas.classList.contains('curve-canvas')) window.drawnEndpoint = { x, y };
      return arc.call(this, x, y, ...rest);
    };
  });
  await page.context().setOffline(true);
  await page.goto(new URL('../Wave Curves.html', import.meta.url).href);
  await page.waitForSelector('#app[data-ready="true"]');
  await page.locator('[data-action="play"]').click();
  const control = name => page.locator(`[data-control="${name}"]`);
  const value = frame => 0.5 * Math.cos(2 * Math.PI * 440 * frame / 48000) + 0.2 * Math.cos(2 * Math.PI * 713.37 * frame / 48000 + 0.4);
  await control('file').setInputFiles({
    name: '100seconds.wav', mimeType: 'audio/wav',
    buffer: wavFixture({ encoding: 3, bits: 32, sampleRate: 48000, frames: 4800000, value })
  });
  await page.waitForFunction(() => document.querySelector('.file-name').textContent === '100seconds.wav');
  await control('duration').fill('100');
  await control('duration').press('Tab');
  assert.match(await page.locator('.window-info').textContent(), /4,800,000개 샘플.*0.01 Hz/);
  const tick = async ms => page.evaluate(async delta => {
    window.testMilliseconds += delta;
    await new Promise(requestAnimationFrame);
    const canvas = document.querySelector('.curve-canvas');
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0;
    let yellow = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] > 60 && pixels[i + 1] > 50 && pixels[i + 2] < 180) colored++;
      if (pixels[i] > 170 && pixels[i + 1] > 130 && pixels[i + 2] < 180) yellow++;
    }
    return { colored, yellow, time: Number(canvas.dataset.sourceTime), endpoint: window.drawnEndpoint };
  }, ms);
  assert.ok((await tick(0)).colored > 200, 'long preview must be visible');
  await control('phase').fill('500');
  let snapshot = await tick(0);
  assert.equal(snapshot.time, 50);
  assert.ok(snapshot.yellow > 200, 'long trace must be visible after seeking');
  await page.locator('[data-action="all"]').click();
  assert.equal(await control('countNumber').inputValue(), '2400001');
  assert.equal(await page.locator('.energy-value').textContent(), '100.00%');
  await control('speed').fill('1');
  await control('speed').press('Enter');
  await page.getByRole('button', { name: '애니메이션 재생', exact: true }).click();
  snapshot = await tick(1000);
  assert.equal(snapshot.time, 1);
  assert.ok(snapshot.yellow > 200, 'all-component playback must draw the curve');
  assert.ok(Math.abs(snapshot.endpoint.x - Math.fround(value(48000))) < 1e-6, 'all components must reconstruct the input sample');
  const expectedY = 0.5 * Math.sin(2 * Math.PI * 440) + 0.2 * Math.sin(2 * Math.PI * 713.37 + 0.4);
  assert.ok(Math.abs(snapshot.endpoint.y - expectedY) < 1e-6, 'all rotations must preserve the sine coordinate');
  await page.getByRole('button', { name: '애니메이션 일시정지', exact: true }).click();
  await page.locator('[data-action="fit"]').click();
  await page.setViewportSize({ width: 1000, height: 750 });
  assert.ok((await tick(0)).colored > 200, 'resize must rebuild the cache');
  await control('phase').fill('0');
  await control('preview').uncheck();
  await control('circles').uncheck();
  await control('vectors').uncheck();
  assert.ok((await tick(0)).yellow < 100, 'seeking back must clear the previous trace');
  assert.deepEqual(errors, []);
  console.log('PASS: 100 seconds at 48 kHz, all 2,400,001 sinusoid rotations, visible preview/trace, original x and sine y at 1x, seeking, resize, and no page errors.');
} finally {
  await browser.close();
}

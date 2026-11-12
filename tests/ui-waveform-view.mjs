import assert from 'node:assert/strict';
import { wavFixture } from './fixtures.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const begin = CanvasRenderingContext2D.prototype.beginPath;
    const line = CanvasRenderingContext2D.prototype.lineTo;
    CanvasRenderingContext2D.prototype.beginPath = function (...args) {
      if (this.canvas.classList.contains('waveform') && this.strokeStyle === '#8eb5c0') window.wavePoints = [];
      return begin.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.lineTo = function (x, y) {
      if (this.canvas.classList.contains('waveform') && this.strokeStyle === '#8eb5c0') window.wavePoints?.push({x, y});
      return line.call(this, x, y);
    };
  });
  await page.context().setOffline(true);
  await page.goto(new URL('../Wave Curves.html', import.meta.url).href);
  await page.waitForSelector('#app[data-ready="true"]');
  await page.locator('[data-action="play"]').click();
  const control = name => page.locator(`[data-control="${name}"]`);
  const action = name => page.locator(`[data-action="${name}"]`);
  const waveform = page.locator('.waveform');
  const view = () => waveform.evaluate(el => ({start: Number(el.dataset.viewStart), length: Number(el.dataset.viewLength), detail: el.dataset.detail}));
  const selection = async () => Promise.all(['start','duration','countNumber'].map(name => control(name).inputValue()));
  const original = await selection();
  assert.equal((await view()).length, 4800000);
  await action('wave-selection').click();
  assert.ok((await view()).length < 2500);
  await action('wave-in').click();
  assert.equal((await view()).detail, 'samples');
  const before = await view();
  await waveform.scrollIntoViewIfNeeded();
  let bounds = await waveform.boundingBox();
  const pointerX = bounds.x + bounds.width * 0.3;
  await page.mouse.move(pointerX, bounds.y + bounds.height / 2);
  const scrollBefore = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, -300);
  await page.waitForFunction(length => Number(document.querySelector('.waveform').dataset.viewLength) < length, before.length);
  const after = await view();
  assert.ok(Math.abs(after.start + after.length * 0.3 - (before.start + before.length * 0.3)) < 1, 'zoom anchor stays within one sample after pointer pixel rounding');
  assert.equal(await page.evaluate(() => scrollY), scrollBefore);
  await control('wavePosition').fill('1000000');
  assert.equal(Math.round((await view()).start), 1000000);
  bounds = await waveform.boundingBox();
  const panBefore = await view();
  await page.keyboard.down('Shift');
  await page.mouse.move(bounds.x + bounds.width * 0.6, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.4, bounds.y + bounds.height / 2);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  assert.ok(Math.abs((await view()).start - (panBefore.start + panBefore.length * 0.2)) < 1);
  assert.deepEqual(await selection(), original, 'navigation must not change the FFT interval or count');
  await action('wave-pan').click();
  bounds = await waveform.boundingBox();
  const modeBefore = await view();
  await page.mouse.move(bounds.x + bounds.width * 0.6, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.4, bounds.y + bounds.height / 2);
  await page.mouse.up();
  assert.ok((await view()).start > modeBefore.start);
  assert.deepEqual(await selection(), original);
  await action('wave-pan').click();
  const clickView = await view();
  await waveform.click({position: {x: bounds.width / 2, y: bounds.height / 2}});
  const expectedStart = Math.round(clickView.start + clickView.length / 2 - 2048 / 2);
  assert.ok(Math.abs(Number(await control('start').inputValue()) * 48000 - expectedStart) < 0.001);
  await action('wave-fit').click();
  assert.equal((await view()).start, 0);
  assert.equal((await view()).length, 4800000);
  assert.equal(await control('wavePosition').isDisabled(), true);

  // Resolve the original individual samples, including an isolated impulse.
  await control('file').setInputFiles({name:'impulse.wav', mimeType:'audio/wav', buffer: wavFixture({sampleRate:1000,frames:10000,encoding:3,bits:32,value: frame => frame === 5000 ? 1 : 0})});
  await page.waitForFunction(() => document.querySelector('.file-name').textContent === 'impulse.wav');
  assert.equal((await view()).length, 10000, 'new files reset the viewport');
  await control('duration').fill('0.01');
  await control('duration').press('Tab');
  await control('start').fill('4.995');
  await control('start').press('Tab');
  await action('wave-selection').click();
  assert.equal((await view()).detail, 'samples');
  const points = await page.evaluate(() => window.wavePoints);
  const impulseView = await view();
  bounds = await waveform.boundingBox();
  const impulseX = (5000 - impulseView.start) / impulseView.length * bounds.width;
  const impulsePoint = points.find(point => Math.abs(point.x - impulseX) < 1e-6);
  assert.ok(impulsePoint);
  assert.ok(Math.abs(impulsePoint.y - bounds.height * 0.08) < 1e-6);
  await action('wave-in').click();
  assert.equal((await view()).length, 8);
  assert.equal(await action('wave-in').isDisabled(), true);
  await control('wavePosition').fill('9992');
  assert.equal((await view()).start, 9992);
  await action('wave-fit').click();

  // Restore the actual 100-second demo for visual checks of the larger UI.
  await action('demo').click();
  await page.waitForFunction(() => document.querySelector('.file-name').textContent.includes('100초'));
  await control('duration').fill('0.02');
  await control('duration').press('Tab');
  await action('wave-selection').click();
  await page.screenshot({path:'.verification/waveform-zoom-desktop.png',fullPage:true});
  for (const width of [900, 390]) {
    await page.setViewportSize({width,height:1000});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
  }
  await action('wave-in').click();
  await page.screenshot({path:'.verification/waveform-zoom-mobile.png',fullPage:true});
  assert.deepEqual(errors, []);
  console.log('PASS: cursor-anchored waveform zoom, raw sample detail, min/max overview, pan, scroll position, FFT selection preservation, zoomed selection, bounds, file reset and larger responsive UI.');
} finally { await browser.close(); }

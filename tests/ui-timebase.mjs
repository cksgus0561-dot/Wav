import assert from 'node:assert/strict';
import { wavFixture } from './fixtures.mjs';

// Optional browser regression test. The module and browser can be supplied by
// the development environment, independently of the application's dependencies.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE,
  headless: true
});
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    // Explicit wall-clock steps let us verify the canvas output, including
    // delayed frames, without depending on the test machine's frame rate.
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
  await page.getByRole('button', { name: '애니메이션 일시정지', exact: true }).click();
  const control = name => page.locator(`[data-control="${name}"]`);
  assert.equal(await control('speed').inputValue(), '0.001');
  const setSpeed = async (value, key = 'Enter') => {
    await control('speed').fill(value);
    await control('speed').press(key);
  };
  const tick = async milliseconds => page.evaluate(async delta => {
    window.testMilliseconds += delta;
    await new Promise(requestAnimationFrame);
    return {
      time: Number(document.querySelector('.curve-canvas').dataset.sourceTime),
      phase: Number(document.querySelector('.curve-canvas').dataset.phase),
      endpoint: window.drawnEndpoint
    };
  }, milliseconds);
  const play = () => page.getByRole('button', { name: '애니메이션 재생', exact: true }).click();
  const pause = () => page.getByRole('button', { name: '애니메이션 일시정지', exact: true }).click();
  const checkPoint = (snapshot, time, frequency = 8) => {
    close(snapshot.time, time);
    close(snapshot.endpoint.x, 0.6 * Math.cos(2 * Math.PI * frequency * time));
    close(snapshot.endpoint.y, 0.6 * Math.sin(2 * Math.PI * frequency * time));
  };

  for (const sampleRate of [1024, 2048]) {
    await control('file').setInputFiles({
      name: `8hz-${sampleRate}.wav`, mimeType: 'audio/wav',
      buffer: wavFixture({ encoding: 3, bits: 64, sampleRate, frames: 8192,
        value: frame => 0.6 * Math.cos(2 * Math.PI * 8 * frame / sampleRate) })
    });
    await page.waitForFunction(name => document.querySelector('.file-name').textContent === name, `8hz-${sampleRate}.wav`);
    for (const length of [1024, 1536, 2048, 4096]) {
      await control('duration').fill(String(length / sampleRate));
      await control('duration').press('Tab');
      await control('count').fill('1');
      assert.match(await page.locator('.coefficients tr').first().textContent(), /^8/);
      const coefficients = await page.locator('.coefficients').innerHTML();
      const selection = await control('start').inputValue();
      await setSpeed('1');
      await play();
      const snapshot = await tick(137);
      checkPoint(snapshot, 0.137);
      assert.ok(Math.abs(snapshot.phase - 0.137 / (length / sampleRate)) < 1e-5);
      await pause();
      checkPoint(await tick(1200), 0.137);
      assert.equal(await page.locator('.coefficients').innerHTML(), coefficients);
      assert.equal(await control('start').inputValue(), selection);
    }
  }

  // The current selection lasts two seconds. A late frame must account for
  // all 1.2 seconds, rather than silently cap elapsed time at 0.1 seconds.
  await page.locator('[data-action="restart"]').click();
  await play();
  checkPoint(await tick(1200), 1.2);
  await setSpeed('0.1');
  checkPoint(await tick(0), 1.2);
  checkPoint(await tick(1000), 1.3);
  await setSpeed('1');
  checkPoint(await tick(900), 0.2);
  await pause();
  await control('phase').fill('750');
  checkPoint(await tick(0), 1.5);
  await setSpeed('0.001');
  await play();
  checkPoint(await tick(1000), 1.501);

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  checkPoint(await tick(3000), 1.501);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  checkPoint(await tick(1000), 1.502);
  await setSpeed('0.0037');
  checkPoint(await tick(0), 1.502);
  checkPoint(await tick(1000), 1.5057);
  await setSpeed('2.5', 'Tab');
  checkPoint(await tick(100), 1.7557);
  for (const invalid of ['', '0', '-1']) {
    await setSpeed(invalid);
    assert.equal(await control('speed').inputValue(), '2.5');
    checkPoint(await tick(0), 1.7557);
  }
  await setSpeed('0.000001');
  checkPoint(await tick(1000), 1.755701);
  await pause();

  // Select a non-power-of-two, odd interval using seconds. The source tone
  // lands exactly on a bin of this N, not on the convolution's padded grid.
  const sampleRate = 48000;
  const length = 4801;
  const frequency = 317 * sampleRate / length;
  await control('file').setInputFiles({
    name: 'arbitrary-length.wav', mimeType: 'audio/wav',
    buffer: wavFixture({ encoding: 3, bits: 64, sampleRate, frames: 96000,
      value: frame => 0.6 * Math.cos(2 * Math.PI * 317 * frame / length) })
  });
  await page.waitForFunction(() => document.querySelector('.file-name').textContent === 'arbitrary-length.wav');
  const setNumber = async (name, value) => {
    await control(name).fill(String(value));
    await control(name).press('Tab');
  };
  const checkSelection = async (start, samples) => {
    const value = async name => Number(await control(name).inputValue());
    assert.equal(Math.round(await value('start') * sampleRate), start);
    assert.equal(Math.round(await value('end') * sampleRate), start + samples);
    assert.equal(Math.round(await value('duration') * sampleRate), samples);
    assert.equal(Number(await control('count').getAttribute('max')), Math.floor(samples / 2) + 1);
    assert.match(await page.locator('.window-info').textContent(), new RegExp(`^${samples.toLocaleString('ko-KR')}개 샘플`));
  };
  await setNumber('duration', 0.10002);
  await checkSelection(0, 4801);
  await control('count').fill('1');
  await setSpeed('1');
  await play();
  checkPoint(await tick(10.001), 0.010001, frequency);
  await checkSelection(0, 4801);
  await pause();

  await setNumber('start', 0.012345);
  await checkSelection(593, 4801);
  await setNumber('end', 0.2);
  await checkSelection(593, 9007);
  await setNumber('duration', '');
  await checkSelection(593, 9007);
  await setNumber('duration', 100);
  await checkSelection(593, 96000 - 593);
  await setNumber('duration', 0);
  await checkSelection(593, 1);
  await setNumber('end', 0);
  await checkSelection(593, 1);
  await setNumber('start', 100);
  await checkSelection(95999, 1);
  await setNumber('start', -5);
  await checkSelection(0, 1);
  await setNumber('duration', 1.1);
  await checkSelection(0, 52800);
  await setNumber('end', 2);
  await checkSelection(0, 96000);
  await setNumber('duration', 4801 / sampleRate);
  await checkSelection(0, 4801);
  // Moving the yellow selection still preserves its arbitrary sample length.
  const waveform = page.locator('.waveform');
  await waveform.press('End');
  await checkSelection(91199, 4801);
  await waveform.press('Home');
  await checkSelection(0, 4801);
  const bounds = await waveform.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.75, bounds.y + bounds.height / 2);
  await page.mouse.up();
  await checkSelection(69600, 4801);
  await setNumber('start', 0);
  await page.screenshot({ path: '.verification/arbitrary-length-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: '.verification/arbitrary-length-mobile.png', fullPage: true });

  await control('file').setInputFiles({
    name: 'one-sample.wav', mimeType: 'audio/wav',
    buffer: wavFixture({ encoding: 3, bits: 64, sampleRate, frames: 1, value: () => 0.25 })
  });
  await page.waitForFunction(() => document.querySelector('.file-name').textContent === 'one-sample.wav');
  await checkSelection(0, 1);
  const point = await tick(0);
  close(point.endpoint.x, 0.25);
  close(point.endpoint.y, 0);
  assert.deepEqual(errors, []);
  console.log('PASS: rendered endpoints agree across four window lengths and two sample rates; real-time, slow playback, speed changes, delayed frames, pause, seeking, looping, visibility, arbitrary interval inputs, odd-length frequency, sample rounding, boundaries, drag, single-sample WAV and mobile layout.');
} finally {
  await browser.close();
}

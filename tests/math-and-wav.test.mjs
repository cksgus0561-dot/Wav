import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fft, analyze, evaluate, makeCurve } from '../src/fourier.js';
import { readWav } from '../src/wav.js';
import { wavFixture, asArrayBuffer } from './fixtures.mjs';

const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

for (const length of [1, 2, 3, 5, 6, 7, 15, 17, 31, 32, 63, 100, 127]) {
test(`length-${length} FFT matches direct DFT, and inverse restores complex inputs`, () => {
  const re = Float64Array.from({ length }, (_, i) => Math.sin(i * 1.31) + i / 35);
  const im = Float64Array.from(re, (_, i) => Math.cos(i * 0.37));
  const inputRe = re.slice();
  const inputIm = im.slice();
  fft(re, im);
  for (let k = 0; k < re.length; k++) {
    let expectedRe = 0;
    let expectedIm = 0;
    for (let n = 0; n < re.length; n++) {
      const angle = -2 * Math.PI * k * n / re.length;
      expectedRe += inputRe[n] * Math.cos(angle) - inputIm[n] * Math.sin(angle);
      expectedIm += inputRe[n] * Math.sin(angle) + inputIm[n] * Math.cos(angle);
    }
    close(re[k], expectedRe);
    close(im[k], expectedIm);
  }
  fft(re, im, true);
  re.forEach((value, index) => { close(value, inputRe[index]); close(im[index], inputIm[index]); });
});
}

test('sinusoid rotations reproduce source x and agree with the sampled complex sum', () => {
  for (const length of [1, 3, 6, 17, 255, 1000]) {
    const samples = Float64Array.from({ length }, (_, index) => 0.17 + 0.6 * Math.sin(index * 0.49));
    const { components } = analyze(samples, 44100);
    assert.equal(components.length, Math.floor(length / 2) + 1);
    for (const component of components) {
      close(component.frequency, component.bin * 44100 / length);
    }
    samples.forEach((value, index) => {
      const point = evaluate(components, index / 44100);
      close(point.x, value);
    });
    const curve = makeCurve(components, length, 44100);
    for (let index = 0; index < curve.length; index += 137) {
      const point = evaluate(components, index / curve.segments * length / 44100);
      close(curve.real[index], point.x);
      close(curve.imaginary[index], point.y);
    }
    const endpoint = evaluate(components, length / 44100);
    close(curve.real.at(-1), endpoint.x);
    close(curve.imaginary.at(-1), endpoint.y);
    close(evaluate(components, 0).x, endpoint.x);
    close(evaluate(components, 0).y, endpoint.y);
  }
});

test('highest real sinusoid has its original amplitude for odd and even sample counts', () => {
  for (const length of [3, 17, 97, 4801, 4800, 48000]) {
    const bin = Math.floor(length / 2);
    const phase = length % 2 ? 0.4 : 0;
    const samples = Float64Array.from({ length }, (_, index) => 0.7 * Math.cos(2 * Math.PI * bin * index / length + phase));
    const { components } = analyze(samples, 48000);
    const component = components.find(item => item.bin === bin);
    const magnitude = 0.7;
    close(component.re, magnitude * Math.cos(phase));
    close(component.im, magnitude * Math.sin(phase));
    if (length % 2 === 0) {
      close(component.frequency, 24000);
      close(evaluate(components, 0.5 / 48000).y, 0.7);
    }
  }
});

test('FFT rejects empty and mismatched arrays', () => {
  assert.throws(() => fft(new Float64Array(0), new Float64Array(0)));
  assert.throws(() => fft(new Float64Array(3), new Float64Array(4)));
});

test('WAV with one frame is a valid constant curve', () => {
  const wav = readWav(asArrayBuffer(wavFixture({ frames: 1, value: () => 0.5 })));
  const { components } = analyze([wav.sample(0)], wav.sampleRate);
  close(evaluate(components, 0.73).x, 0.5, 0.00005);
  close(evaluate(components, 0.73).y, 0);
});

test('rotating sinusoid sum reproduces source x including DC and Nyquist', () => {
  const samples = Float64Array.from({ length: 256 }, (_, i) => 0.17 + 0.1 * (-1) ** i + 0.6 * Math.sin(i * 0.49));
  const { components } = analyze(samples, 48000);
  const curve = makeCurve(components, samples.length, 48000);
  samples.forEach((expected, index) => {
    close(evaluate(components, index / 48000).x, expected);
    close(curve.real[index * curve.segments / samples.length], expected);
  });
  const beginning = evaluate(components, 0);
  const ending = evaluate(components, samples.length / 48000);
  close(beginning.x, ending.x);
  close(beginning.y, ending.y);
});

test('a real sinusoid is represented by one rotation with its amplitude and phase', () => {
  const samples = Float64Array.from({ length: 128 }, (_, n) => 0.8 * Math.cos(2 * Math.PI * 7 * n / 128 + 0.4));
  const { components } = analyze(samples, 96000);
  const positive = components.find(item => item.bin === 7);
  close(positive.re, 0.8 * Math.cos(0.4));
  close(positive.im, 0.8 * Math.sin(0.4));
  assert.ok(components.every(item => item.frequency >= 0));
  for (const index of [0, 0.3, 1, 31.7, 127, 128]) {
    close(evaluate(components, index / 96000).x, 0.8 * Math.cos(2 * Math.PI * 7 * index / 128 + 0.4));
    close(evaluate(components, index / 96000).y, 0.8 * Math.sin(2 * Math.PI * 7 * index / 128 + 0.4));
  }
});

test('silence and constant signals produce a point', () => {
  for (const value of [0, -0.4]) {
    const { components } = analyze(new Float64Array(64).fill(value), 48000);
    for (const phase of [0, 0.2, 0.9, 1]) {
      const point = evaluate(components, phase);
      close(point.x, value);
      close(point.y, 0);
    }
  }
});

test('1 Hz WAV traces the unit circle counterclockwise with one or all rotations', () => {
  for (const sampleRate of [64, 127, 128]) {
    const wav = readWav(asArrayBuffer(wavFixture({
      encoding: 3, bits: 64, sampleRate, frames: sampleRate,
      value: n => Math.cos(2 * Math.PI * n / sampleRate)
    })));
    const samples = Float64Array.from({ length: wav.frames }, (_, n) => wav.sample(n));
    const { components } = analyze(samples, sampleRate);
    close(components[0].frequency, 1);
    close(components[0].amplitude, 1);
    for (const selected of [components.slice(0, 1), components]) {
      const curve = makeCurve(selected, sampleRate, sampleRate);
      for (const [t, x, y] of [[0, 1, 0], [0.25, 0, 1], [0.5, -1, 0], [0.75, 0, -1], [1, 1, 0]]) {
        const point = evaluate(selected, t);
        close(point.x, x);
        close(point.y, y);
        close(curve.real[t * curve.segments], x);
        close(curve.imaginary[t * curve.segments], y);
      }
    }
  }
});

test('selected sinusoid rotations match independent cosine/sine projection and known waves', () => {
  const sampleRate = 800;
  const length = 100;
  const waves = [
    { amplitude: 0.7, frequency: 24, phase: 0.4 },
    { amplitude: 0.3, frequency: 8, phase: -0.8 },
    { amplitude: 0.1, frequency: 56, phase: 1.1 }
  ];
  const samples = Float64Array.from({ length }, (_, n) => waves.reduce((sum, wave) =>
    sum + wave.amplitude * Math.cos(2 * Math.PI * wave.frequency * n / sampleRate + wave.phase), 0));
  const { components } = analyze(samples, sampleRate);
  const coefficients = Array.from({ length: Math.floor(length / 2) + 1 }, (_, k) => {
    let re = 0;
    let im = 0;
    for (let n = 0; n < length; n++) {
      const angle = 2 * Math.PI * k * n / length;
      const factor = k === 0 || k === length / 2 ? 1 : 2;
      re += factor * samples[n] * Math.cos(angle) / length;
      im -= factor * samples[n] * Math.sin(angle) / length;
    }
    return { re, im, frequency: k * sampleRate / length };
  });
  for (let index = 0; index < components.length; index++) {
    const actual = components[index];
    close(actual.re, coefficients[actual.bin].re);
    close(actual.im, coefficients[actual.bin].im);
    if (index) assert.ok(components[index - 1].amplitude >= actual.amplitude);
    if (index < waves.length) {
      close(actual.frequency, waves[index].frequency);
      close(actual.amplitude, waves[index].amplitude);
      close(actual.re, waves[index].amplitude * Math.cos(waves[index].phase));
      close(actual.im, waves[index].amplitude * Math.sin(waves[index].phase));
    }
  }
  for (const count of [1, 2, 3, 5, 6, components.length]) {
    const selected = components.slice(0, count);
    const curve = makeCurve(selected, length, sampleRate);
    for (const index of [0, 23, 1777, curve.segments]) {
      const t = index / curve.segments * length / sampleRate;
      const expected = selected.reduce((sum, item) => {
        const coefficient = coefficients[item.bin];
        const angle = 2 * Math.PI * coefficient.frequency * t;
        return {
          x: sum.x + coefficient.re * Math.cos(angle) - coefficient.im * Math.sin(angle),
          y: sum.y + coefficient.re * Math.sin(angle) + coefficient.im * Math.cos(angle)
        };
      }, { x: 0, y: 0 });
      const point = evaluate(selected, t);
      close(point.x, expected.x);
      close(point.y, expected.y);
      close(curve.real[index], expected.x);
      close(curve.imaginary[index], expected.y);
    }
  }
});

test('complex sum uses Hz and seconds without wrapping time or forcing closure', () => {
  const waves = [{ re: 0.7, im: 0, frequency: 0.25 }];
  const point = evaluate(waves, 1);
  close(point.x, 0);
  close(point.y, 0.7);
  close(evaluate(waves, 2).x, -0.7);
});

for (const [encoding, bits] of [[1, 8], [1, 16], [1, 24], [1, 32], [3, 32], [3, 64]]) {
  test(`WAV encoding ${encoding}, ${bits}-bit, channels, padding, and multiple data chunks`, () => {
    const wav = readWav(asArrayBuffer(wavFixture({ encoding, bits, channels: 2, splitData: true })));
    assert.equal(wav.sampleRate, 96000);
    assert.equal(wav.channels, 2);
    assert.equal(wav.frames, 4096);
    for (const frame of [0, 1, 2047, 2048, 4095, 4]) {
      for (let channel = 0; channel < 2; channel++) {
        const expected = 0.7 * Math.cos(2 * Math.PI * (channel ? 113 : 1707) * frame / 4096);
        close(wav.sample(frame, channel), expected, bits === 8 ? 0.012 : 0.00005);
      }
    }
  });
}

test('extensible PCM and float WAV decode without resampling ultrasonic content', () => {
  for (const encoding of [1, 3]) {
    const wav = readWav(asArrayBuffer(wavFixture({ extensible: true, bits: 32, encoding })));
    const samples = Float64Array.from({ length: wav.frames }, (_, index) => wav.sample(index));
    const result = analyze(samples, wav.sampleRate);
    close(result.components[0].frequency, 40007.8125);
    close(result.components[0].amplitude, 0.7, 1e-7);
  }
});

test('invalid, truncated, unsupported, and non-finite data are rejected', () => {
  assert.throws(() => readWav(new ArrayBuffer(0)));
  const valid = wavFixture();
  assert.throws(() => readWav(asArrayBuffer(valid.subarray(0, valid.length - 3))));
  const unsupported = Buffer.from(valid);
  unsupported.writeUInt16LE(6, 32);
  assert.throws(() => readWav(asArrayBuffer(unsupported)), /PCM/);
  const badFloat = readWav(asArrayBuffer(wavFixture({ bits: 32, encoding: 3, value: () => NaN })));
  assert.throws(() => badFloat.sample(0), /부동소수점/);
  const wav = readWav(asArrayBuffer(valid));
  assert.throws(() => wav.sample(-1), RangeError);
  assert.throws(() => wav.sample(0, 1), RangeError);
});

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

test('arbitrary-length analytic signal reconstructs samples and drawing grid', () => {
  for (const length of [1, 3, 6, 17, 255, 1000]) {
    const samples = Float64Array.from({ length }, (_, index) => 0.17 + 0.6 * Math.sin(index * 0.49));
    const { components } = analyze(samples, 44100);
    assert.equal(components.length, Math.floor(length / 2) + 1);
    for (const component of components) close(component.frequency, component.bin * 44100 / length);
    samples.forEach((value, index) => close(evaluate(components, index / length).x, value));
    const curve = makeCurve(components, length);
    for (let index = 0; index < curve.length; index += 137) {
      const point = evaluate(components, index / curve.length);
      close(curve.real[index], point.x);
      close(curve.imaginary[index], point.y);
    }
    close(evaluate(components, 0).x, evaluate(components, 1).x);
    close(evaluate(components, 0).y, evaluate(components, 1).y);
  }
});

test('highest positive bin of odd lengths is doubled; even Nyquist is not', () => {
  for (const length of [3, 17, 97, 4801, 4800, 48000]) {
    const bin = Math.floor(length / 2);
    const phase = length % 2 ? 0.4 : 0;
    const samples = Float64Array.from({ length }, (_, index) => 0.7 * Math.cos(2 * Math.PI * bin * index / length + phase));
    const { components } = analyze(samples, 48000);
    assert.equal(components[0].bin, bin);
    close(components[0].amplitude, 0.7);
    close(components[0].phase, phase);
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

test('analytic signal reconstructs every real sample including DC and Nyquist', () => {
  const samples = Float64Array.from({ length: 256 }, (_, i) => 0.17 + 0.1 * (-1) ** i + 0.6 * Math.sin(i * 0.49));
  const { components } = analyze(samples, 48000);
  const curve = makeCurve(components, samples.length);
  samples.forEach((expected, index) => {
    close(evaluate(components, index / samples.length).x, expected);
    close(curve.real[index * curve.length / samples.length], expected);
  });
  const beginning = evaluate(components, 0);
  const ending = evaluate(components, 1);
  close(beginning.x, ending.x);
  close(beginning.y, ending.y);
});

test('sinusoid has correct amplitude, phase, and Hilbert quadrature', () => {
  const samples = Float64Array.from({ length: 128 }, (_, n) => 0.8 * Math.cos(2 * Math.PI * 7 * n / 128 + 0.4));
  const { components } = analyze(samples, 96000);
  assert.equal(components[0].bin, 7);
  close(components[0].amplitude, 0.8);
  close(components[0].phase, 0.4);
  for (let index = 0; index < 128; index++) {
    close(evaluate(components, index / 128).y, 0.8 * Math.sin(2 * Math.PI * 7 * index / 128 + 0.4));
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

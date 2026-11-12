// Unnormalized forward DFT, normalized inverse DFT. Both operate in place.
export function fft(real, imaginary, inverse = false) {
  const length = real.length;
  if (length < 1 || imaginary.length !== length) {
    throw new Error('실수부와 허수부는 같은 길이의 비어 있지 않은 배열이어야 합니다.');
  }
  if ((length & (length - 1)) === 0) return radix2(real, imaginary, inverse);

  // Bluestein: compute the exact length-N DFT using a linear convolution.
  // Padding belongs only to the convolution, never to the source interval.
  let size = 1;
  while (size < length * 2 - 1) size *= 2;
  const ar = new Float64Array(size);
  const ai = new Float64Array(size);
  const br = new Float64Array(size);
  const bi = new Float64Array(size);
  const sign = inverse ? 1 : -1;
  for (let index = 0; index < length; index++) {
    const angle = sign * Math.PI * ((index * index) % (2 * length)) / length;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    ar[index] = real[index] * cosine - imaginary[index] * sine;
    ai[index] = real[index] * sine + imaginary[index] * cosine;
    br[index] = cosine;
    bi[index] = -sine;
    if (index > 0) {
      br[size - index] = cosine;
      bi[size - index] = -sine;
    }
  }
  radix2(ar, ai);
  radix2(br, bi);
  for (let index = 0; index < size; index++) {
    const re = ar[index] * br[index] - ai[index] * bi[index];
    ai[index] = ar[index] * bi[index] + ai[index] * br[index];
    ar[index] = re;
  }
  radix2(ar, ai, true);
  const divisor = inverse ? length : 1;
  for (let index = 0; index < length; index++) {
    const angle = sign * Math.PI * ((index * index) % (2 * length)) / length;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    real[index] = (ar[index] * cosine - ai[index] * sine) / divisor;
    imaginary[index] = (ar[index] * sine + ai[index] * cosine) / divisor;
  }
}

function radix2(real, imaginary, inverse = false) {
  const length = real.length;
  for (let index = 1, reversed = 0; index < length; index++) {
    let bit = length >> 1;
    while (reversed & bit) {
      reversed ^= bit;
      bit >>= 1;
    }
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
      [imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]];
    }
  }
  for (let size = 2; size <= length; size *= 2) {
    const angle = (inverse ? 2 : -2) * Math.PI / size;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let block = 0; block < length; block += size) {
      let rotationReal = 1;
      let rotationImaginary = 0;
      for (let offset = 0; offset < size / 2; offset++) {
        const even = block + offset;
        const odd = even + size / 2;
        const oddReal = real[odd] * rotationReal - imaginary[odd] * rotationImaginary;
        const oddImaginary = real[odd] * rotationImaginary + imaginary[odd] * rotationReal;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
        const nextReal = rotationReal * stepReal - rotationImaginary * stepImaginary;
        rotationImaginary = rotationReal * stepImaginary + rotationImaginary * stepReal;
        rotationReal = nextReal;
      }
    }
  }
  if (inverse) {
    for (let index = 0; index < length; index++) {
      real[index] /= length;
      imaginary[index] /= length;
    }
  }
}

// Keep every FFT coefficient, with the same 1/N normalization for every bin.
// Magnitude is metadata for sorting and display; synthesis uses re/im directly.
export function analyze(samples, sampleRate) {
  const real = Float64Array.from(samples);
  const imaginary = new Float64Array(samples.length);
  fft(real, imaginary);
  const components = [];
  for (let bin = 0; bin < samples.length; bin++) {
    const harmonic = bin < Math.ceil(samples.length / 2) ? bin : bin - samples.length;
    const re = real[bin] / samples.length;
    const im = imaginary[bin] / samples.length;
    components.push({
      bin, harmonic, re, im,
      amplitude: Math.hypot(re, im),
      frequency: harmonic * sampleRate / samples.length
    });
  }
  components.sort((a, b) => b.amplitude - a.amplitude || a.bin - b.bin);
  return { components, length: samples.length, sampleRate };
}

export function makeCurve(components, sampleLength, sampleRate) {
  // This is only the drawing grid; analysis bins still use the exact source N.
  let length = 4096;
  while (length < sampleLength * 2) length *= 2;
  const real = new Float64Array(length + 1);
  const imaginary = new Float64Array(length + 1);
  for (const component of components) {
    const gridBin = component.harmonic < 0 ? length + component.harmonic : component.harmonic;
    real[gridBin] = component.re * length;
    imaginary[gridBin] = component.im * length;
  }
  // Evaluate the same exponential sum efficiently on an evenly spaced grid.
  fft(real.subarray(0, length), imaginary.subarray(0, length), true);
  // Include the actual sum at the end time; never copy the first point or
  // ask the renderer to close the path independently of the signal.
  const endpoint = evaluate(components, sampleLength / sampleRate);
  real[length] = endpoint.x;
  imaginary[length] = endpoint.y;
  return { real, imaginary, length: length + 1, segments: length };
}

export function evaluate(components, timeSeconds) {
  let x = 0;
  let y = 0;
  for (const component of components) {
    const angle = 2 * Math.PI * component.frequency * timeSeconds;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    x += component.re * cosine - component.im * sine;
    y += component.re * sine + component.im * cosine;
  }
  return { x, y };
}

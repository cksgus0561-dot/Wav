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

// Analytic signal: retain DC/Nyquist, double positive bins, discard negative bins.
// At the original sample positions its real part exactly reconstructs the input.
export function analyze(samples, sampleRate) {
  const real = Float64Array.from(samples);
  const imaginary = new Float64Array(samples.length);
  fft(real, imaginary);
  const components = [];
  for (let bin = 0; bin <= Math.floor(samples.length / 2); bin++) {
    const isNyquist = samples.length % 2 === 0 && bin === samples.length / 2;
    const scale = (bin === 0 || isNyquist ? 1 : 2) / samples.length;
    const re = real[bin] * scale;
    const im = imaginary[bin] * scale;
    components.push({
      bin, re, im,
      amplitude: Math.hypot(re, im),
      phase: Math.atan2(im, re),
      frequency: bin * sampleRate / samples.length
    });
  }
  components.sort((a, b) => b.amplitude - a.amplitude || a.bin - b.bin);
  return { components, length: samples.length, sampleRate };
}

export function makeCurve(components, sampleLength) {
  // This is only the drawing grid; analysis bins still use the exact source N.
  let length = 4096;
  while (length < sampleLength * 2) length *= 2;
  const real = new Float64Array(length);
  const imaginary = new Float64Array(length);
  for (const component of components) {
    real[component.bin] = component.re * length;
    imaginary[component.bin] = component.im * length;
  }
  fft(real, imaginary, true);
  return { real, imaginary, length };
}

export function evaluate(components, phase) {
  let x = 0;
  let y = 0;
  for (const component of components) {
    const angle = 2 * Math.PI * component.bin * phase + component.phase;
    x += component.amplitude * Math.cos(angle);
    y += component.amplitude * Math.sin(angle);
  }
  return { x, y };
}

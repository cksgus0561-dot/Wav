// Rasterize bounded pieces of the sampled curve, retaining the result between
// frames. A long interval must never become one enormous Canvas/Skia path.
export function createCurveLayer(curve, width, height, transform) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const { ratio, originX, originY, scale } = transform;
  context.setTransform(ratio * scale, 0, 0, -ratio * scale, ratio * originX, ratio * originY);
  context.strokeStyle = '#f2d875';
  context.lineWidth = 1.6 / scale;
  let drawn = 0;
  return {
    canvas,
    get drawn() { return drawn; },
    advance(target) {
      target = Math.min(curve.length - 1, target);
      if (target < drawn) {
        context.save();
        context.resetTransform();
        context.clearRect(0, 0, width, height);
        context.restore();
        drawn = 0;
      }
      const started = performance.now();
      // Both a time budget and a work bound keep input and animation responsive.
      for (let batch = 0; drawn < target && batch < 32; batch++) {
        const end = Math.min(target, drawn + 4096);
        context.beginPath();
        context.moveTo(curve.real[drawn], curve.imaginary[drawn]);
        for (let index = drawn + 1; index <= end; index++) {
          context.lineTo(curve.real[index], curve.imaginary[index]);
        }
        context.stroke();
        drawn = end;
        if (performance.now() - started > 8) break;
      }
      return drawn === target;
    }
  };
}

// Deterministic in-memory fixtures. No generated audio files are retained.
export function wavFixture({ bits = 16, encoding = 1, channels = 1, sampleRate = 96000, frames = 4096, extensible = false, value = (frame, channel) => 0.7 * Math.cos(2 * Math.PI * (channel ? 113 : 1707) * frame / 4096), splitData = false } = {}) {
  const block = channels * bits / 8;
  const data = Buffer.alloc(frames * block);
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = value(frame, channel);
      const offset = frame * block + channel * bits / 8;
      if (encoding === 3) {
        if (bits === 32) data.writeFloatLE(sample, offset);
        else data.writeDoubleLE(sample, offset);
      } else if (bits === 8) data.writeUInt8(Math.round(sample * 127) + 128, offset);
      else if (bits === 16) data.writeInt16LE(Math.round(sample * 32767), offset);
      else if (bits === 24) data.writeIntLE(Math.round(sample * 8388607), offset, 3);
      else data.writeInt32LE(Math.round(sample * 2147483647), offset);
    }
  }
  const format = Buffer.alloc(extensible ? 40 : 16);
  format.writeUInt16LE(extensible ? 0xfffe : encoding, 0);
  format.writeUInt16LE(channels, 2);
  format.writeUInt32LE(sampleRate, 4);
  format.writeUInt32LE(sampleRate * block, 8);
  format.writeUInt16LE(block, 12);
  format.writeUInt16LE(bits, 14);
  if (extensible) {
    format.writeUInt16LE(22, 16);
    format.writeUInt16LE(bits, 18);
    format.writeUInt32LE(encoding, 24);
    Buffer.from([0, 0, 16, 0, 128, 0, 0, 170, 0, 56, 155, 113]).copy(format, 28);
  }
  function chunk(id, bytes) {
    const header = Buffer.alloc(8);
    header.write(id);
    header.writeUInt32LE(bytes.length, 4);
    return Buffer.concat([header, bytes, Buffer.alloc(bytes.length % 2)]);
  }
  const half = Math.floor(frames / 2) * block;
  const chunks = [chunk('JUNK', Buffer.from([42, 0, 31])), chunk('fmt ', format)];
  if (splitData) chunks.push(chunk('data', data.subarray(0, half)), chunk('data', data.subarray(half)));
  else chunks.push(chunk('data', data));
  const payload = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF');
  header.writeUInt32LE(payload.length + 4, 4);
  header.write('WAVE', 8);
  return Buffer.concat([header, payload]);
}

export function asArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

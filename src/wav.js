export function readWav(buffer) {
  const view = new DataView(buffer);
  const text = (offset, count) => {
    let value = '';
    for (let index = 0; index < count; index++) value += String.fromCharCode(view.getUint8(offset + index));
    return value;
  };
  if (buffer.byteLength < 12 || text(0, 4) !== 'RIFF' || text(8, 4) !== 'WAVE') {
    throw new Error('RIFF/WAVE 형식의 WAV 파일을 선택해 주세요.');
  }
  const end = view.getUint32(4, true) + 8;
  if (end > buffer.byteLength || end < 12) throw new Error('WAV 파일이 잘렸거나 헤더가 손상되었습니다.');
  let format;
  const segments = [];
  for (let offset = 12; offset < end;) {
    if (offset + 8 > end) throw new Error('WAV 청크 헤더가 손상되었습니다.');
    const id = text(offset, 4);
    const size = view.getUint32(offset + 4, true);
    const data = offset + 8;
    if (data + size > end) throw new Error('WAV 데이터 길이가 파일 범위를 벗어납니다.');
    if (id === 'fmt ') {
      if (size < 16) throw new Error('WAV 형식 정보가 손상되었습니다.');
      let encoding = view.getUint16(data, true);
      const channels = view.getUint16(data + 2, true);
      const sampleRate = view.getUint32(data + 4, true);
      const blockAlign = view.getUint16(data + 12, true);
      const bits = view.getUint16(data + 14, true);
      if (encoding === 0xfffe) {
        if (size < 40 || view.getUint16(data + 16, true) < 22) {
          throw new Error('확장 WAV 헤더가 손상되었습니다.');
        }
        const guidTail = [0, 0, 16, 0, 128, 0, 0, 170, 0, 56, 155, 113];
        if (!guidTail.every((byte, index) => view.getUint8(data + 28 + index) === byte)) {
          throw new Error('지원하지 않는 확장 WAV 코덱입니다.');
        }
        encoding = view.getUint32(data + 24, true);
        const validBits = view.getUint16(data + 18, true);
        if (validBits > bits) throw new Error('WAV 유효 비트 수가 잘못되었습니다.');
      }
      const supported = (encoding === 1 && [8, 16, 24, 32].includes(bits)) ||
        (encoding === 3 && [32, 64].includes(bits));
      if (!supported) throw new Error('PCM 8/16/24/32-bit 또는 IEEE float 32/64-bit WAV를 지원합니다.');
      if (!channels || !sampleRate || blockAlign !== channels * bits / 8) {
        throw new Error('WAV 채널·샘플레이트·샘플 크기 정보가 잘못되었습니다.');
      }
      format = { encoding, channels, sampleRate, blockAlign, bits };
    }
    if (id === 'data' && size > 0) segments.push({ offset: data, size });
    offset = data + size + (size % 2);
  }
  if (!format || !segments.length) throw new Error('WAV에 형식 정보 또는 파형 데이터가 없습니다.');
  let frames = 0;
  for (const segment of segments) {
    if (segment.size % format.blockAlign !== 0) throw new Error('WAV 샘플 데이터가 중간에서 잘렸습니다.');
    segment.firstFrame = frames;
    segment.frames = segment.size / format.blockAlign;
    frames += segment.frames;
  }
  if (frames < 1) throw new Error('분석하려면 최소 1개 샘플이 필요합니다.');
  const bytes = format.bits / 8;
  let activeSegment = segments[0];
  return {
    ...format, frames, duration: frames / format.sampleRate,
    sample(frame, channel = 0) {
      if (!Number.isInteger(frame) || frame < 0 || frame >= frames ||
          !Number.isInteger(channel) || channel < 0 || channel >= format.channels) {
        throw new RangeError('샘플 또는 채널 범위를 벗어났습니다.');
      }
      if (frame < activeSegment.firstFrame || frame >= activeSegment.firstFrame + activeSegment.frames) {
        activeSegment = segments.find(segment => frame >= segment.firstFrame && frame < segment.firstFrame + segment.frames);
      }
      const offset = activeSegment.offset + (frame - activeSegment.firstFrame) * format.blockAlign + channel * bytes;
      let value;
      if (format.encoding === 3) {
        value = format.bits === 32 ? view.getFloat32(offset, true) : view.getFloat64(offset, true);
      } else if (format.bits === 8) {
        value = (view.getUint8(offset) - 128) / 128;
      } else if (format.bits === 16) {
        value = view.getInt16(offset, true) / 32768;
      } else if (format.bits === 24) {
        let integer = view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
        if (integer & 0x800000) integer -= 0x1000000;
        value = integer / 8388608;
      } else {
        value = view.getInt32(offset, true) / 2147483648;
      }
      if (!Number.isFinite(value)) throw new Error('WAV에 유효하지 않은 부동소수점 샘플이 있습니다.');
      return value;
    }
  };
}

export function makeDemo() {
  const sampleRate = 48000;
  return {
    channels: 1, sampleRate, bits: 32, encoding: 3,
    frames: sampleRate * 100, duration: 100,
    sample(frame) {
      return Math.fround(0.5 * Math.cos(2 * Math.PI * 440 * frame / sampleRate) +
        0.2 * Math.cos(2 * Math.PI * 713.37 * frame / sampleRate + 0.4));
    }
  };
}

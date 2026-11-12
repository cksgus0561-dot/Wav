import { analyze, makeCurve } from './fourier.js';
import { readWav, makeDemo } from './wav.js';
import { createCurveLayer } from './curve-layer.js';

const TAU = Math.PI * 2;
const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

// Independent entry point. Call destroy() before replacing this screen in a host app.
export function mountWaveCurves(root) {
  root.innerHTML = `
    <div class="wave-app">
      <header class="app-header">
        <div class="brand"><span class="brand-mark">∿</span><div><strong>Wave Curves</strong><span>파동과 곡선</span></div></div>
        <div class="header-actions">
          <button class="quiet" data-action="demo">예제 열기</button>
          <label class="file-button">WAV 파일 열기<input data-control="file" type="file" accept=".wav,audio/wav,audio/x-wav"></label>
        </div>
      </header>
      <div class="error" role="alert" hidden></div>
      <main>
        <section class="visual-panel" aria-label="파동 합성 시각화">
          <div class="canvas-heading"><div><h1>파동이 그리는 곡선</h1><p>x · 원본 파형 <span> / </span> y · 힐베르트 변환</p></div><div class="time-readout"><output class="source-time" aria-label="선택 구간 내 원본 시간"></output><span class="phase-label">0.0%</span></div></div>
          <div class="plot"><canvas class="curve-canvas" aria-label="푸리에 성분을 합성한 평면 곡선"></canvas></div>
          <div class="plot-toolbar">
            <div class="toggles"><label><input type="checkbox" data-control="circles" checked>회전 원</label><label><input type="checkbox" data-control="vectors" checked>연결선</label><label><input type="checkbox" data-control="preview" checked>전체 곡선</label></div>
            <button class="quiet" data-action="fit">화면 맞춤</button>
          </div>
          <div class="transport">
            <button class="play-button" data-action="play" aria-label="애니메이션 일시정지" aria-keyshortcuts="Space" title="재생 / 일시정지 (Space)">Ⅱ</button>
            <button class="restart" data-action="restart" aria-label="처음부터 그리기">↺</button>
            <label class="scrubber-label"><span class="sr-only">애니메이션 위치</span><input data-control="phase" type="range" min="0" max="1000" value="0"></label>
            <label class="speed-label">재생 배율<input data-control="speed" type="number" min="0" step="any" value="0.001" title="0보다 큰 배율을 입력한 뒤 Enter로 적용"><span>×</span></label>
          </div>
        </section>
        <aside class="inspector">
          <div class="section-heading"><h2>푸리에 성분</h2><span class="chip">FFT</span></div>
          <div class="component-summary"><input class="component-count" data-control="countNumber" type="number" min="1" max="1025" step="1" value="64" aria-label="합성 성분 수 직접 입력" title="개수를 입력한 뒤 Enter로 적용"><span>개의 파동으로 합성</span></div>
          <label class="range-label"><span class="sr-only">합성 성분 수</span><input data-control="count" type="range" min="1" max="1025" value="64"></label>
          <div class="range-caption"><span>1개</span><button class="text-button" data-action="all">전체 사용</button></div>
          <div class="energy"><span>성분 에너지 유지율</span><strong class="energy-value">—</strong></div>
          <p class="inspector-note">진폭이 큰 성분부터 더합니다. 성분 수를 바꾸며 곡선의 변화를 살펴보세요.</p>
          <div class="coefficient-heading"><h3>주요 성분</h3><span>원본 주파수</span></div>
          <table><thead><tr><th>Hz</th><th>진폭</th><th>위상</th></tr></thead><tbody class="coefficients"></tbody></table>
          <details><summary>곡선은 어떻게 만들어지나요?</summary><p>실수 파형의 양의 주파수 성분을 사용해 해석 신호를 만듭니다. 전체 성분을 사용하면 원래 샘플 위치에서 가로 좌표가 WAV 파형과 일치하고, 세로 좌표는 힐베르트 변환값입니다.</p><p>각 성분의 회전각은 2π × 주파수(Hz) × 구간 내 원본 시간(초) + 초기 위상입니다. 1×에서는 화면 1초 동안 원본 시간도 1초 진행합니다. 같은 배율에서는 구간 길이에 관계없이 같은 주파수가 같은 속도로 회전합니다. 선택 구간의 끝에 도달하면 처음부터 반복합니다.</p><p>빠른 회전을 살펴보려면 재생 배율을 낮추세요. 원 가이드는 진폭이 큰 64개까지 표시합니다. 연결선과 곡선에는 선택한 모든 성분을 반영합니다.</p></details>
        </aside>
        <section class="source-panel" aria-label="WAV 파형 및 분석 구간">
          <div class="source-heading"><div class="file-description"><span class="file-tag">WAV</span><div><h2 class="file-name">불러오는 중</h2><p class="file-meta">원본 샘플레이트 유지</p></div></div><span class="load-status" role="status" aria-live="polite"></span></div>
          <fieldset class="source-controls">
            <label>채널<select data-control="channel"><option>채널 1</option></select></label>
            <label>시작 위치<input data-control="start" type="number" value="0" min="0" step="0.001"><span>초</span></label>
            <label>끝 위치<input data-control="end" type="number" min="0" step="any"><span>초</span></label>
            <label>구간 길이<input data-control="duration" type="number" min="0" step="any"><span>초</span></label>
            <output class="window-info"></output>
          </fieldset>
          <div class="waveform-toolbar" aria-label="파형 보기 조절">
            <div class="waveform-buttons">
              <button data-action="wave-out" aria-label="파형 축소" title="파형 축소">−</button>
              <button data-action="wave-in" aria-label="파형 확대" title="파형 확대">+</button>
              <button data-action="wave-fit">전체 보기</button>
              <button data-action="wave-selection">선택 구간 보기</button>
              <button data-action="wave-pan" aria-pressed="false" title="켜면 드래그로 파형 화면을 좌우 이동합니다">이동 모드</button>
            </div>
            <output class="wave-view-info"></output>
          </div>
          <div class="waveform-wrap">
            <canvas class="waveform" tabindex="0" role="slider" aria-label="분석 구간 위치. 좌우 화살표로 이동" aria-valuemin="0" aria-valuemax="1" aria-valuenow="0"></canvas>
            <button class="wave-selection-handle" data-edge="start" aria-label="분석 구간 시작점 조절" title="드래그로 시작점 조절" hidden>⋮</button>
            <button class="wave-selection-handle" data-edge="end" aria-label="분석 구간 끝점 조절" title="드래그로 끝점 조절" hidden>⋮</button>
          </div>
          <div class="waveform-caption">
            <label class="wave-view-start"><input data-control="waveStartTime" type="number" value="0" min="0" step="any" aria-label="파형 보기 시작 시간" title="보이는 구간의 시작 시간 · Enter로 적용"><span>s</span></label>
            <label class="wave-view-end"><input data-control="waveEndTime" type="number" value="0" min="0" step="any" aria-label="파형 보기 끝 시간" title="보이는 구간의 끝 시간 · Enter로 적용"><span>s</span></label>
          </div>
          <label class="wave-scroll"><span>보기 위치</span><input data-control="wavePosition" type="range" min="0" max="0" value="0" step="1" aria-label="파형 보기 위치"></label>
          <p class="waveform-help">노란 구간 양끝 드래그: 길이 조절 · 클릭·드래그: 구간 이동 · 휠: 확대·축소 · Shift+드래그 또는 이동 모드: 화면 이동</p>
        </section>
      </main>
      <footer><span>선택 구간을 한 주기로 합성</span><span>마우스 드래그 · 시점 이동 &nbsp; 휠 · 확대</span></footer>
    </div>`;

  const query = selector => root.querySelector(selector);
  const controls = Object.fromEntries([...root.querySelectorAll('[data-control]')].map(element => [element.dataset.control, element]));
  const canvas = query('.curve-canvas');
  const context = canvas.getContext('2d');
  const waveform = query('.waveform');
  const waveContext = waveform.getContext('2d');
  const abort = new AbortController();
  const listen = (element, event, handler, options = {}) => element.addEventListener(event, handler, { ...options, signal: abort.signal });
  let disposed = false;
  let loadSequence = 0;
  let source;
  let envelope;
  let channel = 0;
  let startFrame = 0;
  let selectionLength = 2048;
  let analysis;
  let components = [];
  let curve;
  let curveLayers;
  let centerX = 0;
  let centerY = 0;
  let radius = 1;
  let sourceTime = 0;
  let traceComplete = false;
  let playbackRate = Number(controls.speed.value);
  let playing = true;
  let previousTime = performance.now();
  let frameId;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let plotDrag;
  let waveformDrag = null;
  let selectionResize = null;
  let waveStart = 0;
  let waveLength = 1;
  let wavePanMode = false;

  function showError(error) {
    query('.error').textContent = error.message;
    query('.error').hidden = false;
  }

  function fitCanvas(target) {
    const rect = target.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 2);
    target.width = Math.max(1, Math.round(rect.width * ratio));
    target.height = Math.max(1, Math.round(rect.height * ratio));
    return { width: rect.width, height: rect.height, ratio };
  }

  async function buildEnvelope(dataset, selectedChannel, sequence) {
    // Keep a pyramid of min/max buckets, so zooming reveals source samples
    // rather than stretching the thumbnail of the whole file.
    const bucketSize = 64;
    const bins = Math.ceil(dataset.frames / bucketSize);
    const low = new Float64Array(bins);
    const high = new Float64Array(bins);
    let peak = 0;
    for (let bin = 0; bin < bins; bin++) {
      let minimum = Infinity;
      let maximum = -Infinity;
      const first = bin * bucketSize;
      const last = Math.min(dataset.frames, first + bucketSize);
      for (let frame = first; frame < last; frame++) {
        const value = dataset.sample(frame, selectedChannel);
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
      }
      peak = Math.max(peak, Math.abs(minimum), Math.abs(maximum));
      low[bin] = minimum;
      high[bin] = maximum;
      if (bin % 4096 === 0) {
        await nextFrame();
        if (disposed || sequence !== loadSequence) return null;
      }
    }
    const levels = [{ low, high, bucketSize }];
    while (levels.at(-1).low.length > 1) {
      const previous = levels.at(-1);
      const count = Math.ceil(previous.low.length / 2);
      const next = { low: new Float64Array(count), high: new Float64Array(count), bucketSize: previous.bucketSize * 2 };
      for (let index = 0; index < count; index++) {
        const a = index * 2;
        const b = Math.min(a + 1, previous.low.length - 1);
        next.low[index] = Math.min(previous.low[a], previous.low[b]);
        next.high[index] = Math.max(previous.high[a], previous.high[b]);
      }
      levels.push(next);
    }
    return { levels, peak: peak || 1 };
  }

  function setWaveView(start, length) {
    if (!source) return;
    waveLength = Math.max(Math.min(8, source.frames), Math.min(source.frames, length));
    waveStart = Math.max(0, Math.min(source.frames - waveLength, start));
    drawWaveform();
  }

  function zoomWave(factor, fraction = 0.5) {
    if (!source) return;
    const anchor = waveStart + fraction * waveLength;
    const length = Math.max(Math.min(8, source.frames), Math.min(source.frames, waveLength * factor));
    setWaveView(anchor - fraction * length, length);
  }

  function drawWaveform() {
    const { width, height } = fitCanvas(waveform);
    const scale = waveform.width / width;
    waveContext.setTransform(scale, 0, 0, scale, 0, 0);
    waveContext.clearRect(0, 0, width, height);
    if (!source || !envelope) return;
    waveContext.strokeStyle = '#8eb5c0';
    waveContext.lineWidth = 1;
    waveContext.beginPath();
    const samplesPerPixel = waveLength / Math.max(width, 1);
    const y = value => height / 2 - value / envelope.peak * height * 0.42;
    const x = frame => (frame - waveStart) / waveLength * width;
    if (samplesPerPixel <= 2) {
      const first = Math.max(0, Math.floor(waveStart));
      const last = Math.min(source.frames - 1, Math.ceil(waveStart + waveLength));
      for (let frame = first; frame <= last; frame++) {
        const px = x(frame);
        const py = y(source.sample(frame, channel));
        if (frame === first) waveContext.moveTo(px, py);
        else waveContext.lineTo(px, py);
      }
      waveform.dataset.detail = 'samples';
    } else if (samplesPerPixel < 64) {
      for (let pixel = 0; pixel < Math.ceil(width); pixel++) {
        const first = Math.floor(waveStart + pixel * samplesPerPixel);
        const last = Math.min(source.frames, Math.ceil(waveStart + (pixel + 1) * samplesPerPixel));
        let low = Infinity;
        let high = -Infinity;
        for (let frame = first; frame < last; frame++) {
          const value = source.sample(frame, channel);
          low = Math.min(low, value);
          high = Math.max(high, value);
        }
        if (first < last) {
          waveContext.moveTo(pixel, y(high));
          waveContext.lineTo(pixel, y(low) + 0.5);
        }
      }
      waveform.dataset.detail = 'envelope';
    } else {
      const level = envelope.levels[Math.min(envelope.levels.length - 1, Math.floor(Math.log2(samplesPerPixel / 64)))];
      const first = Math.floor(waveStart / level.bucketSize);
      const last = Math.min(level.low.length, Math.ceil((waveStart + waveLength) / level.bucketSize));
      for (let index = first; index < last; index++) {
        const px = Math.max(0, x(index * level.bucketSize));
        waveContext.moveTo(px, y(level.high[index]));
        waveContext.lineTo(px, y(level.low[index]) + 0.5);
      }
      waveform.dataset.detail = 'envelope';
    }
    waveContext.stroke();
    const shownStart = selectionResize?.previewStart ?? startFrame;
    const shownEnd = selectionResize?.previewEnd ?? (startFrame + selectionLength);
    const left = x(shownStart);
    const right = x(shownEnd);
    if (right >= 0 && left <= width) {
      const visibleLeft = Math.max(0, left);
      const visibleRight = Math.min(width, Math.max(right, left + 2));
      waveContext.fillStyle = '#e9cf6b26';
      waveContext.fillRect(visibleLeft, 0, visibleRight - visibleLeft, height);
      waveContext.strokeStyle = '#e9cf6b';
      waveContext.beginPath();
      waveContext.moveTo(visibleLeft, 0.5); waveContext.lineTo(visibleRight, 0.5);
      waveContext.moveTo(visibleLeft, height - 0.5); waveContext.lineTo(visibleRight, height - 0.5);
      if (left >= 0) { waveContext.moveTo(left + 0.5, 0); waveContext.lineTo(left + 0.5, height); }
      if (right <= width) { waveContext.moveTo(visibleRight - 0.5, 0); waveContext.lineTo(visibleRight - 0.5, height); }
      waveContext.stroke();
    }
    for (const [edge, px] of [['start', left], ['end', right]]) {
      const handle = query(`[data-edge="${edge}"]`);
      handle.hidden = px < 0 || px > width;
      handle.style.left = `${Math.max(0, Math.min(width - 28, px - 14))}px`;
      // Keep both grips usable even when a short interval is subpixel-wide.
      handle.style.top = right - left < 40 ? (edge === 'start' ? '20%' : '60%') : 'calc(50% - 22px)';
    }
    const seconds = waveLength / source.sampleRate;
    controls.waveStartTime.value = (waveStart / source.sampleRate).toFixed(6);
    controls.waveEndTime.value = ((waveStart + waveLength) / source.sampleRate).toFixed(6);
    const minimumView = Math.min(8, source.frames);
    controls.waveStartTime.max = String((waveStart + waveLength - minimumView) / source.sampleRate);
    controls.waveEndTime.min = String((waveStart + minimumView) / source.sampleRate);
    controls.waveEndTime.max = String(source.duration);
    query('.wave-view-info').textContent = `${number.format(source.frames / waveLength)}× · ${seconds < 1 ? `${number.format(seconds * 1000)} ms` : `${number.format(seconds)} s`} 표시`;
    controls.wavePosition.max = String(Math.ceil(source.frames - waveLength));
    controls.wavePosition.value = String(Math.round(waveStart));
    controls.wavePosition.disabled = waveLength >= source.frames;
    query('[data-action="wave-in"]').disabled = waveLength <= Math.min(8, source.frames);
    query('[data-action="wave-out"]').disabled = waveLength >= source.frames;
    waveform.dataset.viewStart = String(waveStart);
    waveform.dataset.viewLength = String(waveLength);
    waveform.setAttribute('aria-valuemax', String(source.duration));
    waveform.setAttribute('aria-valuenow', String(startFrame / source.sampleRate));
    waveform.setAttribute('aria-valuetext', `${(startFrame / source.sampleRate).toFixed(6)}초부터 ${selectionLength}개 샘플`);
  }

  function rebuildCurve() {
    if (!analysis) return;
    const count = Math.min(Number(controls.count.value), analysis.components.length);
    components = analysis.components.slice(0, count);
    curve = makeCurve(components, analysis.length);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    curveLayers = null;
    for (let index = 0; index < curve.length; index++) {
      const x = curve.real[index];
      const y = curve.imaginary[index];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    centerX = (minX + maxX) / 2;
    centerY = (minY + maxY) / 2;
    radius = Math.max((maxX - minX) / 2, (maxY - minY) / 2, 0.01);
    const totalEnergy = analysis.components.reduce((sum, item) => sum + item.amplitude ** 2, 0);
    const usedEnergy = components.reduce((sum, item) => sum + item.amplitude ** 2, 0);
    controls.countNumber.max = controls.count.max;
    controls.countNumber.value = String(count);
    controls.countNumber.style.width = `${Math.max(2, String(count).length) + 1}ch`;
    query('.energy-value').textContent = `${(totalEnergy ? usedEnergy / totalEnergy * 100 : 100).toFixed(2)}%`;
    query('.coefficients').innerHTML = components.slice(0, 6).map(item => `<tr><td>${number.format(item.frequency)}</td><td>${item.amplitude.toFixed(4)}</td><td>${(item.phase * 180 / Math.PI).toFixed(1)}°</td></tr>`).join('');
    if (totalEnergy < 1e-24) query('.load-status').textContent = '선택 구간이 무음입니다. 곡선은 한 점입니다.';
    else query('.load-status').textContent = '분석 완료';
    sourceTime = 0;
    traceComplete = false;
    if (curveLayers) curveLayers.trace = null;
    previousTime = performance.now();
    controls.phase.value = '0';
  }

  function updateSelectionInputs(start = startFrame, length = selectionLength) {
    controls.start.value = (start / source.sampleRate).toFixed(9);
    controls.start.max = String((source.frames - length) / source.sampleRate);
    controls.start.step = 'any';
    controls.end.value = ((start + length) / source.sampleRate).toFixed(9);
    controls.end.min = String((start + 1) / source.sampleRate);
    controls.end.max = String(source.duration);
    controls.duration.value = (length / source.sampleRate).toFixed(9);
    controls.duration.min = String(1 / source.sampleRate);
    controls.duration.max = String((source.frames - start) / source.sampleRate);
    query('.window-info').textContent = `${number.format(length)}개 샘플 · 주파수 간격 ${number.format(source.sampleRate / length)} Hz`;
  }

  function analyzeSelection() {
    if (!source) return;
    const length = selectionLength;
    startFrame = Math.max(0, Math.min(source.frames - length, startFrame));
    const samples = Float64Array.from({ length }, (_, index) => source.sample(startFrame + index, channel));
    const nextAnalysis = analyze(samples, source.sampleRate);
    if (nextAnalysis.components.some(item => !Number.isFinite(item.amplitude))) {
      throw new Error('샘플 값이 너무 커서 분석할 수 없습니다.');
    }
    analysis = nextAnalysis;
    updateSelectionInputs();
    controls.count.max = String(analysis.components.length);
    controls.count.value = String(Math.min(Number(controls.count.value), analysis.components.length));
    rebuildCurve();
    drawWaveform();
  }

  function changeSelection(nextStart, nextLength = selectionLength) {
    if (!source || query('.source-controls').disabled) return;
    const previousStart = startFrame;
    const previousLength = selectionLength;
    selectionLength = Math.max(1, Math.min(source.frames, Math.round(nextLength)));
    startFrame = Math.max(0, Math.min(source.frames - selectionLength, Math.round(nextStart)));
    if (startFrame === previousStart && selectionLength === previousLength) {
      updateSelectionInputs();
      return;
    }
    try {
      analyzeSelection();
      query('.error').hidden = true;
    } catch (error) {
      startFrame = previousStart;
      selectionLength = previousLength;
      analyzeSelection();
      showError(error);
    }
  }

  async function loadDataset(getDataset, name, isDemo = false) {
    finishSelectionResize(false);
    const sequence = ++loadSequence;
    controls.channel.disabled = true;
    query('.source-controls').disabled = true;
    query('.error').hidden = true;
    query('.load-status').textContent = '파형 읽는 중…';
    try {
      const dataset = await getDataset();
      if (disposed || sequence !== loadSequence) return;
      const nextEnvelope = await buildEnvelope(dataset, 0, sequence);
      if (!nextEnvelope || disposed || sequence !== loadSequence) return;
      source = dataset;
      waveStart = 0;
      waveLength = source.frames;
      envelope = nextEnvelope;
      channel = 0;
      startFrame = 0;
      controls.channel.innerHTML = Array.from({ length: source.channels }, (_, index) => `<option value="${index}">채널 ${index + 1}</option>`).join('');
      selectionLength = Math.min(selectionLength, source.frames);
      query('.file-name').textContent = name;
      query('.file-tag').textContent = isDemo ? '예제' : 'WAV';
      query('.file-meta').textContent = `${number.format(source.sampleRate)} Hz · ${source.bits}-bit ${source.encoding === 3 ? 'float' : 'PCM'} · ${source.channels}채널 · ${number.format(source.duration)}초`;
      zoom = 1;
      panX = panY = 0;
      analyzeSelection();
      root.dataset.ready = 'true';
    } catch (error) {
      if (sequence === loadSequence && !disposed) {
        showError(error);
        query('.load-status').textContent = source ? '기존 파형 표시 중' : '파일 열기 실패';
      }
    } finally {
      if (sequence === loadSequence && !disposed) {
        controls.channel.disabled = false;
        query('.source-controls').disabled = false;
      }
    }
  }

  listen(controls.file, 'change', () => {
    const file = controls.file.files[0];
    controls.file.value = '';
    if (!file) return;
    loadDataset(async () => {
      if (file.size > 512 * 1024 * 1024) throw new Error('현재는 512 MB 이하의 WAV 파일을 열 수 있습니다.');
      return readWav(await file.arrayBuffer());
    }, file.name);
  });
  listen(query('[data-action="demo"]'), 'click', () => loadDataset(() => makeDemo(), '합성 파동 · 100초 예제', true));
  listen(controls.channel, 'change', async () => {
    const selected = Number(controls.channel.value);
    const sequence = ++loadSequence;
    query('.source-controls').disabled = true;
    query('.error').hidden = true;
    query('.load-status').textContent = '채널 읽는 중…';
    try {
      const nextEnvelope = await buildEnvelope(source, selected, sequence);
      if (!nextEnvelope || disposed || sequence !== loadSequence) return;
      channel = selected;
      envelope = nextEnvelope;
      analyzeSelection();
    } catch (error) {
      if (sequence === loadSequence && !disposed) {
        controls.channel.value = String(channel);
        showError(error);
        query('.load-status').textContent = '기존 채널 표시 중';
      }
    } finally {
      if (sequence === loadSequence && !disposed) query('.source-controls').disabled = false;
    }
  });
  listen(controls.start, 'change', () => {
    const seconds = controls.start.valueAsNumber;
    if (!source) return;
    if (Number.isFinite(seconds)) changeSelection(seconds * source.sampleRate);
    else updateSelectionInputs();
  });
  listen(controls.end, 'change', () => {
    const seconds = controls.end.valueAsNumber;
    if (!source) return;
    if (Number.isFinite(seconds)) {
      const endFrame = Math.max(startFrame + 1, Math.min(source.frames, Math.round(seconds * source.sampleRate)));
      changeSelection(startFrame, endFrame - startFrame);
    } else updateSelectionInputs();
  });
  listen(controls.duration, 'change', () => {
    const seconds = controls.duration.valueAsNumber;
    if (!source) return;
    if (Number.isFinite(seconds)) {
      changeSelection(startFrame, Math.min(source.frames - startFrame, Math.round(seconds * source.sampleRate)));
    } else updateSelectionInputs();
  });
  listen(controls.count, 'input', rebuildCurve);
  function applyCountInput() {
    const value = controls.countNumber.valueAsNumber;
    const count = Number.isFinite(value)
      ? Math.max(1, Math.min(Number(controls.count.max), Math.round(value)))
      : Number(controls.count.value);
    controls.countNumber.value = String(count);
    controls.countNumber.style.width = `${Math.max(2, String(count).length) + 1}ch`;
    if (count !== Number(controls.count.value)) {
      controls.count.value = String(count);
      rebuildCurve();
    }
  }
  listen(controls.countNumber, 'change', applyCountInput);
  listen(controls.countNumber, 'keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyCountInput();
    }
  });
  listen(query('[data-action="all"]'), 'click', () => {
    controls.count.value = controls.count.max;
    rebuildCurve();
  });
  function updatePlay() {
    const button = query('[data-action="play"]');
    button.textContent = playing ? 'Ⅱ' : '▶';
    button.setAttribute('aria-label', playing ? '애니메이션 일시정지' : '애니메이션 재생');
  }
  function advanceClock() {
    const now = performance.now();
    const elapsedSeconds = (now - previousTime) / 1000;
    previousTime = now;
    if (playing && analysis && !document.hidden && !query('.source-controls').disabled) {
      const duration = analysis.length / analysis.sampleRate;
      const nextTime = sourceTime + elapsedSeconds * playbackRate;
      // A complete revolution can happen between two rendered frames.
      // Preserve its trace even when the current phase wraps back to zero.
      if (nextTime >= duration) traceComplete = true;
      sourceTime = nextTime % duration;
    }
  }
  function togglePlay() {
    advanceClock();
    playing = !playing;
    updatePlay();
  }
  listen(query('[data-action="play"]'), 'click', togglePlay);
  listen(document, 'keydown', event => {
    if (event.code !== 'Space' || event.defaultPrevented || event.isComposing ||
        event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    if (!analysis || !root.isConnected || !root.getClientRects().length) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!root.contains(target) && target !== document.body && target !== document.documentElement) return;
    if (target.isContentEditable) return;
    const nativeControl = target.closest('input:not([type="range"]), textarea, select, button, a[href], summary, [role="button"], [role="textbox"]');
    if (nativeControl && nativeControl !== query('[data-action="play"]')) return;
    event.preventDefault();
    if (!event.repeat) togglePlay();
  });
  function applyPlaybackRate() {
    const rate = controls.speed.valueAsNumber;
    if (!Number.isFinite(rate) || rate <= 0) {
      controls.speed.value = String(playbackRate);
      return;
    }
    advanceClock();
    playbackRate = rate;
    controls.speed.value = String(playbackRate);
  }
  listen(controls.speed, 'change', applyPlaybackRate);
  listen(controls.speed, 'keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyPlaybackRate();
    }
  });
  listen(document, 'visibilitychange', () => { previousTime = performance.now(); });
  listen(query('[data-action="restart"]'), 'click', () => {
    sourceTime = 0;
    traceComplete = false;
    if (curveLayers) curveLayers.trace = null;
    previousTime = performance.now();
    controls.phase.value = '0';
  });
  listen(controls.phase, 'input', () => {
    if (!analysis) return;
    sourceTime = Number(controls.phase.value) / 1000 * analysis.length / analysis.sampleRate;
    traceComplete = Number(controls.phase.value) === 1000;
    if (curveLayers) curveLayers.trace = null;
    previousTime = performance.now();
    playing = false;
    updatePlay();
  });
  listen(query('[data-action="fit"]'), 'click', () => { zoom = 1; panX = panY = 0; });
  listen(canvas, 'wheel', event => {
    event.preventDefault();
    zoom = Math.max(0.2, Math.min(12, zoom * Math.exp(-event.deltaY * 0.001)));
  }, { passive: false });
  listen(canvas, 'pointerdown', event => {
    if (event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    plotDrag = { x: event.clientX, y: event.clientY };
  });
  listen(canvas, 'pointermove', event => {
    if (!plotDrag) return;
    panX += event.clientX - plotDrag.x;
    panY += event.clientY - plotDrag.y;
    plotDrag = { x: event.clientX, y: event.clientY };
  });
  listen(canvas, 'lostpointercapture', () => { plotDrag = null; });
  listen(query('[data-action="wave-in"]'), 'click', () => zoomWave(0.5));
  listen(query('[data-action="wave-out"]'), 'click', () => zoomWave(2));
  listen(query('[data-action="wave-fit"]'), 'click', () => { if (source) setWaveView(0, source.frames); });
  listen(query('[data-action="wave-selection"]'), 'click', () => {
    if (source) setWaveView(startFrame - selectionLength * 0.1, selectionLength * 1.2);
  });
  listen(query('[data-action="wave-pan"]'), 'click', event => {
    wavePanMode = !wavePanMode;
    event.currentTarget.setAttribute('aria-pressed', String(wavePanMode));
    waveform.classList.toggle('pan-mode', wavePanMode);
  });
  listen(controls.wavePosition, 'input', () => setWaveView(Number(controls.wavePosition.value), waveLength));
  function applyWaveBoundary(input, isStart) {
    if (!source) return;
    const seconds = input.valueAsNumber;
    if (!Number.isFinite(seconds)) { drawWaveform(); return; }
    const current = isStart ? waveStart : waveStart + waveLength;
    if (input.value === (current / source.sampleRate).toFixed(6)) return;
    const minimum = Math.min(8, source.frames);
    if (isStart) {
      const end = waveStart + waveLength;
      const start = Math.max(0, Math.min(end - minimum, seconds * source.sampleRate));
      setWaveView(start, end - start);
    } else {
      const end = Math.max(waveStart + minimum, Math.min(source.frames, seconds * source.sampleRate));
      setWaveView(waveStart, end - waveStart);
    }
  }
  for (const [input, isStart] of [[controls.waveStartTime, true], [controls.waveEndTime, false]]) {
    listen(input, 'change', () => applyWaveBoundary(input, isStart));
    listen(input, 'keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        applyWaveBoundary(input, isStart);
      }
    });
  }
  listen(waveform, 'wheel', event => {
    if (!source || query('.source-controls').disabled) return;
    event.preventDefault();
    const bounds = waveform.getBoundingClientRect();
    const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1;
    if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      setWaveView(waveStart + (event.deltaX || event.deltaY) * units / bounds.width * waveLength, waveLength);
    } else {
      zoomWave(Math.exp(Math.max(-2, Math.min(2, event.deltaY * units * 0.002))), Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)));
    }
  }, { passive: false });
  function selectPosition(event) {
    if (!source || query('.source-controls').disabled) return;
    const bounds = waveform.getBoundingClientRect();
    changeSelection(waveStart + (event.clientX - bounds.left) / bounds.width * waveLength - selectionLength / 2);
  }
  function beginSelectionResize(event, edge) {
    if (!source || query('.source-controls').disabled || event.button !== 0 || selectionResize) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    const bounds = waveform.getBoundingClientRect();
    selectionResize = {
      edge, pointerId: event.pointerId, source,
      x: event.clientX, framesPerPixel: waveLength / bounds.width,
      start: startFrame, end: startFrame + selectionLength,
      previewStart: startFrame, previewEnd: startFrame + selectionLength
    };
    waveformDrag = null;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function previewSelectionResize(event) {
    const drag = selectionResize;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.source !== source) { finishSelectionResize(false); return; }
    const delta = Math.round((event.clientX - drag.x) * drag.framesPerPixel);
    if (drag.edge === 'start') drag.previewStart = Math.max(0, Math.min(drag.end - 1, drag.start + delta));
    else drag.previewEnd = Math.max(drag.start + 1, Math.min(source.frames, drag.end + delta));
    updateSelectionInputs(drag.previewStart, drag.previewEnd - drag.previewStart);
    query('.window-info').textContent += ' · 놓으면 적용';
    drawWaveform();
  }
  function finishSelectionResize(apply) {
    const drag = selectionResize;
    if (!drag) return;
    selectionResize = null;
    if (apply && drag.source === source) changeSelection(drag.previewStart, drag.previewEnd - drag.previewStart);
    if (source) { updateSelectionInputs(); drawWaveform(); }
  }
  for (const handle of root.querySelectorAll('[data-edge]')) {
    listen(handle, 'pointerdown', event => beginSelectionResize(event, handle.dataset.edge));
    listen(handle, 'keydown', event => {
      if (!source || selectionResize || query('.source-controls').disabled || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const delta = event.key === 'ArrowLeft' ? -1 : 1;
      if (handle.dataset.edge === 'start') {
        const end = startFrame + selectionLength;
        const start = Math.max(0, Math.min(end - 1, startFrame + delta));
        changeSelection(start, end - start);
      } else changeSelection(startFrame, Math.max(1, Math.min(source.frames - startFrame, selectionLength + delta)));
    });
  }
  listen(document, 'pointermove', previewSelectionResize);
  listen(document, 'pointerup', event => {
    if (selectionResize?.pointerId !== event.pointerId) return;
    previewSelectionResize(event);
    finishSelectionResize(true);
  });
  for (const type of ['pointercancel', 'lostpointercapture']) {
    listen(document, type, event => { if (selectionResize?.pointerId === event.pointerId) finishSelectionResize(false); });
  }
  listen(document, 'keydown', event => {
    if (event.key === 'Escape' && selectionResize) { event.preventDefault(); finishSelectionResize(false); }
  });
  listen(waveform, 'pointerdown', event => {
    if (!source || query('.source-controls').disabled || ![0, 1].includes(event.button)) return;
    const pan = wavePanMode || event.shiftKey || event.button === 1;
    if (!pan) {
      const bounds = waveform.getBoundingClientRect();
      const px = event.clientX - bounds.left;
      const left = (startFrame - waveStart) / waveLength * bounds.width;
      const right = (startFrame + selectionLength - waveStart) / waveLength * bounds.width;
      const distanceLeft = left >= 0 && left <= bounds.width ? Math.abs(px - left) : Infinity;
      const distanceRight = right >= 0 && right <= bounds.width ? Math.abs(px - right) : Infinity;
      if (Math.min(distanceLeft, distanceRight) <= 6) {
        beginSelectionResize(event, distanceLeft < distanceRight ? 'start' : 'end');
        return;
      }
    }
    event.preventDefault();
    waveform.focus({ preventScroll: true });
    waveform.setPointerCapture(event.pointerId);
    waveformDrag = { pan, x: event.clientX, start: waveStart };
    if (!waveformDrag.pan) selectPosition(event);
  });
  listen(waveform, 'pointermove', event => {
    if (!waveformDrag) return;
    if (waveformDrag.pan) {
      const bounds = waveform.getBoundingClientRect();
      setWaveView(waveformDrag.start - (event.clientX - waveformDrag.x) / bounds.width * waveLength, waveLength);
    } else selectPosition(event);
  });
  listen(waveform, 'lostpointercapture', () => { waveformDrag = null; });
  listen(waveform, 'keydown', event => {
    if (!source || query('.source-controls').disabled || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') changeSelection(0);
    else if (event.key === 'End') changeSelection(source.frames);
    else changeSelection(startFrame + (event.key === 'ArrowLeft' ? -1 : 1) * Math.max(1, Math.round(selectionLength / 4)));
  });

  function render() {
    if (disposed) return;
    advanceClock();
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const ratio = canvas.width / Math.max(width, 1);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    if (curve) {
      const duration = analysis.length / analysis.sampleRate;
      const phase = sourceTime / duration;
      const scale = Math.min(width, height) * 0.34 / radius * zoom;
      const originX = width / 2 + panX - centerX * scale;
      const originY = height / 2 + panY + centerY * scale;
      const layerKey = [canvas.width, canvas.height, originX, originY, scale].join(',');
      if (!curveLayers || curveLayers.key !== layerKey) {
        curveLayers = { key: layerKey, full: null, trace: null };
      }
      const newLayer = () => createCurveLayer(curve, canvas.width, canvas.height, { ratio, originX, originY, scale });
      if (controls.preview.checked || traceComplete) {
        curveLayers.full ??= newLayer();
        curveLayers.full.advance(curve.length - 1, true);
      }
      context.strokeStyle = '#1a232c';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(originX, 0); context.lineTo(originX, height);
      context.moveTo(0, originY); context.lineTo(width, originY);
      context.stroke();
      if (controls.preview.checked && !traceComplete) {
        context.save();
        context.globalAlpha = 0.26;
        context.drawImage(curveLayers.full.canvas, 0, 0, width, height);
        context.restore();
      }
      context.save();
      context.translate(originX, originY);
      context.scale(scale, -scale);
      let x = 0;
      let y = 0;
      let chain = new Path2D();
      chain.moveTo(0, 0);
      let chainX = 0;
      let chainY = 0;
      let chainSegments = 0;
      const strokeChain = () => {
        context.save();
        context.lineWidth = 1 / scale;
        context.strokeStyle = '#c7d6dc9c';
        context.stroke(chain);
        context.restore();
      };
      for (let index = 0; index < components.length; index++) {
        const component = components[index];
        if (controls.circles.checked && index < 64 && component.bin !== 0 && component.amplitude * scale > 0.6) {
          context.beginPath();
          context.arc(x, y, component.amplitude, 0, TAU);
          context.strokeStyle = index < 3 ? '#7fc3d353' : '#7fc3d32c';
          context.lineWidth = 0.8 / scale;
          context.stroke();
        }
        const angle = TAU * component.frequency * sourceTime + component.phase;
        x += component.amplitude * Math.cos(angle);
        y += component.amplitude * Math.sin(angle);
        // All components are summed. Only visually subpixel chain segments
        // are coalesced; this does not change the endpoint or the curve.
        if (controls.vectors.checked && Math.hypot(x - chainX, y - chainY) * scale >= 0.25) {
          chain.lineTo(x, y);
          chainX = x;
          chainY = y;
          if (++chainSegments === 4096) {
            strokeChain();
            chain = new Path2D();
            chain.moveTo(x, y);
            chainSegments = 0;
          }
        }
      }
      if (controls.vectors.checked) {
        chain.lineTo(x, y);
        strokeChain();
      }
      context.restore();
      if (traceComplete) {
        context.drawImage(curveLayers.full.canvas, 0, 0, width, height);
      } else {
        const end = Math.min(curve.length - 1, Math.floor(phase * curve.length));
        curveLayers.trace ??= newLayer();
        const caughtUp = curveLayers.trace.advance(end);
        context.drawImage(curveLayers.trace.canvas, 0, 0, width, height);
        if (caughtUp) {
          context.beginPath();
          context.moveTo(originX + curve.real[end] * scale, originY - curve.imaginary[end] * scale);
          context.lineTo(originX + x * scale, originY - y * scale);
          context.strokeStyle = '#f2d875';
          context.lineWidth = 1.6;
          context.stroke();
        }
      }
      context.save();
      context.translate(originX, originY);
      context.scale(scale, -scale);
      context.fillStyle = '#fff4bc';
      context.beginPath();
      context.arc(x, y, 3.2 / scale, 0, TAU);
      context.fill();
      context.restore();
      controls.phase.value = String(Math.round(phase * 1000));
      query('.phase-label').textContent = `${(phase * 100).toFixed(1)}%`;
      query('.source-time').textContent = `${sourceTime.toFixed(6)} / ${duration.toFixed(6)} s`;
      canvas.dataset.phase = phase.toFixed(5);
      canvas.dataset.sourceTime = String(sourceTime);
    }
    frameId = requestAnimationFrame(render);
  }
  const observer = new ResizeObserver(() => { fitCanvas(canvas); drawWaveform(); });
  observer.observe(query('.plot'));
  observer.observe(query('.waveform-wrap'));
  fitCanvas(canvas);
  frameId = requestAnimationFrame(render);
  loadDataset(() => makeDemo(), '합성 파동 · 100초 예제', true);
  return {
    destroy() {
      disposed = true;
      loadSequence++;
      abort.abort();
      cancelAnimationFrame(frameId);
      observer.disconnect();
      root.replaceChildren();
      delete root.dataset.ready;
    }
  };
}

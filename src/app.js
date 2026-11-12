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
          <div class="waveform-wrap"><canvas class="waveform" tabindex="0" role="slider" aria-label="분석 구간 위치. 좌우 화살표로 이동" aria-valuemin="0" aria-valuemax="1" aria-valuenow="0"></canvas></div>
          <div class="waveform-caption"><span>0:00</span><span>파형을 클릭하거나 드래그해 분석 구간 이동</span><span class="duration">0:00</span></div>
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
  let waveformDrag = false;

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
    const bins = Math.min(1600, dataset.frames);
    const values = [];
    let peak = 0;
    for (let bin = 0; bin < bins; bin++) {
      let low = Infinity;
      let high = -Infinity;
      const first = Math.floor(bin * dataset.frames / bins);
      const last = Math.floor((bin + 1) * dataset.frames / bins);
      for (let frame = first; frame < last; frame++) {
        const value = dataset.sample(frame, selectedChannel);
        low = Math.min(low, value);
        high = Math.max(high, value);
      }
      peak = Math.max(peak, Math.abs(low), Math.abs(high));
      values.push({ low, high });
      if (bin % 64 === 0) {
        await nextFrame();
        if (disposed || sequence !== loadSequence) return null;
      }
    }
    return { values, peak: peak || 1 };
  }

  function drawWaveform() {
    const { width, height } = fitCanvas(waveform);
    const scale = waveform.width / width;
    waveContext.setTransform(scale, 0, 0, scale, 0, 0);
    waveContext.clearRect(0, 0, width, height);
    if (!source || !envelope) return;
    waveContext.strokeStyle = '#607981';
    waveContext.lineWidth = 1;
    waveContext.beginPath();
    for (let index = 0; index < envelope.values.length; index++) {
      const x = index / envelope.values.length * width;
      const { low, high } = envelope.values[index];
      waveContext.moveTo(x, height / 2 - high / envelope.peak * height * 0.42);
      waveContext.lineTo(x, height / 2 - low / envelope.peak * height * 0.42 + 0.5);
    }
    waveContext.stroke();
    const left = startFrame / source.frames * width;
    const selectionWidth = Math.max(2, selectionLength / source.frames * width);
    waveContext.fillStyle = '#e9cf6b26';
    waveContext.fillRect(left, 0, selectionWidth, height);
    waveContext.strokeStyle = '#e9cf6b';
    waveContext.strokeRect(left + 0.5, 0.5, selectionWidth, height - 1);
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

  function updateSelectionInputs() {
    const length = selectionLength;
    controls.start.value = (startFrame / source.sampleRate).toFixed(9);
    controls.start.max = String((source.frames - length) / source.sampleRate);
    controls.start.step = 'any';
    controls.end.value = ((startFrame + length) / source.sampleRate).toFixed(9);
    controls.end.min = String((startFrame + 1) / source.sampleRate);
    controls.end.max = String(source.duration);
    controls.duration.value = (length / source.sampleRate).toFixed(9);
    controls.duration.min = String(1 / source.sampleRate);
    controls.duration.max = String((source.frames - startFrame) / source.sampleRate);
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
      envelope = nextEnvelope;
      channel = 0;
      startFrame = 0;
      controls.channel.innerHTML = Array.from({ length: source.channels }, (_, index) => `<option value="${index}">채널 ${index + 1}</option>`).join('');
      selectionLength = Math.min(selectionLength, source.frames);
      query('.file-name').textContent = name;
      query('.file-tag').textContent = isDemo ? '예제' : 'WAV';
      query('.file-meta').textContent = `${number.format(source.sampleRate)} Hz · ${source.bits}-bit ${source.encoding === 3 ? 'float' : 'PCM'} · ${source.channels}채널 · ${number.format(source.duration)}초`;
      query('.duration').textContent = `${Math.floor(source.duration / 60)}:${String(Math.floor(source.duration % 60)).padStart(2, '0')}`;
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
  listen(query('[data-action="demo"]'), 'click', () => loadDataset(() => makeDemo(), '합성 파동 · 예제', true));
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
  function selectPosition(event) {
    if (!source || query('.source-controls').disabled) return;
    const bounds = waveform.getBoundingClientRect();
    changeSelection((event.clientX - bounds.left) / bounds.width * source.frames - selectionLength / 2);
  }
  listen(waveform, 'pointerdown', event => {
    if (event.button !== 0) return;
    waveform.setPointerCapture(event.pointerId);
    waveformDrag = true;
    selectPosition(event);
  });
  listen(waveform, 'pointermove', event => { if (waveformDrag) selectPosition(event); });
  listen(waveform, 'lostpointercapture', () => { waveformDrag = false; });
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
  loadDataset(() => makeDemo(), '합성 파동 · 예제', true);
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

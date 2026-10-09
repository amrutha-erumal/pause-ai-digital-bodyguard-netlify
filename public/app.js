import {
  MODEL,
  clamp,
  extractUrl,
  localSignals,
  normalizeAI,
  redactSensitive,
  samples
} from './risk-engine.mjs';

const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_MAX_SIDE = 1600;
const AI_TIMEOUT_MS = 28_000;

let sampleIndex = 0;
let selectedImage = null;
let lastResult = null;
let lastToolTrace = [];
let arenaIndex = 0;
let arenaScore = 0;
let resilienceScore = 0;
let vaccineAnswered = false;
let activeModal = null;
let restoreFocus = null;

const $ = (id) => document.getElementById(id);
const inputText = $('inputText');
const analyzeBtn = $('analyzeBtn');
const imageAnalyzeBtn = $('imageAnalyzeBtn');
const sampleBtn = $('sampleBtn');
const analysisStage = $('analysisStage');
const results = $('results');
const scanState = $('scanState');
const toast = $('toast');
const privacyShield = $('privacyShield');
const serviceStatus = $('serviceStatus');

function hasServerRoute() {
  // The app must be opened through a web server (localhost or production), never by
  // double-clicking index.html. Localhost also has working /api routes via server.mjs.
  return location.protocol === 'https:' || location.protocol === 'http:';
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add('hidden'), 3200);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

function setStatus(element, message, state = '') {
  if (!element) return;
  element.textContent = message;
  if (state) element.dataset.state = state;
}

function setBusy(isBusy) {
  [analyzeBtn, imageAnalyzeBtn].forEach((button) => {
    if (!button) return;
    button.disabled = isBusy || (button === imageAnalyzeBtn && !selectedImage);
    button.classList.toggle('is-busy', isBusy);
  });
}

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function terminalLog(lines) {
  const box = $('terminalLines');
  box.replaceChildren();
  lines.forEach((line, index) => {
    const node = document.createElement('div');
    node.className = 'terminal-line';
    node.style.animationDelay = `${index * 80}ms`;
    const match = String(line).match(/^<b>([^<]+)<\/b>\s*::\s*(.*)$/);
    if (match) {
      const label = document.createElement('b');
      label.textContent = match[1];
      const tail = document.createTextNode(` :: ${match[2]}`);
      node.append(label, tail);
    } else {
      node.textContent = String(line);
    }
    box.appendChild(node);
  });
}

function buildTerminalBase(text, imageData, redaction) {
  const lines = [];
  if (text) {
    const preview = redaction?.text ?? text;
    lines.push(`<b>signal</b> :: ${escapeHtml(preview.slice(0, 72))}${preview.length > 72 ? '…' : ''}`);
  }
  if (imageData) {
    lines.push(`<b>image</b> :: ${escapeHtml(imageData.name)} (${Math.round(imageData.size / 1024)} KB payload)`);
    if (imageData.originalSize && imageData.originalSize > imageData.size) {
      lines.push(`<b>efficiency</b> :: compressed ${(100 - (imageData.size / imageData.originalSize * 100)).toFixed(0)}% before upload`);
    }
  }
  lines.push(`<b>privacy</b> :: ${redaction?.changed ? 'obvious secrets masked before AI' : privacyShield.checked ? 'shield enabled • no obvious secrets found' : 'shield off'}`);
  lines.push(`<b>model</b> :: ${MODEL} via secure server route`);
  return lines;
}

async function fetchWithTimeout(url, options, timeoutMs = AI_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function askServer(text, imageData, fallback) {
  if (!hasServerRoute()) return { data: fallback, toolTrace: [], safeBrowsing: { status: 'local_preview' }, redactionsApplied: false };

  const redaction = privacyShield.checked && text ? redactSensitive(text) : { text, changed: false };
  const payload = {
    text: redaction.text,
    privacyShield: privacyShield.checked,
    image: imageData ? {
      name: imageData.name,
      mimeType: imageData.mimeType,
      base64: imageData.base64
    } : null
  };

  const response = await fetchWithTimeout('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-PAUSE-Client': 'web-1' },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error || `PAUSE server returned HTTP ${response.status}.`);
  }

  const data = normalizeAI(body.analysis, fallback);
  data.source = 'GEMINI LIVE';
  data.safeBrowsing = body.safeBrowsing || { status: 'not_configured' };
  data.factCheck = body.factCheck || { status: 'not_configured', results: [] };
  data.toolTrace = Array.isArray(body.toolTrace) ? body.toolTrace : [];
  data.redactionsApplied = Boolean(body.redactionsApplied || redaction.changed);
  return {
    data,
    toolTrace: data.toolTrace,
    safeBrowsing: data.safeBrowsing,
    redactionsApplied: data.redactionsApplied
  };
}

function renderGoogleCheck(data) {
  const state = data.safeBrowsing?.status || 'not_configured';
  const value = $('googleCheckValue');
  const detail = $('googleCheckDetail');
  if (!value || !detail) return;

  if (state === 'match') {
    value.textContent = 'MATCH FOUND';
    detail.textContent = `${data.safeBrowsing.matches?.length || 1} known threat-list match(es). Treat the URL as unsafe.`;
    value.dataset.state = 'danger';
  } else if (state === 'no_match') {
    value.textContent = 'NO MATCH FOUND';
    detail.textContent = 'Google returned no known Safe Browsing list match. This is not a guarantee of safety.';
    value.dataset.state = 'ok';
  } else if (state === 'error') {
    value.textContent = 'CHECK UNAVAILABLE';
    detail.textContent = 'Semantic analysis continues; URL reputation service was unavailable.';
    value.dataset.state = 'warn';
  } else if (state === 'local_preview') {
    value.textContent = 'HOSTED CHECK ONLY';
    detail.textContent = 'Deploy to the secure server route for live Google URL reputation.';
    value.dataset.state = 'warn';
  } else {
    value.textContent = 'OPTIONAL';
    detail.textContent = 'Add GOOGLE_SAFE_BROWSING_API_KEY to enable server-side URL reputation.';
    value.dataset.state = 'warn';
  }
}
function renderFactCheck(data) {
  const state = data.factCheck?.status || 'not_configured';
  const value = $('factCheckValue');
  const detail = $('factCheckDetail');
  if (!value || !detail) return;
  if (state === 'match') {
    value.textContent = `${data.factCheck.results?.length || 1} REVIEWED`;
    detail.textContent = 'Google found closely matched fact-checked claims. Open the cited review before trusting the claim.';
    value.dataset.state = 'warn';
  } else if (state === 'no_match') {
    value.textContent = 'NO MATCH';
    detail.textContent = 'No closely matched reviewed claim was returned. This is not proof of truth or safety.';
    value.dataset.state = 'ok';
  } else if (state === 'error') {
    value.textContent = 'UNAVAILABLE';
    detail.textContent = 'Claim evidence was unavailable; PAUSE continued with other signals.';
    value.dataset.state = 'warn';
  } else {
    value.textContent = 'OPTIONAL';
    detail.textContent = 'Add GOOGLE_FACTCHECK_API_KEY to enable reviewed-claim evidence.';
    value.dataset.state = 'warn';
  }
}

function renderResult(data) {
  lastResult = data;
  $('scoreValue').textContent = Math.round(data.score);
  $('riskLabel').textContent = data.risk;
  $('classValue').textContent = data.classification;
  $('riskSummary').textContent = data.summary || (
    data.score >= 80
      ? 'Multiple social-engineering signals combine into a high-risk pattern. Treat this as unsafe until independently verified.'
      : data.score >= 55
        ? 'The signal contains patterns worth verifying before you trust or respond.'
        : 'No major danger pattern was detected, but context still matters.'
  );
  const riskColor = data.score >= 80 ? 'var(--danger)' : data.score >= 55 ? 'var(--warn)' : 'var(--accent)';
  $('scoreRing').style.background = `conic-gradient(${riskColor} 0 ${data.score}%, #1b252e ${data.score}% 100%)`;
  $('targetValue').textContent = data.target;
  $('manipulationValue').textContent = data.manipulation;
  $('confidenceValue').textContent = data.confidence;

  const bars = $('dnaBars');
  bars.replaceChildren();
  data.dna.forEach(([label, value]) => {
    const row = document.createElement('div');
    row.className = 'bar-row';
    const name = document.createElement('label');
    name.textContent = label;
    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('i');
    fill.style.width = '0%';
    bar.appendChild(fill);
    const score = document.createElement('strong');
    score.textContent = `${Math.round(value)}%`;
    row.append(name, bar, score);
    bars.appendChild(row);
    requestAnimationFrame(() => { fill.style.width = `${value}%`; });
  });
  $('dnaNote').textContent = data.score >= 80
    ? 'The risk comes from a stack of signals, not a single suspicious word.'
    : 'No single signal proves fraud. Independent verification is still the safest pattern.';

  const trapList = $('trapList');
  trapList.replaceChildren();
  data.traps.forEach(([mark, title, desc]) => {
    const item = document.createElement('div');
    item.className = 'trap-item';
    const icon = document.createElement('div');
    icon.className = 'mark';
    icon.textContent = mark;
    const copy = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = title;
    const span = document.createElement('span');
    span.textContent = desc;
    copy.append(strong, span);
    item.append(icon, copy);
    trapList.appendChild(item);
  });

  const path = $('attackPath');
  path.replaceChildren();
  const steps = data.attackerPath?.length
    ? data.attackerPath
    : (data.score >= 80
      ? [['01', 'HOOK', 'Fear / reward'], ['02', 'PRESSURE', 'Shrink your decision window'], ['03', 'DIVERT', 'Move to an external route'], ['04', 'CAPTURE', 'Collect the target data']]
      : [['01', 'CONTACT', 'Unexpected message'], ['02', 'PRESSURE', 'Push quick action'], ['03', 'DIVERT', 'Move off a trusted channel'], ['04', 'CAPTURE', 'Seek information']]);
  steps.forEach(([step, title, detail], index) => {
    const node = document.createElement('div');
    node.className = 'attack-node';
    const small = document.createElement('small'); small.textContent = step;
    const strong = document.createElement('strong'); strong.textContent = title;
    const span = document.createElement('div'); span.textContent = detail;
    node.append(small, strong, span);
    path.appendChild(node);
    if (index < steps.length - 1) {
      const arrow = document.createElement('div'); arrow.className = 'attack-arrow'; arrow.textContent = '→';
      path.appendChild(arrow);
    }
  });

  $('actionHeadline').textContent = data.action;
  $('actionDetail').textContent = data.detail;
  $('breakpointValue').textContent = data.breakpoint || (
    data.credential
      ? 'Before sharing a credential, OTP or identity detail.'
      : data.payment || data.reward
        ? 'Before sending money, paying a fee or claiming a reward.'
        : data.hasUrl
          ? 'Before opening the supplied link or signing in through it.'
          : 'Before replying or taking the requested action.'
  );
  $('breakpointDetail').textContent = 'One independent verification step can break the chain before the risky action.';
  $('aiBadge').classList.toggle('hidden', data.source !== 'GEMINI LIVE');
  $('engineLabel').textContent = data.source === 'GEMINI LIVE'
    ? (data.safeBrowsing?.status === 'match' || data.safeBrowsing?.status === 'no_match' ? 'Gemini + Google URL check' : 'Gemini live')
    : 'Demo intelligence';
  renderGoogleCheck(data);
  renderFactCheck(data);
  prepareVaccine(data);
  initAgentDialogue(data);
  if (data.score >= 70) playAlert(); else playSuccess();

  $('analysisTitle').textContent = 'Threat profile built.';
  results.classList.remove('hidden');
  results.setAttribute('tabindex', '-1');
  results.focus({ preventScroll: true });
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function runAnalysis() {
  const textMode = !$('textInputArea').classList.contains('hidden');
  const text = textMode ? inputText.value.trim() : '';
  const imageData = textMode ? null : selectedImage;
  if (!text && !imageData) {
    showToast('Paste a signal or upload a screenshot first.');
    return;
  }

  setBusy(true);
  setStatus(scanState, 'RUNNING');
  if (imageData) {
    setStatus($('visualScanStatus'), 'Visual agent is analyzing…');
    $('visualScanHint').textContent = 'Reading visible text, layout cues, sender identity and suspicious links.';
    $('imageReadyText').textContent = 'ANALYSIS IN PROGRESS';
  }
  analysisStage.classList.remove('hidden');
  results.classList.add('hidden');
  $('runId').textContent = `PX-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

  const steps = [...document.querySelectorAll('.agent-step')];
  steps.forEach((step) => {
    step.classList.remove('live', 'done');
    step.querySelector('.step-state').textContent = 'QUEUED';
  });

  const privacyPreview = privacyShield.checked && text ? redactSensitive(text) : { text, changed: false };
  const fallback = localSignals(text || 'Screenshot uploaded for visual review.');
  if (!text && imageData) {
    fallback.score = 42;
    fallback.risk = 'VISUAL REVIEW';
    fallback.classification = 'SCREENSHOT / VISUAL SIGNAL';
    fallback.summary = 'The screenshot was captured successfully. Live multimodal analysis is required for semantic visual inspection.';
    fallback.action = 'Run the live visual agent before trusting or acting on what the screenshot shows.';
    fallback.detail = 'PAUSE will inspect visible text, interface cues and suspicious destinations when the server AI route is available.';
    fallback.confidence = 'Pending';
    fallback.source = 'LOCAL VISUAL PREVIEW';
  }

  const baseLines = buildTerminalBase(text, imageData, privacyPreview);
  terminalLog(baseLines);

  const serverAvailable = hasServerRoute();
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    step.classList.add('live');
    step.querySelector('.step-state').textContent = 'RUNNING';
    await sleep(420);
    const lines = [...baseLines];
    if (index === 0) lines.push(`<b>tool</b> :: ${imageData ? 'multimodal payload prepared' : 'signal ingestion complete'}`);
    if (index === 1) lines.push('<b>tool</b> :: privacy shield + behavioral indicators applied');
    if (index === 2) lines.push('<b>tool</b> :: Google URL reputation tool will run when configured', '<b>agent</b> :: mapping persuasion → diversion → capture');
    if (index === 3) lines.push(`<b>agent</b> :: ${serverAvailable ? 'requesting Gemini semantic synthesis through the server route' : 'local safety engine selected for preview'}`);
    terminalLog(lines);
    step.classList.remove('live');
    step.classList.add('done');
    step.querySelector('.step-state').textContent = 'DONE';
  }

  try {
    const serverResult = await askServer(text, imageData, fallback);
    const data = serverResult.data;
    lastToolTrace = serverResult.toolTrace;
    if (serverResult.toolTrace.length) {
      terminalLog([
        ...baseLines,
        ...serverResult.toolTrace.map((line) => `<b>tool</b> :: ${escapeHtml(line)}`),
        `<b>result</b> :: ${escapeHtml(data.risk)} • ${Math.round(data.score)}/100`
      ]);
    }
    renderResult(data);
    setStatus(scanState, 'COMPLETE');
  } catch (error) {
    console.warn('PAUSE analysis fallback', error);
    if (serverAvailable) showToast('Server AI is unavailable right now — showing the local safety fallback.');
    else showToast('Open PAUSE through START_PAUSE.bat or a web server to enable all interactions.');
    fallback.source = 'LOCAL SIGNAL ENGINE';
    fallback.safeBrowsing = { status: serverAvailable ? 'error' : 'local_preview' };
    fallback.breakpoint = fallback.credential
      ? 'Before sharing a credential, OTP or identity detail.'
      : fallback.hasUrl
        ? 'Before opening the supplied link.'
        : 'Before replying or taking the requested action.';
    renderResult(fallback);
    setStatus(scanState, serverAvailable ? 'LOCAL SAFETY FALLBACK' : 'LOCAL PREVIEW');
  } finally {
    setBusy(false);
    if (selectedImage) {
      setStatus($('visualScanStatus'), 'Visual signal ready');
      $('visualScanHint').textContent = 'You can rerun the visual agent or replace the screenshot.';
      $('imageReadyText').textContent = 'VISUAL SIGNAL READY';
    }
  }
}

// Screenshot workflow: validate, preview locally, then compress before AI upload.
async function readAndCompressImage(file) {
  if (!file) return null;
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) throw new Error('Please choose a PNG, JPG or WebP image.');
  if (file.size > IMAGE_MAX_BYTES) throw new Error('That image is over 8 MB. Please choose a smaller screenshot.');

  const previewUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode that image.'));
      img.src = previewUrl;
    });

    const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.78));
    const output = blob || await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    if (!output) throw new Error('Could not compress that image.');

    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(new Error('Could not prepare that image for upload.'));
      reader.readAsDataURL(output);
    });

    return {
      name: file.name,
      originalSize: file.size,
      size: output.size,
      mimeType: output.type || 'image/webp',
      base64,
      previewUrl,
      width,
      height
    };
  } catch (error) {
    URL.revokeObjectURL(previewUrl);
    throw error;
  }
}

async function loadImageFile(file) {
  try {
    const image = await readAndCompressImage(file);
    if (selectedImage?.previewUrl) URL.revokeObjectURL(selectedImage.previewUrl);
    selectedImage = image;
    $('imagePreview').src = image.previewUrl;
    $('imagePreviewWrap').classList.remove('hidden');
    $('imageName').textContent = image.name;
    $('imageReadyText').textContent = 'VISUAL SIGNAL READY';
    $('uploadBox').classList.add('hidden');
    setImageModeUI();
    showToast('Screenshot ready. Run the visual PAUSE agent.');
  } catch (error) {
    showToast(error.message || 'Could not load that screenshot.');
  }
}

function setImageModeUI() {
  const hasImage = Boolean(selectedImage);
  imageAnalyzeBtn.disabled = !hasImage;
  imageAnalyzeBtn.setAttribute('aria-disabled', String(!hasImage));
  if (hasImage) {
    setStatus($('visualScanStatus'), 'Visual signal ready');
    $('visualScanHint').textContent = 'Run the agent to inspect visible text, interface cues and suspicious links.';
  } else {
    setStatus($('visualScanStatus'), 'Waiting for a screenshot');
    $('visualScanHint').textContent = 'Upload an image, then run the PAUSE agent on the visual signal.';
  }
}

function clearImage() {
  if (selectedImage?.previewUrl) URL.revokeObjectURL(selectedImage.previewUrl);
  selectedImage = null;
  $('imageInput').value = '';
  $('imagePreview').removeAttribute('src');
  $('imagePreviewWrap').classList.add('hidden');
  $('uploadBox').classList.remove('hidden');
  setImageModeUI();
  showToast('Screenshot removed.');
}

// Tabs
const tabs = [...document.querySelectorAll('.input-tab')];
tabs.forEach((tab) => tab.addEventListener('click', () => {
  tabs.forEach((item) => {
    const selected = item === tab;
    item.classList.toggle('active', selected);
    item.setAttribute('aria-selected', String(selected));
  });
  const mode = tab.dataset.mode;
  $('textInputArea').classList.toggle('hidden', mode !== 'text');
  $('imageInputArea').classList.toggle('hidden', mode !== 'image');
  if (mode === 'image') setImageModeUI();
  playBlip(540, 0.05);
}));

// --- Dynamic Cyber Theme Engine ---
const THEMES = ['obsidian', 'quantum', 'vanguard', 'arctic'];
const THEME_NAMES = {
  obsidian: 'Obsidian',
  quantum: 'Quantum',
  vanguard: 'Vanguard',
  arctic: 'Arctic'
};

function initTheme() {
  const saved = localStorage.getItem('pause_theme') || 'obsidian';
  setTheme(saved);
}

function setTheme(theme) {
  const current = THEMES.includes(theme) ? theme : 'obsidian';
  document.documentElement.dataset.theme = current;
  localStorage.setItem('pause_theme', current);
  const label = $('themeName');
  if (label) label.textContent = THEME_NAMES[current] || 'Obsidian';
}

function cycleTheme() {
  const current = document.documentElement.dataset.theme || 'obsidian';
  const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
  setTheme(next);
  playBlip(620, 0.06);
  showToast(`Switched theme to ${THEME_NAMES[next]}`);
}

const themeToggleBtn = $('themeToggleBtn');
if (themeToggleBtn) themeToggleBtn.addEventListener('click', cycleTheme);

// --- Synthesized Cyber Audio Engine (Web Audio API) ---
let audioCtx = null;
let soundEnabled = localStorage.getItem('pause_sound') !== 'false';

function initSound() {
  updateSoundUI();
}

function updateSoundUI() {
  const icon = $('soundIcon');
  if (icon) icon.textContent = soundEnabled ? '🔊' : '🔇';
  const btn = $('soundToggleBtn');
  if (btn) btn.setAttribute('title', soundEnabled ? 'Audio feedback: ON' : 'Audio feedback: MUTED');
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem('pause_sound', String(soundEnabled));
  updateSoundUI();
  if (soundEnabled) playSuccess();
  showToast(soundEnabled ? 'Cyber sound effects enabled' : 'Sound effects muted');
}

const soundToggleBtn = $('soundToggleBtn');
if (soundToggleBtn) soundToggleBtn.addEventListener('click', toggleSound);

function getAudioContext() {
  if (!audioCtx && typeof AudioContext !== 'undefined') {
    audioCtx = new AudioContext();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playBlip(freq = 580, duration = 0.08, type = 'sine') {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {}
}

function playSuccess() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      setTimeout(() => playBlip(freq, 0.12, 'triangle'), i * 75);
    });
  } catch {}
}

function playAlert() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    [440, 392, 330].forEach((freq, i) => {
      setTimeout(() => playBlip(freq, 0.14, 'sawtooth'), i * 90);
    });
  } catch {}
}

// --- Synthetic Screenshot Presets Engine ---
function createSyntheticScreenshot(type) {
  const canvas = document.createElement('canvas');
  canvas.width = 750;
  canvas.height = 1000;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Background gradient: sleek dark phone screen
  const bgGrad = ctx.createLinearGradient(0, 0, 0, 1000);
  bgGrad.addColorStop(0, '#0a0f1d');
  bgGrad.addColorStop(1, '#05070f');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 750, 1000);

  // Status Bar
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 26px -apple-system, system-ui, sans-serif';
  ctx.fillText('9:41', 40, 52);
  ctx.textAlign = 'right';
  ctx.fillText('5G  100%', 710, 52);
  ctx.textAlign = 'left';

  // Header / Navigation bar
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 76, 750, 96);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 172);
  ctx.lineTo(750, 172);
  ctx.stroke();

  let sender = 'SMS Alert';
  let timestamp = 'Today 9:40 AM';
  let title = 'CRITICAL SECURITY ALERT';
  let message = '';
  let link = '';
  let badgeColor = '#ff3366';

  if (type === 'bank') {
    sender = '+1 (800) 555-0199 • Bank Fraud Desk';
    title = 'CHASE // ACCOUNT RESTRICTION';
    message = 'URGENT: Suspicious debit attempt of $2,450.00 detected from an unverified device. Your card is temporarily locked. Tap below to verify identity within 15 minutes:';
    link = 'https://secure-chase-fraud-verify.com/auth';
  } else if (type === 'crypto') {
    sender = 'Discord Nitro Official Bot';
    title = 'COMMUNITY AIRDROP';
    message = 'CONGRATULATIONS! Your account was randomly selected for 1 Year Discord Nitro + 0.25 ETH reward. Claim your voucher before allocation expires:';
    link = 'https://discord-nitro-gift-claims.xyz/airdrop';
    badgeColor = '#8b5cf6';
  } else {
    sender = 'USPS Delivery Notification';
    title = 'PACKAGE DELIVERY HOLD';
    message = 'USPS: Parcel tracking #US9400100984 cannot be delivered due to incomplete street address. A $1.95 redelivery handling fee is required to reschedule:';
    link = 'https://usps-reschedule-delivery-fee.link/track';
    badgeColor = '#f59e0b';
  }

  // Sender info
  ctx.fillStyle = '#94a3b8';
  ctx.font = '22px -apple-system, system-ui, sans-serif';
  ctx.fillText(sender, 40, 122);
  ctx.fillStyle = '#64748b';
  ctx.font = '17px -apple-system, system-ui, sans-serif';
  ctx.fillText(timestamp, 40, 154);

  // Notification Card Bubble
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.roundRect(36, 210, 678, 380, 20);
  ctx.fill();
  ctx.strokeStyle = badgeColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Badge tag
  ctx.fillStyle = badgeColor;
  ctx.beginPath();
  ctx.roundRect(60, 240, 310, 38, 8);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px -apple-system, system-ui, sans-serif';
  ctx.fillText(title, 75, 265);

  // Message text (wrapped)
  ctx.fillStyle = '#f1f5f9';
  ctx.font = '24px -apple-system, system-ui, sans-serif';
  const words = message.split(' ');
  let line = '';
  let y = 330;
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > 620 && n > 0) {
      ctx.fillText(line, 60, y);
      line = words[n] + ' ';
      y += 36;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, 60, y);

  // Suspicious Link Highlight
  y += 46;
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 22px -apple-system, system-ui, sans-serif';
  ctx.fillText('Tap to verify: ' + link, 60, y);

  // Attacker pressure warning label
  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'italic 18px -apple-system, system-ui, sans-serif';
  ctx.fillText('Immediate action required within 15 minutes to avoid suspension.', 60, y + 40);

  return canvas;
}

async function loadSampleScreenshot(type) {
  const canvas = createSyntheticScreenshot(type);
  if (!canvas) return;
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;
  const file = new File([blob], `sample-${type}-alert.png`, { type: 'image/png' });
  await loadImageFile(file);
  playBlip(750, 0.08);
  showToast(`Sample screenshot loaded. Click 'Run visual PAUSE agent'!`);
}

document.querySelectorAll('.image-sample-chip').forEach((button) => {
  button.addEventListener('click', () => loadSampleScreenshot(button.dataset.sampleImage));
});

// --- Interactive Agent Intelligence Interrogation ---
function initAgentDialogue(data) {
  const dialogueContent = $('agentDialogueContent');
  const dialogueStatus = $('agentDialogueStatus');
  if (!dialogueContent) return;
  document.querySelectorAll('.question-chip').forEach((c) => c.classList.remove('active'));
  if (dialogueStatus) dialogueStatus.textContent = `READY • THREAT SCORE ${Math.round(data.score)}/100`;
  dialogueContent.textContent = `PAUSE Agent is online and analyzing this ${data.classification} signal. Select a question above or type your question below to interrogate the attack mechanism.`;
}

function answerAgentQuery(queryKey, customText = '') {
  const data = lastResult || localSignals(inputText.value.trim() || 'Urgent security alert');
  const dialogueContent = $('agentDialogueContent');
  const dialogueStatus = $('agentDialogueStatus');
  if (!dialogueContent) return;

  let response = '';
  const score = Math.round(data.score || 85);
  const target = data.target || 'Credentials / Financial authorization';
  const manipulation = data.manipulation || 'Urgency + Impersonation';

  if (queryKey === 'why') {
    response = `TACTICAL DECOMPOSITION:\n` +
      `• Primary Vector: ${manipulation}\n` +
      `• Target Objective: ${target}\n` +
      `• The attacker relies on cognitive compression: shortening your window of skepticism with artificial urgency so you bypass standard verification.\n` +
      `• Notice the channel diversion: instead of directing you to an in-app portal or physical card support number, it forces an unauthenticated external route.`;
  } else if (queryKey === 'fallout') {
    response = `SIMULATED ATTACKER FALLOUT:\n` +
      `• If clicked: The link typically presents a reverse-proxy clone of the authentic login or payment screen.\n` +
      `• If credentials entered: Session tokens or MFA prompts are relayed live to the threat actor's command server within seconds.\n` +
      `• Identity Exposure: High risk of immediate account takeover, unauthorized funds transfer, or credential stuffing.`;
  } else if (queryKey === 'verify') {
    response = `ZERO-RISK INDEPENDENT VERIFICATION PLAYBOOK:\n` +
      `1. DO NOT tap any link or call numbers provided in this message.\n` +
      `2. Open your smartphone or browser and navigate directly to the official app or bookmarked banking/service domain.\n` +
      `3. Inspect your verified notification center or dial the verified support number from the physical back of your card.\n` +
      `4. If legitimate, the alert will be prominently displayed in your authenticated inbox.`;
  } else if (queryKey === 'scammer') {
    response = `ATTACKER PSYCHOLOGY RECONSTRUCTION:\n` +
      `• Mindset: Social engineers know fear of immediate loss triggers adrenaline, suppressing rational skepticism.\n` +
      `• Scale: Threat actors blast tens of thousands of automated templates hoping for a 1-2% response rate.\n` +
      `• Weapon: Trust borrowing. They do not hack the bank's servers; they impersonate the institution's brand reputation.`;
  } else if (queryKey === 'reply') {
    response = `RECOMMENDED DEFENSIVE ACTION:\n` +
      `• Best Practice: Do not reply. Replying confirms your phone number or email is active and monitored, increasing future targeting.\n` +
      `• In corporate environments: Forward the raw header and screenshot to your internal security operations desk.\n` +
      `• In mobile messaging: Use 'Report Junk / Phishing' and immediately block the sender identifier.`;
  } else {
    const q = (customText || '').toLowerCase();
    if (q.includes('safe') || q.includes('legit') || q.includes('real')) {
      response = `ASSESSMENT: Given the risk score of ${score}/100 and detected ${manipulation}, this pattern has near-zero probability of being legitimate official correspondence. Real institutions do not threaten immediate account termination via urgent unauthenticated links.`;
    } else if (q.includes('money') || q.includes('cost') || q.includes('pay') || q.includes('card')) {
      response = `FINANCIAL RISK: The signal indicates a lure targeting financial credentials or an unauthorized fee. Never authorize transactions or provide card CVV numbers through links originating in SMS or unverified emails.`;
    } else {
      response = `TACTICAL AGENT ANALYSIS (${score}/100 Risk):\n` +
        `Regarding "${customText}":\n` +
        `This threat profile actively exploits ${manipulation} to target ${target}. The safest operational response is to discard the message and verify via an out-of-band channel.`;
    }
  }

  playBlip(820, 0.08);
  if (dialogueStatus) dialogueStatus.textContent = `ACTIVE RESPONSE // ${new Date().toLocaleTimeString()}`;
  typewriterText(dialogueContent, response);
}

function typewriterText(element, text) {
  element.textContent = '';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    element.textContent = text;
    return;
  }
  let index = 0;
  const timer = setInterval(() => {
    if (index < text.length) {
      element.textContent += text.charAt(index);
      index++;
    } else {
      clearInterval(timer);
    }
  }, 8);
}

document.querySelectorAll('.question-chip').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.question-chip').forEach((c) => c.classList.remove('active'));
    button.classList.add('active');
    answerAgentQuery(button.dataset.query);
  });
});

const askAgentBtn = $('askAgentBtn');
if (askAgentBtn) {
  askAgentBtn.addEventListener('click', () => {
    const val = $('agentQueryInput')?.value.trim();
    if (val) {
      answerAgentQuery('custom', val);
    } else {
      showToast('Type a question for the agent first.');
    }
  });
}

const agentQueryInput = $('agentQueryInput');
if (agentQueryInput) {
  agentQueryInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      askAgentBtn?.click();
    }
  });
}

// Vaccine Difficulty Level Selection
let vaccineDifficulty = 1;
document.querySelectorAll('.level-chip').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.level-chip').forEach((c) => c.classList.remove('active'));
    button.classList.add('active');
    vaccineDifficulty = Number(button.dataset.level || 1);
    playBlip(700, 0.06);
    showToast(`Vaccine difficulty set to Level ${vaccineDifficulty}`);
  });
});

// Screenshot click / drag-drop / clipboard paste.
$('uploadBox').addEventListener('click', () => $('imageInput').click());
$('imageInput').addEventListener('change', (event) => loadImageFile(event.target.files?.[0]));
['dragenter', 'dragover'].forEach((eventName) => $('uploadBox').addEventListener(eventName, (event) => {
  event.preventDefault();
  $('uploadBox').classList.add('dragging');
}));
['dragleave', 'drop'].forEach((eventName) => $('uploadBox').addEventListener(eventName, (event) => {
  event.preventDefault();
  $('uploadBox').classList.remove('dragging');
}));
$('uploadBox').addEventListener('drop', (event) => loadImageFile(event.dataTransfer?.files?.[0]));
document.addEventListener('paste', (event) => {
  if (document.activeElement === inputText) return;
  const item = [...(event.clipboardData?.items || [])].find((entry) => entry.type.startsWith('image/'));
  if (item) {
    const file = item.getAsFile();
    if (file) {
      document.querySelector('[data-mode="image"]').click();
      loadImageFile(file);
    }
  }
});
imageAnalyzeBtn.addEventListener('click', runAnalysis);
$('removeImage').addEventListener('click', clearImage);
setImageModeUI();

// Samples
function loadSample(key) {
  inputText.value = samples[key];
  document.querySelector('[data-mode="text"]').click();
  playBlip(680, 0.06);
  showToast('Sample loaded. Run the PAUSE agent.');
}
document.querySelectorAll('.quick-chip').forEach((button) => button.addEventListener('click', () => loadSample(button.dataset.sample)));
sampleBtn.addEventListener('click', () => {
  const keys = Object.keys(samples);
  sampleIndex = (sampleIndex + 1) % keys.length;
  loadSample(keys[sampleIndex]);
});
analyzeBtn.addEventListener('click', runAnalysis);

// Navigation
$('resetBtn').addEventListener('click', () => {
  results.classList.add('hidden');
  analysisStage.classList.add('hidden');
  setStatus(scanState, 'READY');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('newScanBtn').addEventListener('click', () => {
  $('resetBtn').click();
  setTimeout(() => inputText.focus(), 350);
});
$('decisionBtn').addEventListener('click', () => scrollToSection('arena'));
$('vaccineJumpBtn').addEventListener('click', () => scrollToSection('vaccine'));
// Primary navigation is handled by navigation.js using native anchors, so it still works
// even if the AI module is delayed, unavailable, or fails to initialize.

// Attacker view
function openAttacker() {
  const data = lastResult || localSignals(inputText.value);
  const chain = data.attackerPath?.length ? data.attackerPath : [
    ['01', 'HOOK', 'Create fear, reward or curiosity.'],
    ['02', 'PRESSURE', 'Make you feel you must act now.'],
    ['03', 'DIVERT', 'Move you away from a trusted channel.'],
    ['04', 'CAPTURE', 'Ask for credentials, money or access.'],
    ['05', 'REPEAT', 'Use the captured trust to continue the attack.']
  ];
  const target = $('attackerChain');
  target.replaceChildren();
  chain.forEach(([step, title, detail]) => {
    const card = document.createElement('div'); card.className = 'attacker-step';
    const num = document.createElement('span'); num.className = 'num'; num.textContent = step;
    const strong = document.createElement('strong'); strong.textContent = title;
    const p = document.createElement('p'); p.textContent = detail;
    card.append(num, strong, p); target.appendChild(card);
  });
  openModal('attackerModal', $('attackerViewBtn'));
}

// Report
function openReport() {
  const data = lastResult || localSignals(inputText.value.trim() || '');
  const lines = [
    ['Risk', data.risk], ['Score', `${data.score}/100`], ['Classification', data.classification],
    ['Target', data.target], ['Immediate action', data.action],
    ['Google URL reputation', data.safeBrowsing?.status === 'match' ? 'Known threat match' : data.safeBrowsing?.status === 'no_match' ? 'No known match' : 'Not configured'],
    ['Google claim evidence', data.factCheck?.status === 'match' ? `${data.factCheck.results?.length || 1} reviewed claim match(es)` : data.factCheck?.status === 'no_match' ? 'No reviewed match' : 'Not configured']
  ];
  const container = $('reportLines');
  container.replaceChildren();
  lines.forEach(([label, value]) => {
    const row = document.createElement('div'); row.className = 'report-line';
    const left = document.createElement('span'); left.textContent = label;
    const right = document.createElement('b'); right.textContent = value;
    row.append(left, right); container.appendChild(row);
  });
  openModal('reportModal', $('reportBtn'));
}
$('reportBtn').addEventListener('click', openReport);
$('downloadReport').addEventListener('click', () => {
  const data = lastResult || localSignals(inputText.value.trim() || '');
  const text = [
    'PAUSE — AI DIGITAL BODYGUARD', '',
    `Risk: ${data.risk}`, `Score: ${data.score}/100`, `Classification: ${data.classification}`,
    `Target: ${data.target}`, `Immediate action: ${data.action}`,
    `Google URL reputation: ${data.safeBrowsing?.status || 'not_configured'}`,
    `Google claim evidence: ${data.factCheck?.status || 'not_configured'}`,
    '', 'This report is a safety aid, not a guarantee of maliciousness or safety.'
  ].join('\n');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'pause-safety-report.txt';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
  showToast('Safety report exported.');
});

// Trust-center modal — no client-side API key input by design.
async function refreshHealth() {
  setStatus(serviceStatus, 'Secure AI route • checking…');
  if (!hasServerRoute()) {
    setStatus(serviceStatus, 'Open through START_PAUSE.bat to enable the server route', 'warn');
    $('geminiStatus').textContent = 'Web server required';
    $('safeBrowsingStatus').textContent = 'Web server required';
    $('searchGroundingStatus')?.replaceChildren(document.createTextNode('Web server required'));
    $('factCheckStatus')?.replaceChildren(document.createTextNode('Web server required'));
    return;
  }
  try {
    const response = await fetchWithTimeout('/api/health', { headers: { 'Accept': 'application/json' } }, 7000);
    const body = await response.json();
    $('geminiStatus').textContent = body.geminiConfigured ? 'Configured' : 'Missing env var';
    $('safeBrowsingStatus').textContent = body.safeBrowsingConfigured ? 'Configured' : 'Optional / not configured';
    $('searchGroundingStatus')?.replaceChildren(document.createTextNode(body.googleSearchGroundingConfigured ? 'Enabled' : 'Disabled'));
    $('factCheckStatus')?.replaceChildren(document.createTextNode(body.factCheckConfigured ? 'Configured' : 'Optional / not configured'));
    setStatus(serviceStatus, body.geminiConfigured ? 'Secure AI route • Gemini + Google Search' : 'Secure route • Gemini key missing', body.geminiConfigured ? 'ok' : 'warn');
  } catch {
    setStatus(serviceStatus, 'Service health unavailable', 'warn');
    $('geminiStatus').textContent = 'Unknown';
    $('safeBrowsingStatus').textContent = 'Unknown';
    $('searchGroundingStatus')?.replaceChildren(document.createTextNode('Unknown'));
    $('factCheckStatus')?.replaceChildren(document.createTextNode('Unknown'));
  }
}

function getFocusable(container) {
  return [...container.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.disabled && element.offsetParent !== null);
}

function openModal(id, opener) {
  const modal = $(id);
  if (!modal) return;
  activeModal = modal;
  restoreFocus = opener || document.activeElement;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  const focusable = getFocusable(modal);
  focusable[0]?.focus();
}

function closeModal(modal = activeModal) {
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  const target = restoreFocus;
  activeModal = null;
  restoreFocus = null;
  target?.focus?.();
}
$('settingsBtn').addEventListener('click', () => {
  openModal('settingsModal', $('settingsBtn'));
  refreshHealth();
});
$('refreshHealthBtn').addEventListener('click', refreshHealth);
$('closeSettings').addEventListener('click', () => closeModal($('settingsModal')));
$('closeModal').addEventListener('click', () => closeModal($('reportModal')));
$('closeAttacker').addEventListener('click', () => closeModal($('attackerModal')));
[ $('settingsModal'), $('reportModal'), $('attackerModal') ].forEach((modal) => modal.addEventListener('click', (event) => {
  if (event.target === modal) closeModal(modal);
}));
document.addEventListener('keydown', (event) => {
  if (!activeModal) return;
  if (event.key === 'Escape') {
    closeModal(activeModal);
    return;
  }
  if (event.key === 'Tab') {
    const focusable = getFocusable(activeModal);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }
});

// Threat Vaccine Lab
function getPrimaryTactic(data) {
  if (data.credential && data.urgency) return 'Urgency + identity pressure';
  if (data.payment && data.impersonation) return 'Trust borrowing + payment pressure';
  if (data.reward) return 'Reward bait + action pressure';
  if (data.hasUrl) return 'Channel diversion + urgency';
  if (data.impersonation) return 'Trust borrowing';
  return data.manipulation || 'Pressure / persuasion';
}
function getMemoryRule(data) {
  if (data.credential && data.urgency) return 'A deadline never replaces identity verification. I use the official channel before sharing credentials or codes.';
  if (data.payment && data.impersonation) return 'Urgency + authority + money is a verify-first pattern. I call the person or organization using a trusted contact.';
  if (data.reward) return 'Unexpected rewards create speed pressure. I verify the offer independently before claiming anything.';
  if (data.hasUrl) return 'A supplied link is a route, not proof. I navigate to the official site/app myself.';
  return 'When someone compresses my decision time, I create a pause and verify through a separate trusted channel.';
}
function prepareVaccine(data) {
  $('vaccineThreatTitle').textContent = `${data.risk} • ${data.classification}`;
  const tactic = getPrimaryTactic(data);
  const dna = $('vaccineDna');
  dna.replaceChildren();
  [['TACTIC', tactic], ['CONFIDENCE', data.confidence], ['BREAKPOINT', $('breakpointValue').textContent]].forEach(([label, value]) => {
    const labelNode = document.createElement('span');
    labelNode.textContent = label;
    const valueNode = document.createElement('strong');
    valueNode.textContent = value;
    dna.append(labelNode, valueNode);
  });
  $('memoryRule').textContent = data.memoryRule || getMemoryRule(data);
  $('mutationState').textContent = 'READY';
  $('mutationText').textContent = 'Run the vaccine to generate a fictional variation that preserves the manipulation pattern while changing the wording and context.';
  $('mutationChannel').textContent = 'SIMULATED MESSAGE • VARIANT A';
  $('mutationPressure').textContent = `TACTIC: ${tactic}`;
  $('mutationActions').replaceChildren();
  $('mutationResult').classList.add('hidden');
  vaccineAnswered = false;
  $('startVaccineBtn').textContent = 'Build my 20-second vaccine ✦';
}
function buildMutation(data) {
  const tactic = getPrimaryTactic(data);
  if (data.credential && data.urgency) return {
    channel: 'SIMULATED SMS • VARIANT A', tactic,
    text: '[SIMULATION] Your campus account will be locked tonight. Complete a quick security check within 15 minutes using the portal linked below.',
    choices: [{label:'Open the linked portal', key:'risky'}, {label:'Open the official campus portal myself and check notices', key:'safe'}, {label:'Reply with my student ID first', key:'risky'}],
    correct: 'safe', why: 'You recognized the pattern rather than the wording: pressure + authority + a requested action. Independent navigation breaks the trap.'
  };
  if (data.payment || data.reward) return {
    channel: 'SIMULATED CHAT • VARIANT A', tactic,
    text: '[SIMULATION] A delivery refund is waiting for you. Confirm a small processing step now so the refund can be released before it expires.',
    choices: [{label:'Pay the processing step', key:'risky'}, {label:'Check the order in the official app first', key:'safe'}, {label:'Send the message to a friend to ask if it looks real', key:'risky'}],
    correct: 'safe', why: 'You resisted the reward/refund pressure and moved to a known source before any money action.'
  };
  return {
    channel: 'SIMULATED EMAIL • VARIANT A', tactic,
    text: '[SIMULATION] We noticed an issue with your account. Please use the verification button below before access is limited.',
    choices: [{label:'Use the button immediately', key:'risky'}, {label:'Open the official service separately and verify the alert', key:'safe'}, {label:'Reply asking the sender to confirm', key:'risky'}],
    correct: 'safe', why: 'The safe move is to verify independently instead of trusting the path supplied by the message.'
  };
}
async function startVaccine() {
  const data = lastResult || localSignals(inputText.value.trim() || '');
  $('mutationState').textContent = 'BUILDING…';
  $('startVaccineBtn').disabled = true;
  let mutation;
  try {
    if (hasServerRoute()) {
      const response = await fetchWithTimeout('/api/vaccine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-PAUSE-Client': 'web-1' },
        body: JSON.stringify({
          classification: data.classification,
          tactic: getPrimaryTactic(data),
          memoryRule: data.memoryRule || getMemoryRule(data),
          score: data.score
        })
      }, 18_000);
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.mutation) throw new Error(body?.error || 'Live vaccine unavailable.');
      mutation = body.mutation;
      lastToolTrace = [...lastToolTrace, 'Gemini generated a personalized defensive mutation'];
      showToast('Live Gemini mutation built. Same tactic, new skin.');
    } else {
      mutation = buildMutation(data);
      showToast('Local vaccine preview ready. Deploy to enable live Gemini mutation.');
    }
  } catch (error) {
    mutation = buildMutation(data);
    showToast('Live vaccine unavailable — using the safe local mutation.');
  } finally {
    $('startVaccineBtn').disabled = false;
  }

  $('mutationState').textContent = 'LIVE DRILL';
  $('mutationChannel').textContent = mutation.channel;
  $('mutationPressure').textContent = `TACTIC: ${mutation.tactic}`;
  $('mutationText').textContent = mutation.text;
  if (mutation.memoryRule) $('memoryRule').textContent = mutation.memoryRule;
  const row = $('mutationActions'); row.replaceChildren();
  mutation.choices.forEach(({ label, key }) => {
    const button = document.createElement('button'); button.className = 'choice mutation-choice'; button.type = 'button'; button.textContent = label;
    button.dataset.choice = key; button.addEventListener('click', () => answerVaccine(mutation, key)); row.appendChild(button);
  });
  $('mutationResult').classList.add('hidden');
  $('startVaccineBtn').textContent = 'Generate another mutation ↻';
}
function answerVaccine(mutation, key) {
  if (vaccineAnswered) return;
  vaccineAnswered = true;
  const safe = key === mutation.correct;
  resilienceScore = safe ? Math.min(100, resilienceScore + 34) : Math.max(0, resilienceScore - 10);
  $('resilienceScore').textContent = resilienceScore;
  document.querySelectorAll('.mutation-choice').forEach((button) => {
    button.disabled = true;
    if (button.dataset.choice === mutation.correct) button.classList.add('correct');
    if (button.dataset.choice === key && !safe) button.classList.add('wrong');
  });
  const box = $('mutationResult');
  box.replaceChildren();
  const strong = document.createElement('strong');
  strong.textContent = safe ? '✦ Pattern recognized.' : '⚠️ The surface changed, but the pressure pattern was still there.';
  const reason = document.createElement('span');
  reason.textContent = mutation.why;
  const note = document.createElement('em');
  note.textContent = safe ? 'Your defense rule is getting stronger.' : 'PAUSE shows the missed cue so you can retry with a new mutation.';
  box.append(strong, reason, note);
  box.classList.remove('hidden');
  $('mutationState').textContent = safe ? 'IMMUNE +34' : 'RETRAIN -10';
  showToast(safe ? 'Great — you recognized the pattern, not the wording.' : 'Close — PAUSE exposed the missed manipulation cue.');
}
$('startVaccineBtn').addEventListener('click', startVaccine);

// Decision Arena
const arenaScenarios = [
  { source: 'SMS • UNKNOWN SENDER', sender: 'BANK SUPPORT', text: 'We detected unusual activity. Your account will be suspended unless you confirm your identity within 10 minutes. Tap here to restore access: secure-login.example', choices: [['Tap the link and verify', 'click'], ['Reply asking for help', 'reply'], ['Open the official bank app', 'verify'], ['Ignore it and do nothing', 'ignore']], best: 'verify', why: '✅ You broke the attack chain by switching to a trusted channel instead of following the message.', points: { click: 0, reply: 1, verify: 3, ignore: 2 } },
  { source: 'EMAIL • “INTERNSHIP HR”', sender: 'CAREERS TEAM', text: 'Your internship offer is ready. Please send Aadhaar + OTP now so we can activate your joining portal before 6 PM.', choices: [['Send the details — it came from HR', 'send'], ['Ask for the official portal through a known college contact', 'verify'], ['Forward it to your friend', 'forward'], ['Reply with just the OTP', 'otp']], best: 'verify', why: '✅ Great. Independent verification breaks impersonation and prevents a sensitive-data handoff.', points: { send: 0, verify: 3, forward: 1, otp: 0 } },
  { source: 'CHAT • FRIEND ACCOUNT “COMPROMISED”', sender: 'FRIEND • 2 min ago', text: 'I am stuck. Please send ₹2,000 to this UPI now. I will return it in an hour. Please don’t call, just trust me.', choices: [['Send it quickly — they sound urgent', 'send'], ['Call the friend using a known number', 'verify'], ['Ask the chat for another UPI ID', 'reply'], ['Post the request in the group', 'forward']], best: 'verify', why: '✅ Nice. A trusted side-channel check defeats account impersonation and urgency.', points: { send: 0, verify: 3, reply: 1, forward: 1 } }
];
function renderArena() {
  const scenario = arenaScenarios[arenaIndex];
  $('scenarioNumber').textContent = `SCENARIO ${String(arenaIndex + 1).padStart(2, '0')}`;
  $('scenarioSource').textContent = scenario.source;
  $('scenarioSender').replaceChildren(document.createTextNode(scenario.sender + ' '));
  const now = document.createElement('span'); now.textContent = '• now'; $('scenarioSender').appendChild(now);
  $('scenarioText').textContent = scenario.text;
  $('arenaFeedback').className = 'arena-feedback hidden';
  $('arenaNext').classList.add('hidden');
  const row = $('choiceRow'); row.replaceChildren();
  scenario.choices.forEach(([label, key]) => {
    const button = document.createElement('button'); button.className = 'choice'; button.type = 'button'; button.textContent = label; button.dataset.choice = key;
    button.addEventListener('click', () => chooseArena(key)); row.appendChild(button);
  });
}
function chooseArena(key) {
  const scenario = arenaScenarios[arenaIndex];
  const points = scenario.points[key] || 0;
  arenaScore += points;
  $('arenaScore').textContent = arenaScore;
  document.querySelectorAll('#choiceRow .choice').forEach((button) => {
    button.disabled = true;
    if (button.dataset.choice === scenario.best) button.classList.add('correct');
    if (button.dataset.choice === key && key !== scenario.best) button.classList.add('wrong');
  });
  const feedback = $('arenaFeedback');
  feedback.textContent = key === scenario.best ? scenario.why : `⚠️ Not the safest choice. ${scenario.why.replace('✅ ', '')}`;
  feedback.className = `arena-feedback ${key === scenario.best ? 'good' : 'bad'}`;
  $('arenaNext').classList.remove('hidden');
  $('nextScenarioBtn').textContent = arenaIndex < arenaScenarios.length - 1 ? 'Next scenario →' : 'Play again ↻';
  showToast(`Decision recorded: +${points} points`);
}
$('nextScenarioBtn').addEventListener('click', () => {
  arenaIndex = (arenaIndex + 1) % arenaScenarios.length;
  if (arenaIndex === 0) arenaScore = 0;
  $('arenaScore').textContent = arenaScore;
  renderArena();
});
renderArena();

// Keyboard affordances.
inputText.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') runAnalysis();
});

// Health status is useful in a judging walkthrough and never exposes secrets.
refreshHealth();
initTheme();
initSound();

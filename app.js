// ====================================================================
// 瞬間英作 PWA - メインロジック
// ====================================================================

const STORAGE_KEY = 'shunkan-eisaku-state-v2';
const SETTINGS_KEY = 'shunkan-eisaku-settings-v1';

// SRS インターバル (ミリ秒)
const SRS = {
  AGAIN: 0,
  HARD: 24 * 60 * 60 * 1000,
  GOOD: 3 * 24 * 60 * 60 * 1000,
};

let allProblems = [];        // 全シーン統合
let scenes = [];             // [{id, label, file}]
let state = null;            // { byId: {...}, sessionRetry: [] }
let settings = { geminiTts: false, rate: 0.95, sceneFilter: 'all' };
let currentId = null;
let currentProblem = null;

// ====================================================================
// Init
// ====================================================================
async function init() {
  loadSettings();
  applySettings();
  bindUI();
  await loadAllProblems();
  loadOrCreateState();
  renderSceneSelector();
  buildSessionQueue();
  nextProblem();
}

// ====================================================================
// Storage
// ====================================================================
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) settings = { ...settings, ...JSON.parse(raw) };
  } catch {}
}
function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
function loadOrCreateState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = JSON.parse(raw);
      // 新規追加された問題分の entry を埋める
      for (const p of allProblems) {
        if (!state.byId[p.id]) state.byId[p.id] = { nextDue: 0, streak: 0, seen: 0 };
      }
      saveState();
      return;
    }
  } catch {}
  state = { byId: {}, sessionRetry: [] };
  for (const p of allProblems) {
    state.byId[p.id] = { nextDue: 0, streak: 0, seen: 0 };
  }
  saveState();
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ====================================================================
// Problem loading
// ====================================================================
async function loadAllProblems() {
  const idxRes = await fetch('data/index.json');
  const idx = await idxRes.json();
  scenes = idx.scenes;
  allProblems = [];
  for (const s of scenes) {
    const r = await fetch('data/' + s.file);
    const data = await r.json();
    for (const p of data.problems) {
      p.scene = s.id;
      p.sceneLabel = s.label;
      allProblems.push(p);
    }
  }
}

function problemsForCurrentScene() {
  if (settings.sceneFilter === 'all') return allProblems;
  return allProblems.filter(p => p.scene === settings.sceneFilter);
}

// ====================================================================
// SRS queue logic
// ====================================================================
function buildSessionQueue() {
  const now = Date.now();
  const pool = problemsForCurrentScene();
  const due = pool.filter(p => (state.byId[p.id]?.nextDue ?? 0) <= now);
  due.sort((a, b) => {
    const sa = state.byId[a.id];
    const sb = state.byId[b.id];
    if ((sa.seen === 0) !== (sb.seen === 0)) return sa.seen === 0 ? -1 : 1;
    return sa.nextDue - sb.nextDue;
  });
  const retrySet = new Set(state.sessionRetry || []);
  // 現在のシーン外の retry は除外
  const validIds = new Set(pool.map(p => p.id));
  state.sessionRetry = (state.sessionRetry || []).filter(id => validIds.has(id));
  const queue = due.map(p => p.id).filter(id => !retrySet.has(id));
  state.currentQueue = queue;
  saveState();
}

function nextProblem() {
  hideAnswer();
  document.getElementById('mic-result').textContent = '';
  let id;
  if (state.sessionRetry && state.sessionRetry.length > 0) {
    id = state.sessionRetry.shift();
  } else if (state.currentQueue && state.currentQueue.length > 0) {
    id = state.currentQueue.shift();
  } else {
    showEmpty();
    return;
  }
  currentId = id;
  currentProblem = allProblems.find(p => p.id === id);
  if (!currentProblem) {
    nextProblem();
    return;
  }
  renderProblem();
  saveState();
}

function renderProblem() {
  document.getElementById('card').classList.remove('hidden');
  document.getElementById('empty').classList.add('hidden');
  document.getElementById('jp').textContent = currentProblem.jp;
  document.getElementById('en').textContent = currentProblem.en;
  document.getElementById('alt').textContent = (currentProblem.alt || []).join(' / ');
  document.getElementById('note').textContent = currentProblem.note || '';
  document.getElementById('level-tag').textContent = currentProblem.sceneLabel || currentProblem.scene;
  updateProgress();
}

function updateProgress() {
  const pool = problemsForCurrentScene();
  const total = pool.length;
  const learned = pool.filter(p => state.byId[p.id]?.seen > 0).length;
  document.getElementById('progress').textContent = `${learned} / ${total}`;
  const remaining = (state.currentQueue?.length || 0) + (state.sessionRetry?.length || 0);
  document.getElementById('due-count').textContent = `本日残: ${remaining}`;
}

function showEmpty() {
  document.getElementById('card').classList.add('hidden');
  document.getElementById('empty').classList.remove('hidden');
  updateProgress();
}

// ====================================================================
// Grading
// ====================================================================
function grade(g) {
  const now = Date.now();
  const s = state.byId[currentId];
  s.seen = (s.seen || 0) + 1;
  if (g === 'o') {
    s.streak = (s.streak || 0) + 1;
    s.nextDue = now + SRS.GOOD * Math.max(1, s.streak);
  } else if (g === 'tri') {
    s.streak = 0;
    s.nextDue = now + SRS.HARD;
  } else {
    s.streak = 0;
    s.nextDue = now + SRS.HARD;
    if (!state.sessionRetry) state.sessionRetry = [];
    if (!state.sessionRetry.includes(currentId)) state.sessionRetry.push(currentId);
  }
  saveState();
  nextProblem();
}

function hideAnswer() {
  document.getElementById('answer').classList.add('hidden');
  document.getElementById('actions-pre').classList.remove('hidden');
}
function showAnswer() {
  document.getElementById('answer').classList.remove('hidden');
  document.getElementById('actions-pre').classList.add('hidden');
  speak(currentProblem.en);
}

// ====================================================================
// TTS
// ====================================================================
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'en-US';
  utter.rate = settings.rate || 0.95;
  const voices = window.speechSynthesis.getVoices();
  const enVoice = voices.find(v => v.lang.startsWith('en-') && /Google|Samantha|Daniel|Karen/i.test(v.name))
                || voices.find(v => v.lang.startsWith('en-'));
  if (enVoice) utter.voice = enVoice;
  window.speechSynthesis.speak(utter);
}

// ====================================================================
// Speech Recognition
// ====================================================================
let recognition = null;
function initSTT() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.lang = 'en-US';
  r.interimResults = false;
  r.maxAlternatives = 1;
  return r;
}
function startMic() {
  if (!recognition) recognition = initSTT();
  if (!recognition) {
    document.getElementById('mic-result').textContent = '⚠ この端末は音声認識に未対応';
    return;
  }
  const result = document.getElementById('mic-result');
  result.textContent = '🎙 録音中...';
  recognition.onresult = (e) => {
    const text = e.results[0][0].transcript;
    result.textContent = `あなた: "${text}"`;
  };
  recognition.onerror = (e) => {
    result.textContent = `⚠ ${e.error}`;
  };
  recognition.onend = () => {
    if (result.textContent === '🎙 録音中...') result.textContent = '';
  };
  try { recognition.start(); } catch (e) {}
}

// ====================================================================
// Scene selector
// ====================================================================
function renderSceneSelector() {
  const sel = document.getElementById('scene-select');
  sel.innerHTML = '';
  const opts = [{ id: 'all', label: 'すべて' }, ...scenes];
  for (const s of opts) {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.label;
    if (s.id === settings.sceneFilter) o.selected = true;
    sel.appendChild(o);
  }
}

function onSceneChange(e) {
  settings.sceneFilter = e.target.value;
  saveSettings();
  state.sessionRetry = [];
  buildSessionQueue();
  nextProblem();
}

// ====================================================================
// UI bindings
// ====================================================================
function bindUI() {
  document.getElementById('btn-reveal').addEventListener('click', showAnswer);
  document.getElementById('btn-tts').addEventListener('click', () => speak(currentProblem.en));
  document.getElementById('btn-mic').addEventListener('click', startMic);
  document.querySelectorAll('.grade-buttons .btn').forEach(b => {
    b.addEventListener('click', () => grade(b.dataset.grade));
  });
  document.getElementById('btn-restart').addEventListener('click', () => {
    if (!confirm('全進捗をリセットします。よろしいですか？')) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });
  document.getElementById('scene-select').addEventListener('change', onSceneChange);
  document.getElementById('opt-gemini-tts').addEventListener('change', (e) => {
    settings.geminiTts = e.target.checked;
    saveSettings();
  });
  document.getElementById('opt-rate').addEventListener('input', (e) => {
    settings.rate = parseFloat(e.target.value);
    document.getElementById('rate-label').textContent = settings.rate.toFixed(2);
    saveSettings();
  });
}

function applySettings() {
  document.getElementById('opt-gemini-tts').checked = !!settings.geminiTts;
  document.getElementById('opt-rate').value = settings.rate;
  document.getElementById('rate-label').textContent = (settings.rate || 0.95).toFixed(2);
}

// ====================================================================
// Service Worker
// ====================================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {};
}

init();

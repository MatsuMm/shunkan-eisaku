// ====================================================================
// 瞬間英作 PWA - メインロジック
// ====================================================================

const STORAGE_KEY = 'shunkan-eisaku-state-v1';
const SETTINGS_KEY = 'shunkan-eisaku-settings-v1';

// SRS インターバル (ミリ秒)
const SRS = {
  AGAIN: 0,                  // × → 本セッション内で再出題
  HARD: 24 * 60 * 60 * 1000, // △ → 翌日
  GOOD: 3 * 24 * 60 * 60 * 1000, // ◯ → 3日後
};

// ----- State -----
let problems = [];
let state = null; // { byId: { [id]: { nextDue, streak, seen } }, sessionQueue: [id] }
let settings = { geminiTts: false, rate: 0.95 };
let currentId = null;
let currentProblem = null;

// ----- Init -----
async function init() {
  loadSettings();
  applySettings();
  bindUI();
  await loadProblems();
  loadOrCreateState();
  buildSessionQueue();
  nextProblem();
}

// ----- Storage -----
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
      return;
    }
  } catch {}
  state = { byId: {}, sessionRetry: [] };
  for (const p of problems) {
    state.byId[p.id] = { nextDue: 0, streak: 0, seen: 0 };
  }
  saveState();
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ----- Problem loading -----
async function loadProblems() {
  const res = await fetch('data/problems-b1.json');
  const data = await res.json();
  problems = data.problems;
}

// ----- SRS queue logic -----
function buildSessionQueue() {
  const now = Date.now();
  // 期限切れ (nextDue <= now) を対象に、未学習 → 期限超過順
  const due = problems.filter(p => (state.byId[p.id]?.nextDue ?? 0) <= now);
  due.sort((a, b) => {
    const sa = state.byId[a.id];
    const sb = state.byId[b.id];
    // 未学習 (seen===0) を先に
    if ((sa.seen === 0) !== (sb.seen === 0)) return sa.seen === 0 ? -1 : 1;
    return sa.nextDue - sb.nextDue;
  });
  // sessionRetry にあるものは末尾に追加
  const retrySet = new Set(state.sessionRetry || []);
  const queue = due.map(p => p.id).filter(id => !retrySet.has(id));
  queue.push(...(state.sessionRetry || []));
  state.currentQueue = queue;
  saveState();
}

function nextProblem() {
  hideAnswer();
  document.getElementById('mic-result').textContent = '';
  // sessionRetry を優先消化
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
  currentProblem = problems.find(p => p.id === id);
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
  document.getElementById('level-tag').textContent = (currentProblem.id || '').toUpperCase();
  updateProgress();
}

function updateProgress() {
  const total = problems.length;
  const learned = problems.filter(p => state.byId[p.id]?.seen > 0).length;
  document.getElementById('progress').textContent = `${learned} / ${total}`;
  const remaining = (state.currentQueue?.length || 0) + (state.sessionRetry?.length || 0);
  document.getElementById('due-count').textContent = `本日残: ${remaining}`;
}

function showEmpty() {
  document.getElementById('card').classList.add('hidden');
  document.getElementById('empty').classList.remove('hidden');
  updateProgress();
}

// ----- Grading -----
function grade(g) {
  const now = Date.now();
  const s = state.byId[currentId];
  s.seen = (s.seen || 0) + 1;
  if (g === 'o') {
    s.streak = (s.streak || 0) + 1;
    s.nextDue = now + SRS.GOOD * Math.max(1, s.streak); // 連続正解で間隔伸ばす
  } else if (g === 'tri') {
    s.streak = 0;
    s.nextDue = now + SRS.HARD;
  } else { // x
    s.streak = 0;
    s.nextDue = now + SRS.HARD; // 翌日も出すが今日中にも再出題
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
  speak(currentProblem.en); // 自動で読み上げ
}

// ----- TTS -----
function speak(text) {
  if (settings.geminiTts) {
    // 今のところ Web Speech API のみ実装。Gemini TTS は将来追加。
    // フォールバックして Web Speech 使用。
  }
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'en-US';
  utter.rate = settings.rate || 0.95;
  // 英語ネイティブ音声を優先選択
  const voices = window.speechSynthesis.getVoices();
  const enVoice = voices.find(v => v.lang.startsWith('en-') && /Google|Samantha|Daniel|Karen/i.test(v.name))
                || voices.find(v => v.lang.startsWith('en-'));
  if (enVoice) utter.voice = enVoice;
  window.speechSynthesis.speak(utter);
}

// ----- Speech Recognition (任意) -----
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
  try { recognition.start(); } catch (e) { /* already started */ }
}

// ----- UI bindings -----
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

// Service Worker 登録 (PWA オフライン対応)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// 音声リストが非同期に読まれる Chrome 対策
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {};
}

init();

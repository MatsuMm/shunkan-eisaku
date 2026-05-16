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
let settings = {
  geminiTts: false,
  rate: 0.95,
  sceneFilter: 'all',
  mode: 'study',
  reviewGap: 2.5,
  reviewNextGap: 1.5,
  reviewJpTts: true,
  reviewLoop: false,
  listShowEn: true,
};
let listSearchTerm = '';
let currentId = null;
let currentProblem = null;

// Review mode state
let reviewQueue = [];        // 学習済み problem IDs (current scene)
let reviewIndex = 0;
let reviewPlaying = false;
let reviewTimer = null;
let reviewSpeakingEn = false;
let mediaSessionInited = false;

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
  applyMode();
  if (settings.mode === 'review') {
    buildReviewQueue();
    renderReviewCard();
  }
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
  speak(currentProblem);
}

// ====================================================================
// TTS - 事前生成 MP3 (audio/<id>.mp3) を優先、無ければ Web Speech にフォールバック
// ====================================================================
let currentAudio = null;
const audioMissing = new Set(); // 404 だった ID をキャッシュ

function stopSpeech() {
  if (currentAudio) {
    try { currentAudio.pause(); currentAudio.currentTime = 0; } catch {}
    currentAudio = null;
  }
  if ('speechSynthesis' in window) {
    const ss = window.speechSynthesis;
    if (ss.speaking || ss.pending) ss.cancel();
  }
}

function speak(textOrProblem, maybeText) {
  // 互換: speak("text") も speak(problemObj) も speak(id, text) も受ける
  let id = null, text = null;
  if (typeof textOrProblem === 'object' && textOrProblem) {
    id = textOrProblem.id; text = textOrProblem.en;
  } else if (typeof textOrProblem === 'string' && typeof maybeText === 'string') {
    id = textOrProblem; text = maybeText;
  } else {
    text = textOrProblem;
  }
  speakEn(id, text, null);
}

function speakAudio(srcPath, fallbackText, fallbackLang, onEnd, missingKey) {
  stopSpeech();
  if (audioMissing.has(missingKey)) {
    speakViaWebSpeech(fallbackText, fallbackLang, onEnd);
    return;
  }
  const audio = new Audio(srcPath);
  audio.playbackRate = settings.rate || 0.95;
  // ★ play() より前に currentAudio に代入。連続呼び出しでも次の stopSpeech() が確実に止められる
  currentAudio = audio;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    if (currentAudio === audio) currentAudio = null;
    onEnd && onEnd();
  };
  audio.onended = finish;
  audio.onerror = () => {
    // 404 など実エラーのみ permanent に欠落マーク
    audioMissing.add(missingKey);
    if (done) return;
    done = true;
    if (currentAudio === audio) currentAudio = null;
    speakViaWebSpeech(fallbackText, fallbackLang, onEnd);
  };
  audio.play().catch((err) => {
    // NotAllowedError (autoplay 制限) はファイル不在ではないのでマークしない
    if (err && err.name !== 'NotAllowedError') {
      audioMissing.add(missingKey);
    }
    if (done) return;
    done = true;
    if (currentAudio === audio) currentAudio = null;
    speakViaWebSpeech(fallbackText, fallbackLang, onEnd);
  });
}

function speakEn(id, text, onEnd) {
  if (id) speakAudio(`audio/${id}.mp3`, text, 'en-US', onEnd, id);
  else { stopSpeech(); speakViaWebSpeech(text, 'en-US', onEnd); }
}

function speakJa(text, onEnd, problemId) {
  if (problemId) speakAudio(`audio/jp/${problemId}.mp3`, text, 'ja-JP', onEnd, 'jp/' + problemId);
  else { stopSpeech(); speakViaWebSpeech(text, 'ja-JP', onEnd); }
}

function speakViaWebSpeech(text, lang, onEnd) {
  if (!('speechSynthesis' in window)) { onEnd && onEnd(); return; }
  const ss = window.speechSynthesis;
  // 前のキューを必ず破棄
  ss.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = settings.rate || 0.95;
  const voices = ss.getVoices();
  let voice = null;
  if (lang.startsWith('en')) {
    voice = voices.find(v => v.lang.startsWith('en-') && /Google|Samantha|Daniel|Karen/i.test(v.name))
         || voices.find(v => v.lang.startsWith('en-'));
  } else if (lang.startsWith('ja')) {
    voice = voices.find(v => v.lang.startsWith('ja-') && /Google|Kyoko/i.test(v.name))
         || voices.find(v => v.lang.startsWith('ja-'));
  }
  if (voice) utter.voice = voice;
  if (onEnd) { utter.onend = onEnd; utter.onerror = onEnd; }
  // cancel() が完了するのを少し待ってから speak (Android Chrome の既知タイミング問題対策)
  setTimeout(() => ss.speak(utter), 80);
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
  if (settings.mode === 'review') {
    buildReviewQueue();
    renderReviewCard();
  } else if (settings.mode === 'list') {
    renderList();
  }
}

// ====================================================================
// Mode switching (study / review)
// ====================================================================
function switchMode(mode) {
  if (settings.mode === mode) return;
  settings.mode = mode;
  saveSettings();
  applyMode();
  if (mode === 'review') {
    stopReview();
    buildReviewQueue();
    renderReviewCard();
  } else if (mode === 'list') {
    renderList();
  }
}

// ====================================================================
// List view
// ====================================================================
function renderList() {
  const pool = problemsForCurrentScene();
  const q = listSearchTerm.trim().toLowerCase();
  const filtered = q
    ? pool.filter(p =>
        p.jp.toLowerCase().includes(q) ||
        p.en.toLowerCase().includes(q) ||
        (p.alt || []).some(a => a.toLowerCase().includes(q)) ||
        (p.note || '').toLowerCase().includes(q)
      )
    : pool;

  const ul = document.getElementById('list-items');
  ul.innerHTML = '';
  document.getElementById('list-count').textContent = `${filtered.length} 件`;

  if (filtered.length === 0) {
    const li = document.createElement('li');
    li.className = 'list-empty';
    li.textContent = q ? '一致する例文がありません。' : '例文がありません。';
    ul.appendChild(li);
    return;
  }

  const showEn = !!settings.listShowEn;
  for (const p of filtered) {
    ul.appendChild(buildListItem(p, showEn));
  }
}

function buildListItem(p, showEn) {
  const li = document.createElement('li');
  li.className = 'list-item';
  li.dataset.id = p.id;

  const s = state.byId[p.id] || { seen: 0, streak: 0 };
  let statusClass = '';
  let statusText = '';
  if (s.seen > 0) {
    if (s.streak >= 1) { statusClass = 's-o'; statusText = '◯'; }
    else { statusClass = 's-tri'; statusText = '△'; }
  }

  const head = document.createElement('div');
  head.className = 'list-item-head';
  const jp = document.createElement('span');
  jp.className = 'list-item-jp';
  jp.textContent = p.jp;
  const st = document.createElement('span');
  st.className = 'list-item-status ' + statusClass;
  st.textContent = statusText;
  head.appendChild(jp);
  head.appendChild(st);
  li.appendChild(head);

  if (showEn) {
    const enRow = document.createElement('div');
    enRow.className = 'list-item-en';
    const enText = document.createElement('span');
    enText.textContent = p.en;
    enText.style.flex = '1';
    const speakBtn = document.createElement('button');
    speakBtn.className = 'speak-btn';
    speakBtn.textContent = '🔊';
    speakBtn.setAttribute('aria-label', '音声再生');
    speakBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      speak(p);
    });
    speakBtn.addEventListener('touchend', (e) => {
      // iOS / 一部 Android で click が遅延・吸われる対策
      e.stopPropagation();
    }, { passive: true });
    enRow.appendChild(enText);
    enRow.appendChild(speakBtn);
    li.appendChild(enRow);
  }

  const body = document.createElement('div');
  body.className = 'list-item-body';
  if (p.alt && p.alt.length) {
    const alt = document.createElement('div');
    alt.className = 'alt';
    alt.textContent = p.alt.join(' / ');
    body.appendChild(alt);
  }
  if (p.note) {
    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = p.note;
    body.appendChild(note);
  }
  li.appendChild(body);

  li.addEventListener('click', () => {
    li.classList.toggle('open');
  });

  return li;
}

function applyMode() {
  const mode = settings.mode;
  document.querySelectorAll('.mode-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.mode === mode);
  });
  document.getElementById('card').classList.toggle('hidden', mode !== 'study');
  if (mode !== 'study') document.getElementById('empty').classList.add('hidden');
  document.getElementById('review').classList.toggle('hidden', mode !== 'review');
  document.getElementById('list').classList.toggle('hidden', mode !== 'list');
  if (mode !== 'review') stopReview();
  if (mode === 'list') renderList();
}

// ====================================================================
// Review mode
// ====================================================================
function buildReviewQueue() {
  const pool = problemsForCurrentScene();
  reviewQueue = pool.filter(p => (state.byId[p.id]?.seen || 0) > 0).map(p => p.id);
  if (reviewIndex >= reviewQueue.length) reviewIndex = 0;
}

function renderReviewCard() {
  const total = reviewQueue.length;
  document.getElementById('review-progress').textContent = total > 0 ? `${reviewIndex + 1} / ${total}` : '0 / 0';
  const jpEl = document.getElementById('review-jp');
  const enEl = document.getElementById('review-en');
  if (total === 0) {
    jpEl.innerHTML = '復習する問題がありません。<br>まず「学習」モードで何問か解いてください。';
    enEl.textContent = '';
    enEl.classList.remove('visible');
    document.getElementById('btn-rev-play').disabled = true;
    return;
  }
  document.getElementById('btn-rev-play').disabled = false;
  const p = allProblems.find(x => x.id === reviewQueue[reviewIndex]);
  jpEl.textContent = p.jp;
  enEl.textContent = p.en;
  enEl.classList.remove('visible');
}

function playReview() {
  if (reviewQueue.length === 0) return;
  reviewPlaying = true;
  document.getElementById('btn-rev-play').textContent = '⏸ 一時停止';
  document.getElementById('review-state').textContent = '再生中';
  initMediaSession();
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  playCurrentReviewItem();
}

function pauseReview() {
  reviewPlaying = false;
  clearTimeout(reviewTimer);
  reviewTimer = null;
  stopSpeech();
  document.getElementById('btn-rev-play').textContent = '▶ 再生';
  document.getElementById('review-state').textContent = '停止中';
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
}

// ====================================================================
// Media Session API - ロック画面・通知エリアでの再生コントロール
// ====================================================================
function initMediaSession() {
  if (mediaSessionInited) return;
  if (!('mediaSession' in navigator)) return;
  mediaSessionInited = true;
  navigator.mediaSession.setActionHandler('play', () => { if (!reviewPlaying) playReview(); });
  navigator.mediaSession.setActionHandler('pause', () => { if (reviewPlaying) pauseReview(); });
  navigator.mediaSession.setActionHandler('previoustrack', reviewPrev);
  navigator.mediaSession.setActionHandler('nexttrack', reviewNext);
}

function updateMediaSession(p) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: p.en,
      artist: p.jp,
      album: p.sceneLabel || '瞬間英作',
      artwork: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    });
  } catch {}
}

function stopReview() {
  pauseReview();
}

function playCurrentReviewItem() {
  if (!reviewPlaying) return;
  if (reviewQueue.length === 0) { pauseReview(); return; }
  const p = allProblems.find(x => x.id === reviewQueue[reviewIndex]);
  if (!p) { advanceReview(); return; }
  renderReviewCard();
  // 日本語読み上げ (任意)
  const jpDone = () => {
    if (!reviewPlaying) return;
    // JP → EN 間隔
    reviewTimer = setTimeout(() => {
      if (!reviewPlaying) return;
      document.getElementById('review-en').classList.add('visible');
      speakEn(p.id, p.en, () => {
        if (!reviewPlaying) return;
        // 次へ進む間隔
        reviewTimer = setTimeout(advanceReview, settings.reviewNextGap * 1000);
      });
    }, settings.reviewGap * 1000);
  };
  updateMediaSession(p);
  if (settings.reviewJpTts) {
    speakJa(p.jp, jpDone, p.id);
  } else {
    jpDone();
  }
}

function advanceReview() {
  if (!reviewPlaying) return;
  reviewIndex++;
  if (reviewIndex >= reviewQueue.length) {
    if (settings.reviewLoop) {
      reviewIndex = 0;
    } else {
      reviewIndex = reviewQueue.length - 1;
      pauseReview();
      document.getElementById('review-state').textContent = '完了';
      return;
    }
  }
  playCurrentReviewItem();
}

function reviewPrev() {
  const wasPlaying = reviewPlaying;
  pauseReview();
  reviewIndex = Math.max(0, reviewIndex - 1);
  renderReviewCard();
  if (wasPlaying) playReview();
}
function reviewNext() {
  const wasPlaying = reviewPlaying;
  pauseReview();
  reviewIndex = Math.min(reviewQueue.length - 1, reviewIndex + 1);
  renderReviewCard();
  if (wasPlaying) playReview();
}

// ====================================================================
// UI bindings
// ====================================================================
function bindUI() {
  document.getElementById('btn-reveal').addEventListener('click', showAnswer);
  document.getElementById('btn-tts').addEventListener('click', () => speak(currentProblem));
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
  document.querySelectorAll('.mode-tab').forEach(t => {
    t.addEventListener('click', () => switchMode(t.dataset.mode));
  });
  document.getElementById('btn-rev-play').addEventListener('click', () => {
    if (reviewPlaying) pauseReview(); else playReview();
  });
  document.getElementById('btn-rev-prev').addEventListener('click', reviewPrev);
  document.getElementById('btn-rev-next').addEventListener('click', reviewNext);
  document.getElementById('rev-gap').addEventListener('input', (e) => {
    settings.reviewGap = parseFloat(e.target.value);
    document.getElementById('rev-gap-label').textContent = settings.reviewGap + '秒';
    saveSettings();
  });
  document.getElementById('rev-next-gap').addEventListener('input', (e) => {
    settings.reviewNextGap = parseFloat(e.target.value);
    document.getElementById('rev-next-gap-label').textContent = settings.reviewNextGap + '秒';
    saveSettings();
  });
  document.getElementById('rev-jp-tts').addEventListener('change', (e) => {
    settings.reviewJpTts = e.target.checked;
    saveSettings();
  });
  document.getElementById('rev-loop').addEventListener('change', (e) => {
    settings.reviewLoop = e.target.checked;
    saveSettings();
  });
  document.getElementById('list-search').addEventListener('input', (e) => {
    listSearchTerm = e.target.value;
    renderList();
  });
  document.getElementById('list-show-en').addEventListener('change', (e) => {
    settings.listShowEn = e.target.checked;
    saveSettings();
    renderList();
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
  document.getElementById('rev-gap').value = settings.reviewGap;
  document.getElementById('rev-gap-label').textContent = settings.reviewGap + '秒';
  document.getElementById('rev-next-gap').value = settings.reviewNextGap;
  document.getElementById('rev-next-gap-label').textContent = settings.reviewNextGap + '秒';
  document.getElementById('rev-jp-tts').checked = !!settings.reviewJpTts;
  document.getElementById('rev-loop').checked = !!settings.reviewLoop;
  document.getElementById('list-show-en').checked = settings.listShowEn !== false;
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

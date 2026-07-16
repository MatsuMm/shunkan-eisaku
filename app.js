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
  rate: 0.95,
  levelFilter: 1,
  sceneFilter: 'all',
  mode: 'study',
  reviewGap: 2.5,
  reviewNextGap: 1.5,
  reviewJpTts: true,
  reviewLoop: false,
  reviewOnlySeen: false,
  listShowEn: true,
  sttEnabled: true,
  dailyGoal: 15,
  requireSaid: true,
  studyTimerSec: 3,
  studyTimerOn: true,
};
let listSearchTerm = '';
let currentId = null;
let currentProblem = null;
let studyTimerHandle = null;
let studyTimerLeft = 0;
let studyTimedOut = false;
let saidThisCard = false;
let goalCelebratedDay = null;

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
  try {
    await loadAllProblems();
  } catch (err) {
    console.error(err);
    showAppError(
      '教材データの読み込みに失敗しました',
      'ネットワーク接続を確認して再読み込みしてください。オフラインの場合は、オンライン時に一度開いてキャッシュを作ってください。'
    );
    hideAppLoading();
    return;
  }
  if (!allProblems.length) {
    showAppError(
      '問題データが空です',
      'data/index.json または問題ファイルの配置を確認してください。'
    );
    hideAppLoading();
    return;
  }
  loadOrCreateState();
  renderLevelSelector();
  renderSceneSelector();
  renderLevelBanner();
  buildSessionQueue();
  nextProblem();
  applyMode();
  if (settings.mode === 'review') {
    buildReviewQueue();
    renderReviewCard();
  }
  renderHeaderStats();
  renderDailyGoal();
  hideAppLoading();
  maybeShowOnboarding();
}

function hideAppLoading() {
  const ld = document.getElementById('app-loading');
  if (ld) setTimeout(() => ld.classList.add('hidden'), 250);
}
// フェイルセーフ: 初期化が失敗してもローディングは必ず消す
window.addEventListener('load', () => setTimeout(hideAppLoading, 4000));

function showAppError(title, body) {
  const el = document.getElementById('app-error');
  if (!el) {
    alert(title + '\n' + (body || ''));
    return;
  }
  const t = document.getElementById('app-error-title');
  const b = document.getElementById('app-error-body');
  if (t) t.textContent = title;
  if (b) b.textContent = body || '';
  el.classList.remove('hidden');
  document.getElementById('card')?.classList.add('hidden');
}

// ====================================================================
// Streak / daily stats (retention)
// ====================================================================
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function dayDiff(a, b) {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  const da = new Date(pa[0], pa[1] - 1, pa[2]);
  const db = new Date(pb[0], pb[1] - 1, pb[2]);
  return Math.round((db - da) / 86400000);
}
function ensureStats() {
  if (!state.stats) state.stats = { streak: 0, lastDay: null, today: null, todayCount: 0 };
  const t = todayStr();
  if (state.stats.today !== t) { state.stats.today = t; state.stats.todayCount = 0; }
}
function recordStudy() {
  ensureStats();
  const t = todayStr();
  const last = state.stats.lastDay;
  if (last !== t) {
    if (last && dayDiff(last, t) === 1) state.stats.streak += 1;
    else state.stats.streak = 1;
    state.stats.lastDay = t;
  }
  state.stats.todayCount += 1;
  saveState();
  renderHeaderStats();
  renderDailyGoal();
  maybeCelebrateGoal();
}
function renderHeaderStats() {
  if (!state) return;
  ensureStats();
  const s = document.getElementById('streak');
  const tc = document.getElementById('today-count');
  if (s) s.textContent = `🔥 ${state.stats.streak}`;
  if (tc) tc.innerHTML = `今日 <b>${state.stats.todayCount}</b>`;
  updateProgress();
}
function renderDailyGoal() {
  if (!state) return;
  ensureStats();
  const goal = Math.max(1, settings.dailyGoal || 15);
  const n = state.stats.todayCount || 0;
  const fill = document.getElementById('daily-goal-fill');
  const label = document.getElementById('daily-goal-label');
  const wrap = document.getElementById('daily-goal');
  if (fill) fill.style.width = Math.min(100, Math.round((n / goal) * 100)) + '%';
  if (label) label.textContent = `今日の目標 ${n} / ${goal}`;
  if (wrap) wrap.classList.toggle('done', n >= goal);
}
function maybeCelebrateGoal() {
  const goal = Math.max(1, settings.dailyGoal || 15);
  const t = todayStr();
  if ((state.stats.todayCount || 0) < goal) return;
  if (goalCelebratedDay === t) return;
  goalCelebratedDay = t;
  const toast = document.getElementById('goal-toast');
  if (!toast) return;
  toast.classList.remove('hidden');
  toast.textContent = `🎯 今日の目標 ${goal} 問クリア！`;
  setTimeout(() => toast.classList.add('hidden'), 3200);
}

// ====================================================================
// Onboarding (first run)
// ====================================================================
const ONBOARD_KEY = 'shunkan-onboarded-v1';
const OB_STEPS = [
  { e: '⚡️', t: '瞬間英作へようこそ', b: '日本語を見て、英語を瞬時に口に出す練習アプリです。学習・復習・聞き取り・会話・読解・語彙・文法を同じ教材で回せます。' },
  { e: '📈', t: 'レベルとシーン', b: 'Lv1(基礎)〜Lv5。仕事・旅行・飲食などのシーンも選べます。各レベルに目標があり、ヘッダーで進捗と本日残りが見えます。' },
  { e: '🗣️', t: '声に出して自己採点', b: '答えを見る前に声に出しましょう。◯=3日後 / △=明日 / ×=今日もう一度。マイク機能は任意（設定でオフ可）。進捗は端末内のみ保存されます。' },
];
let obIndex = 0;
function maybeShowOnboarding() {
  try { if (localStorage.getItem(ONBOARD_KEY)) return; } catch { return; }
  obIndex = 0;
  renderOnboarding();
  document.getElementById('onboarding').classList.remove('hidden');
}
function renderOnboarding() {
  const st = OB_STEPS[obIndex];
  document.getElementById('ob-emoji').textContent = st.e;
  document.getElementById('ob-title').textContent = st.t;
  document.getElementById('ob-body').textContent = st.b;
  const dots = document.getElementById('ob-dots');
  dots.innerHTML = OB_STEPS.map((_, i) =>
    `<span class="ob-dot${i === obIndex ? ' active' : ''}"></span>`).join('');
  document.getElementById('ob-next').textContent =
    obIndex === OB_STEPS.length - 1 ? '始める' : '次へ';
}
function finishOnboarding() {
  try { localStorage.setItem(ONBOARD_KEY, '1'); } catch {}
  document.getElementById('onboarding').classList.add('hidden');
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('saveState failed', e);
  }
}

const BACKUP_VERSION = 1;

function exportProgress() {
  const payload = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'shunkan-eisaku',
    state: state,
    settings: {
      rate: settings.rate,
      levelFilter: settings.levelFilter,
      sceneFilter: settings.sceneFilter,
      dailyGoal: settings.dailyGoal,
      requireSaid: settings.requireSaid,
      studyTimerOn: settings.studyTimerOn,
      studyTimerSec: settings.studyTimerSec,
      sttEnabled: settings.sttEnabled,
      reviewGap: settings.reviewGap,
      reviewNextGap: settings.reviewNextGap,
      reviewJpTts: settings.reviewJpTts,
      reviewLoop: settings.reviewLoop,
      reviewOnlySeen: settings.reviewOnlySeen,
      listShowEn: settings.listShowEn,
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const day = todayStr().replace(/-/g, '');
  a.href = URL.createObjectURL(blob);
  a.download = `shunkan-eisaku-backup-${day}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

function importProgressFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || typeof data !== 'object') throw new Error('invalid');
      if (data.state && data.state.byId) {
        state = data.state;
        saveState();
      } else if (data.byId) {
        // raw state dump
        state = data;
        saveState();
      } else {
        throw new Error('no state');
      }
      if (data.settings && typeof data.settings === 'object') {
        settings = { ...settings, ...data.settings };
        saveSettings();
      }
      alert('進捗をインポートしました。画面を再読み込みします。');
      location.reload();
    } catch (e) {
      alert('インポートに失敗しました。バックアップ JSON を確認してください。');
      console.error(e);
    }
  };
  reader.readAsText(file);
}

// ====================================================================
// Problem loading
// ====================================================================
let levelsMeta = [];   // [{id,label,cefr,goal,criteria}]

async function loadAllProblems() {
  const idxRes = await fetch('data/index.json');
  if (!idxRes.ok) throw new Error('index.json HTTP ' + idxRes.status);
  const idx = await idxRes.json();
  levelsMeta = idx.levels || [];
  allProblems = [];
  const errors = [];
  for (const src of idx.sources || []) {
    try {
      const res = await fetch('data/' + src.file);
      if (!res.ok) throw new Error(src.file + ' HTTP ' + res.status);
      const data = await res.json();
      const problems = data.problems || [];
      for (const p of problems) {
        p.level = src.level;
        p.scene = src.scene;
        p.sceneLabel = src.sceneLabel;
        allProblems.push(p);
      }
    } catch (e) {
      errors.push(String(e.message || e));
    }
  }
  if (!allProblems.length && errors.length) {
    throw new Error(errors.join('; '));
  }
  if (errors.length) console.warn('Some content failed to load:', errors);
}

function currentLevel() {
  return settings.levelFilter || 1;
}

function levelMeta(lv) {
  return levelsMeta.find(m => m.id === lv) || { label: 'Lv' + lv, goal: '', criteria: '', cefr: '' };
}

// 現レベル内に存在するシーン一覧
function scenesForLevel(lv) {
  const seen = new Map();
  for (const p of allProblems) {
    if (p.level === lv && !seen.has(p.scene)) seen.set(p.scene, p.sceneLabel);
  }
  return [...seen.entries()].map(([id, label]) => ({ id, label }));
}

// レベル + シーンで絞ったプール
function problemsForCurrentScene() {
  const lv = currentLevel();
  let pool = allProblems.filter(p => p.level === lv);
  if (settings.sceneFilter && settings.sceneFilter !== 'all') {
    pool = pool.filter(p => p.scene === settings.sceneFilter);
  }
  return pool;
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
  document.getElementById('tip').textContent = currentProblem.tip || '';
  document.getElementById('level-tag').textContent = currentProblem.sceneLabel || currentProblem.scene;
  saidThisCard = false;
  studyTimedOut = false;
  const saidEl = document.getElementById('said-check');
  if (saidEl) saidEl.checked = false;
  updateSaidGate();
  startStudyTimer();
  updateProgress();
}

function clearStudyTimer() {
  if (studyTimerHandle) {
    clearInterval(studyTimerHandle);
    studyTimerHandle = null;
  }
  const el = document.getElementById('study-timer');
  if (el) {
    el.classList.add('hidden');
    el.textContent = '';
    el.classList.remove('timeout');
  }
}

function startStudyTimer() {
  clearStudyTimer();
  if (!settings.studyTimerOn) return;
  const sec = Math.max(1, Number(settings.studyTimerSec) || 3);
  studyTimerLeft = sec;
  studyTimedOut = false;
  const el = document.getElementById('study-timer');
  if (!el) return;
  el.classList.remove('hidden', 'timeout');
  el.textContent = `${studyTimerLeft}`;
  el.title = '目標反応時間（秒）';
  studyTimerHandle = setInterval(() => {
    studyTimerLeft -= 1;
    if (studyTimerLeft <= 0) {
      clearInterval(studyTimerHandle);
      studyTimerHandle = null;
      studyTimedOut = true;
      el.textContent = '…';
      el.classList.add('timeout');
      el.title = '時間オーバー（詰まったサイン）';
    } else {
      el.textContent = `${studyTimerLeft}`;
    }
  }, 1000);
}

function updateSaidGate() {
  const require = settings.requireSaid !== false;
  const wrap = document.getElementById('said-check-wrap');
  if (wrap) wrap.classList.toggle('hidden', !require);
  const btn = document.getElementById('btn-reveal');
  if (!btn) return;
  if (!require) {
    btn.disabled = false;
    return;
  }
  btn.disabled = !saidThisCard;
}

function updateProgress() {
  const pool = problemsForCurrentScene();
  const total = pool.length;
  const learned = pool.filter(p => state.byId[p.id]?.seen > 0).length;
  const pg = document.getElementById('progress');
  if (pg) pg.textContent = `${learned} / ${total}`;
  const dc = document.getElementById('due-count');
  if (dc) {
    const remaining = (state.currentQueue?.length || 0) + (state.sessionRetry?.length || 0);
    dc.textContent = `本日残: ${remaining}`;
  }
  renderLevelBanner();
}

function showEmpty() {
  document.getElementById('card').classList.add('hidden');
  document.getElementById('empty').classList.remove('hidden');
  updateProgress();
}

/** 進捗を消さず、現在のレベル×シーンを追加練習（SRS の nextDue は変えない） */
function practiceAgain() {
  const pool = problemsForCurrentScene();
  if (!pool.length) return;
  state.sessionRetry = [];
  state.currentQueue = shuffle(pool.map(p => p.id));
  saveState();
  document.getElementById('empty').classList.add('hidden');
  document.getElementById('card').classList.remove('hidden');
  nextProblem();
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
  recordStudy();
  saveState();
  nextProblem();
}

function hideAnswer() {
  clearStudyTimer();
  document.getElementById('answer').classList.add('hidden');
  document.getElementById('actions-pre').classList.remove('hidden');
  const shadow = document.getElementById('shadow-result');
  if (shadow) { shadow.classList.remove('visible'); shadow.innerHTML = ''; }
  const mic = document.getElementById('mic-result');
  if (mic) mic.textContent = '';
}
function showAnswer() {
  if (settings.requireSaid !== false && !saidThisCard) {
    const wrap = document.getElementById('said-check-wrap');
    if (wrap) {
      wrap.classList.add('shake');
      setTimeout(() => wrap.classList.remove('shake'), 400);
    }
    return;
  }
  clearStudyTimer();
  document.getElementById('answer').classList.remove('hidden');
  document.getElementById('actions-pre').classList.add('hidden');
  const flag = document.getElementById('timer-flag');
  if (flag) {
    if (settings.studyTimerOn && studyTimedOut) {
      flag.textContent = '⏱ 時間内に出なかった（詰まり）';
      flag.classList.remove('hidden');
    } else {
      flag.classList.add('hidden');
      flag.textContent = '';
    }
  }
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

// 0.7x slow play 用 (リダクション・連結の聞き取り訓練用)
function speakSlow(problemObj) {
  if (!problemObj) return;
  const id = problemObj.id;
  const text = problemObj.en;
  speakAudio(`audio/${id}.mp3`, text, 'en-US', null, id, 0.7);
}

function speakAudio(srcPath, fallbackText, fallbackLang, onEnd, missingKey, rateOverride) {
  stopSpeech();
  if (audioMissing.has(missingKey)) {
    speakViaWebSpeech(fallbackText, fallbackLang, onEnd, rateOverride);
    return;
  }
  const audio = new Audio(srcPath);
  audio.playbackRate = rateOverride || settings.rate || 0.95;
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

function speakViaWebSpeech(text, lang, onEnd, rateOverride) {
  if (!('speechSynthesis' in window)) { onEnd && onEnd(); return; }
  const ss = window.speechSynthesis;
  ss.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = rateOverride || settings.rate || 0.95;
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
  if (settings.sttEnabled === false) {
    document.getElementById('mic-result').textContent = '設定でマイク入力がオフです';
    return;
  }
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

// シャドウイング: 模範を再生 → 終わったらマイク自動 ON → 結果を模範と比較
function startShadowing() {
  if (!currentProblem) return;
  const shadowEl = document.getElementById('shadow-result');
  shadowEl.classList.add('visible');
  if (settings.sttEnabled === false) {
    shadowEl.innerHTML = '<div class="label">設定でマイク入力がオフです。模範音声のみ再生します。</div>';
    speak(currentProblem);
    return;
  }
  shadowEl.innerHTML = '<div class="label">▶ 模範音声を再生中...</div>';
  speakAudio(`audio/${currentProblem.id}.mp3`, currentProblem.en, 'en-US', () => {
    // 模範終了後にマイク ON
    runShadowRecognition();
  }, currentProblem.id);
}

function runShadowRecognition() {
  if (!recognition) recognition = initSTT();
  const shadowEl = document.getElementById('shadow-result');
  if (!recognition) {
    shadowEl.innerHTML = '<div class="label">⚠ この端末は音声認識に未対応</div>';
    return;
  }
  shadowEl.innerHTML = '<div class="label">🎙 マイク ON - 真似て話してください</div>';
  recognition.onresult = (e) => {
    const heard = e.results[0][0].transcript;
    renderShadowResult(heard, currentProblem.en);
  };
  recognition.onerror = (e) => {
    shadowEl.innerHTML = `<div class="label">⚠ ${e.error}</div>`;
  };
  recognition.onend = () => {};
  try { recognition.start(); }
  catch (e) {
    // すでに動作中の場合は一度止めて再起動
    try { recognition.stop(); } catch {}
    setTimeout(() => { try { recognition.start(); } catch {} }, 300);
  }
}

function renderShadowResult(heard, correct) {
  const shadowEl = document.getElementById('shadow-result');
  const userWords = normalizeForDict(heard);
  const correctWords = normalizeForDict(correct);
  const diff = diffWordsHtml(userWords, correctWords);
  const score = correctWords.length > 0 ? Math.round((diff.okCount / correctWords.length) * 100) : 0;
  let cls = 's-low';
  if (score >= 85) cls = 's-good';
  else if (score >= 60) cls = 's-mid';
  shadowEl.innerHTML =
    `<div class="label">あなたの発音 (聞き取り結果):</div>` +
    `<div class="heard">${diff.body}</div>` +
    `<div class="score ${cls}">一致度: ${score}% (${diff.okCount}/${correctWords.length} 語)</div>`;
}

// ====================================================================
// Scene selector
// ====================================================================
function renderLevelSelector() {
  const sel = document.getElementById('level-select');
  if (!sel) return;
  sel.innerHTML = '';
  for (const m of levelsMeta) {
    const o = document.createElement('option');
    o.value = String(m.id);
    o.textContent = m.label;
    if (m.id === currentLevel()) o.selected = true;
    sel.appendChild(o);
  }
}

function renderLevelBanner() {
  const lv = currentLevel();
  const m = levelMeta(lv);
  const pool = allProblems.filter(p => p.level === lv);
  const learned = pool.filter(p => (state.byId[p.id]?.seen || 0) > 0).length;
  const total = pool.length;
  const pct = total > 0 ? Math.round((learned / total) * 100) : 0;
  // ゆるい卒業指標: 当該Lvの 80% 以上を1回以上学習
  const gradReady = total > 0 && learned / total >= 0.8;
  const el = document.getElementById('level-banner');
  if (!el) return;
  el.innerHTML =
    `<div class="lb-head">🎯 ${escapeHtml(m.label)} <span class="lb-cefr">${escapeHtml(m.cefr || '')}</span>` +
    (gradReady ? ` <span class="lb-grad">卒業ライン到達</span>` : '') +
    `</div>` +
    `<div class="lb-goal">目標: ${escapeHtml(m.goal)}</div>` +
    `<div class="lb-crit">卒業: ${escapeHtml(m.criteria)}</div>` +
    `<div class="lb-bar"><div class="lb-fill${gradReady ? ' grad' : ''}" style="width:${pct}%"></div></div>` +
    `<div class="lb-pct">${learned} / ${total} 学習済 (${pct}%)${gradReady ? ' · 次のレベルへ進んでもOK' : ''}</div>`;
}

function renderSceneSelector() {
  const sel = document.getElementById('scene-select');
  sel.innerHTML = '';
  const list = scenesForLevel(currentLevel());
  // このレベルでシーンが1種(全般のみ)なら「すべて」だけ出す
  const opts = [{ id: 'all', label: 'すべて' }, ...list];
  // 選択中シーンがこのレベルに無ければ all に戻す
  if (settings.sceneFilter !== 'all' && !list.some(s => s.id === settings.sceneFilter)) {
    settings.sceneFilter = 'all';
  }
  for (const s of opts) {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.label;
    if (s.id === settings.sceneFilter) o.selected = true;
    sel.appendChild(o);
  }
  // シーンが実質1種ならセレクタを隠す
  sel.style.display = list.length <= 1 ? 'none' : '';
}

function refreshCurrentMode() {
  state.sessionRetry = [];
  buildSessionQueue();
  nextProblem();
  renderLevelBanner();
  if (settings.mode === 'review') { buildReviewQueue(); renderReviewCard(); }
  else if (settings.mode === 'list') renderList();
  else if (settings.mode === 'dictation') startDictation();
  else if (settings.mode === 'dialogue') startDialogue();
  else if (settings.mode === 'reading') startReading();
  else if (settings.mode === 'vocab') startVocab();
}

function onLevelChange(e) {
  settings.levelFilter = parseInt(e.target.value, 10);
  settings.sceneFilter = 'all';
  saveSettings();
  renderSceneSelector();
  refreshCurrentMode();
}

function onSceneChange(e) {
  settings.sceneFilter = e.target.value;
  saveSettings();
  refreshCurrentMode();
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
// Dictation mode
// ====================================================================
let dictQueue = [];
let dictIndex = 0;
let dictCurrent = null;
let dictCorrectTokens = [];   // 正解の表示用トークン (句読点除去後)
let dictBuilt = [];           // [{word, bankIdx}] 選択済み

function startDictation() {
  buildDictQueue();
  dictIndex = 0;
  renderDictation();
}

function buildDictQueue() {
  const pool = problemsForCurrentScene();
  dictQueue = pool.slice().sort(() => Math.random() - 0.5);
}

// 表示用トークン: 句読点を外した単語配列 (比較も表示もこれを使う)
function tokenizeForDict(s) {
  return s
    .replace(/[“”‘’]/g, '')
    .split(/\s+/)
    .map(w => w.replace(/^[,.!?;:"()]+|[,.!?;:"()]+$/g, ''))
    .filter(Boolean);
}

/** シャドウイング・採点用: 小文字化してからトークン化 */
function normalizeForDict(s) {
  return tokenizeForDict(String(s || '').toLowerCase().replace(/[’']/g, "'"));
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function renderDictation() {
  if (dictQueue.length === 0) {
    document.getElementById('dict-jp').textContent = '例文がありません。';
    document.getElementById('dict-progress').textContent = '0 / 0';
    document.getElementById('dict-build').innerHTML = '';
    document.getElementById('dict-bank').innerHTML = '';
    return;
  }
  dictCurrent = dictQueue[dictIndex];
  dictCorrectTokens = tokenizeForDict(dictCurrent.en);
  dictBuilt = [];
  document.getElementById('dict-progress').textContent = `${dictIndex + 1} / ${dictQueue.length}`;
  document.getElementById('dict-jp').textContent = dictCurrent.jp;
  document.getElementById('dict-result').classList.add('hidden');
  document.getElementById('dict-tip').classList.add('hidden');
  document.getElementById('dict-next-wrap').classList.add('hidden');
  document.getElementById('dict-check').classList.remove('hidden');
  document.getElementById('dict-skip').classList.remove('hidden');

  // バンク生成 (シャッフル)。同一単語が複数あっても index で区別
  const bankWords = shuffle(dictCorrectTokens.map((w, i) => ({ w, i })));
  const bank = document.getElementById('dict-bank');
  bank.innerHTML = '';
  bankWords.forEach(({ w, i }) => {
    const chip = document.createElement('button');
    chip.className = 'word-chip';
    chip.textContent = w;
    chip.dataset.bankIdx = String(i);
    chip.addEventListener('click', () => pickWord(chip, w, i));
    bank.appendChild(chip);
  });
  document.getElementById('dict-build').innerHTML = '';
  setTimeout(() => speak(dictCurrent), 200);
}

function pickWord(chip, word, bankIdx) {
  if (chip.classList.contains('used')) return;
  chip.classList.add('used');
  dictBuilt.push({ word, bankIdx });
  renderBuild();
}

function renderBuild() {
  const build = document.getElementById('dict-build');
  build.innerHTML = '';
  dictBuilt.forEach((item, pos) => {
    const c = document.createElement('button');
    c.className = 'word-chip';
    c.textContent = item.word;
    c.addEventListener('click', () => unpickWord(pos));
    build.appendChild(c);
  });
}

function unpickWord(pos) {
  const item = dictBuilt[pos];
  if (!item) return;
  dictBuilt.splice(pos, 1);
  // バンク側の used を解除
  const chip = document.querySelector(`#dict-bank .word-chip[data-bank-idx="${item.bankIdx}"]`);
  if (chip) chip.classList.remove('used');
  renderBuild();
}

function dictCheck() {
  if (!dictCurrent) return;
  const build = document.getElementById('dict-build');
  const chips = Array.from(build.children);
  let okCount = 0;
  dictBuilt.forEach((item, i) => {
    const correct = dictCorrectTokens[i];
    const good = correct && item.word.toLowerCase() === correct.toLowerCase();
    if (good) okCount++;
    if (chips[i]) chips[i].classList.add(good ? 'ok' : 'bad');
  });
  const total = dictCorrectTokens.length;
  const score = total > 0 ? Math.round((okCount / total) * 100) : 0;

  const resEl = document.getElementById('dict-result');
  resEl.innerHTML =
    `<div class="dict-correct"><div class="full">${escapeHtml(dictCurrent.en)}</div></div>` +
    `<div class="dict-score">スコア: <b>${score}%</b> (${okCount}/${total} 語が正しい位置)</div>`;
  resEl.classList.remove('hidden');
  document.getElementById('dict-check').classList.add('hidden');
  document.getElementById('dict-skip').classList.add('hidden');
  document.getElementById('dict-next-wrap').classList.remove('hidden');
  if (dictCurrent.tip) {
    const tipEl = document.getElementById('dict-tip');
    tipEl.textContent = dictCurrent.tip;
    tipEl.classList.remove('hidden');
  }
  speak(dictCurrent);
}

function dictSkip() {
  document.getElementById('dict-check').classList.add('hidden');
  document.getElementById('dict-skip').classList.add('hidden');
  const resEl = document.getElementById('dict-result');
  resEl.innerHTML = `<div class="dict-correct"><div class="full">${escapeHtml(dictCurrent.en)}</div></div>`;
  resEl.classList.remove('hidden');
  document.getElementById('dict-next-wrap').classList.remove('hidden');
  if (dictCurrent.tip) {
    const tipEl = document.getElementById('dict-tip');
    tipEl.textContent = dictCurrent.tip;
    tipEl.classList.remove('hidden');
  }
  speak(dictCurrent);
}

function dictNext() {
  dictIndex = (dictIndex + 1) % dictQueue.length;
  renderDictation();
}

// 簡易 word-diff: ユーザー入力と正解を順に並べ、Longest Common Subsequence 風
function diffWordsHtml(userWords, correctWords) {
  // LCS テーブル
  const m = userWords.length, n = correctWords.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (userWords[i] === correctWords[j]) dp[i + 1][j + 1] = dp[i][j] + 1;
      else dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  // 正解側を中心に並べる: 各 correctWord が user に存在するか
  const matched = new Array(n).fill(false);
  // バックトラックして対応関係
  let i = m, j = n;
  const userMatch = new Array(m).fill(false);
  while (i > 0 && j > 0) {
    if (userWords[i - 1] === correctWords[j - 1]) {
      matched[j - 1] = true;
      userMatch[i - 1] = true;
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  let okCount = 0;
  const parts = [];
  for (let k = 0; k < n; k++) {
    if (matched[k]) { parts.push(`<span class="dict-word ok">${escapeHtml(correctWords[k])}</span>`); okCount++; }
    else { parts.push(`<span class="dict-word miss">${escapeHtml(correctWords[k])}</span>`); }
  }
  // 余分な user words (extra) も末尾に
  const extras = [];
  for (let k = 0; k < m; k++) {
    if (!userMatch[k]) extras.push(`<span class="dict-word extra">${escapeHtml(userWords[k])}</span>`);
  }
  let body = `<div>${parts.join(' ')}</div>`;
  if (extras.length) body += `<div style="margin-top:6px;font-size:13px;color:var(--text-dim)">余分: ${extras.join(' ')}</div>`;
  return { body, okCount };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ====================================================================
// Dialogue mode
// ====================================================================
let dialoguesData = null;
let dlgIndex = 0;
let dlgTurn = 0;

let dlgList = [];   // 現 Lv/シーンで絞った会話

function dialoguesForCurrent() {
  const lv = currentLevel();
  return (dialoguesData || []).filter(d =>
    d.level === lv &&
    (settings.sceneFilter === 'all' || d.scene === settings.sceneFilter));
}

async function startDialogue() {
  if (!dialoguesData) {
    try {
      dialoguesData = (await (await fetch('data/dialogues.json')).json()).dialogues;
    } catch { return; }
  }
  dlgList = dialoguesForCurrent();
  dlgIndex = 0;
  dlgTurn = 0;
  renderDialogueTurn();
}

function currentDialogue() { return dlgList[dlgIndex]; }

function renderDialogueTurn() {
  const log = document.getElementById('dlg-log');
  const prompt = document.getElementById('dlg-prompt');
  const done = document.getElementById('dlg-done');
  if (dlgList.length === 0) {
    document.getElementById('dlg-title').textContent = 'この Lv / シーンの会話はまだ準備中';
    document.getElementById('dlg-progress').textContent = '0 / 0';
    log.innerHTML = '<div style="color:var(--text-dim);padding:24px;text-align:center">レベルかシーンを変えてみてください。</div>';
    prompt.classList.add('hidden');
    done.classList.add('hidden');
    return;
  }
  const d = currentDialogue();
  document.getElementById('dlg-title').textContent = d.title;
  document.getElementById('dlg-progress').textContent = `${dlgIndex + 1} / ${dlgList.length}`;
  if (dlgTurn === 0) log.innerHTML = '';
  prompt.classList.add('hidden');
  done.classList.add('hidden');

  // 終了
  if (dlgTurn >= d.turns.length) {
    done.classList.remove('hidden');
    return;
  }

  const turn = d.turns[dlgTurn];
  if (turn.sp === 'A') {
    addDialogueBubble(turn, dlgTurn, 'a');
    speak({ id: `${d.id}-${dlgTurn + 1}`, en: turn.en });
    dlgTurn++;
    setTimeout(renderDialogueTurn, 200); // 連続で次へ (YOU が来るまで A を流す)
  } else {
    // YOU の番: プロンプト表示
    document.getElementById('dlg-prompt-jp').textContent = turn.jp;
    document.getElementById('dlg-prompt-answer').classList.add('hidden');
    document.getElementById('dlg-reveal').classList.remove('hidden');
    prompt.classList.remove('hidden');
  }
}

function addDialogueBubble(turn, turnIdx, cls) {
  const log = document.getElementById('dlg-log');
  const b = document.createElement('div');
  b.className = 'dlg-bubble ' + cls;
  const en = document.createElement('div');
  en.innerHTML = escapeHtml(turn.en) +
    ` <button class="b-speak" aria-label="再生">🔊</button>`;
  const jp = document.createElement('div');
  jp.className = 'b-jp';
  jp.textContent = turn.jp;
  b.appendChild(en);
  b.appendChild(jp);
  log.appendChild(b);
  b.querySelector('.b-speak').addEventListener('click', () =>
    speak({ id: `${currentDialogue().id}-${turnIdx + 1}`, en: turn.en }));
  b.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function dlgReveal() {
  const d = currentDialogue();
  const turn = d.turns[dlgTurn];
  document.getElementById('dlg-ans-en').textContent = turn.en;
  document.getElementById('dlg-prompt-answer').classList.remove('hidden');
  document.getElementById('dlg-reveal').classList.add('hidden');
  speak({ id: `${d.id}-${dlgTurn + 1}`, en: turn.en });
}

function dlgContinue() {
  const d = currentDialogue();
  const turn = d.turns[dlgTurn];
  addDialogueBubble(turn, dlgTurn, 'you');
  dlgTurn++;
  document.getElementById('dlg-prompt').classList.add('hidden');
  renderDialogueTurn();
}

function dlgNextDialogue() {
  if (dlgList.length === 0) return;
  dlgIndex = (dlgIndex + 1) % dlgList.length;
  dlgTurn = 0;
  renderDialogueTurn();
}
function dlgReplay() { dlgTurn = 0; renderDialogueTurn(); }

// ====================================================================
// Reading mode
// ====================================================================
let readingData = null;
let rdIndex = 0;
let rdAnswered = false;

let rdList = [];

function readingForCurrent() {
  const lv = currentLevel();
  return (readingData || []).filter(p =>
    p.level === lv &&
    (settings.sceneFilter === 'all' || p.scene === settings.sceneFilter));
}

async function startReading() {
  if (!readingData) {
    try {
      readingData = (await (await fetch('data/reading.json')).json()).passages;
    } catch { return; }
  }
  rdList = readingForCurrent();
  rdIndex = 0;
  renderReading();
}

function renderReading() {
  if (rdList.length === 0) {
    document.getElementById('rd-kind').textContent = '—';
    document.getElementById('rd-progress').textContent = '0 / 0';
    document.getElementById('rd-title').textContent = 'この Lv / シーンの読解はまだ準備中';
    document.getElementById('rd-en').textContent = 'レベルかシーンを変えてみてください。';
    document.getElementById('rd-jp').classList.add('hidden');
    document.getElementById('rd-q').textContent = '';
    document.getElementById('rd-choices').innerHTML = '';
    document.getElementById('rd-next-wrap').classList.add('hidden');
    return;
  }
  const p = rdList[rdIndex];
  rdAnswered = false;
  document.getElementById('rd-kind').textContent = p.kind;
  document.getElementById('rd-progress').textContent = `${rdIndex + 1} / ${rdList.length}`;
  document.getElementById('rd-title').textContent = p.title;
  document.getElementById('rd-en').textContent = p.en;
  const jpEl = document.getElementById('rd-jp');
  jpEl.textContent = p.jp;
  jpEl.classList.add('hidden');
  document.getElementById('rd-q').textContent = p.q;
  document.getElementById('rd-next-wrap').classList.add('hidden');
  const ch = document.getElementById('rd-choices');
  ch.innerHTML = '';
  p.choices.forEach((c, i) => {
    const btn = document.createElement('button');
    btn.className = 'rd-choice';
    btn.textContent = c;
    btn.addEventListener('click', () => rdAnswer(i, btn));
    ch.appendChild(btn);
  });
}

function rdAnswer(i, btn) {
  if (rdAnswered) return;
  rdAnswered = true;
  const p = rdList[rdIndex];
  const buttons = document.querySelectorAll('#rd-choices .rd-choice');
  buttons.forEach((b, idx) => {
    b.disabled = true;
    if (idx === p.answer) b.classList.add('ok');
  });
  if (i !== p.answer) btn.classList.add('bad');
  document.getElementById('rd-jp').classList.remove('hidden');
  document.getElementById('rd-next-wrap').classList.remove('hidden');
}

function rdNext() {
  if (rdList.length === 0) return;
  rdIndex = (rdIndex + 1) % rdList.length;
  renderReading();
}

// ====================================================================
// Vocab mode - 現 Lv/シーンのフレーズプールから派生 (英→日 意味当て)
// ====================================================================
let vocItems = [];   // 現プールのフレーズ配列
let vocPos = 0;
let vocScore = 0;
let vocAnswered = false;

function startVocab() {
  const pool = problemsForCurrentScene();
  vocItems = pool.slice().sort(() => Math.random() - 0.5);
  vocPos = 0;
  vocScore = 0;
  renderVocab();
}

function renderVocab() {
  vocAnswered = false;
  document.getElementById('voc-explain').classList.add('hidden');
  document.getElementById('voc-next-wrap').classList.add('hidden');
  const ch = document.getElementById('voc-choices');
  if (vocItems.length === 0) {
    document.getElementById('voc-progress').textContent = '0 / 0';
    document.getElementById('voc-score').textContent = '';
    document.getElementById('voc-word').textContent = 'この Lv / シーンの語彙はまだ準備中';
    document.getElementById('voc-ex').textContent = '';
    ch.innerHTML = '';
    return;
  }
  const item = vocItems[vocPos];
  document.getElementById('voc-progress').textContent = `${vocPos + 1} / ${vocItems.length}`;
  document.getElementById('voc-score').textContent = `正解 ${vocScore}`;
  document.getElementById('voc-word').textContent = item.en;
  document.getElementById('voc-ex').textContent = '↓ 意味は？';

  // 4択: 正解 = この文の jp、ダミー = プール内の他の文の jp
  const others = vocItems.filter(x => x.id !== item.id && x.jp !== item.jp);
  const distractors = others.sort(() => Math.random() - 0.5).slice(0, 3).map(x => x.jp);
  const choices = [item.jp, ...distractors].sort(() => Math.random() - 0.5);
  ch.innerHTML = '';
  choices.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'voc-choice';
    btn.textContent = c;
    btn.addEventListener('click', () => vocAnswer(c, item, btn));
    ch.appendChild(btn);
  });
  setTimeout(() => speak({ id: item.id, en: item.en }), 150);
}

function vocAnswer(choice, item, btn) {
  if (vocAnswered) return;
  vocAnswered = true;
  const correct = choice === item.jp;
  if (correct) vocScore++;
  document.querySelectorAll('#voc-choices .voc-choice').forEach(b => {
    b.disabled = true;
    if (b.textContent === item.jp) b.classList.add('ok');
  });
  if (!correct) btn.classList.add('bad');
  const ex = document.getElementById('voc-explain');
  let html = `<b>${escapeHtml(item.en)}</b><br>= ${escapeHtml(item.jp)}`;
  if (item.note) html += `<br><span style="color:var(--text-dim)">${escapeHtml(item.note)}</span>`;
  if (item.tip) html += `<br><span style="color:#f0b87b">🎧 ${escapeHtml(item.tip)}</span>`;
  ex.innerHTML = html;
  ex.classList.remove('hidden');
  document.getElementById('voc-score').textContent = `正解 ${vocScore}`;
  document.getElementById('voc-next-wrap').classList.remove('hidden');
}

function vocNext() {
  if (vocItems.length === 0) return;
  vocPos = (vocPos + 1) % vocItems.length;
  if (vocPos === 0) vocItems.sort(() => Math.random() - 0.5);
  renderVocab();
}

// ====================================================================
// Grammar reference
// ====================================================================
let grammarData = null;

async function renderGrammar() {
  if (!grammarData) {
    try {
      const res = await fetch('data/grammar.json');
      grammarData = await res.json();
    } catch {
      document.getElementById('grammar-title').textContent = '文法データの読み込みに失敗しました';
      return;
    }
  }
  document.getElementById('grammar-title').textContent = grammarData.title;
  document.getElementById('grammar-intro').textContent = grammarData.intro || '';
  const ul = document.getElementById('grammar-list');
  if (ul.children.length > 0) return; // 既に描画済みなら維持
  ul.innerHTML = '';
  for (const sec of grammarData.sections) {
    const li = document.createElement('li');
    li.className = 'grammar-item';

    const head = document.createElement('div');
    head.className = 'grammar-item-head';
    head.textContent = sec.title;
    li.appendChild(head);

    const body = document.createElement('div');
    body.className = 'grammar-body';

    const txt = document.createElement('div');
    txt.className = 'grammar-text';
    txt.textContent = sec.body;
    body.appendChild(txt);

    if (sec.examples && sec.examples.length) {
      const ex = document.createElement('div');
      ex.className = 'grammar-ex';
      for (const e of sec.examples) {
        const row = document.createElement('div');
        row.className = 'grammar-ex-row';
        const jp = document.createElement('div');
        jp.className = 'grammar-ex-jp';
        jp.textContent = e.jp;
        const en = document.createElement('div');
        en.className = 'grammar-ex-en';
        const enText = document.createElement('span');
        enText.textContent = e.en;
        enText.style.flex = '1';
        const sb = document.createElement('button');
        sb.className = 'speak-btn';
        sb.textContent = '🔊';
        sb.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (e.id) speak({ id: e.id, en: e.en });
          else speak(e.en);
        });
        en.appendChild(enText);
        en.appendChild(sb);
        row.appendChild(jp);
        row.appendChild(en);
        ex.appendChild(row);
      }
      body.appendChild(ex);
    }

    li.appendChild(body);
    head.addEventListener('click', () => li.classList.toggle('open'));
    ul.appendChild(li);
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
    speakBtn.addEventListener('touchend', (e) => { e.stopPropagation(); }, { passive: true });
    const slowBtn = document.createElement('button');
    slowBtn.className = 'speak-btn';
    slowBtn.textContent = '🐢';
    slowBtn.setAttribute('aria-label', 'ゆっくり再生');
    slowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      speakSlow(p);
    });
    slowBtn.addEventListener('touchend', (e) => { e.stopPropagation(); }, { passive: true });
    enRow.appendChild(enText);
    enRow.appendChild(speakBtn);
    enRow.appendChild(slowBtn);
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
  if (p.tip) {
    const tip = document.createElement('div');
    tip.className = 'tip';
    tip.textContent = p.tip;
    body.appendChild(tip);
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
  document.getElementById('dictation').classList.toggle('hidden', mode !== 'dictation');
  document.getElementById('grammar').classList.toggle('hidden', mode !== 'grammar');
  document.getElementById('dialogue').classList.toggle('hidden', mode !== 'dialogue');
  document.getElementById('reading').classList.toggle('hidden', mode !== 'reading');
  document.getElementById('vocab').classList.toggle('hidden', mode !== 'vocab');
  // レベル/シーン/目標バナーは「コア4モード」だけで意味を持つ。
  // 文法/会話/読解/語彙 はシーン非連動の独立コンテンツなので隠す。
  // Lv/シーンは文法以外の全モードで有効 (会話/読解/語彙も Lv×シーン連動に統合済)
  const coreMode = mode !== 'grammar';
  const controls = document.getElementById('core-controls');
  const banner = document.getElementById('level-banner');
  const scSel = document.getElementById('scene-select');
  if (controls) controls.style.display = coreMode ? '' : 'none';
  if (banner) banner.style.display = coreMode ? '' : 'none';
  if (scSel && coreMode) {
    scSel.style.display = scenesForLevel(currentLevel()).length <= 1 ? 'none' : '';
  }

  if (mode !== 'review') stopReview();
  if (mode !== 'dictation') stopSpeech();
  if (mode === 'list') renderList();
  if (mode === 'dictation') startDictation();
  if (mode === 'grammar') renderGrammar();
  if (mode === 'dialogue') startDialogue();
  if (mode === 'reading') startReading();
  if (mode === 'vocab') startVocab();
}

// ====================================================================
// Review mode
// ====================================================================
function buildReviewQueue() {
  const pool = problemsForCurrentScene();
  const filtered = settings.reviewOnlySeen
    ? pool.filter(p => (state.byId[p.id]?.seen || 0) > 0)
    : pool;
  reviewQueue = filtered.map(p => p.id);
  if (reviewIndex >= reviewQueue.length) reviewIndex = 0;
}

function renderReviewCard() {
  const total = reviewQueue.length;
  document.getElementById('review-progress').textContent = total > 0 ? `${reviewIndex + 1} / ${total}` : '0 / 0';
  const jpEl = document.getElementById('review-jp');
  const enEl = document.getElementById('review-en');
  if (total === 0) {
    if (settings.reviewOnlySeen) {
      jpEl.innerHTML = '学習済みの問題がありません。<br>「学習済みだけに絞る」を外すか、まず学習モードで何問か解いてください。';
    } else {
      jpEl.innerHTML = 'このシーンに例文がありません。';
    }
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
  const obNext = document.getElementById('ob-next');
  if (obNext) obNext.addEventListener('click', () => {
    if (obIndex < OB_STEPS.length - 1) { obIndex++; renderOnboarding(); }
    else finishOnboarding();
  });
  const obSkip = document.getElementById('ob-skip');
  if (obSkip) obSkip.addEventListener('click', finishOnboarding);
  document.getElementById('btn-reveal').addEventListener('click', showAnswer);
  document.getElementById('btn-tts').addEventListener('click', () => speak(currentProblem));
  document.getElementById('btn-tts-slow').addEventListener('click', () => speakSlow(currentProblem));
  document.getElementById('btn-shadow').addEventListener('click', startShadowing);
  document.getElementById('btn-mic').addEventListener('click', startMic);
  document.querySelectorAll('.grade-buttons .btn').forEach(b => {
    b.addEventListener('click', () => grade(b.dataset.grade));
  });
  const saidEl = document.getElementById('said-check');
  if (saidEl) {
    saidEl.addEventListener('change', (e) => {
      saidThisCard = !!e.target.checked;
      updateSaidGate();
    });
  }
  const btnPractice = document.getElementById('btn-practice-again');
  if (btnPractice) btnPractice.addEventListener('click', practiceAgain);
  document.getElementById('btn-restart').addEventListener('click', () => {
    if (!confirm('全進捗をリセットします。よろしいですか？')) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });
  const btnErrReload = document.getElementById('app-error-reload');
  if (btnErrReload) btnErrReload.addEventListener('click', () => location.reload());
  const btnExport = document.getElementById('btn-export');
  if (btnExport) btnExport.addEventListener('click', exportProgress);
  const btnImport = document.getElementById('btn-import');
  const importFile = document.getElementById('import-file');
  if (btnImport && importFile) {
    btnImport.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', () => {
      const f = importFile.files && importFile.files[0];
      importProgressFromFile(f);
      importFile.value = '';
    });
  }
  const optGoal = document.getElementById('opt-daily-goal');
  if (optGoal) {
    optGoal.addEventListener('change', (e) => {
      settings.dailyGoal = Math.max(1, parseInt(e.target.value, 10) || 15);
      saveSettings();
      renderDailyGoal();
    });
  }
  const optSaid = document.getElementById('opt-require-said');
  if (optSaid) {
    optSaid.addEventListener('change', (e) => {
      settings.requireSaid = e.target.checked;
      saveSettings();
      updateSaidGate();
    });
  }
  const optTimer = document.getElementById('opt-study-timer');
  if (optTimer) {
    optTimer.addEventListener('change', (e) => {
      settings.studyTimerOn = e.target.checked;
      saveSettings();
      if (settings.mode === 'study' && currentProblem) startStudyTimer();
      else clearStudyTimer();
    });
  }
  const optTimerSec = document.getElementById('opt-timer-sec');
  if (optTimerSec) {
    optTimerSec.addEventListener('change', (e) => {
      settings.studyTimerSec = Math.max(1, parseInt(e.target.value, 10) || 3);
      saveSettings();
      if (settings.studyTimerOn && settings.mode === 'study' && currentProblem) startStudyTimer();
    });
  }
  document.getElementById('scene-select').addEventListener('change', onSceneChange);
  const lvSel = document.getElementById('level-select');
  if (lvSel) lvSel.addEventListener('change', onLevelChange);
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
  document.getElementById('rev-only-seen').addEventListener('change', (e) => {
    settings.reviewOnlySeen = e.target.checked;
    saveSettings();
    reviewIndex = 0;
    buildReviewQueue();
    renderReviewCard();
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
  document.getElementById('dict-play').addEventListener('click', () => speak(dictCurrent));
  document.getElementById('dict-play-slow').addEventListener('click', () => speakSlow(dictCurrent));
  document.getElementById('dict-check').addEventListener('click', dictCheck);
  document.getElementById('dict-skip').addEventListener('click', dictSkip);
  document.getElementById('dict-next').addEventListener('click', dictNext);
  document.getElementById('dlg-reveal').addEventListener('click', dlgReveal);
  document.getElementById('dlg-continue').addEventListener('click', dlgContinue);
  document.getElementById('dlg-next-dialogue').addEventListener('click', dlgNextDialogue);
  document.getElementById('dlg-replay').addEventListener('click', dlgReplay);
  document.getElementById('rd-play').addEventListener('click', () => {
    const p = rdList[rdIndex];
    if (p) speak({ id: p.id, en: p.en });
  });
  document.getElementById('rd-play-slow').addEventListener('click', () => {
    const p = rdList[rdIndex];
    if (p) speakSlow({ id: p.id, en: p.en });
  });
  document.getElementById('rd-toggle-jp').addEventListener('click', () => {
    document.getElementById('rd-jp').classList.toggle('hidden');
  });
  document.getElementById('rd-next').addEventListener('click', rdNext);
  document.getElementById('voc-play').addEventListener('click', () => {
    const it = vocItems[vocPos];
    if (it) speak({ id: it.id, en: it.en });
  });
  document.getElementById('voc-next').addEventListener('click', vocNext);
  document.getElementById('opt-rate').addEventListener('input', (e) => {
    settings.rate = parseFloat(e.target.value);
    document.getElementById('rate-label').textContent = settings.rate.toFixed(2);
    saveSettings();
  });
  const optStt = document.getElementById('opt-stt');
  if (optStt) {
    optStt.addEventListener('change', (e) => {
      settings.sttEnabled = e.target.checked;
      saveSettings();
      applySttUi();
    });
  }
}

function applySttUi() {
  const on = settings.sttEnabled !== false;
  ['btn-mic', 'btn-shadow'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = on ? '' : 'none';
  });
}

function applySettings() {
  document.getElementById('opt-rate').value = settings.rate;
  document.getElementById('rate-label').textContent = (settings.rate || 0.95).toFixed(2);
  document.getElementById('rev-gap').value = settings.reviewGap;
  document.getElementById('rev-gap-label').textContent = settings.reviewGap + '秒';
  document.getElementById('rev-next-gap').value = settings.reviewNextGap;
  document.getElementById('rev-next-gap-label').textContent = settings.reviewNextGap + '秒';
  document.getElementById('rev-jp-tts').checked = !!settings.reviewJpTts;
  document.getElementById('rev-loop').checked = !!settings.reviewLoop;
  document.getElementById('rev-only-seen').checked = !!settings.reviewOnlySeen;
  document.getElementById('list-show-en').checked = settings.listShowEn !== false;
  const optStt = document.getElementById('opt-stt');
  if (optStt) optStt.checked = settings.sttEnabled !== false;
  const optGoal = document.getElementById('opt-daily-goal');
  if (optGoal) optGoal.value = settings.dailyGoal || 15;
  const optSaid = document.getElementById('opt-require-said');
  if (optSaid) optSaid.checked = settings.requireSaid !== false;
  const optTimer = document.getElementById('opt-study-timer');
  if (optTimer) optTimer.checked = settings.studyTimerOn !== false;
  const optTimerSec = document.getElementById('opt-timer-sec');
  if (optTimerSec) optTimerSec.value = settings.studyTimerSec || 3;
  applySttUi();
  updateSaidGate();
  renderDailyGoal();
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

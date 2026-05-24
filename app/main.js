const APP_BUILD = '003';

const storageKeys = {
  language: 'familyTracker.language',
  theme: 'familyTracker.theme',
};

const translations = {
  ko: {
    htmlLang: 'ko',
    eyebrow: 'Baby Tracker',
    today: '오늘',
    yesterday: '어제',
    tomorrow: '내일',
    settings: '설정',
    theme: '테마',
    language: '언어',
    refresh: '새로고침',
    signInTitle: '로그인이 필요해요',
    signInBody: '계정별로 가족 기록과 세션을 분리해서 저장합니다.',
    googleLogin: 'Google로 로그인',
    devLogin: 'Admin 개발 로그인',
    logout: '로그아웃',
    signedInAs: (name) => `${name} 계정`,
    log: '기록',
    save: '저장',
    timeline: '타임라인',
    tabletBoard: '패드 보드',
    sharedInput: '공용 입력',
    question: '질문',
    ask: '질문',
    thinking: '생각 중...',
    saving: '저장 중...',
    saveFailed: '저장하지 못했어요.',
    logPlaceholder: '분유, 낮잠, 깸, 고구마 먹음',
    askPlaceholder: '오늘 총 수면시간?',
    emptyTimeline: '아직 이 날짜에 기록이 없어요.',
    eventCount: (count) => `${count}개`,
    minutes: (value) => `${value}분`,
    times: (value) => `${value}회`,
    sleepActive: '지금 낮잠 중',
    elapsed: (value) => `${value}분째`,
    started: (value) => `시작 ${value}`,
    wake: '깸',
    summarySleep: '수면',
    summaryMilk: '수유',
    summarySolid: '이유식',
    summaryDiaper: '기저귀',
    eventSleep: '수면',
    eventSleepEnd: '수면 종료',
    eventBreast: '모유',
    eventFormula: '분유',
    eventSolid: '이유식',
    eventDirty: '응가',
    eventDiaper: '기저귀',
    eventGeneric: '기록',
    noTime: '시간 없음',
    inferred: (label) => `${label} 예상`,
    fieldAmount: '양',
    fieldStart: '시작',
    fieldEnd: '종료',
    fieldDuration: '시간',
    fieldKind: '종류',
    quickActions: ['분유', '낮잠', '깸', '응가', '쉬', '이유식'],
    tabletActions: [
      { label: '분유', value: '분유' },
      { label: '모유', value: '모유' },
      { label: '이유식', value: '이유식 먹음' },
      { label: '낮잠 시작', value: '낮잠' },
      { label: '깸', value: '깸' },
      { label: '응가', value: '응가' },
      { label: '쉬', value: '쉬' },
      { label: '메모', value: '' },
    ],
  },
  en: {
    htmlLang: 'en',
    eyebrow: 'Baby Tracker',
    today: 'Today',
    yesterday: 'Yesterday',
    tomorrow: 'Tomorrow',
    settings: 'Settings',
    theme: 'Theme',
    language: 'Language',
    refresh: 'Refresh',
    signInTitle: 'Sign in required',
    signInBody: 'Family logs and sessions are separated by account.',
    googleLogin: 'Continue with Google',
    devLogin: 'Admin dev login',
    logout: 'Log out',
    signedInAs: (name) => `${name} account`,
    log: 'Log',
    save: 'Save',
    timeline: 'Timeline',
    tabletBoard: 'Tablet board',
    sharedInput: 'Shared input',
    question: 'Question',
    ask: 'Ask',
    thinking: 'Thinking...',
    saving: 'Saving...',
    saveFailed: 'Could not save.',
    logPlaceholder: 'formula, nap, woke up, sweet potato',
    askPlaceholder: 'How much sleep today?',
    emptyTimeline: 'No logs for this date yet.',
    eventCount: (count) => `${count} items`,
    minutes: (value) => `${value} min`,
    times: (value) => `${value}x`,
    sleepActive: 'Napping now',
    elapsed: (value) => `${value} min`,
    started: (value) => `Started ${value}`,
    wake: 'Wake',
    summarySleep: 'Sleep',
    summaryMilk: 'Milk',
    summarySolid: 'Solids',
    summaryDiaper: 'Diaper',
    eventSleep: 'Sleep',
    eventSleepEnd: 'Sleep ended',
    eventBreast: 'Breast milk',
    eventFormula: 'Formula',
    eventSolid: 'Solids',
    eventDirty: 'Dirty diaper',
    eventDiaper: 'Diaper',
    eventGeneric: 'Log',
    noTime: 'No time',
    inferred: (label) => `${label} estimated`,
    fieldAmount: 'Amount',
    fieldStart: 'Start',
    fieldEnd: 'End',
    fieldDuration: 'Duration',
    fieldKind: 'Kind',
    quickActions: ['formula', 'nap', 'woke up', 'dirty', 'wet', 'solids'],
    tabletActions: [
      { label: 'Formula', value: 'formula' },
      { label: 'Breast', value: 'breast milk' },
      { label: 'Solids', value: 'solids eaten' },
      { label: 'Nap start', value: 'nap' },
      { label: 'Wake', value: 'woke up' },
      { label: 'Dirty', value: 'dirty diaper' },
      { label: 'Wet', value: 'wet diaper' },
      { label: 'Note', value: '' },
    ],
  },
  vi: {
    htmlLang: 'vi',
    eyebrow: 'Theo dõi em bé',
    today: 'Hôm nay',
    yesterday: 'Hôm qua',
    tomorrow: 'Ngày mai',
    settings: 'Cài đặt',
    theme: 'Giao diện',
    language: 'Ngôn ngữ',
    refresh: 'Làm mới',
    signInTitle: 'Cần đăng nhập',
    signInBody: 'Ghi chép gia đình và phiên làm việc được tách theo tài khoản.',
    googleLogin: 'Đăng nhập bằng Google',
    devLogin: 'Đăng nhập admin dev',
    logout: 'Đăng xuất',
    signedInAs: (name) => `Tài khoản ${name}`,
    log: 'Ghi lại',
    save: 'Lưu',
    timeline: 'Dòng thời gian',
    tabletBoard: 'Bảng tablet',
    sharedInput: 'Nhập chung',
    question: 'Câu hỏi',
    ask: 'Hỏi',
    thinking: 'Đang nghĩ...',
    saving: 'Đang lưu...',
    saveFailed: 'Không lưu được.',
    logPlaceholder: 'sữa bột, ngủ trưa, thức dậy, khoai lang',
    askPlaceholder: 'Hôm nay ngủ bao lâu?',
    emptyTimeline: 'Ngày này chưa có ghi chép.',
    eventCount: (count) => `${count} mục`,
    minutes: (value) => `${value} phút`,
    times: (value) => `${value} lần`,
    sleepActive: 'Đang ngủ trưa',
    elapsed: (value) => `${value} phút`,
    started: (value) => `Bắt đầu ${value}`,
    wake: 'Thức dậy',
    summarySleep: 'Ngủ',
    summaryMilk: 'Sữa',
    summarySolid: 'Ăn dặm',
    summaryDiaper: 'Tã',
    eventSleep: 'Ngủ',
    eventSleepEnd: 'Kết thúc ngủ',
    eventBreast: 'Sữa mẹ',
    eventFormula: 'Sữa bột',
    eventSolid: 'Ăn dặm',
    eventDirty: 'Tã bẩn',
    eventDiaper: 'Tã',
    eventGeneric: 'Ghi chép',
    noTime: 'Không có giờ',
    inferred: (label) => `${label} ước tính`,
    fieldAmount: 'Lượng',
    fieldStart: 'Bắt đầu',
    fieldEnd: 'Kết thúc',
    fieldDuration: 'Thời lượng',
    fieldKind: 'Loại',
    quickActions: ['sữa bột', 'ngủ trưa', 'thức dậy', 'tã bẩn', 'tã ướt', 'ăn dặm'],
    tabletActions: [
      { label: 'Sữa bột', value: 'sữa bột' },
      { label: 'Sữa mẹ', value: 'sữa mẹ' },
      { label: 'Ăn dặm', value: 'ăn dặm' },
      { label: 'Ngủ trưa', value: 'ngủ trưa' },
      { label: 'Thức dậy', value: 'thức dậy' },
      { label: 'Tã bẩn', value: 'tã bẩn' },
      { label: 'Tã ướt', value: 'tã ướt' },
      { label: 'Ghi chú', value: '' },
    ],
  },
};

const state = {
  events: [],
  summary: null,
  user: null,
  language: normalizeLanguage(localStorage.getItem(storageKeys.language)),
  theme: normalizeTheme(localStorage.getItem(storageKeys.theme)),
  selectedDay: localDateKey(new Date()),
};

const logForm = document.querySelector('#log-form');
const logInput = document.querySelector('#log-input');
const askForm = document.querySelector('#ask-form');
const askInput = document.querySelector('#ask-input');
const answerEl = document.querySelector('#answer');
const timelineEl = document.querySelector('#timeline');
const summaryEl = document.querySelector('#summary');
const sleepStatusEl = document.querySelector('#sleep-status');
const quickActionsEl = document.querySelector('#quick-actions');
const tabletActionsEl = document.querySelector('#tablet-actions');
const eventCountEl = document.querySelector('#event-count');
const refreshButton = document.querySelector('#refresh');
const languageSelect = document.querySelector('#language-select');
const themeSelect = document.querySelector('#theme-select');
const authPanel = document.querySelector('#auth-panel');
const accountPanel = document.querySelector('#account-panel');
const accountLabel = document.querySelector('#account-label');
const workspace = document.querySelector('#workspace');
const devLoginButton = document.querySelector('#dev-login');
const logoutButton = document.querySelector('#logout');
const buildBadge = document.querySelector('#build-badge');
const dayLabel = document.querySelector('#day-label');
const dayPicker = document.querySelector('#day-picker');
const previousDayButton = document.querySelector('#previous-day');
const nextDayButton = document.querySelector('#next-day');
const menuToggle = document.querySelector('#menu-toggle');
const menuPanel = document.querySelector('#menu-panel');

applyPreferences();
renderBuildBadge();
renderStaticText();
renderQuickActions();
renderTabletActions();
await loadCurrentUser();
if (state.user) await loadToday();
renderAuthState();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/app/sw.js').catch(() => {});
}

logForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await saveLog(logInput.value);
});

askForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const question = askInput.value.trim();
  if (!question) return;
  answerEl.textContent = t().thinking;
  const response = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question,
      day: state.selectedDay,
      timezone: localTimezone(),
    }),
  });
  const payload = await response.json();
  answerEl.textContent = response.ok ? payload.answer : payload.error;
});

refreshButton.addEventListener('click', loadToday);
devLoginButton.addEventListener('click', devLogin);
logoutButton.addEventListener('click', logout);
menuToggle.addEventListener('click', () => setMenuOpen(menuPanel.classList.contains('hidden')));
previousDayButton.addEventListener('click', () => shiftSelectedDay(-1));
nextDayButton.addEventListener('click', () => shiftSelectedDay(1));
dayPicker.addEventListener('change', () => {
  if (!dayPicker.value) return;
  state.selectedDay = dayPicker.value;
  loadToday();
});

languageSelect.addEventListener('change', () => {
  state.language = normalizeLanguage(languageSelect.value);
  localStorage.setItem(storageKeys.language, state.language);
  applyPreferences();
  renderStaticText();
  renderQuickActions();
  renderTabletActions();
  renderAuthState();
  render();
});

themeSelect.addEventListener('change', () => {
  state.theme = normalizeTheme(themeSelect.value);
  localStorage.setItem(storageKeys.theme, state.theme);
  applyPreferences();
});

document.addEventListener('click', (event) => {
  if (menuPanel.classList.contains('hidden')) return;
  if (menuPanel.contains(event.target) || menuToggle.contains(event.target)) return;
  setMenuOpen(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setMenuOpen(false);
});

async function saveLog(text) {
  const cleanText = text.trim();
  if (!cleanText) return;
  logInput.value = '';
  logInput.placeholder = t().saving;
  const response = await fetch('/api/logs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: cleanText,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
  const payload = await response.json();
  logInput.placeholder = t().logPlaceholder;
  if (!response.ok) {
    answerEl.textContent = payload.error || t().saveFailed;
    return;
  }
  state.selectedDay = dayFromSavedEvents(payload.events) || localDateKey(new Date());
  await loadToday();
}

async function loadToday() {
  const params = new URLSearchParams({
    day: state.selectedDay,
    timezone: localTimezone(),
  });
  const response = await fetch(`/api/logs/today?${params.toString()}`);
  const payload = await response.json();
  if (response.status === 401) {
    state.user = null;
    state.events = [];
    state.summary = null;
    renderAuthState();
    render();
    return;
  }
  state.events = payload.events || [];
  state.summary = payload.summary;
  render();
}

async function loadCurrentUser() {
  const response = await fetch('/api/auth/me');
  const payload = await response.json();
  state.user = payload.user || null;
}

async function devLogin() {
  const response = await fetch('/api/auth/dev', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'admin' }),
  });
  const payload = await response.json();
  if (!response.ok) {
    answerEl.textContent = payload.error || t().saveFailed;
    return;
  }
  state.user = payload.user;
  renderAuthState();
  await loadToday();
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  state.user = null;
  state.events = [];
  state.summary = null;
  renderAuthState();
  render();
}

function applyPreferences() {
  document.documentElement.lang = t().htmlLang;
  document.documentElement.dataset.theme = state.theme;
  languageSelect.value = state.language;
  themeSelect.value = state.theme;
}

function renderBuildBadge() {
  if (!buildBadge) return;
  buildBadge.textContent = `Build ${APP_BUILD}`;
  buildBadge.title = `Family Tracker build ${APP_BUILD}`;
  document.body.dataset.build = APP_BUILD;
}

function setMenuOpen(open) {
  menuPanel.classList.toggle('hidden', !open);
  menuToggle.setAttribute('aria-expanded', String(open));
}

function renderStaticText() {
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t()[node.dataset.i18n] || node.textContent;
  });
  logInput.placeholder = t().logPlaceholder;
  askInput.placeholder = t().askPlaceholder;
  quickActionsEl.setAttribute('aria-label', t().log);
  renderDayControls();
}

function renderAuthState() {
  authPanel.classList.toggle('hidden', Boolean(state.user));
  accountPanel.classList.toggle('hidden', !state.user);
  workspace.classList.toggle('disabled', !state.user);
  if (state.user) {
    accountLabel.textContent = t().signedInAs(state.user.name || state.user.email || 'User');
  } else {
    accountLabel.textContent = '';
  }
}

function render() {
  renderDayControls();
  renderSummary();
  renderSleepStatus();
  renderTimeline();
}

function renderDayControls() {
  dayPicker.value = state.selectedDay;
  dayLabel.textContent = dayHeading(state.selectedDay);
}

function renderQuickActions() {
  quickActionsEl.replaceChildren(...t().quickActions.map((label) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => saveLog(label));
    return button;
  }));
}

function renderTabletActions() {
  tabletActionsEl.replaceChildren(...t().tabletActions.map((action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      if (action.value) {
        saveLog(action.value);
        return;
      }
      logInput.focus();
    });
    return button;
  }));
}

function renderSummary() {
  const summary = state.summary || {};
  summaryEl.replaceChildren(
    summaryItem(t().summarySleep, t().minutes(summary.sleepMinutes || 0)),
    summaryItem(t().summaryMilk, `${summary.milkCount || 0}${timesSuffix()} · ${summary.milkAmountMl || 0}ml`),
    summaryItem(t().summarySolid, `${summary.solidCount || 0}${timesSuffix()}`),
    summaryItem(t().summaryDiaper, `${summary.diaperCount || 0}${timesSuffix()}`),
  );
}

function summaryItem(label, value) {
  const item = document.createElement('div');
  item.className = 'summary-item';
  item.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
  return item;
}

function renderSleepStatus() {
  const openSleep = [...state.events].reverse().find((event) => (
    event.type === 'sleep'
    && event.action?.value === 'start'
    && event.status !== 'completed'
    && !event.endAt?.value
  ));
  if (!openSleep) {
    sleepStatusEl.classList.add('hidden');
    sleepStatusEl.replaceChildren();
    return;
  }

  const startedAt = new Date(openSleep.startAt.value);
  const elapsed = Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 60000));
  sleepStatusEl.classList.remove('hidden');

  const copy = document.createElement('div');
  copy.innerHTML = `<span>${escapeHtml(t().sleepActive)}</span><strong>${escapeHtml(t().elapsed(elapsed))}</strong><small>${escapeHtml(t().started(timeLabel(openSleep.startAt)))}</small>`;
  const wakeButton = document.createElement('button');
  wakeButton.type = 'button';
  wakeButton.textContent = t().wake;
  wakeButton.addEventListener('click', () => saveLog(t().wake));
  sleepStatusEl.replaceChildren(copy, wakeButton);
}

function renderTimeline() {
  eventCountEl.textContent = t().eventCount(state.events.length);
  if (!state.events.length) {
    timelineEl.innerHTML = `<p class="empty">${escapeHtml(t().emptyTimeline)}</p>`;
    return;
  }
  timelineEl.replaceChildren(...state.events.filter((event) => !event.hiddenFromTimeline).map(renderEvent));
}

function renderEvent(event) {
  const item = document.createElement('article');
  item.className = 'timeline-item';
  const title = document.createElement('div');
  title.className = 'timeline-title';
  title.textContent = eventTitle(event);
  const meta = document.createElement('div');
  meta.className = 'timeline-meta';
  meta.textContent = eventMeta(event);
  const raw = document.createElement('p');
  raw.className = 'raw-text';
  raw.textContent = event.rawText;
  const badges = document.createElement('div');
  badges.className = 'badges';
  badges.replaceChildren(...inferredBadges(event));
  const main = document.createElement('div');
  main.className = 'timeline-main';
  main.replaceChildren(meta, raw);
  item.replaceChildren(title, main, badges);
  return item;
}

function eventTitle(event) {
  if (event.type === 'sleep') return event.action?.value === 'end' ? t().eventSleepEnd : t().eventSleep;
  if (event.type === 'feeding_milk') return event.feedingKind?.value === 'breast' ? t().eventBreast : t().eventFormula;
  if (event.type === 'feeding_solid') return event.food?.value || t().eventSolid;
  if (event.type === 'diaper') return event.diaperKind?.value === 'dirty' ? t().eventDirty : t().eventDiaper;
  return t().eventGeneric;
}

function eventMeta(event) {
  if (event.type === 'sleep') {
    return `${timeLabel(event.startAt)} -> ${timeLabel(event.endAt)} · ${t().minutes(event.durationMinutes?.value || 0)}`;
  }
  if (event.type === 'feeding_milk') return `${timeLabel(event.occurredAt)} · ${event.amountMl?.value || 0}ml`;
  if (event.type === 'feeding_solid') return `${timeLabel(event.occurredAt)} · ${event.amount?.value || ''}`;
  return timeLabel(event.occurredAt);
}

function inferredBadges(event) {
  return Object.entries(event)
    .filter(([, value]) => value?.source === 'inferred')
    .map(([key, value]) => {
      const badge = document.createElement('span');
      badge.textContent = t().inferred(labelForField(key));
      badge.title = `${value.basis} · confidence ${value.confidence}`;
      return badge;
    });
}

function timeLabel(field) {
  if (!field?.value) return t().noTime;
  return new Intl.DateTimeFormat(localeForLanguage(), { hour: 'numeric', minute: '2-digit' }).format(new Date(field.value));
}

function dayHeading(day) {
  const today = localDateKey(new Date());
  if (day === today) return t().today;
  if (day === shiftDateKey(today, -1)) return t().yesterday;
  if (day === shiftDateKey(today, 1)) return t().tomorrow;
  return new Intl.DateTimeFormat(localeForLanguage(), {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  }).format(dateFromKey(day));
}

function shiftSelectedDay(days) {
  state.selectedDay = shiftDateKey(state.selectedDay, days);
  loadToday();
}

function shiftDateKey(day, days) {
  const date = dateFromKey(day);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function dayFromSavedEvents(events = []) {
  const event = events.find((item) => item.occurredAt?.value || item.startAt?.value || item.endAt?.value);
  const value = event?.occurredAt?.value || event?.startAt?.value || event?.endAt?.value;
  return value ? localDateKey(new Date(value)) : null;
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromKey(day) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
}

function labelForField(key) {
  return {
    amountMl: t().fieldAmount,
    amount: t().fieldAmount,
    startAt: t().fieldStart,
    endAt: t().fieldEnd,
    durationMinutes: t().fieldDuration,
    diaperKind: t().fieldKind,
  }[key] || key;
}

function timesSuffix() {
  if (state.language === 'ko') return '회';
  if (state.language === 'vi') return ' lần';
  return 'x';
}

function localeForLanguage() {
  return { ko: 'ko-KR', en: 'en-US', vi: 'vi-VN' }[state.language] || 'ko-KR';
}

function localTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function t() {
  return translations[state.language] || translations.ko;
}

function normalizeLanguage(value) {
  return translations[value] ? value : 'ko';
}

function normalizeTheme(value) {
  return ['warm', 'sage', 'contrast'].includes(value) ? value : 'warm';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

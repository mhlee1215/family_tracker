const state = {
  events: [],
  summary: null,
};

const quickActions = ['분유', '낮잠', '깸', '응가', '쉬', '고구마 먹음'];

const logForm = document.querySelector('#log-form');
const logInput = document.querySelector('#log-input');
const askForm = document.querySelector('#ask-form');
const askInput = document.querySelector('#ask-input');
const answerEl = document.querySelector('#answer');
const timelineEl = document.querySelector('#timeline');
const summaryEl = document.querySelector('#summary');
const quickActionsEl = document.querySelector('#quick-actions');
const refreshButton = document.querySelector('#refresh');

renderQuickActions();
await loadToday();

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
  answerEl.textContent = '생각 중...';
  const response = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  const payload = await response.json();
  answerEl.textContent = response.ok ? payload.answer : payload.error;
});

refreshButton.addEventListener('click', loadToday);

async function saveLog(text) {
  const cleanText = text.trim();
  if (!cleanText) return;
  logInput.value = '';
  logInput.placeholder = '저장 중...';
  const response = await fetch('/api/logs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: cleanText,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
  const payload = await response.json();
  logInput.placeholder = '분유, 낮잠, 깸, 고구마 먹음';
  if (!response.ok) {
    answerEl.textContent = payload.error || '저장하지 못했어요.';
    return;
  }
  await loadToday();
}

async function loadToday() {
  const response = await fetch('/api/logs/today');
  const payload = await response.json();
  state.events = payload.events || [];
  state.summary = payload.summary;
  render();
}

function render() {
  renderSummary();
  renderTimeline();
}

function renderQuickActions() {
  quickActionsEl.replaceChildren(...quickActions.map((label) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => saveLog(label));
    return button;
  }));
}

function renderSummary() {
  const summary = state.summary || {};
  summaryEl.replaceChildren(
    summaryItem('수면', summary.sleepLabel || '0분'),
    summaryItem('수유', `${summary.milkCount || 0}회 · ${summary.milkAmountMl || 0}ml`),
    summaryItem('이유식', `${summary.solidCount || 0}회`),
    summaryItem('기저귀', `${summary.diaperCount || 0}회`),
  );
}

function summaryItem(label, value) {
  const item = document.createElement('div');
  item.className = 'summary-item';
  item.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
  return item;
}

function renderTimeline() {
  if (!state.events.length) {
    timelineEl.innerHTML = '<p class="empty">아직 오늘 기록이 없어요.</p>';
    return;
  }
  timelineEl.replaceChildren(...state.events.map(renderEvent));
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
  item.replaceChildren(title, meta, raw, badges);
  return item;
}

function eventTitle(event) {
  if (event.type === 'sleep') return event.action?.value === 'end' ? '수면 종료' : '수면';
  if (event.type === 'feeding_milk') return event.feedingKind?.value === 'breast' ? '모유' : '분유';
  if (event.type === 'feeding_solid') return event.food?.value || '이유식';
  if (event.type === 'diaper') return event.diaperKind?.value === 'dirty' ? '응가' : '기저귀';
  return '기록';
}

function eventMeta(event) {
  if (event.type === 'sleep') {
    return `${timeLabel(event.startAt)} → ${timeLabel(event.endAt)} · ${event.durationMinutes?.value || 0}분`;
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
      badge.textContent = `${labelForField(key)} 예상`;
      badge.title = `${value.basis} · confidence ${value.confidence}`;
      return badge;
    });
}

function timeLabel(field) {
  if (!field?.value) return '시간 없음';
  return new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' }).format(new Date(field.value));
}

function labelForField(key) {
  return {
    amountMl: '양',
    amount: '양',
    startAt: '시작',
    endAt: '종료',
    durationMinutes: '시간',
    diaperKind: '종류',
  }[key] || key;
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


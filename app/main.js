const BUILD_PLACEHOLDER = '---';
const BUILD_CHECK_INTERVAL_MS = 60_000;

const storageKeys = {
  theme: 'familyTracker.theme',
  activeTab: 'familyTracker.activeTab',
};

const copy = {
  today: 'Today',
  yesterday: 'Yesterday',
  tomorrow: 'Tomorrow',
  saving: 'Saving...',
  saveFailed: 'Could not save.',
  logPlaceholder: 'formula, nap, woke up, sweet potato',
  askPlaceholder: 'How much sleep today?',
  emptyTimeline: 'No logs for this date yet.',
  emptyTasks: 'No tasks for this day.',
  emptyOverview: 'No completed tasks yet.',
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
};

const state = {
  events: [],
  summary: null,
  user: null,
  profile: null,
  tasks: [],
  taskOverview: [],
  eventSummary: null,
  assignees: [],
  theme: normalizeTheme(localStorage.getItem(storageKeys.theme)),
  activeTab: normalizeTab(localStorage.getItem(storageKeys.activeTab)),
  selectedDay: localDateKey(new Date()),
  selectedTaskDay: localDateKey(new Date()),
};

const $ = (selector) => document.querySelector(selector);

const elements = {
  tabs: document.querySelectorAll('.module-tab'),
  views: document.querySelectorAll('.module-view'),
  settings: document.querySelectorAll('.module-settings'),
  logForm: $('#log-form'),
  logInput: $('#log-input'),
  askForm: $('#ask-form'),
  askInput: $('#ask-input'),
  answer: $('#answer'),
  timeline: $('#timeline'),
  summary: $('#summary'),
  sleepStatus: $('#sleep-status'),
  quickActions: $('#quick-actions'),
  tabletActions: $('#tablet-actions'),
  eventCount: $('#event-count'),
  refresh: $('#refresh'),
  themeSelect: $('#theme-select'),
  authPanel: $('#auth-panel'),
  accountPanel: $('#account-panel'),
  accountLabel: $('#account-label'),
  workspace: $('#workspace'),
  taskWorkspace: $('#task-workspace'),
  devLogin: $('#dev-login'),
  logout: $('#logout'),
  buildBadge: $('#build-badge'),
  dayLabel: $('#day-label'),
  dayPicker: $('#day-picker'),
  previousDay: $('#previous-day'),
  nextDay: $('#next-day'),
  taskDayLabel: $('#task-day-label'),
  taskDayPicker: $('#task-day-picker'),
  previousTaskDay: $('#previous-task-day'),
  nextTaskDay: $('#next-task-day'),
  menuToggle: $('#menu-toggle'),
  menuPanel: $('#menu-panel'),
  babySettingsForm: $('#baby-settings-form'),
  babyName: $('#baby-name'),
  birthDate: $('#birth-date'),
  milkAmount: $('#milk-amount'),
  napDuration: $('#nap-duration'),
  assigneeForm: $('#assignee-form'),
  assigneeName: $('#assignee-name'),
  taskForm: $('#task-form'),
  openTaskComposer: $('#open-task-composer'),
  taskAssignee: $('#task-assignee'),
  taskTitle: $('#task-title'),
  taskDueMode: $('#task-due-mode'),
  taskDueDate: $('#task-due-date'),
  summaryPeriod: $('#summary-period'),
  eventSummary: $('#event-summary'),
  taskList: $('#task-list'),
  taskCount: $('#task-count'),
  taskOverviewList: $('#task-overview-list'),
};

applyPreferences();
await syncBuildMetadata();
renderTabs();
renderQuickActions();
renderTabletActions();
await loadCurrentUser();
if (state.user) await Promise.all([loadBabyProfile(), loadToday(), loadTaskData()]);
renderAuthState();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/app/sw.js').catch(() => {});
}
startBuildWatcher();

elements.tabs.forEach((tab) => {
  tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));
});

elements.logForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await saveLog(elements.logInput.value);
});

elements.askForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const question = elements.askInput.value.trim();
  if (!question) return;
  elements.answer.textContent = 'Thinking...';
  const response = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question, day: state.selectedDay, timezone: localTimezone() }),
  });
  const payload = await response.json();
  elements.answer.textContent = response.ok ? payload.answer : payload.error;
});

elements.taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await createTask();
});
elements.openTaskComposer.addEventListener('click', () => setTaskComposerOpen(true));

elements.babySettingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await saveBabyProfile();
});

elements.assigneeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await createAssignee();
});

elements.refresh.addEventListener('click', refreshActiveTab);
elements.devLogin.addEventListener('click', devLogin);
elements.logout.addEventListener('click', logout);
elements.menuToggle.addEventListener('click', () => setMenuOpen(elements.menuPanel.classList.contains('hidden')));
elements.previousDay.addEventListener('click', () => shiftSelectedDay(-1));
elements.nextDay.addEventListener('click', () => shiftSelectedDay(1));
elements.previousTaskDay.addEventListener('click', () => shiftSelectedTaskDay(-1));
elements.nextTaskDay.addEventListener('click', () => shiftSelectedTaskDay(1));

elements.dayPicker.addEventListener('change', () => {
  if (!elements.dayPicker.value) return;
  state.selectedDay = elements.dayPicker.value;
  loadToday();
});

elements.summaryPeriod?.addEventListener('change', loadTaskData);
elements.taskDueMode?.addEventListener('change', renderTaskComposerDueState);

elements.taskDayPicker.addEventListener('change', () => {
  if (!elements.taskDayPicker.value) return;
  state.selectedTaskDay = elements.taskDayPicker.value;
  loadTaskData();
});

elements.themeSelect.addEventListener('change', () => {
  state.theme = normalizeTheme(elements.themeSelect.value);
  localStorage.setItem(storageKeys.theme, state.theme);
  applyPreferences();
});

document.addEventListener('click', (event) => {
  if (elements.menuPanel.classList.contains('hidden')) return;
  if (elements.menuPanel.contains(event.target) || elements.menuToggle.contains(event.target)) return;
  setMenuOpen(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setMenuOpen(false);
});

async function saveLog(text) {
  const cleanText = text.trim();
  if (!cleanText) return;
  elements.logInput.value = '';
  elements.logInput.placeholder = copy.saving;
  const response = await fetch('/api/logs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: cleanText, timezone: localTimezone() }),
  });
  const payload = await response.json();
  elements.logInput.placeholder = copy.logPlaceholder;
  if (!response.ok) {
    elements.answer.textContent = payload.error || copy.saveFailed;
    return;
  }
  state.selectedDay = dayFromSavedEvents(payload.events) || localDateKey(new Date());
  await loadToday();
}

async function loadToday() {
  const params = new URLSearchParams({ day: state.selectedDay, timezone: localTimezone() });
  const response = await fetch(`/api/logs/today?${params.toString()}`);
  const payload = await response.json();
  if (handleAuthFailure(response)) return;
  state.events = payload.events || [];
  state.summary = payload.summary;
  renderBaby();
}

async function loadBabyProfile() {
  const response = await fetch('/api/profile');
  const payload = await response.json();
  if (handleAuthFailure(response)) return;
  state.profile = payload.profile || null;
  renderBabySettings();
}

async function saveBabyProfile() {
  const profile = {
    ...state.profile,
    babyName: elements.babyName.value.trim(),
    birthDate: elements.birthDate.value,
    milkAmountMlOverride: numberOrNull(elements.milkAmount.value),
    napDurationMinutesOverride: numberOrNull(elements.napDuration.value),
  };
  const response = await fetch('/api/profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile }),
  });
  const payload = await response.json();
  if (!response.ok) return;
  state.profile = payload.profile;
  renderBabySettings();
  setMenuOpen(false);
}

async function loadTaskData() {
  await loadAssignees();
  const params = new URLSearchParams({ day: state.selectedTaskDay });
  const period = elements.summaryPeriod?.value || 'week';
  const [todayResponse, overviewResponse, summaryResponse] = await Promise.all([
    fetch(`/api/tasks/today?${params.toString()}`),
    fetch('/api/tasks/overview'),
    fetch(`/api/events/summary?period=${encodeURIComponent(period)}&day=${encodeURIComponent(state.selectedTaskDay)}`),
  ]);
  const todayPayload = await todayResponse.json();
  const overviewPayload = await overviewResponse.json();
  const summaryPayload = await summaryResponse.json();
  if (handleAuthFailure(todayResponse)) return;
  state.tasks = todayPayload.tasks || [];
  state.taskOverview = overviewPayload.tasks || [];
  state.eventSummary = summaryPayload.summary || null;
  renderTasks();
}

async function loadAssignees() {
  const response = await fetch('/api/task-assignees');
  const payload = await response.json();
  if (handleAuthFailure(response)) return;
  state.assignees = payload.assignees || [];
  renderAssignees();
}

async function createAssignee() {
  const name = elements.assigneeName.value.trim();
  if (!name) return;
  const response = await fetch('/api/task-assignees', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (response.ok) {
    elements.assigneeName.value = '';
    await loadAssignees();
  }
}

async function createTask() {
  const title = elements.taskTitle.value.trim();
  const assigneeId = elements.taskAssignee.value;
  if (!title || !assigneeId) return;
  const dueMode = elements.taskDueMode.value;
  const chosenDate = elements.taskDueDate.value || state.selectedTaskDay;
  const response = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, assigneeId, dueMode, dueDate: chosenDate }),
  });
  if (!response.ok) return;
  elements.taskTitle.value = '';
  setTaskComposerOpen(false);
  await loadTaskData();
}

async function toggleTask(task) {
  const nextStatus = task.status === 'done' ? 'open' : 'done';
  const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: nextStatus }),
  });
  if (response.ok) await loadTaskData();
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
    elements.answer.textContent = payload.error || copy.saveFailed;
    return;
  }
  state.user = payload.user;
  renderAuthState();
  await Promise.all([loadBabyProfile(), loadToday(), loadTaskData()]);
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  state.user = null;
  state.events = [];
  state.summary = null;
  state.tasks = [];
  state.taskOverview = [];
  renderAuthState();
  renderBaby();
  renderTasks();
}

function handleAuthFailure(response) {
  if (response.status !== 401) return false;
  state.user = null;
  renderAuthState();
  renderBaby();
  renderTasks();
  return true;
}

function applyPreferences() {
  document.documentElement.lang = 'en';
  document.documentElement.dataset.theme = state.theme;
  elements.themeSelect.value = state.theme;
}

async function syncBuildMetadata() {
  const build = await readBuildFromMetadata();
  renderBuildBadge(build);
}

function renderBuildBadge(build) {
  const resolvedBuild = build || BUILD_PLACEHOLDER;
  elements.buildBadge.textContent = `Build ${resolvedBuild}`;
  elements.buildBadge.title = `Family Tracker build ${resolvedBuild}`;
  document.body.dataset.build = resolvedBuild;
}

function setActiveTab(tab) {
  state.activeTab = normalizeTab(tab);
  localStorage.setItem(storageKeys.activeTab, state.activeTab);
  renderTabs();
  refreshActiveTab();
}

function renderTabs() {
  elements.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === state.activeTab));
  elements.views.forEach((view) => view.classList.toggle('active', view.id === `${state.activeTab}-view`));
  elements.settings.forEach((panel) => panel.classList.toggle('hidden', panel.dataset.settings !== state.activeTab));
}

function setMenuOpen(open) {
  elements.menuPanel.classList.toggle('hidden', !open);
  elements.menuToggle.setAttribute('aria-expanded', String(open));
}

function setTaskComposerOpen(open) {
  elements.taskForm.classList.toggle('hidden', !open);
  elements.openTaskComposer.setAttribute('aria-expanded', String(open));
  if (open) elements.taskTitle.focus();
}

function renderAuthState() {
  elements.authPanel.classList.toggle('hidden', Boolean(state.user));
  elements.accountPanel.classList.toggle('hidden', !state.user);
  elements.devLogin.classList.toggle('hidden', Boolean(state.user));
  elements.workspace.classList.toggle('disabled', !state.user);
  elements.taskWorkspace.classList.toggle('disabled', !state.user);
  elements.accountLabel.textContent = state.user ? `${state.user.name || state.user.email || 'User'} account` : '';
}

function renderBaby() {
  renderDayControls();
  renderSummary();
  renderSleepStatus();
  renderTimeline();
}

function renderDayControls() {
  elements.dayPicker.value = state.selectedDay;
  elements.dayLabel.textContent = dayHeading(state.selectedDay);
}

function renderBabySettings() {
  const profile = state.profile || {};
  elements.babyName.value = profile.babyName || '';
  elements.birthDate.value = profile.birthDate || '';
  elements.milkAmount.value = profile.milkAmountMlOverride ?? '';
  elements.napDuration.value = profile.napDurationMinutesOverride ?? '';
}

function renderQuickActions() {
  elements.quickActions.replaceChildren(...copy.quickActions.map((label) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => saveLog(label));
    return button;
  }));
}

function renderTabletActions() {
  elements.tabletActions.replaceChildren(...copy.tabletActions.map((action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    button.addEventListener('click', () => (action.value ? saveLog(action.value) : elements.logInput.focus()));
    return button;
  }));
}

function renderSummary() {
  const summary = state.summary || {};
  elements.summary.replaceChildren(
    summaryItem('Sleep', `${summary.sleepMinutes || 0} min`),
    summaryItem('Milk', `${summary.milkCount || 0}x · ${summary.milkAmountMl || 0}ml`),
    summaryItem('Solids', `${summary.solidCount || 0}x`),
    summaryItem('Diaper', `${summary.diaperCount || 0}x`),
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
    event.type === 'sleep' && event.action?.value === 'start' && event.status !== 'completed' && !event.endAt?.value
  ));
  if (!openSleep) {
    elements.sleepStatus.classList.add('hidden');
    elements.sleepStatus.replaceChildren();
    return;
  }
  const elapsed = Math.max(0, Math.round((Date.now() - new Date(openSleep.startAt.value).getTime()) / 60000));
  elements.sleepStatus.classList.remove('hidden');
  const copyEl = document.createElement('div');
  copyEl.innerHTML = `<span>Napping now</span><strong>${elapsed} min</strong><small>Started ${escapeHtml(timeLabel(openSleep.startAt))}</small>`;
  const wakeButton = document.createElement('button');
  wakeButton.type = 'button';
  wakeButton.textContent = 'Wake';
  wakeButton.addEventListener('click', () => saveLog('woke up'));
  elements.sleepStatus.replaceChildren(copyEl, wakeButton);
}

function renderTimeline() {
  elements.eventCount.textContent = `${state.events.length} items`;
  const visible = state.events.filter((event) => !event.hiddenFromTimeline);
  if (!visible.length) {
    elements.timeline.innerHTML = `<p class="empty">${copy.emptyTimeline}</p>`;
    return;
  }
  elements.timeline.replaceChildren(...visible.map(renderEvent));
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

function renderAssignees() {
  elements.taskAssignee.replaceChildren(...state.assignees.map((assignee) => {
    const option = document.createElement('option');
    option.value = assignee.id;
    option.textContent = assignee.name;
    return option;
  }));
}


function renderEventSummary() {
  if (!elements.eventSummary) return;
  const summary = state.eventSummary;
  if (!summary) { elements.eventSummary.innerHTML = '<p class="empty">No summary yet.</p>'; return; }
  const items = [
    `Events: ${summary.totalEvents}`,
    `Open tasks: ${summary.openTasks}`,
    `Overdue: ${summary.overdueTasks}`,
    `At risk: ${summary.riskTasks}`,
    `Done: ${summary.doneTasks}`,
  ];
  const wrap = document.createElement('div');
  wrap.innerHTML = items.map((t)=>`<article class="overview-item"><strong>${escapeHtml(t)}</strong></article>`).join('') +
    `<article class="overview-item"><strong>Task status chart</strong><span>Open ${summary.openTasks} · Done ${summary.doneTasks} · Risk ${summary.riskTasks}</span><div class="mini-chart"><div style="width:${summary.chart.open}%"></div><div style="width:${summary.chart.done}%"></div><div style="width:${summary.chart.risk}%"></div></div></article>`;
  elements.eventSummary.replaceChildren(...wrap.children);
}

function renderTaskComposerDueState() {
  if (!elements.taskDueMode || !elements.taskDueDate) return;
  const mode = elements.taskDueMode.value;
  elements.taskDueDate.disabled = !(mode === 'on_date' || mode === 'before_date');
  if (!elements.taskDueDate.value) elements.taskDueDate.value = state.selectedTaskDay;
}

function taskDueText(task) {
  if (task.dueMode === 'asap' || task.dueMode === 'someday') return `${task.dueMode.toUpperCase()} · created ${relativeDateTime(task.createdAt)}`;
  if (task.dueMode === 'before_date') return `before ${dayHeading(task.dueDate).toLowerCase()}`;
  return `due ${dayHeading(task.dueDate).toLowerCase()}`;
}

function renderTasks() {
  renderTaskDayControls();
  renderAssignees();
  elements.taskCount.textContent = `${state.tasks.length} tasks`;
  if (!state.tasks.length) {
    elements.taskList.innerHTML = `<p class="empty">${copy.emptyTasks}</p>`;
  } else {
    const byAssignee = new Map();
    for (const task of state.tasks) {
      const key = task.assigneeId || 'unassigned';
      if (!byAssignee.has(key)) byAssignee.set(key, {
        name: task.assigneeName || 'Unassigned',
        color: task.assigneeColor || '#0066cc',
        tasks: [],
      });
      byAssignee.get(key).tasks.push(task);
    }
    const columns = [...byAssignee.values()].map((group) => renderTaskColumn(group));
    const board = document.createElement('div');
    board.className = 'task-board';
    board.replaceChildren(...columns);
    elements.taskList.replaceChildren(board);
  }
  if (!state.taskOverview.length) {
    elements.taskOverviewList.innerHTML = `<p class="empty">${copy.emptyOverview}</p>`;
  } else {
    elements.taskOverviewList.replaceChildren(...state.taskOverview.map(renderOverviewTask));
  }
  renderEventSummary();
}


async function readBuildFromMetadata() {
  try {
    const response = await fetch(`/app/build.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return '';
    const payload = await response.json();
    if (typeof payload.build !== 'string') return '';
    return payload.build;
  } catch {
    return '';
  }
}

function startBuildWatcher() {
  const check = async () => {
    try {
      const response = await fetch(`/app/build.json?ts=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json();
      const currentBuild = document.body.dataset.build;
      if (payload.build && currentBuild && payload.build !== currentBuild) window.location.reload();
    } catch {
      // Ignore transient offline or deploy-in-progress failures.
    }
  };
  window.setInterval(check, BUILD_CHECK_INTERVAL_MS);
}

function renderTaskDayControls() {
  elements.taskDayPicker.value = state.selectedTaskDay;
  renderTaskComposerDueState();
  elements.taskDayLabel.textContent = dayHeading(state.selectedTaskDay);
}


function renderTaskColumn(group) {
  const column = document.createElement('section');
  column.className = 'task-column';
  const header = document.createElement('header');
  header.className = 'task-column-header';
  header.innerHTML = `<span class="assignee-dot" style="background:${escapeHtml(group.color)}"></span><strong>${escapeHtml(group.name)}</strong><span>${group.tasks.length}</span>`;
  const list = document.createElement('div');
  list.className = 'task-column-list';
  list.replaceChildren(...group.tasks.map(renderTask));
  column.replaceChildren(header, list);
  return column;
}

function renderTask(task) {
  const row = document.createElement('article');
  row.className = `task-item ${task.status === 'done' ? 'done' : ''}`;
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = task.status === 'done';
  checkbox.addEventListener('change', () => toggleTask(task));
  const marker = document.createElement('span');
  marker.className = 'assignee-marker';
  marker.style.background = task.assigneeColor;
  const text = document.createElement('div');
  text.className = 'task-text';
  text.innerHTML = `<strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.assigneeName || 'Unassigned')} · ${escapeHtml(taskDueText(task))}</span>`;
  row.replaceChildren(checkbox, marker, text);
  return row;
}

function renderOverviewTask(task) {
  const item = document.createElement('article');
  item.className = 'overview-item';
  item.innerHTML = `<strong>${escapeHtml(task.assigneeName || 'Someone')}</strong><span>completed "${escapeHtml(task.title)}" ${escapeHtml(relativeDateTime(task.completedAt))}</span>`;
  return item;
}

function eventTitle(event) {
  if (event.type === 'sleep') return event.action?.value === 'end' ? 'Sleep ended' : 'Sleep';
  if (event.type === 'feeding_milk') return event.feedingKind?.value === 'breast' ? 'Breast milk' : 'Formula';
  if (event.type === 'feeding_solid') return event.food?.value || 'Solids';
  if (event.type === 'diaper') return event.diaperKind?.value === 'dirty' ? 'Dirty diaper' : 'Diaper';
  return 'Log';
}

function eventMeta(event) {
  if (event.type === 'sleep') return `${timeLabel(event.startAt)} to ${timeLabel(event.endAt)} · ${event.durationMinutes?.value || 0} min`;
  if (event.type === 'feeding_milk') return `${timeLabel(event.occurredAt)} · ${event.amountMl?.value || 0}ml`;
  if (event.type === 'feeding_solid') return `${timeLabel(event.occurredAt)} · ${event.amount?.value || ''}`;
  return timeLabel(event.occurredAt);
}

function inferredBadges(event) {
  return Object.entries(event)
    .filter(([, value]) => value?.source === 'inferred')
    .map(([key, value]) => {
      const badge = document.createElement('span');
      badge.textContent = `${labelForField(key)} estimated`;
      badge.title = `${value.basis} · confidence ${value.confidence}`;
      return badge;
    });
}

function refreshActiveTab() {
  if (!state.user) return;
  if (state.activeTab === 'baby') {
    loadBabyProfile();
    loadToday();
  } else {
    loadTaskData();
  }
}

function shiftSelectedDay(days) {
  state.selectedDay = shiftDateKey(state.selectedDay, days);
  loadToday();
}

function shiftSelectedTaskDay(days) {
  state.selectedTaskDay = shiftDateKey(state.selectedTaskDay, days);
  loadTaskData();
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

function dayHeading(day) {
  const today = localDateKey(new Date());
  if (day === today) return copy.today;
  if (day === shiftDateKey(today, -1)) return copy.yesterday;
  if (day === shiftDateKey(today, 1)) return copy.tomorrow;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', weekday: 'short' }).format(dateFromKey(day));
}

function relativeDateTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function timeLabel(field) {
  if (!field?.value) return 'No time';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(field.value));
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

function localTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function labelForField(key) {
  return {
    amountMl: 'Amount',
    amount: 'Amount',
    startAt: 'Start',
    endAt: 'End',
    durationMinutes: 'Duration',
    diaperKind: 'Kind',
  }[key] || key;
}

function numberOrNull(value) {
  if (value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeTheme(value) {
  return ['warm', 'sage', 'contrast'].includes(value) ? value : 'warm';
}

function normalizeTab(value) {
  return ['baby', 'task'].includes(value) ? value : 'baby';
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

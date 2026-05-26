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
  activeTab: normalizeTab(getInitialTab()),
  selectedDay: getInitialDayParam('day'),
  selectedTaskDay: getInitialDayParam('taskDay'),
  taskCalendarMonth: null,
  taskCalendarDots: {},
  taskPanel: 'today',
  meals: loadMeals(),
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
  buildRefresh: $('#build-refresh'),
  buildVersion: $('#build-version'),
  metadataVersion: $('#metadata-version'),
  dayLabel: $('#day-label'),
  dayPicker: $('#day-picker'),
  previousDay: $('#previous-day'),
  nextDay: $('#next-day'),
  taskDayLabel: $('#task-day-label'),
  taskCalendarToggle: $('#task-calendar-toggle'),
  taskCalendarPopover: $('#task-calendar-popover'),
  taskCalendarPrev: $('#task-calendar-prev'),
  taskCalendarNext: $('#task-calendar-next'),
  taskCalendarMonth: $('#task-calendar-month'),
  taskCalendarGrid: $('#task-calendar-grid'),
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
  openTaskSummary: $('#open-task-summary'),
  backToTodayTasks: $('#back-to-today-tasks'),
  taskTodayPanel: $('#task-today-panel'),
  taskSummaryPanel: $('#task-summary-panel'),
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
  wishList: $('#wish-list'),
  mealBreakfast: $('#meal-breakfast'),
  mealLunch: $('#meal-lunch'),
  mealDinner: $('#meal-dinner'),
  mealLog: $('#meal-log'),
  mealCount: $('#meal-count'),
  openWishModal: $('#open-wish-modal'),
  mealModal: $('#meal-modal'),
  mealForm: $('#meal-form'),
  mealFormTitle: $('#meal-form-title'),
  mealFormName: $('#meal-form-name'),
  mealFormCategory: $('#meal-form-category'),
  mealFormUrl: $('#meal-form-url'),
  mealFormIngredients: $('#meal-form-ingredients'),
  mealCancel: $('#meal-cancel'),
};

applyPreferences();
await syncBuildMetadata();
renderTabs();
renderQuickActions();
renderTabletActions();
if (elements.summaryPeriod) elements.summaryPeriod.value = getSummaryPeriodFromLocation();
await loadCurrentUser();
if (state.user) await Promise.all([loadBabyProfile(), loadToday(), loadTaskData()]);
renderAuthState();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/app/sw.js').catch(() => {});
}
startBuildWatcher();

elements.tabs.forEach((tab) => {
  tab.addEventListener('click', () => setActiveTab(tab.dataset.tab, { pushHistory: true }));
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
elements.openWishModal?.addEventListener('click', () => openMealModal({ slot: 'wish' }));
elements.mealForm?.addEventListener('submit', submitMealForm);
elements.mealCancel?.addEventListener('click', closeMealModal);
elements.openTaskSummary?.addEventListener('click', () => setTaskPanel('summary'));
elements.backToTodayTasks?.addEventListener('click', () => setTaskPanel('today'));

elements.babySettingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await saveBabyProfile();
});

elements.assigneeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await createAssignee();
});

elements.refresh.addEventListener('click', refreshActiveTab);
elements.buildRefresh?.addEventListener('click', () => window.location.reload());
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
  syncUrlForTab(state.activeTab, { pushHistory: true });
  loadToday();
});

elements.summaryPeriod?.addEventListener('change', () => {
  syncUrlForTab(state.activeTab, { pushHistory: true });
  loadTaskData();
});
elements.taskDueMode?.addEventListener('change', renderTaskComposerDueState);

elements.taskDayPicker.addEventListener('change', () => {
  if (!elements.taskDayPicker.value) return;
  state.selectedTaskDay = elements.taskDayPicker.value;
  syncUrlForTab(state.activeTab, { pushHistory: true });
  loadTaskData();
});
elements.taskCalendarToggle?.addEventListener('click', () => toggleTaskCalendar());
elements.taskCalendarPrev?.addEventListener('click', () => shiftTaskCalendarMonth(-1));
elements.taskCalendarNext?.addEventListener('click', () => shiftTaskCalendarMonth(1));

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

document.addEventListener('click', (event) => {
  if (!elements.taskCalendarPopover || elements.taskCalendarPopover.classList.contains('hidden')) return;
  if (elements.taskCalendarPopover.contains(event.target) || elements.taskCalendarToggle.contains(event.target)) return;
  setTaskCalendarOpen(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setMenuOpen(false);
});

window.addEventListener('popstate', () => {
  const tab = tabFromLocation();
  const nextTab = normalizeTab(tab || state.activeTab);
  const nextDay = getDayParamFromLocation('day', state.selectedDay);
  const nextTaskDay = getDayParamFromLocation('taskDay', state.selectedTaskDay);
  const nextPeriod = getSummaryPeriodFromLocation();
  const tabChanged = nextTab !== state.activeTab;
  const babyDayChanged = nextDay !== state.selectedDay;
  const taskDayChanged = nextTaskDay !== state.selectedTaskDay;
  const periodChanged = nextPeriod !== (elements.summaryPeriod?.value || 'week');

  state.selectedDay = nextDay;
  state.selectedTaskDay = nextTaskDay;
  if (elements.summaryPeriod) elements.summaryPeriod.value = nextPeriod;

  if (tabChanged) setActiveTab(nextTab, { pushHistory: false });
  else if (state.activeTab === 'baby' && babyDayChanged) loadToday();
  else if (state.activeTab === 'task' && (taskDayChanged || periodChanged)) loadTaskData();
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
  if (!state.taskCalendarMonth) state.taskCalendarMonth = state.selectedTaskDay.slice(0, 7);
  await loadTaskCalendarDots(state.taskCalendarMonth);
  renderTasks();
}

async function loadTaskCalendarDots(monthKey) {
  const response = await fetch(`/api/tasks/calendar?month=${encodeURIComponent(monthKey)}`);
  const payload = await response.json();
  if (!response.ok) return;
  state.taskCalendarDots = payload.days || {};
  renderTaskCalendar();
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
  state.taskPanel = 'today';
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
  const metadata = await readBuildFromMetadata();
  renderBuildBadge(metadata);
}

function renderBuildBadge(metadata) {
  const resolvedBuild = metadata.build || BUILD_PLACEHOLDER;
  const resolvedMeta = metadata.metadata || BUILD_PLACEHOLDER;
  if (elements.buildVersion) elements.buildVersion.textContent = `Build ${resolvedBuild}`;
  if (elements.metadataVersion) elements.metadataVersion.textContent = `Meta ${resolvedMeta}`;
  elements.buildBadge.title = `Family Tracker build ${resolvedBuild}, metadata ${resolvedMeta}`;
  document.body.dataset.build = resolvedBuild;
  document.body.dataset.metadata = resolvedMeta;
}

function setActiveTab(tab, options = {}) {
  const { pushHistory = false } = options;
  state.activeTab = normalizeTab(tab);
  localStorage.setItem(storageKeys.activeTab, state.activeTab);
  syncUrlForTab(state.activeTab, { pushHistory });
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
  renderTaskPanel();
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
  renderMeals();
}


async function readBuildFromMetadata() {
  try {
    const response = await fetch(`/app/build.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return { build: '', metadata: '' };
    const payload = await response.json();
    return {
      build: typeof payload.build === 'string' ? payload.build : '',
      metadata: typeof payload.metadata === 'string' ? payload.metadata : '',
    };
  } catch {
    return { build: '', metadata: '' };
  }
}

function startBuildWatcher() {
  const check = async () => {
    try {
      const response = await fetch(`/app/build.json?ts=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json();
      const currentBuild = document.body.dataset.build;
      const currentMetadata = document.body.dataset.metadata;
      if ((payload.build && currentBuild && payload.build !== currentBuild)
        || (payload.metadata && currentMetadata && payload.metadata !== currentMetadata)) {
        window.location.reload();
      }
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
  if (elements.taskCalendarToggle) elements.taskCalendarToggle.textContent = 'Open task calendar';
  renderTaskCalendar();
}


function setTaskPanel(panel) {
  state.taskPanel = panel === 'summary' ? 'summary' : 'today';
  renderTaskPanel();
}

function renderTaskPanel() {
  if (!elements.taskSummaryPanel || !elements.openTaskSummary || !elements.taskTodayPanel) return;
  const summaryOpen = state.taskPanel === 'summary';
  elements.taskSummaryPanel.classList.toggle('hidden', !summaryOpen);
  elements.taskTodayPanel.classList.toggle('hidden', summaryOpen);
  elements.openTaskSummary.classList.toggle('hidden', summaryOpen);
  if (elements.openTaskComposer) elements.openTaskComposer.classList.toggle('hidden', summaryOpen);
  if (elements.taskForm && summaryOpen) setTaskComposerOpen(false);
}

function setTaskCalendarOpen(open) {
  elements.taskCalendarPopover?.classList.toggle('hidden', !open);
  elements.taskCalendarToggle?.setAttribute('aria-expanded', String(open));
}

function toggleTaskCalendar() {
  if (!elements.taskCalendarPopover) return;
  const open = elements.taskCalendarPopover.classList.contains('hidden');
  if (open) {
    state.taskCalendarMonth = state.selectedTaskDay.slice(0, 7);
    loadTaskCalendarDots(state.taskCalendarMonth);
  }
  setTaskCalendarOpen(open);
}

function shiftTaskCalendarMonth(delta) {
  const monthKey = state.taskCalendarMonth || state.selectedTaskDay.slice(0, 7);
  const base = new Date(`${monthKey}-01T00:00:00`);
  base.setMonth(base.getMonth() + delta);
  state.taskCalendarMonth = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`;
  loadTaskCalendarDots(state.taskCalendarMonth);
}

function renderTaskCalendar() {
  if (!elements.taskCalendarGrid || !state.taskCalendarMonth) return;
  const [year, month] = state.taskCalendarMonth.split('-').map(Number);
  const first = new Date(year, month - 1, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(document.createElement('span'));
  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `calendar-day ${iso === state.selectedTaskDay ? 'selected' : ''}`;
    const dots = (state.taskCalendarDots[iso] || []).slice(0, 4)
      .map((color) => `<span class="calendar-dot" style="background:${escapeHtml(color)}"></span>`).join('');
    button.innerHTML = `<span>${day}</span><span class="calendar-dots">${dots}</span>`;
    button.addEventListener('click', () => {
      state.selectedTaskDay = iso;
      syncUrlForTab(state.activeTab, { pushHistory: true });
      setTaskCalendarOpen(false);
      loadTaskData();
    });
    cells.push(button);
  }
  elements.taskCalendarMonth.textContent = first.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
  elements.taskCalendarGrid.replaceChildren(...cells);
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
  const statusText = task.status === 'done'
    ? `completed "${escapeHtml(task.title)}" ${escapeHtml(relativeDateTime(task.completedAt))}`
    : `missed "${escapeHtml(task.title)}" (due ${escapeHtml(dayHeading(task.dueDate).toLowerCase())})`;
  item.innerHTML = `<strong>${escapeHtml(task.assigneeName || 'Someone')}</strong><span>${statusText}</span>`;
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
  } else if (state.activeTab === 'meal') {
    renderMeals();
  } else {
    loadTaskData();
  }
}

function shiftSelectedDay(days) {
  state.selectedDay = shiftDateKey(state.selectedDay, days);
  syncUrlForTab(state.activeTab, { pushHistory: true });
  loadToday();
}

function shiftSelectedTaskDay(days) {
  state.selectedTaskDay = shiftDateKey(state.selectedTaskDay, days);
  syncUrlForTab(state.activeTab, { pushHistory: true });
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
  return ['baby', 'task', 'meal'].includes(value) ? value : 'baby';
}

function tabFromLocation() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/tasks') return 'task';
  if (path === '/meals') return 'meal';
  if (path === '/' || path === '/baby') return 'baby';
  return null;
}

function getInitialTab() {
  return tabFromLocation() || normalizeTab(localStorage.getItem(storageKeys.activeTab));
}

function syncUrlForTab(tab, { pushHistory = false } = {}) {
  const targetPath = tab === 'task' ? '/tasks' : tab === 'meal' ? '/meals' : '/';
  const params = new URLSearchParams(window.location.search);
  params.set('day', state.selectedDay);
  params.set('taskDay', state.selectedTaskDay);
  const period = elements.summaryPeriod?.value || 'week';
  params.set('period', period);
  const targetUrl = `${targetPath}?${params.toString()}`;
  if (`${window.location.pathname}${window.location.search}` === targetUrl) return;
  const method = pushHistory ? 'pushState' : 'replaceState';
  window.history[method]({}, '', targetUrl);
}

function getDayParamFromLocation(key, fallback) {
  const value = new URLSearchParams(window.location.search).get(key);
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : fallback;
}

function getInitialDayParam(key) {
  return getDayParamFromLocation(key, localDateKey(new Date()));
}

function getSummaryPeriodFromLocation() {
  const value = new URLSearchParams(window.location.search).get('period');
  return ['week', 'month', 'quarter', 'year'].includes(value || '') ? value : 'week';
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

function emptyMealState() {
  return { wish: [], breakfast: [], lunch: [], dinner: [], log: [], lastDay: localDateKey(new Date()) };
}

function defaultDemoMeals() {
  return {
    wish: [
      { id: 'meal-demo-wish-1', name: 'Soy-braised tofu', url: 'https://example.com/tofu', ingredients: 'tofu, soy sauce, garlic', done: false },
      { id: 'meal-demo-wish-2', name: 'Pumpkin porridge', url: 'https://example.com/pumpkin-porridge', ingredients: 'pumpkin, rice, water', done: false },
    ],
    breakfast: [
      { id: 'meal-demo-breakfast-1', name: 'Egg toast', url: 'https://example.com/egg-toast', ingredients: 'bread, egg, butter', done: false },
    ],
    lunch: [
      { id: 'meal-demo-lunch-1', name: 'Beef seaweed soup', url: 'https://example.com/seaweed-soup', ingredients: 'beef, seaweed, sesame oil', done: false },
    ],
    dinner: [
      { id: 'meal-demo-dinner-1', name: 'Salmon rice bowl', url: 'https://example.com/salmon-bowl', ingredients: 'salmon, rice, avocado', done: false },
    ],
  };
}

function loadMeals() {
  try {
    const parsed = JSON.parse(localStorage.getItem('familyTracker.meals') || '');
    if (!parsed || typeof parsed !== 'object') return emptyMealState();
    const next = {
      ...emptyMealState(),
      ...parsed,
      wish: Array.isArray(parsed.wish) ? parsed.wish : [],
      breakfast: Array.isArray(parsed.breakfast) ? parsed.breakfast : [],
      lunch: Array.isArray(parsed.lunch) ? parsed.lunch : [],
      dinner: Array.isArray(parsed.dinner) ? parsed.dinner : [],
      log: Array.isArray(parsed.log) ? parsed.log : [],
    };
    const totalCount = next.wish.length + next.breakfast.length + next.lunch.length + next.dinner.length;
    if (totalCount > 0) return next;
    return { ...next, ...defaultDemoMeals() };
  } catch {
    return { ...emptyMealState(), ...defaultDemoMeals() };
  }
}

function saveMeals() {
  localStorage.setItem('familyTracker.meals', JSON.stringify(state.meals));
}

function rolloverMeals() {
  const today = localDateKey(new Date());
  if (state.meals.lastDay === today) return;
  const carriedBySlot = { breakfast: 0, lunch: 0, dinner: 0 };
  for (const slot of ['breakfast', 'lunch', 'dinner']) {
    const carry = state.meals[slot].filter((item) => !item.done).map((item) => ({ ...item, day: today }));
    carriedBySlot[slot] = carry.length;
    state.meals[slot] = carry;
  }
  state.meals.lastDay = today;
  const carriedTotal = carriedBySlot.breakfast + carriedBySlot.lunch + carriedBySlot.dinner;
  if (carriedTotal > 0) {
    logMealAction(
      `carried ${carriedTotal} unfinished menu(s) to ${today} (breakfast ${carriedBySlot.breakfast}, lunch ${carriedBySlot.lunch}, dinner ${carriedBySlot.dinner})`,
      'system',
    );
  }
  saveMeals();
}

function addWishMenu(data) {
  const name = data.name.trim();
  if (!name) return;
  const item = {
    id: `meal-${Date.now()}`,
    name,
    category: data.category || 'korean',
    url: data.url.trim(),
    ingredients: data.ingredients.trim(),
    done: false,
  };
  state.meals.wish.unshift(item);
  logMealAction(`added wish menu "${name}"`);
  saveMeals();
  renderMeals();
}

function submitMealForm(event) {
  event.preventDefault();
  const mode = elements.mealForm.dataset.mode || 'create';
  const slot = elements.mealForm.dataset.slot || 'wish';
  const payload = {
    name: elements.mealFormName.value,
    category: elements.mealFormCategory.value,
    url: elements.mealFormUrl.value || '',
    ingredients: elements.mealFormIngredients.value || '',
  };
  if (mode === 'edit') {
    saveMealEdit(elements.mealForm.dataset.id, payload);
  } else if (slot === 'wish') {
    addWishMenu(payload);
  } else {
    upsertPlannedMeal(slot, payload);
  }
  closeMealModal();
}

function openMealModal({ slot = 'wish', item = null } = {}) {
  if (!elements.mealModal) return;
  elements.mealForm.dataset.mode = item ? 'edit' : 'create';
  elements.mealForm.dataset.slot = slot;
  elements.mealForm.dataset.id = item?.id || '';
  elements.mealFormTitle.textContent = item ? 'Edit meal' : `Add ${slot} menu`;
  elements.mealFormName.value = item?.name || '';
  elements.mealFormCategory.value = item?.category || 'korean';
  elements.mealFormUrl.value = item?.url || '';
  elements.mealFormIngredients.value = item?.ingredients || '';
  elements.mealModal.showModal();
}

function closeMealModal() {
  elements.mealModal?.close();
}

function upsertPlannedMeal(slot, data) {
  const name = data.name.trim();
  if (!name) return;
  const item = { id: `meal-${Date.now()}`, name, category: data.category || 'korean', url: data.url.trim(), ingredients: data.ingredients.trim(), done: false };
  state.meals[slot].unshift(item);
  logMealAction(`added ${slot} menu "${name}"`);
  saveMeals();
  renderMeals();
}

function saveMealEdit(id, data) {
  const found = findMeal(id);
  if (!found) return;
  Object.assign(found.item, { name: data.name.trim(), category: data.category, url: data.url.trim(), ingredients: data.ingredients.trim() });
  logMealAction(`edited "${found.item.name}"`);
  saveMeals();
  renderMeals();
}

function logMealAction(action, actor = state.user?.name || state.user?.email || 'Family member') {
  state.meals.log.unshift({ id: `log-${Date.now()}-${Math.random()}`, actor, action, at: new Date().toISOString() });
  state.meals.log = state.meals.log.slice(0, 60);
}

function renderMeals() {
  if (!elements.wishList) return;
  rolloverMeals();
  const slots = [
    ['wish', elements.wishList],
    ['breakfast', elements.mealBreakfast],
    ['lunch', elements.mealLunch],
    ['dinner', elements.mealDinner],
  ];
  slots.forEach(([slot, container]) => {
    const items = state.meals[slot] || [];
    if (!items.length && slot !== 'wish') {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'meal-placeholder';
      button.textContent = '+ Add menu';
      button.onclick = () => openMealModal({ slot });
      container.replaceChildren(button);
    } else if (!items.length) {
      container.innerHTML = '<p class="empty">No menu</p>';
    } else {
      container.replaceChildren(...items.map((item) => renderMealItem(item)));
    }
    container.ondragenter = () => container.classList.add('drag-target');
    container.ondragleave = (event) => {
      if (container.contains(event.relatedTarget)) return;
      container.classList.remove('drag-target');
    };
    container.ondragover = (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    };
    container.ondrop = (event) => {
      event.preventDefault();
      container.classList.remove('drag-target');
      moveMeal(event.dataTransfer.getData('text/plain'), slot);
    };
  });
  elements.mealLog.replaceChildren(...(state.meals.log || []).slice(0, 10).map((entry) => {
    const node = document.createElement('article');
    node.className = 'overview-item';
    node.innerHTML = `<strong>${escapeHtml(entry.actor)}</strong><span>${escapeHtml(entry.action)} · ${escapeHtml(relativeDateTime(entry.at))}</span>`;
    return node;
  }));
  elements.mealCount.textContent = `${state.meals.breakfast.length + state.meals.lunch.length + state.meals.dinner.length} menus`;
}

function renderMealItem(item) {
  const row = document.createElement('article');
  row.className = `meal-item ${item.done ? 'done' : ''} category-${item.category || 'korean'}`;
  row.dataset.mealId = item.id;

  const dragHandle = document.createElement('button');
  dragHandle.type = 'button';
  dragHandle.className = 'meal-drag-handle';
  dragHandle.draggable = true;
  dragHandle.setAttribute('aria-label', `Drag ${item.name}`);
  dragHandle.textContent = '⋮⋮';
  dragHandle.ondragstart = (event) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', item.id);
  };
  row.appendChild(dragHandle);

  const title = document.createElement('strong');
  title.textContent = `＋ ${item.name}`;
  row.appendChild(title);
  const thumb = document.createElement('img');
  thumb.className = 'meal-thumb';
  thumb.alt = `${item.name} thumbnail`;
  thumb.src = mealThumbnailUrl(item.url);
  row.appendChild(thumb);
  if (item.url) {
    const link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = 'recipe';
    const linkWrap = document.createElement('small');
    linkWrap.appendChild(link);
    row.appendChild(linkWrap);
  }
  const ingredients = document.createElement('small');
  ingredients.textContent = item.ingredients || '';
  row.appendChild(ingredients);

  const controls = document.createElement('div');
  controls.className = 'row';
  const done = document.createElement('button');
  done.type = 'button';
  done.textContent = item.done ? 'Undo' : 'Done';
  done.onclick = () => toggleMealDone(item.id);
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.textContent = 'Edit';
  edit.onclick = () => editMeal(item.id);
  const del = document.createElement('button');
  del.type = 'button';
  del.textContent = 'Delete';
  del.onclick = () => deleteMeal(item.id);
  controls.append(done, edit, del);
  row.appendChild(controls);
  return row;
}

function findMeal(id) {
  for (const slot of ['wish', 'breakfast', 'lunch', 'dinner']) {
    const idx = (state.meals[slot] || []).findIndex((item) => item.id === id);
    if (idx >= 0) return { slot, idx, item: state.meals[slot][idx] };
  }
  return null;
}

function moveMeal(id, to) {
  const found = findMeal(id);
  if (!found || found.slot === to) return;
  const [item] = state.meals[found.slot].splice(found.idx, 1);
  if (found.slot === 'wish' && to !== 'wish') item.done = true;
  if (to === 'wish') item.done = false;
  state.meals[to].unshift(item);
  logMealAction(`moved "${item.name}" from ${found.slot} to ${to}`);
  saveMeals();
  renderMeals();
}

function toggleMealDone(id) {
  const found = findMeal(id);
  if (!found) return;
  found.item.done = !found.item.done;
  logMealAction(`${found.item.done ? 'completed' : 'reopened'} "${found.item.name}" in ${found.slot}`);
  saveMeals();
  renderMeals();
}

function editMeal(id) {
  const found = findMeal(id);
  if (!found) return;
  openMealModal({ slot: found.slot, item: found.item });
}

function deleteMeal(id) {
  const found = findMeal(id);
  if (!found) return;
  const [item] = state.meals[found.slot].splice(found.idx, 1);
  logMealAction(`deleted "${item.name}" from ${found.slot}`);
  saveMeals();
  renderMeals();
}

function mealThumbnailUrl(url) {
  const clean = (url || '').trim();
  if (!clean) return 'https://placehold.co/220x140/f5f5f7/7a7a7a?text=Meal';
  return `https://image.thum.io/get/width/220/crop/140/noanimate/${encodeURIComponent(clean)}`;
}

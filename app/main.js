const BUILD_PLACEHOLDER = '---';
const BUILD_CHECK_INTERVAL_MS = 60_000;

const mealSortableInstances = new Map();
const mealThumbnailCache = new Map();

const storageKeys = {
  theme: 'familyTracker.theme',
  activeTab: 'familyTracker.activeTab',
  mealsLegacy: 'familyTracker.meals',
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
  growthRecords: [],
  tasks: [],
  taskOverview: [],
  eventSummary: null,
  assignees: [],
  theme: normalizeTheme(localStorage.getItem(storageKeys.theme)),
  activeTab: normalizeTab(getInitialTab()),
  selectedDay: getInitialSharedDay(),
  taskCalendarMonth: null,
  taskCalendarDots: {},
  babyCalendarMonth: null,
  babyCalendarDots: {},
  mealCalendarMonth: null,
  mealCalendarDots: {},
  taskPanel: 'today',
  babyPanel: null,
  meals: emptyMealState(),
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
  growthSummary: $('#growth-summary'),
  babySettingsPanel: $('#baby-settings-panel'),
  openBabySummary: $('#open-baby-summary'),
  openBabySettings: $('#open-baby-settings'),
  openBabyLog: $('#open-baby-log'),
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
  babyToday: $('#baby-today'),
  babyCalendarToggle: $('#baby-calendar-toggle'),
  babyCalendarPopover: $('#baby-calendar-popover'),
  babyCalendarPrev: $('#baby-calendar-prev'),
  babyCalendarNext: $('#baby-calendar-next'),
  babyCalendarMonth: $('#baby-calendar-month'),
  babyCalendarGrid: $('#baby-calendar-grid'),
  previousDay: $('#previous-day'),
  nextDay: $('#next-day'),
  taskDayLabel: $('#task-day-label'),
  taskToday: $('#task-today'),
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
  birthTime: $('#birth-time'),
  babyHeight: $('#baby-height'),
  babyHead: $('#baby-head'),
  babyWeight: $('#baby-weight'),
  babyApgar: $('#baby-apgar'),
  growthRecordMode: $('#growth-record-mode'),
  growthRecordDateControl: $('#growth-record-date-control'),
  growthRecordTimeControl: $('#growth-record-time-control'),
  growthRecordDate: $('#growth-record-date'),
  growthRecordTime: $('#growth-record-time'),
  milkAmount: $('#milk-amount'),
  napDuration: $('#nap-duration'),
  assigneeForm: $('#assignee-form'),
  assigneeName: $('#assignee-name'),
  taskForm: $('#task-form'),
  openTaskSummary: $('#open-task-summary'),
  openTaskLog: $('#open-task-log'),
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
  mealDayLabel: $('#meal-day-label'),
  mealToday: $('#meal-today'),
  mealCalendarToggle: $('#meal-calendar-toggle'),
  mealCalendarPopover: $('#meal-calendar-popover'),
  mealCalendarPrev: $('#meal-calendar-prev'),
  mealCalendarNext: $('#meal-calendar-next'),
  mealCalendarMonth: $('#meal-calendar-month'),
  mealCalendarGrid: $('#meal-calendar-grid'),
  mealDayPicker: $('#meal-day-picker'),
  previousMealDay: $('#previous-meal-day'),
  nextMealDay: $('#next-meal-day'),
  openMealSummary: $('#open-meal-summary'),
  mealSummaryPanel: $('#meal-summary-panel'),
  mealSummary: $('#meal-summary'),
  mealBreakfast: $('#meal-breakfast'),
  mealLunch: $('#meal-lunch'),
  mealDinner: $('#meal-dinner'),
  mealLog: $('#meal-log'),
  mealLogPanel: $('#meal-log-panel'),
  mealBoard: $('#meal-board'),
  toggleMealLog: $('#toggle-meal-log'),
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
state.meals = loadMealsForUser(state.user);
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
elements.openTaskComposer.addEventListener('click', () => {
  setTaskPanel('today');
  setTaskComposerOpen(elements.taskForm.classList.contains('hidden'));
});
elements.openWishModal?.addEventListener('click', () => openMealModal({ slot: 'wish' }));
elements.toggleMealLog?.addEventListener('click', toggleMealLogPanel);
elements.mealForm?.addEventListener('submit', submitMealForm);
elements.mealCancel?.addEventListener('click', closeMealModal);
elements.openTaskSummary?.addEventListener('click', () => setTaskPanel(state.taskPanel === 'summary' ? 'today' : 'summary'));
elements.openTaskLog?.addEventListener('click', () => {
  setTaskPanel('today');
  setTaskComposerOpen(false);
});
elements.backToTodayTasks?.addEventListener('click', () => setTaskPanel('today'));
elements.openBabySummary?.addEventListener('click', () => toggleBabyPanel('summary'));
elements.openBabySettings?.addEventListener('click', () => toggleBabyPanel('settings'));
elements.openBabyLog?.addEventListener('click', () => {
  setBabyPanel(null);
  elements.logInput?.focus();
});

elements.babySettingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await saveBabyProfile();
});

elements.growthRecordMode?.addEventListener('change', renderGrowthRecordDateControls);

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
elements.babyToday?.addEventListener('click', () => jumpToToday());
elements.previousTaskDay.addEventListener('click', () => shiftSelectedDay(-1));
elements.nextTaskDay.addEventListener('click', () => shiftSelectedDay(1));
elements.taskToday?.addEventListener('click', () => jumpToToday());
elements.previousMealDay?.addEventListener('click', () => shiftSelectedDay(-1));
elements.nextMealDay?.addEventListener('click', () => shiftSelectedDay(1));
elements.mealToday?.addEventListener('click', () => jumpToToday());
elements.openMealSummary?.addEventListener('click', toggleMealSummaryPanel);

elements.dayPicker.addEventListener('change', () => setSelectedDay(elements.dayPicker.value, { pushHistory: true }));

elements.summaryPeriod?.addEventListener('change', () => {
  syncUrlForTab(state.activeTab, { pushHistory: true });
  loadTaskData();
});
elements.mealDayPicker?.addEventListener('change', () => setSelectedDay(elements.mealDayPicker.value, { pushHistory: true }));
elements.taskDueMode?.addEventListener('change', renderTaskComposerDueState);

elements.taskDayPicker.addEventListener('change', () => setSelectedDay(elements.taskDayPicker.value, { pushHistory: true }));
elements.taskCalendarToggle?.addEventListener('click', () => toggleTaskCalendar());
elements.taskCalendarPrev?.addEventListener('click', () => shiftTaskCalendarMonth(-1));
elements.taskCalendarNext?.addEventListener('click', () => shiftTaskCalendarMonth(1));
elements.babyCalendarToggle?.addEventListener('click', () => toggleBabyCalendar());
elements.babyCalendarPrev?.addEventListener('click', () => shiftBabyCalendarMonth(-1));
elements.babyCalendarNext?.addEventListener('click', () => shiftBabyCalendarMonth(1));
elements.mealCalendarToggle?.addEventListener('click', () => toggleMealCalendar());
elements.mealCalendarPrev?.addEventListener('click', () => shiftMealCalendarMonth(-1));
elements.mealCalendarNext?.addEventListener('click', () => shiftMealCalendarMonth(1));

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
  if (elements.taskCalendarPopover && !elements.taskCalendarPopover.classList.contains('hidden')) {
    if (!(elements.taskCalendarPopover.contains(event.target) || elements.taskCalendarToggle.contains(event.target))) setTaskCalendarOpen(false);
  }
  if (elements.babyCalendarPopover && !elements.babyCalendarPopover.classList.contains('hidden')) {
    if (!(elements.babyCalendarPopover.contains(event.target) || elements.babyCalendarToggle.contains(event.target))) setBabyCalendarOpen(false);
  }
  if (elements.mealCalendarPopover && !elements.mealCalendarPopover.classList.contains('hidden')) {
    if (!(elements.mealCalendarPopover.contains(event.target) || elements.mealCalendarToggle.contains(event.target))) setMealCalendarOpen(false);
  }
});

document.addEventListener('pointerdown', (event) => {
  const target = event.target;
  if (swipeState.openItem && !swipeState.openItem.contains(target)) closeSwipeItem(swipeState.openItem);
  closeFloatingSectionPanels(target);
  if (elements.mealLogPanel && !elements.mealLogPanel.classList.contains('hidden')) {
    const insideLog = elements.mealLogPanel.contains(target) || elements.toggleMealLog?.contains(target);
    if (!insideLog) setMealLogPanelOpen(false);
  }
  if (elements.mealSummaryPanel && !elements.mealSummaryPanel.classList.contains('hidden')) {
    const insideSummary = elements.mealSummaryPanel.contains(target) || elements.openMealSummary?.contains(target);
    if (!insideSummary) setMealSummaryPanelOpen(false);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  setMenuOpen(false);
  setBabyPanel(null);
  setTaskPanel('today');
  setTaskComposerOpen(false);
  setMealLogPanelOpen(false);
  setMealSummaryPanelOpen(false);
});

window.addEventListener('popstate', () => {
  const tab = tabFromLocation();
  const nextTab = normalizeTab(tab || state.activeTab);
  const nextDay = getDayParamFromLocation('day', state.selectedDay);
  const nextPeriod = getSummaryPeriodFromLocation();
  const tabChanged = nextTab !== state.activeTab;
  const dayChanged = nextDay !== state.selectedDay;
  const periodChanged = nextPeriod !== (elements.summaryPeriod?.value || 'week');

  state.selectedDay = nextDay;
  if (elements.summaryPeriod) elements.summaryPeriod.value = nextPeriod;
  renderSharedDayControls();

  if (tabChanged) setActiveTab(nextTab, { pushHistory: false });
  else if (dayChanged || (state.activeTab === 'task' && periodChanged)) refreshActiveTab();
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
  state.growthRecords = payload.growthRecords || [];
  renderBabySettings();
  renderGrowthSummary();
}

async function saveBabyProfile() {
  const profile = {
    ...state.profile,
    babyName: elements.babyName.value.trim(),
    birthDate: elements.birthDate.value,
    birthTime: elements.birthTime.value,
    heightCm: numberOrNull(elements.babyHeight.value),
    headCm: numberOrNull(elements.babyHead.value),
    weightG: numberOrNull(elements.babyWeight.value),
    apgarPercent: numberOrNull(elements.babyApgar.value),
    milkAmountMlOverride: numberOrNull(elements.milkAmount.value),
    napDurationMinutesOverride: numberOrNull(elements.napDuration.value),
  };
  const growthRecord = shouldSaveGrowthRecord(profile, state.profile)
    ? buildGrowthRecordPayload(profile)
    : null;
  const response = await fetch('/api/profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile, growthRecord }),
  });
  const payload = await response.json();
  if (!response.ok) return;
  state.profile = payload.profile;
  state.growthRecords = payload.growthRecords || state.growthRecords;
  renderBabySettings();
  renderGrowthSummary();
  setBabyPanel(null);
}

async function loadTaskData() {
  await loadAssignees();
  const params = new URLSearchParams({ day: state.selectedDay });
  const period = elements.summaryPeriod?.value || 'week';
  const [todayResponse, overviewResponse, summaryResponse] = await Promise.all([
    fetch(`/api/tasks/today?${params.toString()}`),
    fetch('/api/tasks/overview'),
    fetch(`/api/events/summary?period=${encodeURIComponent(period)}&day=${encodeURIComponent(state.selectedDay)}`),
  ]);
  const todayPayload = await todayResponse.json();
  const overviewPayload = await overviewResponse.json();
  const summaryPayload = await summaryResponse.json();
  if (handleAuthFailure(todayResponse)) return;
  state.tasks = todayPayload.tasks || [];
  state.taskOverview = overviewPayload.tasks || [];
  state.eventSummary = summaryPayload.summary || null;
  if (!state.taskCalendarMonth) state.taskCalendarMonth = state.selectedDay.slice(0, 7);
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
  const chosenDate = elements.taskDueDate.value || state.selectedDay;
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

async function editBabyLog(event) {
  if (!event.rawLogId) return;
  const nextText = window.prompt('Edit this baby log', event.rawText || '');
  if (nextText === null) return;
  const cleanText = nextText.trim();
  if (!cleanText) return;
  const response = await fetch(`/api/logs/${encodeURIComponent(event.rawLogId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: cleanText, timezone: localTimezone() }),
  });
  const payload = await response.json();
  if (!response.ok) {
    elements.answer.textContent = payload.error || copy.saveFailed;
    return;
  }
  state.selectedDay = dayFromSavedEvents(payload.events) || state.selectedDay;
  await loadToday();
}

async function deleteBabyLog(event) {
  if (!event.rawLogId) return;
  const ok = window.confirm(`Delete this baby log?\n\n${event.rawText || eventTitle(event)}`);
  if (!ok) return;
  const response = await fetch(`/api/logs/${encodeURIComponent(event.rawLogId)}`, { method: 'DELETE' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    elements.answer.textContent = payload.error || copy.saveFailed;
    return;
  }
  await loadToday();
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
  state.meals = loadMealsForUser(state.user);
  renderAuthState();
  await Promise.all([loadBabyProfile(), loadToday(), loadTaskData()]);
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  state.user = null;
  state.meals = loadMealsForUser(null);
  state.events = [];
  state.summary = null;
  state.tasks = [];
  state.taskOverview = [];
  state.taskPanel = 'today';
  state.babyPanel = null;
  renderAuthState();
  renderBaby();
  renderTasks();
}

function handleAuthFailure(response) {
  if (response.status !== 401) return false;
  state.user = null;
  state.meals = loadMealsForUser(null);
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
  const previousTab = state.activeTab;
  state.activeTab = normalizeTab(tab);
  localStorage.setItem(storageKeys.activeTab, state.activeTab);
  syncUrlForTab(state.activeTab, { pushHistory });
  renderTabs();
  if (previousTab !== state.activeTab) closeModuleFloatingPanels();
  refreshActiveTab();
}

function renderTabs() {
  elements.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === state.activeTab));
  elements.views.forEach((view) => view.classList.toggle('active', view.id === `${state.activeTab}-view`));
  elements.settings.forEach((panel) => panel.classList.toggle('hidden', panel.dataset.settings !== state.activeTab));
}

function isPanelOpen(panel) {
  return panel && !panel.classList.contains('hidden');
}

function closeModuleFloatingPanels() {
  setBabyPanel(null);
  setTaskPanel('today');
  setTaskComposerOpen(false);
  setMealLogPanelOpen(false);
  setMealSummaryPanelOpen(false);
}

function closeFloatingSectionPanels(target) {
  const babyPanel = state.babyPanel === 'settings' ? elements.babySettingsPanel : state.babyPanel === 'summary' ? elements.growthSummary : null;
  const babyToggle = state.babyPanel === 'settings' ? elements.openBabySettings : state.babyPanel === 'summary' ? elements.openBabySummary : null;
  if (isPanelOpen(babyPanel) && !(babyPanel.contains(target) || babyToggle?.contains(target))) setBabyPanel(null);

  if (isPanelOpen(elements.taskSummaryPanel) && !(elements.taskSummaryPanel.contains(target) || elements.openTaskSummary?.contains(target))) setTaskPanel('today');

  if (isPanelOpen(elements.taskForm) && !(elements.taskForm.contains(target) || elements.openTaskComposer?.contains(target))) setTaskComposerOpen(false);
}

function setMenuOpen(open) {
  elements.menuPanel.classList.toggle('hidden', !open);
  elements.menuToggle.setAttribute('aria-expanded', String(open));
}

function toggleBabyPanel(panel) {
  setBabyPanel(state.babyPanel === panel ? null : panel);
}

function setBabyPanel(panel) {
  state.babyPanel = panel === 'summary' || panel === 'settings' ? panel : null;
  renderBabyPanel();
}

function renderBabyPanel() {
  const summaryOpen = state.babyPanel === 'summary';
  const settingsOpen = state.babyPanel === 'settings';
  elements.growthSummary?.classList.toggle('hidden', !summaryOpen);
  elements.growthSummary?.setAttribute('aria-hidden', String(!summaryOpen));
  elements.babySettingsPanel?.classList.toggle('hidden', !settingsOpen);
  elements.babySettingsPanel?.setAttribute('aria-hidden', String(!settingsOpen));
  elements.openBabySummary?.classList.toggle('active', summaryOpen);
  elements.openBabySettings?.classList.toggle('active', settingsOpen);
  elements.openBabyLog?.classList.toggle('active', !summaryOpen && !settingsOpen);
  elements.openBabySummary?.setAttribute('aria-expanded', String(summaryOpen));
  elements.openBabySettings?.setAttribute('aria-expanded', String(settingsOpen));
  if (settingsOpen) renderBabySettings();
}

function setTaskComposerOpen(open) {
  elements.taskForm.classList.toggle('hidden', !open);
  elements.taskForm.setAttribute('aria-hidden', String(!open));
  elements.openTaskComposer.setAttribute('aria-expanded', String(open));
  elements.openTaskComposer.classList.toggle('active', open);
  renderTaskPanel();
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
  renderGrowthSummary();
  renderBabyPanel();
  renderTimeline();
}

function renderDayControls() {
  renderSharedDayControls();
}

function renderSharedDayControls() {
  renderBabyDayControls();
  renderTaskDayControls();
  renderMealDayControls();
}

function renderBabySettings() {
  const profile = state.profile || {};
  elements.babyName.value = profile.babyName || '';
  elements.birthDate.value = profile.birthDate || '';
  elements.birthTime.value = profile.birthTime || '';
  elements.babyHeight.value = profile.heightCm ?? '';
  elements.babyHead.value = profile.headCm ?? '';
  elements.babyWeight.value = profile.weightG ?? '';
  elements.babyApgar.value = profile.apgarPercent ?? '';
  elements.growthRecordMode.value = 'birth';
  elements.growthRecordDate.value = '';
  elements.growthRecordTime.value = '';
  renderGrowthRecordDateControls();
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

function renderGrowthSummary() {
  if (!elements.growthSummary) return;
  const records = [...(state.growthRecords || [])].sort(compareGrowthRecordsDesc);
  if (!records.length) {
    elements.growthSummary.innerHTML = '<p class="empty">Add height, head size, weight, or Apgar in Baby settings to start a growth history.</p>';
    return;
  }

  const latest = records[0];
  const baseline = [...records].reverse().find((record) => record.recordedFor === 'birth') || records[records.length - 1];
  const metricCards = [
    growthMetricCard('Height', latest.heightCm, 'cm', deltaValue(latest.heightCm, baseline.heightCm, 'cm')),
    growthMetricCard('Head', latest.headCm, 'cm', deltaValue(latest.headCm, baseline.headCm, 'cm')),
    growthMetricCard('Weight', latest.weightG, 'g', deltaValue(latest.weightG, baseline.weightG, 'g')),
    growthMetricCard('Apgar', latest.apgarPercent, '%', latest.apgarPercent == null ? '' : `${latest.apgarPercent}%`),
  ];
  const history = records.slice(0, 6).map((record) => `
    <article class="growth-history-item">
      <div><strong>${escapeHtml(growthRecordDateLabel(record))}</strong><span>${escapeHtml(growthRecordTag(record))}</span></div>
      <p>${escapeHtml(growthRecordMetrics(record))}</p>
    </article>
  `).join('');

  elements.growthSummary.innerHTML = `
    <div class="section-header growth-summary-header">
      <div>
        <p class="eyebrow">Summary</p>
        <h2>Growth summary</h2>
        <p class="growth-summary-note">Latest saved record: ${escapeHtml(growthRecordDateLabel(latest))}</p>
      </div>
      <span class="muted-count">${records.length} records</span>
    </div>
    <div class="growth-metric-grid">${metricCards.join('')}</div>
    ${renderGrowthChart(records)}
    <div class="growth-history-list">${history}</div>
  `;
}

function renderGrowthChart(records) {
  const chartRecords = [...records].sort(compareGrowthRecordsAsc).slice(-8);
  const series = [
    { key: 'heightCm', label: 'Height', unit: 'cm' },
    { key: 'headCm', label: 'Head', unit: 'cm' },
    { key: 'weightG', label: 'Weight', unit: 'g' },
  ].map((metric) => ({ ...metric, points: growthChartPoints(chartRecords, metric.key) }));
  const visibleSeries = series.filter((metric) => metric.points.length >= 2);
  if (!visibleSeries.length) {
    return '<section class="growth-chart-card"><p class="empty">Add at least two dated growth records to draw a trend chart.</p></section>';
  }
  const polylines = visibleSeries.map((metric) => `<polyline class="growth-line growth-line-${metric.key}" points="${metric.points.map((point) => `${point.x},${point.y}`).join(' ')}"><title>${escapeHtml(metric.label)}</title></polyline>`).join('');
  const markers = visibleSeries.flatMap((metric) => metric.points.map((point) => `<circle class="growth-dot growth-dot-${metric.key}" cx="${point.x}" cy="${point.y}" r="4"><title>${escapeHtml(metric.label)} ${escapeHtml(point.valueText)} on ${escapeHtml(point.label)}</title></circle>`)).join('');
  const legend = visibleSeries.map((metric) => `<span class="growth-legend-item growth-legend-${metric.key}">${escapeHtml(metric.label)}</span>`).join('');
  const firstLabel = growthRecordDateLabel(chartRecords[0]);
  const lastLabel = growthRecordDateLabel(chartRecords[chartRecords.length - 1]);
  return `
    <section class="growth-chart-card" aria-label="Growth trend chart">
      <div class="growth-chart-copy">
        <strong>Growth trend</strong>
        <span>${escapeHtml(firstLabel)} → ${escapeHtml(lastLabel)}</span>
      </div>
      <svg class="growth-chart" viewBox="0 0 640 220" role="img" aria-label="Growth measurements over time">
        <line x1="40" y1="20" x2="40" y2="184"></line>
        <line x1="40" y1="184" x2="612" y2="184"></line>
        ${polylines}${markers}
      </svg>
      <div class="growth-legend">${legend}</div>
    </section>
  `;
}

function growthChartPoints(records, key) {
  const values = records
    .map((record, index) => ({ record, index, value: record[key] }))
    .filter((point) => point.value !== null && point.value !== undefined && Number.isFinite(Number(point.value)));
  if (values.length < 2) return [];
  const min = Math.min(...values.map((point) => Number(point.value)));
  const max = Math.max(...values.map((point) => Number(point.value)));
  const span = max - min || 1;
  const xSpan = Math.max(records.length - 1, 1);
  return values.map((point) => ({
    x: Math.round(40 + (point.index / xSpan) * 572),
    y: Math.round(184 - ((Number(point.value) - min) / span) * 150),
    label: growthRecordDateLabel(point.record),
    valueText: `${point.value}`,
  }));
}

function compareGrowthRecordsAsc(a, b) {
  return growthRecordSortValue(a).localeCompare(growthRecordSortValue(b));
}

function growthMetricCard(label, value, unit, detail) {
  const valueText = value == null ? '—' : `${value}${unit}`;
  return `<article class="growth-metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(valueText)}</strong><small>${escapeHtml(detail || 'No baseline yet')}</small></article>`;
}

function growthRecordMetrics(record) {
  const parts = [];
  if (record.heightCm != null) parts.push(`Height ${record.heightCm}cm`);
  if (record.headCm != null) parts.push(`Head ${record.headCm}cm`);
  if (record.weightG != null) parts.push(`Weight ${record.weightG}g`);
  if (record.apgarPercent != null) parts.push(`Apgar ${record.apgarPercent}%`);
  return parts.join(' · ') || 'No measurements';
}

function growthRecordDateLabel(record) {
  const date = dayHeading(record.occurredDate || '');
  return record.occurredTime ? `${date} ${record.occurredTime}` : date;
}

function growthRecordTag(record) {
  return { birth: 'At birth', now: 'Now', custom: 'Specific date' }[record.recordedFor] || 'Growth record';
}

function deltaValue(latest, baseline, unit) {
  if (latest == null || baseline == null) return '';
  const delta = Number((latest - baseline).toFixed(unit === 'cm' ? 1 : 0));
  if (!delta) return `No change from baseline`;
  return `${delta > 0 ? '+' : ''}${delta}${unit} from baseline`;
}

function compareGrowthRecordsDesc(a, b) {
  return growthRecordSortValue(b).localeCompare(growthRecordSortValue(a));
}

function growthRecordSortValue(record) {
  return `${record.occurredDate || ''}T${record.occurredTime || '00:00'}`;
}

function renderGrowthRecordDateControls() {
  if (!elements.growthRecordMode) return;
  const custom = elements.growthRecordMode.value === 'custom';
  elements.growthRecordDateControl.classList.toggle('hidden', !custom);
  elements.growthRecordTimeControl.classList.toggle('hidden', !custom);
  if (custom && !elements.growthRecordDate.value) elements.growthRecordDate.value = state.selectedDay;
}

function shouldSaveGrowthRecord(next, previous = {}) {
  if (!hasGrowthValues(next)) return false;
  const mode = elements.growthRecordMode?.value || 'birth';
  return growthValuesChanged(next, previous) || mode !== 'birth';
}

function hasGrowthValues(profile = {}) {
  return ['heightCm', 'headCm', 'weightG', 'apgarPercent'].some((key) => profile[key] !== null && profile[key] !== undefined);
}

function growthValuesChanged(next, previous = {}) {
  return ['birthTime', 'heightCm', 'headCm', 'weightG', 'apgarPercent'].some((key) => normalizeComparable(next?.[key]) !== normalizeComparable(previous?.[key]));
}

function normalizeComparable(value) {
  return value === null || value === undefined ? '' : String(value);
}

function buildGrowthRecordPayload(profile) {
  const mode = elements.growthRecordMode?.value || 'birth';
  const now = new Date();
  const localDate = toLocalDateInputValue(now);
  const localTime = toLocalTimeInputValue(now);
  return {
    recordedFor: mode,
    occurredDate: mode === 'birth' ? (profile.birthDate || localDate)
      : mode === 'now' ? localDate
        : (elements.growthRecordDate.value || state.selectedDay || localDate),
    occurredTime: mode === 'birth' ? (profile.birthTime || '')
      : mode === 'now' ? localTime
        : (elements.growthRecordTime.value || ''),
    heightCm: profile.heightCm,
    headCm: profile.headCm,
    weightG: profile.weightG,
    apgarPercent: profile.apgarPercent,
  };
}

function toLocalDateInputValue(date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

function toLocalTimeInputValue(date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(11, 16);
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


const swipeState = { openItem: null };

function actionIcon(name) {
  const paths = {
    edit: '<path d="M4 15.5V20h4.5L18.9 9.6l-4.5-4.5L4 15.5Z"/><path d="m13.2 6.3 4.5 4.5"/>',
    delete: '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
    like: '<path d="M7 11v9"/><path d="M3 11h4v9H3z"/><path d="M7 11l4-7a2 2 0 0 1 3 2v3h5a2 2 0 0 1 2 2l-2 7a2 2 0 0 1-2 2H7"/>',
    save: '<path d="M5 5a2 2 0 0 1 2-2h8l4 4v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5Z"/><path d="M8 21v-7h8v7"/><path d="M8 3v5h7"/>',
    breakfast: '<path d="M4 11h16"/><path d="M6 11a6 6 0 0 1 12 0"/><path d="M8 15h8"/><path d="M10 19h4"/><path d="M12 3v2"/>',
    lunch: '<path d="M5 4v8"/><path d="M9 4v8"/><path d="M7 4v17"/><path d="M15 4v17"/><path d="M15 4c3 2 4 6 1 9"/>',
    dinner: '<path d="M4 12a8 8 0 0 1 16 0"/><path d="M3 12h18"/><path d="M5 16h14"/><path d="M8 20h8"/>',
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.edit}</svg>`;
}

function makeSwipeAction({ label, icon, tone = '', onClick }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `swipe-action ${tone}`.trim();
  button.innerHTML = `${actionIcon(icon)}<span>${escapeHtml(label)}</span>`;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    closeSwipeItem(button.closest('.swipe-item'));
    onClick?.();
  });
  return button;
}

function makeSwipeItem(content, actions, className = '') {
  const shell = document.createElement('div');
  shell.className = `swipe-item ${className}`.trim();
  shell.tabIndex = 0;
  shell.setAttribute('aria-label', 'Swipe left to reveal actions');

  const rail = document.createElement('div');
  rail.className = 'swipe-actions';
  rail.setAttribute('aria-hidden', 'true');
  rail.replaceChildren(...actions);

  content.classList.add('swipe-card');
  content.style.setProperty('--swipe-offset', '0px');

  let startX = 0;
  let startY = 0;
  let currentOffset = 0;
  let swiping = false;
  let pointerId = null;

  const actionWidth = () => Math.max(88, rail.getBoundingClientRect().width || actions.length * 76);
  const setOffset = (value, animate = true) => {
    const next = Math.max(-actionWidth(), Math.min(0, value));
    currentOffset = next;
    content.style.setProperty('--swipe-offset', `${next}px`);
    content.classList.toggle('is-dragging', !animate);
    shell.classList.toggle('is-open', Math.abs(next) > 1);
    rail.setAttribute('aria-hidden', Math.abs(next) > 1 ? 'false' : 'true');
    if (Math.abs(next) > 1) {
      if (swipeState.openItem && swipeState.openItem !== shell) closeSwipeItem(swipeState.openItem);
      swipeState.openItem = shell;
    } else if (swipeState.openItem === shell) {
      swipeState.openItem = null;
    }
  };

  shell.__closeSwipe = () => setOffset(0);

  content.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest('button, a, input, select, textarea, .meal-item-handle')) return;
    startX = event.clientX;
    startY = event.clientY;
    pointerId = event.pointerId;
    swiping = false;
    content.setPointerCapture?.(pointerId);
  });

  content.addEventListener('pointermove', (event) => {
    if (pointerId !== event.pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!swiping && Math.abs(dx) < 8) return;
    if (!swiping && Math.abs(dy) > Math.abs(dx)) return;
    swiping = true;
    event.preventDefault();
    const base = shell.classList.contains('is-open') ? -actionWidth() : 0;
    setOffset(base + dx, false);
  });

  const finishSwipe = (event) => {
    if (pointerId !== event.pointerId) return;
    content.releasePointerCapture?.(pointerId);
    pointerId = null;
    if (!swiping) return;
    swiping = false;
    const shouldOpen = Math.abs(currentOffset) > actionWidth() * 0.38;
    setOffset(shouldOpen ? -actionWidth() : 0);
  };
  content.addEventListener('pointerup', finishSwipe);
  content.addEventListener('pointercancel', finishSwipe);

  shell.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setOffset(-actionWidth());
    } else if (event.key === 'ArrowRight' || event.key === 'Escape') {
      event.preventDefault();
      setOffset(0);
    }
  });

  shell.replaceChildren(rail, content);
  return shell;
}

function closeSwipeItem(item) {
  item?.__closeSwipe?.();
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
  badges.replaceChildren(parserBadge(event), ...inferredBadges(event));
  const hint = document.createElement('small');
  hint.className = 'swipe-hint';
  hint.textContent = 'Swipe left for actions';
  const main = document.createElement('div');
  main.className = 'timeline-main';
  main.replaceChildren(meta, raw, hint);
  item.replaceChildren(title, main, badges);
  return makeSwipeItem(item, [
    makeSwipeAction({ label: 'Edit', icon: 'edit', onClick: () => editBabyLog(event) }),
    makeSwipeAction({ label: 'Delete', icon: 'delete', tone: 'danger', onClick: () => deleteBabyLog(event) }),
  ], 'timeline-swipe');
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
  if (!elements.taskDueDate.value) elements.taskDueDate.value = state.selectedDay;
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
  const openTasks = state.tasks.filter((task) => task.status !== 'done');
  const completedTasks = state.tasks.filter((task) => task.status === 'done');
  elements.taskCount.textContent = `${state.tasks.length} tasks`;
  const sections = [];
  if (openTasks.length) {
    sections.push(renderTaskBoard(openTasks));
  } else {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = copy.emptyTasks;
    sections.push(empty);
  }
  if (completedTasks.length) {
    const completedSection = document.createElement('section');
    completedSection.className = 'completed-task-section';
    const heading = document.createElement('h3');
    heading.textContent = 'Completed';
    const completedList = document.createElement('div');
    completedList.className = 'completed-task-list';
    completedList.replaceChildren(...completedTasks.map(renderTask));
    completedSection.replaceChildren(heading, completedList);
    sections.push(completedSection);
  }
  elements.taskList.replaceChildren(...sections);
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
  elements.taskDayPicker.value = state.selectedDay;
  renderTaskComposerDueState();
  elements.taskDayLabel.textContent = dayHeading(state.selectedDay);
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
  elements.taskSummaryPanel.setAttribute('aria-hidden', String(!summaryOpen));
  elements.openTaskSummary.classList.toggle('active', summaryOpen);
  elements.openTaskSummary.setAttribute('aria-expanded', String(summaryOpen));
  const composerOpen = elements.taskForm && !elements.taskForm.classList.contains('hidden');
  elements.openTaskLog?.classList.toggle('active', !summaryOpen && !composerOpen);
  elements.openTaskLog?.setAttribute('aria-expanded', String(!summaryOpen && !composerOpen));
  if (elements.taskForm && summaryOpen && composerOpen) setTaskComposerOpen(false);
}

function setTaskCalendarOpen(open) {
  elements.taskCalendarPopover?.classList.toggle('hidden', !open);
  elements.taskCalendarToggle?.setAttribute('aria-expanded', String(open));
}

function toggleTaskCalendar() {
  if (!elements.taskCalendarPopover) return;
  const open = elements.taskCalendarPopover.classList.contains('hidden');
  if (open) {
    state.taskCalendarMonth = state.selectedDay.slice(0, 7);
    loadTaskCalendarDots(state.taskCalendarMonth);
  }
  setTaskCalendarOpen(open);
}

function shiftTaskCalendarMonth(delta) {
  const monthKey = state.taskCalendarMonth || state.selectedDay.slice(0, 7);
  const base = new Date(`${monthKey}-01T00:00:00`);
  base.setMonth(base.getMonth() + delta);
  state.taskCalendarMonth = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`;
  loadTaskCalendarDots(state.taskCalendarMonth);
}

function renderTaskCalendar() {
  if (!elements.taskCalendarGrid || !state.taskCalendarMonth) return;
  renderCalendarGrid({ monthKey: state.taskCalendarMonth, selectedDay: state.selectedDay, dotsByDay: state.taskCalendarDots, monthElement: elements.taskCalendarMonth, gridElement: elements.taskCalendarGrid, onSelect: (iso) => { setTaskCalendarOpen(false); setSelectedDay(iso, { pushHistory: true }); } });
}



async function loadBabyCalendarDots(monthKey) {
  const response = await fetch(`/api/logs/calendar?month=${encodeURIComponent(monthKey)}&timezone=${encodeURIComponent(localTimezone())}`);
  const payload = await response.json();
  state.babyCalendarDots = payload.days || {};
  renderBabyCalendar();
}

function renderBabyDayControls() {
  elements.dayPicker.value = state.selectedDay;
  elements.dayLabel.textContent = dayHeading(state.selectedDay);
  if (elements.babyCalendarToggle) elements.babyCalendarToggle.textContent = 'Open baby calendar';
  renderBabyCalendar();
}

function setBabyCalendarOpen(open) { elements.babyCalendarPopover?.classList.toggle('hidden', !open); elements.babyCalendarToggle?.setAttribute('aria-expanded', String(open)); }
function toggleBabyCalendar() {
  if (!elements.babyCalendarPopover) return;
  const open = elements.babyCalendarPopover.classList.contains('hidden');
  if (open) { state.babyCalendarMonth = state.selectedDay.slice(0, 7); loadBabyCalendarDots(state.babyCalendarMonth); }
  setBabyCalendarOpen(open);
}
function shiftBabyCalendarMonth(delta) {
  const monthKey = state.babyCalendarMonth || state.selectedDay.slice(0, 7);
  const base = new Date(`${monthKey}-01T00:00:00`);
  base.setMonth(base.getMonth() + delta);
  state.babyCalendarMonth = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`;
  loadBabyCalendarDots(state.babyCalendarMonth);
}
function renderBabyCalendar() {
  if (!elements.babyCalendarGrid || !state.babyCalendarMonth) return;
  renderCalendarGrid({monthKey: state.babyCalendarMonth, selectedDay: state.selectedDay, dotsByDay: state.babyCalendarDots, monthElement: elements.babyCalendarMonth, gridElement: elements.babyCalendarGrid, onSelect: (iso) => { setBabyCalendarOpen(false); setSelectedDay(iso, { pushHistory: true }); }});
}

function renderMealDayControls() {
  if (elements.mealDayLabel) elements.mealDayLabel.textContent = dayHeading(state.selectedDay);
  if (elements.mealDayPicker) elements.mealDayPicker.value = state.selectedDay;
  if (elements.mealCalendarToggle) elements.mealCalendarToggle.textContent = 'Open meal calendar';
  renderMealCalendar();
}

function loadMealCalendarDots(monthKey) {
  const dots = {};
  Object.keys(state.meals.plannedByDay || {}).filter((day) => day.startsWith(monthKey)).forEach((day) => {
    const plan = state.meals.plannedByDay[day] || {};
    const colors = [];
    if ((plan.breakfast || []).length) colors.push('#f59e0b');
    if ((plan.lunch || []).length) colors.push('#22c55e');
    if ((plan.dinner || []).length) colors.push('#8b5cf6');
    if (colors.length) dots[day] = colors;
  });
  state.mealCalendarDots = dots;
  renderMealCalendar();
}
function setMealCalendarOpen(open) { elements.mealCalendarPopover?.classList.toggle('hidden', !open); elements.mealCalendarToggle?.setAttribute('aria-expanded', String(open)); }
function toggleMealCalendar() {
  if (!elements.mealCalendarPopover) return;
  const open = elements.mealCalendarPopover.classList.contains('hidden');
  if (open) { state.mealCalendarMonth = state.selectedDay.slice(0, 7); loadMealCalendarDots(state.mealCalendarMonth); }
  setMealCalendarOpen(open);
}
function shiftMealCalendarMonth(delta) {
  const monthKey = state.mealCalendarMonth || state.selectedDay.slice(0, 7);
  const base = new Date(`${monthKey}-01T00:00:00`); base.setMonth(base.getMonth() + delta);
  state.mealCalendarMonth = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`; loadMealCalendarDots(state.mealCalendarMonth);
}
function renderMealCalendar() {
  if (!elements.mealCalendarGrid || !state.mealCalendarMonth) return;
  renderCalendarGrid({monthKey: state.mealCalendarMonth, selectedDay: state.selectedDay, dotsByDay: state.mealCalendarDots, monthElement: elements.mealCalendarMonth, gridElement: elements.mealCalendarGrid, onSelect: (iso) => { setMealCalendarOpen(false); setSelectedDay(iso, { pushHistory: true }); }});
}

function renderCalendarGrid({ monthKey, selectedDay, dotsByDay, monthElement, gridElement, onSelect }) {
  const [year, month] = monthKey.split('-').map(Number);
  const first = new Date(year, month - 1, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(document.createElement('span'));
  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `calendar-day ${iso === selectedDay ? 'selected' : ''}`;
    const dots = (dotsByDay[iso] || []).slice(0, 4).map((color) => `<span class="calendar-dot" style="background:${escapeHtml(color)}"></span>`).join('');
    button.innerHTML = `<span>${day}</span><span class="calendar-dots">${dots}</span>`;
    button.addEventListener('click', () => onSelect(iso));
    cells.push(button);
  }
  monthElement.textContent = first.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
  gridElement.replaceChildren(...cells);
}
function renderTaskBoard(tasks) {
  const byAssignee = new Map();
  for (const task of tasks) {
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
  return board;
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

function parserBadge(event) {
  const info = event.parserInfo || {};
  const badge = document.createElement('span');
  const kind = info.kind === 'llm' ? 'llm' : info.kind === 'system' ? 'system' : 'heuristic';
  badge.className = `parser-badge parser-badge-${kind}`;
  badge.textContent = kind === 'llm' ? `LLM · ${info.model || info.provider || 'provider'}` : kind === 'system' ? (info.label || 'System') : 'Heuristic';
  badge.title = parserBadgeTitle(event);
  return badge;
}

function parserBadgeTitle(event) {
  const info = event.parserInfo || {};
  const base = info.label || event.parser || 'Unknown parser';
  if (info.fallbackFrom) return `${base}; fallback from ${info.fallbackFrom.provider} ${info.fallbackFrom.model}: ${info.fallbackFrom.reason}`;
  return base;
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
  setSelectedDay(shiftDateKey(state.selectedDay, days), { pushHistory: true });
}

function jumpToToday() {
  setSelectedDay(localDateKey(new Date()), { pushHistory: true });
}

function setSelectedDay(day, { pushHistory = false } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return;
  state.selectedDay = day;
  syncUrlForTab(state.activeTab, { pushHistory });
  renderSharedDayControls();
  refreshActiveTab();
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
  params.delete('taskDay');
  params.delete('mealDay');
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

function getInitialSharedDay() {
  const today = localDateKey(new Date());
  const activeTab = getInitialTab();
  const legacyKey = activeTab === 'task' ? 'taskDay' : activeTab === 'meal' ? 'mealDay' : 'day';
  return getDayParamFromLocation('day', getDayParamFromLocation(legacyKey, today));
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
  return { wish: [], plannedByDay: {}, likes: {}, log: [] };
}

function defaultDemoMeals() {
  const today = localDateKey(new Date());
  return {
    wish: [
      { id: 'meal-demo-wish-1', name: 'Soy-braised tofu', url: 'https://example.com/tofu', ingredients: 'tofu, soy sauce, garlic', likes: 0 },
      { id: 'meal-demo-wish-2', name: 'Pumpkin porridge', url: 'https://example.com/pumpkin-porridge', ingredients: 'pumpkin, rice, water', likes: 0 },
    ],
    plannedByDay: {
      [today]: {
        breakfast: [{ id: 'meal-demo-breakfast-1', name: 'Egg toast', url: 'https://example.com/egg-toast', ingredients: 'bread, egg, butter', likes: 0 }],
        lunch: [{ id: 'meal-demo-lunch-1', name: 'Beef seaweed soup', url: 'https://example.com/seaweed-soup', ingredients: 'beef, seaweed, sesame oil', likes: 0 }],
        dinner: [{ id: 'meal-demo-dinner-1', name: 'Salmon rice bowl', url: 'https://example.com/salmon-bowl', ingredients: 'salmon, rice, avocado', likes: 0 }],
      },
    },
  };
}

function mealStorageKey(user = state.user) {
  const userId = user?.id || user?.email || 'guest';
  return `familyTracker.meals.${userId}`;
}

function loadMealsForUser(user = state.user) {
  try {
    const scopedRaw = localStorage.getItem(mealStorageKey(user));
    const legacyRaw = localStorage.getItem(storageKeys.mealsLegacy);
    const parsed = JSON.parse(scopedRaw || legacyRaw || '');
    if (!parsed || typeof parsed !== 'object') return emptyMealState();
    const next = {
      ...emptyMealState(),
      ...parsed,
      wish: Array.isArray(parsed.wish) ? parsed.wish : [],
      plannedByDay: parsed.plannedByDay && typeof parsed.plannedByDay === 'object' ? parsed.plannedByDay : {},
      likes: parsed.likes && typeof parsed.likes === 'object' ? parsed.likes : {},
      log: Array.isArray(parsed.log) ? parsed.log : [],
    };
    if (!Object.keys(next.plannedByDay).length && (Array.isArray(parsed.breakfast) || Array.isArray(parsed.lunch) || Array.isArray(parsed.dinner))) {
      next.plannedByDay[localDateKey(new Date())] = { breakfast: parsed.breakfast || [], lunch: parsed.lunch || [], dinner: parsed.dinner || [] };
    }
    const assignedCount = Object.values(next.plannedByDay).reduce((sum, dayPlan) => (
      sum + (dayPlan?.breakfast?.length || 0) + (dayPlan?.lunch?.length || 0) + (dayPlan?.dinner?.length || 0)
    ), 0);
    const totalCount = next.wish.length + assignedCount;
    if (totalCount > 0) return next;
    return { ...next, ...defaultDemoMeals() };
  } catch {
    return { ...emptyMealState(), ...defaultDemoMeals() };
  }
}

function saveMeals() {
  localStorage.setItem(mealStorageKey(state.user), JSON.stringify(state.meals));
}

function planForDay(day = state.selectedDay) {
  if (!state.meals.plannedByDay[day]) state.meals.plannedByDay[day] = { breakfast: [], lunch: [], dinner: [] };
  return state.meals.plannedByDay[day];
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
    likes: 0,
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
  const item = { id: `meal-${Date.now()}`, name, category: data.category || 'korean', url: data.url.trim(), ingredients: data.ingredients.trim(), likes: 0 };
  planForDay()[slot].unshift(item);
  logMealAction(`added ${slot} menu "${name}" on ${state.selectedDay}`);
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
  const dayPlan = planForDay();
  const slots = [
    ['wish', elements.wishList],
    ['breakfast', elements.mealBreakfast, dayPlan.breakfast],
    ['lunch', elements.mealLunch, dayPlan.lunch],
    ['dinner', elements.mealDinner, dayPlan.dinner],
  ];
  slots.forEach(([slot, container, dayItems]) => {
    container.dataset.slot = slot;
    const items = slot === 'wish' ? (state.meals.wish || []) : (dayItems || []);
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
      container.replaceChildren(...items.map((item) => renderMealItem(item, slot)));
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
  initMealSortables(slots);
  elements.mealLog.replaceChildren(...(state.meals.log || []).slice(0, 10).map((entry) => {
    const node = document.createElement('article');
    node.className = 'overview-item';
    node.innerHTML = `<strong>${escapeHtml(entry.actor)}</strong><span>${escapeHtml(entry.action)} · ${escapeHtml(relativeDateTime(entry.at))}</span>`;
    return node;
  }));
  elements.mealCount.textContent = `${dayPlan.breakfast.length + dayPlan.lunch.length + dayPlan.dinner.length} menus`;
  renderMealDayControls();
  if (elements.mealSummaryPanel && !elements.mealSummaryPanel.classList.contains('hidden')) renderMealSummary();
}

function renderMealItem(item, slot) {
  let dragArmed = false;
  let swipe = null;

  const card = document.createElement('div');
  card.className = 'meal-card';

  const title = document.createElement('strong');
  title.className = 'meal-item-handle';
  title.textContent = `☰ ${item.name}`;
  title.setAttribute('aria-label', `Drag ${item.name}`);
  card.appendChild(title);

  const armDrag = () => {
    dragArmed = true;
    if (swipe) swipe.draggable = true;
  };
  const disarmDrag = () => {
    dragArmed = false;
    if (swipe) swipe.draggable = false;
  };
  title.addEventListener('pointerdown', armDrag);
  title.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') armDrag();
  });

  const thumb = document.createElement('img');
  thumb.className = 'meal-thumb';
  thumb.alt = `${item.name} thumbnail`;
  thumb.src = mealThumbnailUrl(item.url);
  hydrateMealThumbnail(thumb, item.url);
  card.appendChild(thumb);
  if (item.url) {
    const link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = 'recipe';
    const linkWrap = document.createElement('small');
    linkWrap.appendChild(link);
    card.appendChild(linkWrap);
  }
  const ingredients = document.createElement('small');
  ingredients.textContent = item.ingredients || '';
  card.appendChild(ingredients);

  const hint = document.createElement('small');
  hint.className = 'swipe-hint';
  hint.textContent = 'Swipe left for actions';
  card.appendChild(hint);

  const actions = [];
  if (slot !== 'wish') {
    actions.push(makeSwipeAction({ label: `${item.likes || 0}`, icon: 'like', onClick: () => likeMeal(item.id) }));
    actions.push(makeSwipeAction({ label: 'Save', icon: 'save', onClick: () => moveMeal(item.id, 'wish') }));
  } else {
    for (const mealSlot of ['breakfast', 'lunch', 'dinner']) {
      actions.push(makeSwipeAction({ label: mealSlot, icon: mealSlot, onClick: () => moveMeal(item.id, mealSlot) }));
    }
  }
  actions.push(
    makeSwipeAction({ label: 'Edit', icon: 'edit', onClick: () => editMeal(item.id) }),
    makeSwipeAction({ label: 'Delete', icon: 'delete', tone: 'danger', onClick: () => deleteMeal(item.id) }),
  );

  swipe = makeSwipeItem(card, actions, `meal-swipe meal-item ${item.done ? 'done' : ''} category-${item.category || 'korean'}`);
  swipe.dataset.mealId = item.id;
  swipe.draggable = false;
  swipe.addEventListener('dragstart', (event) => {
    if (!dragArmed) {
      event.preventDefault();
      return;
    }
    event.dataTransfer?.setData('text/plain', item.id);
    event.dataTransfer?.setData('application/x-family-meal-id', item.id);
    event.dataTransfer?.setData('text/id', item.id);
  });
  swipe.addEventListener('dragend', () => disarmDrag());
  return swipe;
}


function setMealLogPanelOpen(open) {
  if (!elements.mealLogPanel || !elements.toggleMealLog) return;
  elements.mealLogPanel.classList.toggle('hidden', !open);
  elements.mealLogPanel.setAttribute('aria-hidden', String(!open));
  elements.toggleMealLog.setAttribute('aria-expanded', String(open));
  elements.toggleMealLog.classList.toggle('active', open);
}

function toggleMealLogPanel() {
  if (!elements.mealLogPanel) return;
  setMealLogPanelOpen(elements.mealLogPanel.classList.contains('hidden'));
}

function initMealSortables(slots) {
  if (typeof window.Sortable !== 'function') return;
  const knownContainers = new Set(slots.map(([, container]) => container));
  mealSortableInstances.forEach((sortable, container) => {
    if (!knownContainers.has(container)) {
      sortable.destroy();
      mealSortableInstances.delete(container);
    }
  });

  slots.forEach(([slot, container]) => {
    const existing = mealSortableInstances.get(container);
    if (existing) return;
    const sortable = window.Sortable.create(container, {
      group: 'family-meal-board',
      animation: 180,
      handle: '.meal-item-handle',
      draggable: '.meal-item',
      ghostClass: 'meal-item-ghost',
      chosenClass: 'meal-item-chosen',
      dragClass: 'meal-item-drag',
      onEnd: (event) => {
        const id = event.item?.dataset.mealId;
        const to = event.to?.dataset.slot;
        if (!id || !to) return renderMeals();
        moveMeal(id, to);
      },
    });
    mealSortableInstances.set(container, sortable);
  });
}

function findMeal(id) {
  for (const day of Object.keys(state.meals.plannedByDay || {})) {
    for (const slot of ['breakfast', 'lunch', 'dinner']) {
      const idx = (state.meals.plannedByDay[day]?.[slot] || []).findIndex((item) => item.id === id);
      if (idx >= 0) return { slot, idx, item: state.meals.plannedByDay[day][slot][idx], day };
    }
  }
  for (const slot of ['wish', 'breakfast', 'lunch', 'dinner']) {
    const idx = (state.meals[slot] || []).findIndex((item) => item.id === id);
    if (idx >= 0) return { slot, idx, item: state.meals[slot][idx] };
  }
  return null;
}

function moveMeal(id, to) {
  const found = findMeal(id);
  if (!found || found.slot === to) return;
  const sourceList = found.slot === 'wish' ? state.meals.wish : state.meals.plannedByDay[found.day || state.selectedDay][found.slot];
  const [item] = sourceList.splice(found.idx, 1);
  const targetList = to === 'wish' ? state.meals.wish : planForDay()[to];
  targetList.unshift(item);
  logMealAction(`moved "${item.name}" from ${found.slot} to ${to} (${state.selectedDay})`);
  saveMeals();
  renderMeals();
}

function likeMeal(id) {
  const found = findMeal(id);
  if (!found) return;
  found.item.likes = (found.item.likes || 0) + 1;
  logMealAction(`liked "${found.item.name}"`);
  saveMeals();
  renderMeals();
}

function renderMealSummary() {
  if (!elements.mealSummary) return;
  const counts = new Map();
  const slotTotals = { breakfast: 0, lunch: 0, dinner: 0 };
  for (const dayPlan of Object.values(state.meals.plannedByDay || {})) {
    for (const slot of ['breakfast', 'lunch', 'dinner']) {
      for (const item of (dayPlan[slot] || [])) {
        slotTotals[slot] += 1;
        const key = item.name.trim().toLowerCase();
        const current = counts.get(key) || { name: item.name, assigned: 0, likes: 0 };
        current.assigned += 1;
        current.likes += item.likes || 0;
        counts.set(key, current);
      }
    }
  }
  const top = [...counts.values()].sort((a, b) => (b.likes - a.likes) || (b.assigned - a.assigned)).slice(0, 5);
  const totalAssigned = [...counts.values()].reduce((sum, item) => sum + item.assigned, 0);
  const maxSlotTotal = Math.max(...Object.values(slotTotals), 1);
  const chart = ['breakfast', 'lunch', 'dinner'].map((slot) => {
    const value = slotTotals[slot];
    const width = Math.round((value / maxSlotTotal) * 100);
    return `<article class="meal-summary-bar"><strong>${slot}</strong><div class="meal-summary-bar-track"><span style="width:${width}%"></span></div><em>${value}</em></article>`;
  }).join('');
  elements.mealSummary.innerHTML = `<article class="overview-item"><strong>Total assigned meals</strong><span>${totalAssigned}</span></article><section class="meal-summary-chart" aria-label="Meal slot distribution">${chart}</section>${top.map((item, i) => `<article class="overview-item"><strong>#${i + 1} ${escapeHtml(item.name)}</strong><span>assigned ${item.assigned} · 👍 ${item.likes}</span></article>`).join('') || '<p class=\"empty\">No assigned meals yet.</p>'}`;
}

function setMealSummaryPanelOpen(open) {
  if (!elements.mealSummaryPanel || !elements.openMealSummary) return;
  elements.mealSummaryPanel.classList.toggle('hidden', !open);
  elements.mealSummaryPanel.setAttribute('aria-hidden', String(!open));
  elements.openMealSummary.setAttribute('aria-expanded', String(open));
  elements.openMealSummary.classList.toggle('active', open);
}

function toggleMealSummaryPanel() {
  if (!elements.mealSummaryPanel) return;
  const open = elements.mealSummaryPanel.classList.contains('hidden');
  setMealSummaryPanelOpen(open);
  if (open) renderMealSummary();
}

function editMeal(id) {
  const found = findMeal(id);
  if (!found) return;
  openMealModal({ slot: found.slot, item: found.item });
}

function deleteMeal(id) {
  const found = findMeal(id);
  if (!found) return;
  const source = found.slot === 'wish' ? state.meals.wish : state.meals.plannedByDay[found.day || state.selectedDay][found.slot];
  const [item] = source.splice(found.idx, 1);
  logMealAction(`deleted "${item.name}" from ${found.slot}`);
  saveMeals();
  renderMeals();
}

function mealThumbnailUrl(url) {
  const clean = (url || '').trim();
  const host = (() => {
    if (!clean) return 'Meal';
    try {
      return new URL(clean).hostname.replace(/^www\./, '') || 'Meal';
    } catch {
      return 'Meal';
    }
  })();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="140" viewBox="0 0 220 140"><rect width="220" height="140" fill="#f5f5f7"/><text x="110" y="72" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="14" fill="#7a7a7a">${escapeHtml(host)}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

async function hydrateMealThumbnail(imageElement, url) {
  const clean = String(url || '').trim();
  if (!clean) return;
  if (mealThumbnailCache.has(clean)) {
    const cached = mealThumbnailCache.get(clean);
    if (cached) imageElement.src = cached;
    return;
  }
  try {
    const params = new URLSearchParams({ url: clean });
    const response = await fetch(`/api/meal-thumbnail?${params.toString()}`);
    if (!response.ok) throw new Error('failed to resolve thumbnail');
    const payload = await response.json();
    const resolved = String(payload.thumbnail || '').trim();
    mealThumbnailCache.set(clean, resolved || '');
    if (resolved) imageElement.src = resolved;
  } catch {
    mealThumbnailCache.set(clean, '');
  }
}

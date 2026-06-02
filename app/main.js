import { buildFeedingGuidance } from '../src/domain/feeding-guidance.js';
import { buildTodayContext, buildTodaySummary, buildWindowSummary, filterEventsForWindow } from '../src/domain/summary-builder.js';
import { babyActionIconColors, babySummaryLabelColors, colorForBabyEventType, mealSlotColors } from '../src/utils/tracker-colors.js';

const BUILD_PLACEHOLDER = '---';
const BUILD_CHECK_INTERVAL_MS = 60_000;
const REMOTE_SYNC_CHECK_INTERVAL_MS = 60_000;
const REMOTE_SYNC_FOCUS_MIN_INTERVAL_MS = 15_000;
const PULL_REFRESH_THRESHOLD_PX = 72;
const PULL_REFRESH_MAX_DISTANCE_PX = 112;

const mealSortableInstances = new Map();
const mealThumbnailCache = new Map();
const swipeState = { openItem: null, nextId: 0 };
let openTimelineDetail = null;
let openHomeTooltip = null;
let growthChartInstance = null;

const babyTrackerTypes = [
  { type: 'sleep', label: 'Sleep' },
  { type: 'feeding_milk', label: 'Milk' },
  { type: 'feeding_solid', label: 'Baby food' },
  { type: 'diaper', label: 'Diaper' },
];

const babyTrackerTypeSet = new Set(babyTrackerTypes.map((item) => item.type));

const patternEventTypes = babyTrackerTypes.map(({ type, label }) => ({ type, label }));

const storageKeys = {
  theme: 'familyTracker.theme',
  activeTab: 'familyTracker.activeTab',
  mealsLegacy: 'familyTracker.meals',
  timelineSort: 'familyTracker.timelineSort',
  timelineFilter: 'familyTracker.timelineFilter',
  recentBabyLogs: 'familyTracker.recentBabyLogs',
  patternTypes: 'familyTracker.patternTypes',
  patternPeriodDays: 'familyTracker.patternPeriodDays',
  patternStatUnit: 'familyTracker.patternStatUnit',
  babyStatusRange: 'familyTracker.babyStatusRange',
  activeBabyTrackers: 'familyTracker.activeBabyTrackers',
};

const copy = {
  today: 'Today',
  yesterday: 'Yesterday',
  tomorrow: 'Tomorrow',
  saving: 'Saving...',
  saveFailed: 'Could not save.',
  logPlaceholder: 'Try: 분유 120 먹고 응가했어',
  askPlaceholder: 'How much sleep today?',
  emptyTimeline: 'No records for this date yet.',
  emptyFilteredTimeline: 'No records match this filter.',
  emptyTasks: 'No tasks for this day.',
  emptyOverview: 'No completed tasks yet.',
  quickActions: [
    { label: 'Formula', value: 'formula', icon: 'formula', trackerType: 'feeding_milk' },
    { label: 'Breast', value: 'breast milk', icon: 'breast', trackerType: 'feeding_milk' },
    { label: 'Nap start', value: 'nap', wakeLabel: 'Wake', wakeValue: 'woke up', icon: 'sleep', wakeIcon: 'wake', trackerType: 'sleep' },
    { label: 'Diaper (poop)', value: 'poop diaper', icon: 'dirty', trackerType: 'diaper' },
    { label: 'Diaper (pee)', value: 'pee diaper', icon: 'wet', trackerType: 'diaper' },
    { label: 'Baby food', value: 'baby food eaten', icon: 'solids', trackerType: 'feeding_solid' },
  ],
};

function normalizeBabyStatusRange(value) {
  return value === 'today' ? 'today' : 'recent24h';
}

const state = {
  events: [],
  previousEvents: [],
  previousSummary: null,
  summary: null,
  todayContext: null,
  recent24Events: [],
  recent24Summary: null,
  recent24Context: null,
  babyStatusRange: normalizeBabyStatusRange(localStorage.getItem(storageKeys.babyStatusRange)),
  activeBabyTrackers: normalizeActiveBabyTrackers(localStorage.getItem(storageKeys.activeBabyTrackers)),
  recentBabyLogs: loadRecentBabyLogs(),
  user: null,
  profile: null,
  growthRecords: [],
  tasks: [],
  taskOverview: [],
  babyActionLog: [],
  taskActionLog: [],
  eventSummary: null,
  assignees: [],
  theme: normalizeTheme(localStorage.getItem(storageKeys.theme)),
  activeTab: normalizeTab(getInitialTab()),
  selectedDay: getInitialSharedDay(),
  homeCalendarMonth: null,
  homeCalendarDots: {},
  taskCalendarMonth: null,
  taskCalendarDots: {},
  babyCalendarMonth: null,
  babyCalendarDots: {},
  mealCalendarMonth: null,
  mealCalendarDots: {},
  taskPanel: 'today',
  babyPanel: null,
  momentPanelMode: 'gallery',
  meals: emptyMealState(),
  llmConfig: { provider: 'mock', model: 'mock-local', providers: [] },
  timelineSort: normalizeTimelineSort(localStorage.getItem(storageKeys.timelineSort)),
  timelineFilter: normalizeTimelineFilter(localStorage.getItem(storageKeys.timelineFilter)),
  momentAttachments: [],
  patternDays: [],
  patternLoading: false,
  patternError: '',
  patternRequestId: 0,
  patternTypes: normalizePatternTypes(localStorage.getItem(storageKeys.patternTypes)),
  patternPeriodDays: normalizePatternPeriodDays(localStorage.getItem(storageKeys.patternPeriodDays)),
  patternStatUnit: normalizePatternStatUnit(localStorage.getItem(storageKeys.patternStatUnit)),
  syncVersions: null,
  syncCheckInFlight: false,
  syncLastCheckedAt: 0,
  pullRefresh: { active: false, ready: false, refreshing: false, startY: 0, distance: 0 },
};

const $ = (selector) => document.querySelector(selector);

const elements = {
  app: $('#app'),
  appLoading: $('#app-loading'),
  appLoadingText: $('#app-loading-text'),
  tabs: document.querySelectorAll('.module-tab'),
  views: document.querySelectorAll('.module-view'),
  homeDayLabel: $('#home-day-label'),
  homeDayPicker: $('#home-day-picker'),
  homeToday: $('#home-today'),
  homeCalendarToggle: $('#home-calendar-toggle'),
  homeCalendarPopover: $('#home-calendar-popover'),
  homeCalendarPrev: $('#home-calendar-prev'),
  homeCalendarNext: $('#home-calendar-next'),
  homeCalendarMonth: $('#home-calendar-month'),
  homeCalendarGrid: $('#home-calendar-grid'),
  previousHomeDay: $('#previous-home-day'),
  nextHomeDay: $('#next-home-day'),
  homeDeck: $('#home-deck'),
  homeAttentionCount: $('#home-attention-count'),
  homeAttentionStrip: $('#home-attention-strip'),
  homeSummaryGrid: $('#home-summary-grid'),
  brandHome: $('#brand-home'),
  pullRefresh: $('#pull-refresh'),
  pullRefreshLabel: $('#pull-refresh-label'),
  settings: document.querySelectorAll('.module-settings'),
  logForm: $('#log-form'),
  logInput: $('#log-input'),
  askForm: $('#ask-form'),
  askInput: $('#ask-input'),
  answer: $('#answer'),
  timeline: $('#timeline'),
  summary: $('#summary'),
  todayContext: $('#today-context'),
  babyStatusRange: $('#baby-status-range'),
  feedingGuidance: $('#feeding-guidance'),
  sleepStatus: $('#sleep-status'),
  babyPatterns: $('#baby-patterns'),
  growthSummary: $('#growth-summary'),
  babySettingsPanel: $('#baby-settings-panel'),
  openBabySummary: $('#open-baby-summary'),
  openBabyPatterns: $('#open-baby-patterns'),
  openBabySettings: $('#open-baby-settings'),
  openBabyLog: $('#open-baby-log'),
  openBabyMoments: $('#open-baby-moments'),
  openBabyActionLog: $('#open-baby-action-log'),
  babyMomentPanel: $('#baby-moment-panel'),
  babyMomentGallery: $('#baby-moment-gallery'),
  momentForm: $('#moment-form'),
  momentTitle: $('#moment-title'),
  momentDate: $('#moment-date'),
  momentNote: $('#moment-note'),
  momentIsFirst: $('#moment-is-first'),
  momentFileInput: $('#moment-file-input'),
  momentCameraInput: $('#moment-camera-input'),
  momentLibraryButton: $('#moment-library-button'),
  momentCameraButton: $('#moment-camera-button'),
  momentPreviewStrip: $('#moment-preview-strip'),
  momentUploadStatus: $('#moment-upload-status'),
  momentReset: $('#moment-reset'),
  quickAddMoment: $('#quick-add-moment'),
  babyActionLogPanel: $('#baby-action-log-panel'),
  babyActionLog: $('#baby-action-log'),
  quickActions: $('#quick-actions'),
  eventCount: $('#event-count'),
  timelineSort: $('#timeline-sort'),
  timelineFilter: $('#timeline-filter'),
  refresh: $('#refresh'),
  themeSelect: $('#theme-select'),
  llmProviderForm: $('#llm-provider-form'),
  llmProviderSelect: $('#llm-provider-select'),
  llmModelSelect: $('#llm-model-select'),
  llmProviderList: $('#llm-provider-list'),
  llmProviderStatus: $('#llm-provider-status'),
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
  babyTrackerToggles: document.querySelectorAll('[name="babyTrackerTypes"]'),
  assigneeForm: $('#assignee-form'),
  assigneeName: $('#assignee-name'),
  taskForm: $('#task-form'),
  openTaskSummary: $('#open-task-summary'),
  openTaskLog: $('#open-task-log'),
  openTaskActionLog: $('#open-task-action-log'),
  taskActionLogPanel: $('#task-action-log-panel'),
  taskActionLog: $('#task-action-log'),
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
  mealDialogCancel: $('[data-dialog-cancel="meal"]'),
  actionDialog: $('#action-dialog'),
  actionDialogForm: $('#action-dialog-form'),
  actionDialogKicker: $('#action-dialog-kicker'),
  actionDialogTitle: $('#action-dialog-title'),
  actionDialogDescription: $('#action-dialog-description'),
  actionDialogInputField: $('#action-dialog-input-field'),
  actionDialogInputLabel: $('#action-dialog-input-label'),
  actionDialogInput: $('#action-dialog-input'),
  actionDialogClose: $('#action-dialog-close'),
  actionDialogCancel: $('#action-dialog-cancel'),
  actionDialogConfirm: $('#action-dialog-confirm'),
};

const HOME_BABY_CLUSTER_WINDOW_MINUTES = 45;
const HOME_BABY_MARKER_LIMIT = 18;
const HOME_BABY_CLUSTER_ICON_LIMIT = 4;

function handleMenuToggleClick() {
  setMenuOpen(elements.menuPanel.classList.contains('hidden'));
}

elements.menuToggle?.addEventListener('click', handleMenuToggleClick);

await initializeApp();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/app/sw.js').catch(() => {});
}
startBuildWatcher();
startRemoteSyncWatcher();
setupPullToRefresh();

elements.tabs.forEach((tab) => {
  tab.addEventListener('click', () => setActiveTab(tab.dataset.tab, { pushHistory: true }));
});
elements.brandHome?.addEventListener('click', () => setActiveTab('home', { pushHistory: true }));
elements.previousHomeDay?.addEventListener('click', () => shiftSelectedDay(-1));
elements.nextHomeDay?.addEventListener('click', () => shiftSelectedDay(1));
elements.homeToday?.addEventListener('click', () => jumpToToday());
elements.homeDayPicker?.addEventListener('change', () => setSelectedDay(elements.homeDayPicker.value, { pushHistory: true }));
elements.homeSummaryGrid?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-home-tooltip-toggle]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  toggleHomeTooltip(button);
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
elements.mealDialogCancel?.addEventListener('click', closeMealModal);
elements.actionDialogForm?.addEventListener('submit', submitFloatingAction);
elements.actionDialogClose?.addEventListener('click', () => closeFloatingAction(null));
elements.actionDialogCancel?.addEventListener('click', () => closeFloatingAction(null));
elements.actionDialog?.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeFloatingAction(null);
});
elements.openTaskSummary?.addEventListener('click', () => setTaskPanel(state.taskPanel === 'summary' ? 'today' : 'summary'));
elements.openTaskLog?.addEventListener('click', () => {
  setTaskPanel('today');
  setTaskComposerOpen(false);
});
elements.openTaskActionLog?.addEventListener('click', () => setTaskPanel(state.taskPanel === 'actionLog' ? 'today' : 'actionLog'));
elements.backToTodayTasks?.addEventListener('click', () => setTaskPanel('today'));
elements.openBabySummary?.addEventListener('click', () => toggleBabyPanel('summary'));
elements.openBabyPatterns?.addEventListener('click', () => toggleBabyPanel('patterns'));
elements.openBabySettings?.addEventListener('click', () => toggleBabyPanel('settings'));
elements.openBabyMoments?.addEventListener('click', () => toggleBabyPanel('moments', { mode: 'gallery' }));
elements.openBabyActionLog?.addEventListener('click', () => toggleBabyPanel('actionLog'));
elements.openBabyLog?.addEventListener('click', () => {
  setBabyPanel(null);
  elements.logInput?.focus();
});
elements.quickAddMoment?.addEventListener('click', () => setBabyPanel('moments', { mode: 'form' }));
elements.momentLibraryButton?.addEventListener('click', () => elements.momentFileInput?.click());
elements.momentCameraButton?.addEventListener('click', () => elements.momentCameraInput?.click());
elements.momentFileInput?.addEventListener('change', (event) => addMomentFiles(event.target.files));
elements.momentCameraInput?.addEventListener('change', (event) => addMomentFiles(event.target.files));
elements.momentReset?.addEventListener('click', resetMomentForm);
elements.momentForm?.addEventListener('submit', submitMomentForm);
elements.babyMomentPanel?.addEventListener('click', (event) => {
  const preset = event.target.closest('[data-moment-title]');
  if (preset) {
    elements.momentTitle.value = preset.dataset.momentTitle || '';
    elements.momentTitle.focus();
    return;
  }
  if (event.target.closest('[data-open-moment-form]')) {
    state.momentPanelMode = 'form';
    renderBabyPanel();
    elements.momentTitle?.focus();
  }
});

elements.babySettingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await saveBabyProfile();
});

elements.llmProviderForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  await saveLLMProvider({
    provider: elements.llmProviderSelect.value,
    model: elements.llmModelSelect.value,
  });
});

elements.llmProviderSelect?.addEventListener('change', renderLLMModelOptions);

elements.llmProviderList?.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-llm-provider]');
  if (!button) return;
  const provider = button.dataset.llmProvider;
  const card = button.closest('.llm-provider-card');
  await saveLLMProvider({
    provider,
    model: card?.querySelector('[data-llm-model]')?.value || '',
    apiKey: card?.querySelector('[data-llm-key]')?.value || '',
  });
});

elements.growthRecordMode?.addEventListener('change', renderGrowthRecordDateControls);

elements.assigneeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await createAssignee();
});

elements.refresh.addEventListener('click', () => refreshActiveTab({ reason: 'manual' }));
elements.timelineSort?.addEventListener('change', () => {
  state.timelineSort = normalizeTimelineSort(elements.timelineSort.value);
  localStorage.setItem(storageKeys.timelineSort, state.timelineSort);
  renderTimeline();
  renderActionLog(elements.babyActionLog, state.babyActionLog, 'No baby actions yet.');
  renderHomeDashboard();
});
elements.timelineFilter?.addEventListener('change', () => {
  state.timelineFilter = normalizeTimelineFilter(elements.timelineFilter.value);
  localStorage.setItem(storageKeys.timelineFilter, state.timelineFilter);
  renderTimeline();
});
elements.buildRefresh?.addEventListener('click', () => window.location.reload());
elements.devLogin.addEventListener('click', devLogin);
elements.logout.addEventListener('click', logout);
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
elements.babyStatusRange?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-status-range]');
  if (!button) return;
  setBabyStatusRange(button.dataset.statusRange);
});

elements.summaryPeriod?.addEventListener('change', () => {
  syncUrlForTab(state.activeTab, { pushHistory: true });
  loadTaskData();
});
elements.mealDayPicker?.addEventListener('change', () => setSelectedDay(elements.mealDayPicker.value, { pushHistory: true }));
elements.taskDueMode?.addEventListener('change', renderTaskComposerDueState);

elements.taskDayPicker.addEventListener('change', () => setSelectedDay(elements.taskDayPicker.value, { pushHistory: true }));
elements.homeCalendarToggle?.addEventListener('click', () => toggleHomeCalendar());
elements.homeCalendarPrev?.addEventListener('click', () => shiftHomeCalendarMonth(-1));
elements.homeCalendarNext?.addEventListener('click', () => shiftHomeCalendarMonth(1));
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
  if (elements.homeCalendarPopover && !elements.homeCalendarPopover.classList.contains('hidden')) {
    if (!(elements.homeCalendarPopover.contains(event.target) || elements.homeCalendarToggle.contains(event.target))) setHomeCalendarOpen(false);
  }
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
  if (openTimelineDetail && !openTimelineDetail.contains(target) && !target.closest?.('.timeline-row-actions')) closeTimelineDetail();
  if (openHomeTooltip && !openHomeTooltip.contains(target) && !target.closest?.('[data-home-tooltip-toggle]')) closeHomeTooltip();
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
  closeHomeTooltip();
  closeTimelineDetail();
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

async function saveLog(text, options = {}) {
  const cleanText = text.trim();
  if (!cleanText) return;
  elements.logInput.value = '';
  elements.logInput.placeholder = copy.saving;
  const response = await fetch('/api/logs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: cleanText,
      timezone: localTimezone(),
      parserMode: options.parserMode || 'auto',
      inputSource: options.inputSource || 'text',
    }),
  });
  const payload = await response.json();
  elements.logInput.placeholder = copy.logPlaceholder;
  if (!response.ok) {
    if (payload.code === 'needs_clarification' || payload.status === 'needs_clarification') {
      elements.logInput.value = cleanText;
      showClarificationWarning(payload);
      return;
    }
    elements.answer.textContent = payload.error || copy.saveFailed;
    return;
  }
  const savedCount = (payload.events || []).filter((event) => !event.hiddenFromTimeline).length;
  rememberRecentBabyLog(cleanText, payload.events || []);
  elements.answer.textContent = savedCount === 1 ? '1 log saved' : `${savedCount} logs saved`;
  state.selectedDay = dayFromSavedEvents(payload.events) || localDateKey(new Date());
  await loadToday();
}


function showClarificationWarning(payload) {
  const message = formatClarificationMessage(payload);
  elements.answer.textContent = message;
  if (typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(message);
  }
}

function formatClarificationMessage(payload = {}) {
  const parts = [payload.error || '입력 내용을 정확히 기록하려면 추가 정보가 필요해요.'];
  if (payload.message) parts.push(payload.message);
  const questions = Array.isArray(payload.questions) ? payload.questions.filter(Boolean) : [];
  if (questions.length) parts.push(`확인할 점: ${questions.join(' ')}`);
  const suggestions = Array.isArray(payload.suggestedInputs) ? payload.suggestedInputs.filter(Boolean) : [];
  if (suggestions.length) parts.push(`다시 입력 예: ${suggestions.join(' / ')}`);
  return parts.join('\n');
}

async function loadToday() {
  const params = new URLSearchParams({ day: state.selectedDay, timezone: localTimezone() });
  const recentParams = new URLSearchParams({ range: 'recent24h', timezone: localTimezone() });
  const [response, recentResponse, actionLogResponse] = await Promise.all([
    fetch(`/api/logs/today?${params.toString()}`),
    fetch(`/api/logs/today?${recentParams.toString()}`),
    fetch('/api/action-logs?module=baby&limit=30'),
  ]);
  const payload = await response.json();
  const recentPayload = await recentResponse.json().catch(() => ({}));
  const actionLogPayload = await actionLogResponse.json().catch(() => ({}));
  if (handleAuthFailure(response)) return;
  state.events = payload.events || [];
  state.summary = payload.summary || buildTodaySummary(state.events);
  state.babyActionLog = actionLogResponse.ok ? actionLogPayload.logs || [] : [];
  state.todayContext = payload.context || buildClientTodayContext(state.events);
  state.recent24Events = recentResponse.ok ? recentPayload.events || [] : [];
  state.recent24Summary = recentResponse.ok ? recentPayload.summary || null : null;
  state.recent24Context = recentResponse.ok ? recentPayload.context || null : null;
  await loadPreviousBabyDay();
  hydrateRecent24StatusFallback();
  seedSelectedDayPattern();
  renderBaby();
  loadBabyPatterns();
}

async function loadPreviousBabyDay() {
  const previousDay = shiftDateKey(state.selectedDay, -1);
  const params = new URLSearchParams({ day: previousDay, timezone: localTimezone() });
  try {
    const response = await fetch(`/api/logs/today?${params.toString()}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Previous day unavailable');
    state.previousEvents = payload.events || [];
    state.previousSummary = payload.summary || null;
  } catch {
    state.previousEvents = [];
    state.previousSummary = null;
  }
}

async function loadBabyProfile() {
  const response = await fetch('/api/profile');
  const payload = await response.json();
  if (handleAuthFailure(response)) return;
  state.profile = payload.profile || null;
  state.growthRecords = payload.growthRecords || [];
  renderBabySettings();
  renderGrowthSummary();
  renderFeedingGuidance();
}

async function saveBabyProfile() {
  saveActiveBabyTrackerSettings();
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
  renderBaby();
  setBabyPanel(null);
}

async function loadTaskData() {
  await loadAssignees();
  const params = new URLSearchParams({ day: state.selectedDay });
  const period = elements.summaryPeriod?.value || 'week';
  const [todayResponse, overviewResponse, summaryResponse, actionLogResponse] = await Promise.all([
    fetch(`/api/tasks/today?${params.toString()}`),
    fetch('/api/tasks/overview'),
    fetch(`/api/events/summary?period=${encodeURIComponent(period)}&day=${encodeURIComponent(state.selectedDay)}`),
    fetch('/api/action-logs?module=task&limit=30'),
  ]);
  const todayPayload = await todayResponse.json();
  const overviewPayload = await overviewResponse.json();
  const summaryPayload = await summaryResponse.json();
  const actionLogPayload = await actionLogResponse.json().catch(() => ({}));
  if (handleAuthFailure(todayResponse)) return;
  state.tasks = todayPayload.tasks || [];
  state.taskOverview = overviewPayload.tasks || [];
  state.eventSummary = summaryPayload.summary || null;
  state.taskActionLog = actionLogResponse.ok ? actionLogPayload.logs || [] : [];
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

let activeFloatingAction = null;

function showFloatingDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
}

function hideFloatingDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === 'function' && dialog.open) {
    dialog.close();
  } else {
    dialog.removeAttribute('open');
  }
}

function openFloatingAction({ kicker = 'Item action', title, description, input = false, inputLabel = 'Details', value = '', confirmLabel = 'Save' }) {
  if (!elements.actionDialog || !elements.actionDialogForm) {
    if (input) return Promise.resolve(window.prompt(title, value));
    return Promise.resolve(window.confirm(description || title));
  }
  if (activeFloatingAction) closeFloatingAction(null);
  elements.actionDialogKicker.textContent = kicker;
  elements.actionDialogTitle.textContent = title;
  elements.actionDialogDescription.textContent = description || '';
  elements.actionDialogInputField.classList.toggle('hidden', !input);
  elements.actionDialogInputLabel.textContent = inputLabel;
  elements.actionDialogInput.value = value || '';
  elements.actionDialogInput.required = Boolean(input);
  elements.actionDialogConfirm.textContent = confirmLabel;
  return new Promise((resolve) => {
    activeFloatingAction = { resolve, input };
    showFloatingDialog(elements.actionDialog);
    if (input) elements.actionDialogInput.focus();
    else elements.actionDialogConfirm.focus();
  });
}

function submitFloatingAction(event) {
  event.preventDefault();
  if (!activeFloatingAction) return;
  const result = activeFloatingAction.input ? elements.actionDialogInput.value : true;
  closeFloatingAction(result);
}

function closeFloatingAction(result) {
  if (!activeFloatingAction) {
    hideFloatingDialog(elements.actionDialog);
    return;
  }
  const { resolve } = activeFloatingAction;
  activeFloatingAction = null;
  hideFloatingDialog(elements.actionDialog);
  elements.actionDialogForm?.reset();
  resolve(result);
}

async function editBabyLog(event) {
  if (!event.rawLogId) return;
  const nextText = await openFloatingAction({
    kicker: 'Baby record',
    title: 'Edit baby record',
    description: 'Update the original note and Family Tracker will re-parse the timeline record.',
    input: true,
    inputLabel: 'Original note',
    value: event.rawText || '',
    confirmLabel: 'Save',
  });
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
    if (payload.code === 'needs_clarification' || payload.status === 'needs_clarification') {
      showClarificationWarning(payload);
      return;
    }
    elements.answer.textContent = payload.error || copy.saveFailed;
    return;
  }
  state.selectedDay = dayFromSavedEvents(payload.events) || state.selectedDay;
  await loadToday();
}

async function deleteBabyLog(event) {
  if (!event.rawLogId) return;
  const ok = await openFloatingAction({
    kicker: 'Baby record',
    title: 'Delete baby record?',
    description: event.rawText || eventTitle(event),
    confirmLabel: 'Delete',
  });
  if (!ok) return;
  const response = await fetch(`/api/logs/${encodeURIComponent(event.rawLogId)}`, { method: 'DELETE' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    elements.answer.textContent = payload.error || copy.saveFailed;
    return;
  }
  await loadToday();
}


async function loadAppConfig() {
  const response = await fetch('/api/config');
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return;
  state.llmConfig = normalizeLLMConfig(payload);
  renderLLMSettings();
}

async function saveLLMProvider({ provider, model, apiKey = '' }) {
  if (!provider) return;
  elements.llmProviderStatus.textContent = 'Saving LLM provider...';
  const body = { provider, model };
  if (apiKey.trim()) body.apiKey = apiKey.trim();
  const response = await fetch('/api/llm-config', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    elements.llmProviderStatus.textContent = payload.error || 'Could not save LLM provider.';
    return;
  }
  state.llmConfig = normalizeLLMConfig(payload);
  renderLLMSettings();
  elements.llmProviderStatus.textContent = `${providerLabel(provider)} is ready for server-side parsing.`;
}

function normalizeLLMConfig(payload) {
  const providers = Array.isArray(payload.providers) ? payload.providers : [];
  return {
    provider: payload.provider || 'mock',
    model: payload.model || providers.find((item) => item.id === payload.provider)?.defaultModel || 'mock-local',
    providers,
  };
}

function renderLLMSettings() {
  if (!elements.llmProviderSelect || !elements.llmProviderList) return;
  const providers = state.llmConfig.providers || [];
  elements.llmProviderSelect.replaceChildren(...providers.map((provider) => {
    const option = document.createElement('option');
    option.value = provider.id;
    option.textContent = `${provider.label}${provider.configured ? '' : ' · add key'}`;
    option.disabled = provider.requiresApiKey && !provider.configured;
    option.selected = provider.id === state.llmConfig.provider;
    return option;
  }));
  renderLLMModelOptions();
  elements.llmProviderList.replaceChildren(...providers.map(providerCard));
}

function renderLLMModelOptions() {
  if (!elements.llmModelSelect) return;
  const provider = (state.llmConfig.providers || []).find((item) => item.id === elements.llmProviderSelect.value)
    || (state.llmConfig.providers || []).find((item) => item.id === state.llmConfig.provider);
  const models = provider?.models?.length ? provider.models : [provider?.defaultModel || state.llmConfig.model || 'mock-local'];
  elements.llmModelSelect.replaceChildren(...models.map((model) => {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    option.selected = model === state.llmConfig.model;
    return option;
  }));
}

function providerCard(provider) {
  const card = document.createElement('article');
  card.className = `llm-provider-card${provider.active ? ' active' : ''}${provider.configured ? ' configured' : ''}`;
  const status = provider.active ? 'Active' : provider.configured ? 'Ready' : provider.requiresApiKey ? 'Needs API key' : 'Available';
  const models = provider.models?.length ? provider.models : [provider.defaultModel];
  card.innerHTML = `
    <div class="llm-provider-card-header">
      <div>
        <strong>${escapeHtml(provider.label)}</strong>
        <span>${escapeHtml(status)}</span>
      </div>
      <span class="llm-provider-pill">${escapeHtml(status)}</span>
    </div>
    <label class="select-control llm-provider-model">
      <span>Model</span>
      <select data-llm-model>${models.map((model) => `<option value="${escapeHtml(model)}"${model === (state.llmConfig.model || provider.defaultModel) ? ' selected' : ''}>${escapeHtml(model)}</option>`).join('')}</select>
    </label>
    ${provider.requiresApiKey ? `
      <label class="select-control">
        <span>API key</span>
        <input data-llm-key type="password" placeholder="${provider.configured ? 'Key saved — paste to replace' : 'Paste API key'}" autocomplete="off">
      </label>
    ` : '<p class="settings-note">Local fallback is available without an API key.</p>'}
    <button type="button" class="menu-action" data-llm-provider="${escapeHtml(provider.id)}">${provider.configured || !provider.requiresApiKey ? 'Use provider' : 'Save key & use'}</button>
  `;
  return card;
}

function providerLabel(providerId) {
  return (state.llmConfig.providers || []).find((item) => item.id === providerId)?.label || providerId;
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
    body: JSON.stringify({ id: 'admin-dev' }),
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
  await updateRemoteSyncBaseline();
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  state.user = null;
  state.meals = loadMealsForUser(null);
  state.events = [];
  state.summary = null;
  state.tasks = [];
  state.taskOverview = [];
  state.babyActionLog = [];
  state.taskActionLog = [];
  state.taskPanel = 'today';
  state.babyPanel = null;
  state.syncVersions = null;
  state.syncLastCheckedAt = 0;
  renderAuthState();
  renderBaby();
  renderTasks();
}

function handleAuthFailure(response) {
  if (response.status !== 401) return false;
  state.user = null;
  state.meals = loadMealsForUser(null);
  state.syncVersions = null;
  state.syncLastCheckedAt = 0;
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

async function initializeApp() {
  setAppLoading(true, 'Loading family data...');
  try {
    applyPreferences();
    await syncBuildMetadata();
    renderTabs();
    renderTimelineControls();
    renderQuickActions();
    if (elements.summaryPeriod) elements.summaryPeriod.value = getSummaryPeriodFromLocation();
    await Promise.all([loadCurrentUser(), loadAppConfig()]);
    state.meals = loadMealsForUser(state.user);
    if (state.user) {
      await Promise.all([loadBabyProfile(), loadToday(), loadTaskData()]);
      await updateRemoteSyncBaseline();
    }
    renderAuthState();
    setAppLoading(false);
  } catch (error) {
    console.error(error);
    setAppLoading(true, 'Could not load family data. Please refresh.');
  }
}

function setAppLoading(loading, message = 'Loading family data...') {
  if (elements.appLoadingText) elements.appLoadingText.textContent = message;
  elements.appLoading?.classList.toggle('hidden', !loading);
  elements.appLoading?.setAttribute('aria-hidden', String(!loading));
  elements.app?.setAttribute('aria-busy', String(loading));
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
  renderHomeDashboard();
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
  const babyPanel = state.babyPanel === 'settings' ? elements.babySettingsPanel
    : state.babyPanel === 'summary' ? elements.growthSummary
      : state.babyPanel === 'patterns' ? elements.babyPatterns
        : state.babyPanel === 'moments' ? elements.babyMomentPanel
          : state.babyPanel === 'actionLog' ? elements.babyActionLogPanel
            : null;
  const babyToggle = state.babyPanel === 'settings' ? elements.openBabySettings
    : state.babyPanel === 'summary' ? elements.openBabySummary
      : state.babyPanel === 'patterns' ? elements.openBabyPatterns
        : state.babyPanel === 'moments' ? elements.openBabyMoments
          : state.babyPanel === 'actionLog' ? elements.openBabyActionLog
            : null;
  if (isPanelOpen(babyPanel) && !(babyPanel.contains(target) || babyToggle?.contains(target))) setBabyPanel(null);

  if (isPanelOpen(elements.taskSummaryPanel) && !(elements.taskSummaryPanel.contains(target) || elements.openTaskSummary?.contains(target))) setTaskPanel('today');

  if (isPanelOpen(elements.taskActionLogPanel) && !(elements.taskActionLogPanel.contains(target) || elements.openTaskActionLog?.contains(target))) setTaskPanel('today');

  if (isPanelOpen(elements.taskForm) && !(elements.taskForm.contains(target) || elements.openTaskComposer?.contains(target))) setTaskComposerOpen(false);
}

function setMenuOpen(open) {
  elements.menuPanel.classList.toggle('hidden', !open);
  elements.menuToggle.setAttribute('aria-expanded', String(open));
}

function toggleBabyPanel(panel, options = {}) {
  setBabyPanel(state.babyPanel === panel ? null : panel, options);
}

function setBabyPanel(panel, options = {}) {
  state.babyPanel = ['summary', 'settings', 'patterns', 'moments', 'actionLog'].includes(panel) ? panel : null;
  if (options.mode) state.momentPanelMode = options.mode === 'form' ? 'form' : 'gallery';
  if (state.babyPanel === 'moments' && !options.mode) state.momentPanelMode = 'gallery';
  if (state.babyPanel === 'moments') prepareMomentForm();
  renderBabyPanel();
}

function renderBabyPanel() {
  const summaryOpen = state.babyPanel === 'summary';
  const settingsOpen = state.babyPanel === 'settings';
  const patternsOpen = state.babyPanel === 'patterns';
  const momentsOpen = state.babyPanel === 'moments';
  const actionLogOpen = state.babyPanel === 'actionLog';
  elements.growthSummary?.classList.toggle('hidden', !summaryOpen);
  elements.growthSummary?.setAttribute('aria-hidden', String(!summaryOpen));
  elements.babyPatterns?.classList.toggle('hidden', !patternsOpen);
  elements.babyPatterns?.setAttribute('aria-hidden', String(!patternsOpen));
  elements.babySettingsPanel?.classList.toggle('hidden', !settingsOpen);
  elements.babySettingsPanel?.setAttribute('aria-hidden', String(!settingsOpen));
  elements.babyMomentPanel?.classList.toggle('hidden', !momentsOpen);
  elements.babyMomentPanel?.setAttribute('aria-hidden', String(!momentsOpen));
  elements.babyActionLogPanel?.classList.toggle('hidden', !actionLogOpen);
  elements.babyActionLogPanel?.setAttribute('aria-hidden', String(!actionLogOpen));
  elements.openBabySummary?.classList.toggle('active', summaryOpen);
  elements.openBabyPatterns?.classList.toggle('active', patternsOpen);
  elements.openBabySettings?.classList.toggle('active', settingsOpen);
  elements.openBabyMoments?.classList.toggle('active', momentsOpen);
  elements.openBabyActionLog?.classList.toggle('active', actionLogOpen);
  elements.openBabyLog?.classList.toggle('active', !summaryOpen && !settingsOpen && !patternsOpen && !momentsOpen && !actionLogOpen);
  elements.openBabySummary?.setAttribute('aria-expanded', String(summaryOpen));
  elements.openBabyPatterns?.setAttribute('aria-expanded', String(patternsOpen));
  elements.openBabySettings?.setAttribute('aria-expanded', String(settingsOpen));
  elements.openBabyMoments?.setAttribute('aria-expanded', String(momentsOpen));
  elements.openBabyActionLog?.setAttribute('aria-expanded', String(actionLogOpen));
  if (settingsOpen) renderBabySettings();
  if (momentsOpen) renderMomentPanel();
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
  renderTodayContext();
  renderFeedingGuidance();
  renderSleepStatus();
  renderBabyPatterns();
  renderQuickActions();
  renderGrowthSummary();
  renderBabyPanel();
  renderTimeline();
  renderActionLog(elements.babyActionLog, state.babyActionLog, 'No baby actions yet.');
}

function renderDayControls() {
  renderSharedDayControls();
}

function renderSharedDayControls() {
  renderHomeDayControls();
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
  elements.babyTrackerToggles.forEach((input) => {
    input.checked = isBabyTrackerActive(input.value);
  });
}

function saveActiveBabyTrackerSettings() {
  const selected = Array.from(elements.babyTrackerToggles)
    .filter((input) => input.checked)
    .map((input) => input.value);
  state.activeBabyTrackers = selected;
  localStorage.setItem(storageKeys.activeBabyTrackers, state.activeBabyTrackers.join(','));
  if (state.timelineFilter !== 'all' && !state.activeBabyTrackers.includes(state.timelineFilter)) {
    state.timelineFilter = 'all';
    localStorage.setItem(storageKeys.timelineFilter, state.timelineFilter);
  }
}

function isBabyTrackerActive(type) {
  return !type || state.activeBabyTrackers.includes(type);
}

function renderQuickActions() {
  const openSleep = currentOpenSleep();
  const baseButtons = copy.quickActions.filter((action) => isBabyTrackerActive(action.trackerType)).map((action) => (
    makeBabyActionButton(resolveSleepAction(action, openSleep), 'quick-action-button')
  ));
  const suggestionButtons = state.recentBabyLogs.slice(0, 3).map(makeRecentSuggestionButton);
  elements.quickActions.replaceChildren(...baseButtons, ...suggestionButtons);
}

function resolveSleepAction(action, openSleep) {
  if (!action.wakeValue) return action;
  return openSleep
    ? { ...action, label: action.wakeLabel, value: action.wakeValue, icon: action.wakeIcon, activeSleep: true }
    : action;
}

function makeRecentSuggestionButton(item) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'quick-action-button suggested-action';
  button.innerHTML = `${actionIcon('note')}<span>${escapeHtml(item.text)}</span>`;
  button.title = 'Suggested recent log';
  button.addEventListener('click', () => {
    elements.logInput.value = item.text;
    elements.logInput.focus();
  });
  return button;
}

function makeBabyActionButton(action, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  const accentColor = babyActionIconColors[action.icon];
  if (accentColor) button.style.setProperty('--tracker-accent', accentColor);
  if (action.activeSleep) button.classList.add('sleep-active');
  button.innerHTML = `${actionIcon(action.icon)}<span>${escapeHtml(action.label)}</span>`;
  if (action.value) {
    button.addEventListener('click', () => saveLog(action.value, { parserMode: 'heuristic', inputSource: 'button' }));
  } else {
    button.addEventListener('click', () => elements.logInput.focus());
  }
  return button;
}


function prepareMomentForm() {
  if (!elements.momentDate) return;
  if (!elements.momentDate.value) elements.momentDate.value = state.selectedDay || localDateKey(new Date());
  renderMomentPreviews();
}

function renderMomentPanel() {
  const formMode = state.momentPanelMode === 'form';
  elements.momentForm?.classList.toggle('hidden', !formMode);
  elements.babyMomentGallery?.classList.toggle('hidden', formMode);
  if (!formMode) renderMomentGallery();
}

function renderMomentGallery() {
  if (!elements.babyMomentGallery) return;
  const moments = sortedTimelineEvents(state.events.filter((event) => event.type === 'milestone' && !event.hiddenFromTimeline)).reverse();
  const cards = moments.map(momentGalleryCard).join('');
  elements.babyMomentGallery.innerHTML = `
    <div class="moment-gallery-hero">
      <div>
        <p class="eyebrow">Moments</p>
        <h2>Growth moments</h2>
        <p>Browse the tiny firsts and favorite memories you have saved so far.</p>
      </div>
      <button type="button" data-open-moment-form>+ Add moment</button>
    </div>
    <div class="moment-gallery-grid">${cards || '<p class="empty">No growth moments yet. Add the first one from Record.</p>'}</div>
  `;
}

function momentGalleryCard(event) {
  const attachment = (event.attachments || []).find((item) => item.thumbnailDataUrl);
  const media = attachment
    ? `<img loading="lazy" src="${escapeHtml(attachment.thumbnailDataUrl)}" alt="${escapeHtml(attachment.name || eventTitle(event))}">`
    : `<div class="moment-gallery-placeholder">${actionIcon('moment')}</div>`;
  return `
    <article class="moment-gallery-card">
      <div class="moment-gallery-media">${media}</div>
      <div class="moment-gallery-copy">
        <span>${escapeHtml(timeLabel(event.occurredAt))}</span>
        <strong>${escapeHtml(eventTitle(event))}</strong>
        <p>${escapeHtml(event.note || event.rawText || 'No description yet.')}</p>
      </div>
    </article>
  `;
}

function resetMomentForm() {
  elements.momentForm?.reset();
  if (elements.momentDate) elements.momentDate.value = state.selectedDay || localDateKey(new Date());
  if (elements.momentIsFirst) elements.momentIsFirst.checked = true;
  state.momentAttachments = [];
  renderMomentPreviews();
}

async function addMomentFiles(fileList) {
  const files = Array.from(fileList || []).slice(0, 10 - state.momentAttachments.length);
  for (const file of files) {
    const mediaType = file.type.startsWith('video/') ? 'video' : 'image';
    const attachment = {
      id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      mediaType,
      byteSize: file.size,
      status: 'Preparing preview…',
      thumbnailDataUrl: '',
    };
    state.momentAttachments.push(attachment);
    renderMomentPreviews();
    attachment.thumbnailDataUrl = mediaType === 'video'
      ? await createVideoThumbnail(file)
      : await createImageThumbnail(file);
    attachment.status = 'Ready';
    renderMomentPreviews();
  }
  if (elements.momentFileInput) elements.momentFileInput.value = '';
  if (elements.momentCameraInput) elements.momentCameraInput.value = '';
}

function renderMomentPreviews() {
  if (!elements.momentPreviewStrip) return;
  if (!state.momentAttachments.length) {
    elements.momentPreviewStrip.innerHTML = '<p class="empty">No attachments yet. Add a photo or a short video.</p>';
  } else {
    elements.momentPreviewStrip.replaceChildren(...state.momentAttachments.map((attachment) => {
      const card = document.createElement('article');
      card.className = 'moment-preview-card';
      const thumb = attachment.thumbnailDataUrl
        ? `<img src="${escapeHtml(attachment.thumbnailDataUrl)}" alt="${escapeHtml(attachment.name)} thumbnail">`
        : `<div class="moment-preview-placeholder">${attachment.mediaType === 'video' ? '▶' : '…'}</div>`;
      card.innerHTML = `${thumb}<span>${escapeHtml(attachment.mediaType === 'video' ? 'Video' : 'Photo')}</span><small>${escapeHtml(attachment.status)}</small>`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove ${attachment.name}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        state.momentAttachments = state.momentAttachments.filter((item) => item.id !== attachment.id);
        renderMomentPreviews();
      });
      card.append(remove);
      return card;
    }));
  }
  if (elements.momentUploadStatus) {
    const count = state.momentAttachments.length;
    elements.momentUploadStatus.textContent = count ? `${count} ready` : 'Add photo or video first';
  }
}

async function createImageThumbnail(file) {
  const dataUrl = await readFileAsDataUrl(file);
  return resizeImageDataUrl(dataUrl, 420, 0.78).catch(() => dataUrl);
}

async function createVideoThumbnail(file) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject;
      video.src = objectUrl;
    });
    video.currentTime = Math.min(0.5, Math.max(0, (video.duration || 1) / 10));
    await new Promise((resolve) => {
      video.onseeked = resolve;
      setTimeout(resolve, 1000);
    });
    const canvas = document.createElement('canvas');
    const width = video.videoWidth || 420;
    const height = video.videoHeight || 420;
    const scale = Math.min(1, 420 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.76);
  } catch {
    return videoPlaceholderDataUrl();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function resizeImageDataUrl(dataUrl, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(image.naturalWidth || maxSize, image.naturalHeight || maxSize));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round((image.naturalWidth || maxSize) * scale));
      canvas.height = Math.max(1, Math.round((image.naturalHeight || maxSize) * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function videoPlaceholderDataUrl() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="420" viewBox="0 0 420 420"><rect width="420" height="420" rx="48" fill="#1d1d1f"/><polygon points="170,135 170,285 290,210" fill="#fff"/></svg>';
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

async function submitMomentForm(event) {
  event.preventDefault();
  const title = elements.momentTitle.value.trim();
  if (!title) return;
  const date = elements.momentDate.value || state.selectedDay || localDateKey(new Date());
  const occurredAt = new Date(`${date}T12:00:00`).toISOString();
  const attachments = state.momentAttachments.map((item, index) => ({
    id: item.id,
    name: item.name,
    mediaType: item.mediaType,
    mimeType: item.mimeType,
    byteSize: item.byteSize,
    thumbnailDataUrl: item.thumbnailDataUrl,
    status: 'uploaded',
    sortOrder: index,
  }));
  elements.momentUploadStatus.textContent = 'Saving…';
  const response = await fetch('/api/moments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title,
      note: elements.momentNote.value.trim(),
      occurredAt,
      isFirst: Boolean(elements.momentIsFirst.checked),
      attachments,
      timezone: localTimezone(),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    elements.momentUploadStatus.textContent = payload.error || copy.saveFailed;
    return;
  }
  await loadToday();
  setBabyPanel(null);
  resetMomentForm();
  elements.timeline?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderMomentMediaGrid(event) {
  const attachments = (event.attachments || []).filter((item) => item.thumbnailDataUrl).slice(0, 4);
  if (!attachments.length) return null;
  const grid = document.createElement('div');
  grid.className = `moment-media-grid count-${Math.min(attachments.length, 3)}`;
  attachments.forEach((attachment, index) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'moment-media-tile';
    if (index === 0) tile.classList.add('primary');
    tile.innerHTML = `<img src="${escapeHtml(attachment.thumbnailDataUrl)}" alt="${escapeHtml(attachment.name || 'Moment media')}">${attachment.mediaType === 'video' ? '<span class="play-badge">▶</span>' : ''}`;
    grid.append(tile);
  });
  return grid;
}

function renderSummary() {
  renderBabyStatusRangeToggle();
  const summary = selectedBabyStatus().summary || {};
  const items = [
    isBabyTrackerActive('sleep') ? summaryItem('Sleep', `${summary.sleepMinutes || 0} min`, babySummaryLabelColors.Sleep) : null,
    isBabyTrackerActive('feeding_milk') ? summaryItem('Milk', `${summary.milkCount || 0}x · ${summary.milkAmountMl || 0}ml`, babySummaryLabelColors.Milk) : null,
    isBabyTrackerActive('feeding_solid') ? summaryItem('Baby food', `${summary.solidCount || 0}x`, babySummaryLabelColors.Solids) : null,
    isBabyTrackerActive('diaper') ? summaryItem('Diaper', `${summary.diaperCount || 0}x`, babySummaryLabelColors.Diaper) : null,
  ].filter(Boolean);
  elements.summary.classList.toggle('hidden', !items.length);
  elements.summary.replaceChildren(...items);
  renderTimelineControls();
}

function renderTodayContext() {
  if (!elements.todayContext) return;
  const context = selectedBabyStatus().context || buildClientTodayContext(selectedBabyStatus().events);
  const cards = [
    isBabyTrackerActive('feeding_milk') ? contextCard('Last milk', milkContextLabel(context.lastMilk), 'feeding_milk') : null,
    isBabyTrackerActive('diaper') ? contextCard('Last diaper', diaperContextLabel(context.lastDiaper), 'diaper') : null,
    isBabyTrackerActive('sleep') ? contextCard('Sleep', sleepContextLabel(context.sleep), 'sleep') : null,
  ].filter(Boolean);
  if (cards.length) cards.push(contextCard('AI checks', estimateContextLabel(context), 'all'));
  elements.todayContext.classList.toggle('hidden', !cards.length);
  elements.todayContext.replaceChildren(...cards);
}

function selectedBabyStatus() {
  if (state.babyStatusRange === 'today') {
    return { events: state.events, summary: state.summary || buildTodaySummary(state.events), context: state.todayContext || buildClientTodayContext(state.events) };
  }
  return {
    events: state.recent24Events || [],
    summary: state.recent24Summary || buildWindowSummary(state.recent24Events || []),
    context: state.recent24Context || buildClientTodayContext(state.recent24Events || []),
  };
}

function setBabyStatusRange(value) {
  state.babyStatusRange = normalizeBabyStatusRange(value);
  localStorage.setItem(storageKeys.babyStatusRange, state.babyStatusRange);
  renderSummary();
  renderTodayContext();
}

function renderBabyStatusRangeToggle() {
  if (!elements.babyStatusRange) return;
  elements.babyStatusRange.querySelectorAll('[data-status-range]').forEach((button) => {
    const active = button.dataset.statusRange === state.babyStatusRange;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function hydrateRecent24StatusFallback() {
  if (state.recent24Summary && state.recent24Context) return;
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60000);
  const candidates = [...state.previousEvents, ...state.events];
  state.recent24Events = filterEventsForWindow(candidates, { start, end: now });
  state.recent24Summary = buildWindowSummary(candidates, { start, end: now });
  state.recent24Context = buildTodayContext(state.recent24Events, { now, selectedDay: localDateKey(now), today: localDateKey(now) });
}


function renderFeedingGuidance() {
  if (!elements.feedingGuidance) return;
  elements.feedingGuidance.classList.toggle('hidden', !isBabyTrackerActive('feeding_milk'));
  if (!isBabyTrackerActive('feeding_milk')) {
    elements.feedingGuidance.innerHTML = '';
    return;
  }
  const guidance = buildFeedingGuidance({
    profile: state.profile || {},
    events: state.events,
    previousEvents: state.previousEvents,
    selectedDay: state.selectedDay,
  });
  const comparison = guidance.comparison || {};
  const guideline = guidance.guideline;
  const expectedCount = comparison.feedCount ? rangeLabel(comparison.feedCount, 'x') : 'Add birth date';
  const expectedAmount = comparison.amount ? rangeLabel(comparison.amount, 'ml') : 'Add ml records';
  const averageTarget = guideline?.amountPerFeedMl ? rangeLabel(guideline.amountPerFeedMl, 'ml') : 'Track baseline';
  const dayPercent = Math.round(guidance.dayProgress * 100);
  const amountPercent = comparison.amount?.max ? Math.min(100, Math.round((guidance.today.totalAmountMl / comparison.amount.max) * 100)) : 0;
  const amountDetail = comparison.amount?.max
    ? `${guidance.today.totalAmountMl}ml logged so far out of the upper expected pace of ${comparison.amount.max}ml for this time of day.`
    : 'Add milk amounts to compare today against the expected pace.';
  const sources = guidance.sources.map((source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)}</a>`).join(' · ');
  const suggestions = guidance.suggestions.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const yesterday = guidance.yesterdayComparison?.hasYesterday
    ? `<span>${escapeHtml(deltaLabel(guidance.yesterdayComparison.totalAmountDeltaMl, 'ml'))}</span><strong>${escapeHtml(deltaLabel(guidance.yesterdayComparison.feedCountDelta, 'feed'))}</strong>`
    : '<span>No previous milk records</span><strong>Start baseline</strong>';

  elements.feedingGuidance.innerHTML = `
    <div class="feeding-guidance-hero">
      <div>
        <p class="eyebrow">Feeding progress</p>
        <h2>${escapeHtml(guidance.stageLabel)}</h2>
        <p>${escapeHtml(guidance.summary)}</p>
      </div>
    </div>
    <section class="feeding-progress-panel" aria-label="Feeding progress explained">
      <div class="feeding-progress-heading">
        <div>
          <span>Progress at a glance</span>
          <strong>What the percentages mean</strong>
        </div>
        <small>Tap each row for detail.</small>
      </div>
      ${feedingProgressRow({ label: 'Day elapsed', value: dayPercent, detail: `${dayPercent}% of the selected day has passed in your local time. We use this to pace expected feeds for “by now” comparisons.` })}
      ${feedingProgressRow({ label: 'Milk pace', value: amountPercent, detail: amountDetail })}
    </section>
    <div class="feeding-guidance-grid">
      ${guidanceMetricCard('Today milk', `${guidance.today.feedCount}x · ${guidance.today.totalAmountMl}ml`, `Average ${guidance.today.averageAmountMl ?? 0}ml/feed`)}
      ${guidanceMetricCard('Expected by now', `${expectedCount} · ${expectedAmount}`, `Per feed target ${averageTarget}`)}
      ${guidanceMetricCard('Vs yesterday', yesterday, 'Same time-window comparison', true)}
    </div>
    <div class="feeding-guidance-notes">
      <ul>${suggestions}</ul>
      <p>Sources: ${sources}</p>
    </div>
  `;
}

function guidanceMetricCard(label, value, note, rawValue = false) {
  const valueMarkup = rawValue ? value : `<strong>${escapeHtml(value)}</strong>`;
  return `<article class="feeding-guidance-card"><span>${escapeHtml(label)}</span>${valueMarkup}<small>${escapeHtml(note)}</small></article>`;
}

function feedingProgressRow({ label, value, detail }) {
  const normalized = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return `
    <details class="feeding-progress-row">
      <summary>
        <span>${escapeHtml(label)}</span>
        <strong>${normalized}%</strong>
        <i aria-hidden="true"><b style="width: ${normalized}%"></b></i>
      </summary>
      <p>${escapeHtml(detail)}</p>
    </details>
  `;
}

function rangeLabel(range, unit) {
  if (!range) return '';
  if (range.min === range.max) return `${range.min}${unit}`;
  return `${range.min}–${range.max}${unit}`;
}

function deltaLabel(value, unit) {
  if (!Number.isFinite(value) || value === 0) return unit === 'ml' ? 'same ml' : 'same feeds';
  const suffix = value > 0 ? 'more' : unit === 'ml' ? 'less' : 'fewer';
  const label = unit === 'ml' ? 'ml' : (Math.abs(value) === 1 ? 'feed' : 'feeds');
  return `${Math.abs(value)} ${label} ${suffix}`;
}

function contextCard(label, value, filter) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'today-context-card';
  button.dataset.filter = filter;
  button.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
  button.addEventListener('click', () => {
    if (filter !== 'all') {
      state.timelineFilter = normalizeTimelineFilter(filter);
      localStorage.setItem(storageKeys.timelineFilter, state.timelineFilter);
      renderTimelineControls();
      renderTimeline();
    }
    elements.timeline?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  return button;
}

function milkContextLabel(item) {
  if (!item) return 'No milk yet';
  return item.amountMl ? `${item.label} · ${item.amountMl}ml` : item.label;
}

function diaperContextLabel(item) {
  if (!item) return 'No diaper yet';
  if (item.diaperKind === 'dirty') return `${item.label} · poop`;
  return item.label;
}

function sleepContextLabel(item) {
  if (!item) return 'No sleep yet';
  return item.label || (item.state === 'ongoing' ? 'Sleeping now' : 'Logged');
}

function estimateContextLabel(context) {
  const inferred = context?.inferredFieldCount || 0;
  const corrected = context?.correctedFieldCount || 0;
  if (corrected) return `${inferred} estimated · ${corrected} corrected`;
  if (inferred) return `${inferred} estimated`;
  return 'No estimates';
}

function seedSelectedDayPattern() {
  state.patternDays = patternDayKeys(state.selectedDay, state.patternPeriodDays).map((day) => ({
    day,
    events: day === state.selectedDay ? state.events : [],
  }));
  state.patternError = '';
}

async function loadBabyPatterns() {
  if (!elements.babyPatterns || !state.user) return;
  const requestId = state.patternRequestId + 1;
  state.patternRequestId = requestId;
  state.patternLoading = true;
  renderBabyPatterns();
  const days = patternDayKeys(state.selectedDay, state.patternPeriodDays);
  try {
    const patternDays = await Promise.all(days.map(async (day) => {
      if (day === state.selectedDay) return { day, events: state.events };
      const params = new URLSearchParams({ day, timezone: localTimezone() });
      const response = await fetch(`/api/logs/today?${params.toString()}`);
      if (!response.ok) throw new Error(`Could not load ${day}`);
      const payload = await response.json();
      return { day, events: payload.events || [] };
    }));
    if (requestId !== state.patternRequestId) return;
    state.patternDays = patternDays;
    state.patternError = '';
  } catch {
    if (requestId !== state.patternRequestId) return;
    state.patternError = 'Could not load patterns.';
  } finally {
    if (requestId === state.patternRequestId) {
      state.patternLoading = false;
      renderBabyPatterns();
    }
  }
}

function renderBabyPatterns() {
  if (!elements.babyPatterns) return;
  const days = state.patternDays.length ? state.patternDays : patternDayKeys(state.selectedDay, state.patternPeriodDays).map((day) => ({ day, events: [] }));
  const visibleTypes = new Set(state.patternTypes);
  const flatEvents = visiblePatternEvents(days, visibleTypes);
  const range = `${shortDayLabel(days[0]?.day)} – ${shortDayLabel(days.at(-1)?.day)}`;
  const periodLabel = patternPeriodLabel(days.length);
  elements.babyPatterns.innerHTML = `
    <div class="baby-patterns-header">
      <div>
        <span class="eyebrow">Patterns</span>
        <h2>${escapeHtml(periodLabel)} rhythm</h2>
        <p>${escapeHtml(range)} · 24-hour lanes from baby logs</p>
      </div>
      <div class="pattern-status">${state.patternLoading ? 'Refreshing…' : `${flatEvents.length} visible logs`}</div>
    </div>
    ${state.patternError ? `<p class="pattern-error">${escapeHtml(state.patternError)}</p>` : ''}
    <div class="pattern-controls">
      <label class="compact-select-control" for="pattern-period-days">
        <span>Period</span>
        <select id="pattern-period-days" name="patternPeriodDays">
          ${patternPeriodOptions().map((option) => `<option value="${option.days}"${option.days === days.length ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
        </select>
      </label>
      <label class="compact-select-control" for="pattern-stat-unit">
        <span>Statistics</span>
        <select id="pattern-stat-unit" name="patternStatUnit">
          ${patternStatUnitOptions().map((option) => `<option value="${escapeHtml(option.value)}"${option.value === state.patternStatUnit ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="pattern-type-toggles" aria-label="Pattern event filters">
      ${patternEventTypes.map((item) => patternTypeToggle(item, visibleTypes.has(item.type))).join('')}
    </div>
    <div class="pattern-chart-shell">
      <div class="pattern-time-axis" aria-hidden="true">${[0, 6, 12, 18, 24].map((hour) => `<span style="top:${hour / 24 * 100}%">${String(hour).padStart(2, '0')}</span>`).join('')}</div>
      <div class="pattern-chart" style="--pattern-day-count:${days.length}" role="img" aria-label="Baby activity pattern chart">
        ${days.map(({ day, events }) => patternDayColumn(day, events || [], visibleTypes)).join('')}
      </div>
    </div>
    <div class="pattern-legend" aria-label="Pattern legend">
      ${patternEventTypes.map((item) => `<span><i class="pattern-swatch pattern-${item.type}"></i>${escapeHtml(item.label)}</span>`).join('')}
    </div>
    <section class="pattern-insights" aria-label="Interval insights">
      ${patternInsightCards(days).join('')}
    </section>
    <section class="pattern-statistics" aria-label="Baby pattern statistics">
      ${renderPatternStatistics(days, state.patternStatUnit)}
    </section>
  `;
  elements.babyPatterns.querySelectorAll('[data-pattern-type]').forEach((button) => {
    button.addEventListener('click', () => togglePatternType(button.dataset.patternType));
  });
  elements.babyPatterns.querySelector('#pattern-period-days')?.addEventListener('change', (event) => changePatternPeriod(event.target.value));
  elements.babyPatterns.querySelector('#pattern-stat-unit')?.addEventListener('change', (event) => changePatternStatUnit(event.target.value));
}

function patternPeriodOptions() {
  return [
    { days: 1, label: 'Day' },
    { days: 7, label: 'Week' },
    { days: 14, label: '2 weeks' },
    { days: 30, label: 'Month' },
  ];
}

function patternStatUnitOptions() {
  return [
    { value: 'day', label: 'Daily average' },
    { value: 'week', label: 'Weekly average' },
    { value: 'month', label: 'Monthly average' },
  ];
}

function patternPeriodLabel(days) {
  if (days === 1) return 'Daily';
  if (days === 7) return '7-day';
  if (days === 14) return '2-week';
  if (days >= 28) return 'Monthly';
  return `${days}-day`;
}

function changePatternPeriod(value) {
  const next = normalizePatternPeriodDays(value);
  if (next === state.patternPeriodDays) return;
  state.patternPeriodDays = next;
  localStorage.setItem(storageKeys.patternPeriodDays, String(next));
  seedSelectedDayPattern();
  loadBabyPatterns();
}

function changePatternStatUnit(value) {
  state.patternStatUnit = normalizePatternStatUnit(value);
  localStorage.setItem(storageKeys.patternStatUnit, state.patternStatUnit);
  renderBabyPatterns();
}

function visiblePatternEvents(days, visibleTypes = new Set(state.patternTypes)) {
  return days.flatMap(({ day, events }) => (events || [])
    .filter((event) => !event.hiddenFromTimeline && visibleTypes.has(event.type))
    .map((event) => ({ ...event, patternDay: day })));
}

function patternTypeToggle(item, active) {
  return `<button type="button" class="pattern-toggle${active ? ' active' : ''}" data-pattern-type="${escapeHtml(item.type)}" aria-pressed="${active}">${escapeHtml(item.label)}</button>`;
}

function togglePatternType(type) {
  const next = new Set(state.patternTypes);
  if (next.has(type) && next.size > 1) next.delete(type);
  else next.add(type);
  state.patternTypes = [...next].filter((item) => patternEventTypes.some((eventType) => eventType.type === item));
  localStorage.setItem(storageKeys.patternTypes, state.patternTypes.join(','));
  renderBabyPatterns();
}

function patternDayColumn(day, events, visibleTypes) {
  const markers = events
    .filter((event) => !event.hiddenFromTimeline && visibleTypes.has(event.type))
    .map((event) => patternMarker(day, event))
    .filter(Boolean)
    .join('');
  return `
    <article class="pattern-day" aria-label="${escapeHtml(dayHeading(day))}">
      <div class="pattern-day-lane">${markers}</div>
      <strong>${escapeHtml(patternDayName(day))}</strong>
      <span>${escapeHtml(shortDayLabel(day))}</span>
    </article>
  `;
}

function patternMarker(day, event) {
  const range = eventMinuteRange(day, event);
  if (!range) return '';
  const title = `${eventTitle(event)} · ${patternTimeRangeLabel(day, event, range)}`;
  const poop = event.type === 'diaper' && event.diaperKind?.value === 'dirty';
  const estimated = Object.values(event).some((value) => value?.source === 'inferred');
  const style = `top:${range.start / 1440 * 100}%;height:${Math.max(0.6, (range.end - range.start) / 1440 * 100)}%;`;
  return `<span class="pattern-marker pattern-${event.type}${poop ? ' pattern-poop' : ''}${estimated ? ' pattern-estimated' : ''}" style="${style}" title="${escapeHtml(title)}">${poop ? '💩' : ''}</span>`;
}

function eventMinuteRange(day, event) {
  const startValue = event.type === 'sleep' ? (event.startAt?.value || event.occurredAt?.value) : eventTimeValue(event);
  if (!startValue) return null;
  const dayStart = dateFromKey(day).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const startMs = new Date(startValue).getTime();
  if (!Number.isFinite(startMs)) return null;
  let endMs = startMs + 12 * 60 * 1000;
  if (event.type === 'sleep') {
    const explicitEnd = event.endAt?.value ? new Date(event.endAt.value).getTime() : NaN;
    const durationMs = Number(event.durationMinutes?.value) * 60 * 1000;
    if (Number.isFinite(explicitEnd)) endMs = explicitEnd;
    else if (Number.isFinite(durationMs) && durationMs > 0) endMs = startMs + durationMs;
    else endMs = startMs + 45 * 60 * 1000;
  }
  const clampedStart = Math.max(dayStart, startMs);
  const clampedEnd = Math.min(dayEnd, Math.max(endMs, startMs + 8 * 60 * 1000));
  if (clampedEnd <= dayStart || clampedStart >= dayEnd) return null;
  return {
    start: Math.max(0, Math.round((clampedStart - dayStart) / 60000)),
    end: Math.min(1440, Math.round((clampedEnd - dayStart) / 60000)),
  };
}

function patternTimeRangeLabel(day, event, range) {
  const start = minutesToClock(range.start);
  const end = minutesToClock(range.end);
  return event.type === 'sleep' ? `${start}–${end}` : start;
}

function patternInsightCards(days) {
  const events = days.flatMap(({ events = [] }) => events).filter((event) => !event.hiddenFromTimeline);
  const milkEvents = sortedEventsWithTime(events.filter((event) => event.type === 'feeding_milk'));
  const diaperEvents = sortedEventsWithTime(events.filter((event) => event.type === 'diaper'));
  const poopEvents = diaperEvents.filter((event) => event.diaperKind?.value === 'dirty');
  const sleepEvents = events.filter((event) => event.type === 'sleep' && Number(event.durationMinutes?.value) > 0 && !(event.action?.value === 'end' && event.linkedStartEventId));
  const inferredCount = events.reduce((sum, event) => sum + Object.values(event).filter((value) => value?.source === 'inferred').length, 0);
  return [
    insightCard('Milk interval', averageGapLabel(milkEvents), milkEvents.length ? `${milkEvents.length} feeds · last ${timeAgoLabel(eventTimeValue(milkEvents.at(-1)))}` : 'No milk logs in range'),
    insightCard('Sleep rhythm', averageSleepLabel(sleepEvents), sleepEvents.length ? `${sleepEvents.length} sessions · longest ${minutesLabel(Math.max(...sleepEvents.map((event) => Number(event.durationMinutes?.value || 0))))}` : 'No completed sleep logs'),
    insightCard('Diaper rhythm', averageGapLabel(diaperEvents), poopEvents.length ? `Last poop ${timeAgoLabel(eventTimeValue(poopEvents.at(-1)))}` : 'No poop logs in range'),
    insightCard('Data confidence', `${events.length} logs`, inferredCount ? `${inferredCount} estimated fields shown with soft edges` : 'No estimated fields in range'),
  ];
}

function insightCard(label, value, detail) {
  return `<article class="pattern-insight-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><p>${escapeHtml(detail)}</p></article>`;
}

function renderPatternStatistics(days, unit) {
  const buckets = patternStatisticBuckets(days, unit);
  const metrics = patternStatisticMetrics(days);
  const maxValue = Math.max(1, ...buckets.flatMap((bucket) => metrics.map((metric) => bucket[metric.key] || 0)));
  const unitName = { day: 'day', week: 'week', month: 'month' }[unit] || 'day';
  const average = (metric) => buckets.length ? metricsValueLabel(metric, buckets.reduce((sum, bucket) => sum + (bucket[metric.key] || 0), 0) / buckets.length) : 'No data';
  return `
    <div class="pattern-statistics-header">
      <div>
        <span class="eyebrow">Statistics</span>
        <h3>${escapeHtml(unitName[0].toUpperCase() + unitName.slice(1))} comparison</h3>
        <p>Compare ${escapeHtml(unitName)} averages across the selected history.</p>
      </div>
      <div class="pattern-stat-averages">
        ${metrics.map((metric) => `<span><strong>${escapeHtml(average(metric))}</strong>${escapeHtml(metric.label)} avg</span>`).join('')}
      </div>
    </div>
    <div class="pattern-stat-chart" role="img" aria-label="${escapeHtml(unitName)} baby statistics comparison chart">
      ${buckets.map((bucket) => patternStatisticBucket(bucket, metrics, maxValue)).join('') || '<p class="empty">No logs to chart yet.</p>'}
    </div>
  `;
}

function patternStatisticMetrics(days) {
  const events = days.flatMap(({ events = [] }) => events).filter((event) => !event.hiddenFromTimeline);
  return [
    { key: 'logs', label: 'Logs', value: (bucketEvents) => bucketEvents.length, format: (value) => String(Math.round(value)) },
    { key: 'milk', label: 'Milk', value: (bucketEvents) => bucketEvents.filter((event) => event.type === 'feeding_milk').reduce((sum, event) => sum + Number(event.amountMl?.value || 0), 0), format: (value) => `${Math.round(value)} ml` },
    { key: 'sleep', label: 'Sleep', value: (bucketEvents) => bucketEvents.filter((event) => event.type === 'sleep').reduce((sum, event) => sum + Number(event.durationMinutes?.value || 0), 0), format: (value) => minutesLabel(Math.round(value)) },
    { key: 'diapers', label: 'Diapers', value: (bucketEvents) => bucketEvents.filter((event) => event.type === 'diaper').length, format: (value) => String(Math.round(value)) },
  ].filter((metric) => metric.key === 'logs' || events.some((event) => metric.value([event]) > 0));
}

function patternStatisticBuckets(days, unit) {
  const buckets = new Map();
  const metrics = patternStatisticMetrics(days);
  days.forEach(({ day, events = [] }) => {
    const key = patternBucketKey(day, unit);
    if (!buckets.has(key)) buckets.set(key, { key, label: patternBucketLabel(day, unit), events: [] });
    buckets.get(key).events.push(...events.filter((event) => !event.hiddenFromTimeline));
  });
  return [...buckets.values()].map((bucket) => {
    metrics.forEach((metric) => { bucket[metric.key] = metric.value(bucket.events); });
    return bucket;
  });
}

function patternStatisticBucket(bucket, metrics, maxValue) {
  return `
    <article class="pattern-stat-bucket">
      <strong>${escapeHtml(bucket.label)}</strong>
      <div class="pattern-stat-bars">
        ${metrics.map((metric) => {
          const value = bucket[metric.key] || 0;
          const width = Math.max(value ? 4 : 0, (value / maxValue) * 100);
          return `<div class="pattern-stat-row pattern-stat-${metric.key}"><span>${escapeHtml(metric.label)}</span><div class="pattern-stat-track"><i style="width:${width}%"></i></div><em>${escapeHtml(metricsValueLabel(metric, value))}</em></div>`;
        }).join('')}
      </div>
    </article>
  `;
}

function metricsValueLabel(metric, value) {
  return metric.format ? metric.format(value) : String(Math.round(value));
}

function patternBucketKey(day, unit) {
  const date = dateFromKey(day);
  if (unit === 'month') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  if (unit === 'week') {
    const start = weekStartDate(date);
    return localDateKey(start);
  }
  return day;
}

function patternBucketLabel(day, unit) {
  const date = dateFromKey(day);
  if (unit === 'month') return new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' }).format(date);
  if (unit === 'week') return `Week of ${shortDayLabel(localDateKey(weekStartDate(date)))}`;
  return shortDayLabel(day);
}

function weekStartDate(date) {
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  return start;
}

function sortedEventsWithTime(events) {
  return [...events]
    .filter((event) => eventTimeValue(event))
    .sort((left, right) => timestamp(eventTimeValue(left)) - timestamp(eventTimeValue(right)));
}

function averageGapLabel(events) {
  if (events.length < 2) return 'Need 2+ logs';
  const gaps = [];
  for (let index = 1; index < events.length; index += 1) {
    const gap = Math.round((timestamp(eventTimeValue(events[index])) - timestamp(eventTimeValue(events[index - 1]))) / 60000);
    if (gap > 0 && gap < 36 * 60) gaps.push(gap);
  }
  if (!gaps.length) return 'Need 2+ logs';
  return `${minutesLabel(Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length))} avg`;
}

function averageSleepLabel(events) {
  if (!events.length) return 'Need sleep logs';
  const minutes = events.map((event) => Number(event.durationMinutes?.value || 0)).filter((value) => value > 0);
  if (!minutes.length) return 'Need sleep logs';
  return `${minutesLabel(Math.round(minutes.reduce((sum, value) => sum + value, 0) / minutes.length))} avg`;
}

function minutesLabel(minutes) {
  const safe = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

function timeAgoLabel(value) {
  if (!value) return 'unknown';
  return `${minutesLabel(Math.round(Math.max(0, Date.now() - timestamp(value)) / 60000))} ago`;
}

function patternDayKeys(endDay, count = 7) {
  const end = dateFromKey(endDay || localDateKey(new Date()));
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end);
    date.setDate(end.getDate() - (count - index - 1));
    return localDateKey(date);
  });
}

function patternDayName(day) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(dateFromKey(day));
}

function shortDayLabel(day) {
  if (!day) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(dateFromKey(day));
}

function minutesToClock(minutes) {
  const safe = Math.max(0, Math.min(1440, Number(minutes) || 0));
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function buildClientTodayContext(events = []) {
  const visible = events.filter((event) => !event.hiddenFromTimeline);
  const now = new Date();
  const lastMilk = latestClientEvent(visible.filter((event) => event.type === 'feeding_milk'));
  const lastDiaper = latestClientEvent(visible.filter((event) => event.type === 'diaper'));
  const openSleep = currentOpenSleep();
  const lastSleep = latestClientEvent(visible.filter((event) => event.type === 'sleep' && event.status === 'completed' && !(event.action?.value === 'end' && event.linkedStartEventId)), (event) => event.endAt?.value || event.startAt?.value);
  return {
    lastMilk: lastMilk ? clientContextItem(lastMilk, now) : null,
    lastDiaper: lastDiaper ? { ...clientContextItem(lastDiaper, now), diaperKind: lastDiaper.diaperKind?.value || 'wet_or_unspecified' } : null,
    sleep: openSleep ? { state: 'ongoing', label: `${durationLabel(minutesSince(openSleep.startAt?.value, now))} sleeping` }
      : lastSleep ? { state: 'completed', label: `Woke ${durationLabel(minutesSince(lastSleep.endAt?.value || lastSleep.startAt?.value, now))} ago` }
        : null,
    inferredFieldCount: visible.reduce((sum, event) => sum + Object.values(event).filter((value) => value?.source === 'inferred').length, 0),
    correctedFieldCount: visible.reduce((sum, event) => sum + Object.values(event).filter((value) => value?.source === 'user_corrected').length, 0),
  };
}

function latestClientEvent(events, getValue = eventTimeValue) {
  return [...events].filter((event) => getValue(event)).sort((a, b) => timestamp(getValue(b)) - timestamp(getValue(a)))[0] || null;
}

function clientContextItem(event, now) {
  return { eventId: event.id, label: `${durationLabel(minutesSince(eventTimeValue(event), now))} ago`, amountMl: event.amountMl?.value ?? null };
}

function minutesSince(value, now) {
  if (!value) return 0;
  return Math.max(0, Math.round((new Date(now) - new Date(value)) / 60000));
}

function durationLabel(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

function summaryItem(label, value, accentColor = '') {
  const item = document.createElement('div');
  item.className = 'summary-item';
  if (accentColor) item.style.setProperty('--tracker-accent', accentColor);
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
  const datasets = growthChartDatasets(chartRecords);
  if (!datasets.length) {
    destroyGrowthChart();
    return '<section class="growth-chart-card"><p class="empty">Add at least two dated growth records to draw a trend chart.</p></section>';
  }
  const firstLabel = growthRecordDateLabel(chartRecords[0]);
  const lastLabel = growthRecordDateLabel(chartRecords[chartRecords.length - 1]);
  window.setTimeout(() => renderGrowthChartInstance(chartRecords, datasets), 0);
  return `
    <section class="growth-chart-card" aria-label="Growth trend chart">
      <div class="growth-chart-copy">
        <strong>Growth trend</strong>
        <span>${escapeHtml(firstLabel)} → ${escapeHtml(lastLabel)}</span>
      </div>
      <div class="growth-chart-shell">
        <canvas id="growth-trend-chart" class="growth-chart" role="img" aria-label="Growth measurements over time with dates on the x-axis and measured units on the y-axis"></canvas>
      </div>
      <p class="growth-chart-axis-note">X-axis shows record dates. Y-axis shows each measurement in its own unit: cm for height/head and grams for weight.</p>
    </section>
  `;
}

function growthChartDatasets(records) {
  return [
    { key: 'heightCm', label: 'Height (cm)', unit: 'cm', color: '#2997ff', axisID: 'cm' },
    { key: 'headCm', label: 'Head (cm)', unit: 'cm', color: '#0066cc', axisID: 'cm' },
    { key: 'weightG', label: 'Weight (g)', unit: 'g', color: '#7a7a7a', axisID: 'g' },
  ].map((metric) => ({
    ...metric,
    data: records.map((record) => record[metric.key] == null ? null : Number(record[metric.key])),
  })).filter((metric) => metric.data.filter((value) => Number.isFinite(value)).length >= 2);
}

function renderGrowthChartInstance(records, datasets) {
  const canvas = document.getElementById('growth-trend-chart');
  const ChartCtor = window.Chart;
  if (!canvas || !ChartCtor) return;
  destroyGrowthChart();
  growthChartInstance = new ChartCtor(canvas, {
    type: 'line',
    data: {
      labels: records.map(growthRecordDateLabel),
      datasets: datasets.map((metric) => ({
        label: metric.label,
        data: metric.data,
        borderColor: metric.color,
        backgroundColor: metric.color,
        yAxisID: metric.axisID,
        spanGaps: true,
        tension: 0.28,
        pointRadius: 4,
        pointHoverRadius: 5,
        borderWidth: 2,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, color: '#1d1d1f' } },
        tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${context.parsed.y}` } },
      },
      scales: {
        x: { title: { display: true, text: 'Record date' }, grid: { color: '#f0f0f0' } },
        cm: { type: 'linear', position: 'left', title: { display: true, text: 'Centimeters' }, grid: { color: '#f0f0f0' } },
        g: { type: 'linear', position: 'right', title: { display: true, text: 'Grams' }, grid: { drawOnChartArea: false } },
      },
    },
  });
}

function destroyGrowthChart() {
  if (!growthChartInstance) return;
  growthChartInstance.destroy();
  growthChartInstance = null;
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

function currentOpenSleep() {
  return [...state.events].reverse().find((event) => (
    event.type === 'sleep' && event.action?.value === 'start' && event.status !== 'completed' && !event.endAt?.value
  ));
}



async function undoActionLog(entry) {
  if (!entry?.id || !entry.canUndo) return;
  const ok = await openFloatingAction({
    kicker: 'Action log',
    title: 'Undo this action?',
    description: entry.message || entry.action,
    confirmLabel: 'Undo',
  });
  if (!ok) return;
  const response = await fetch(`/api/action-logs/${encodeURIComponent(entry.id)}/undo`, { method: 'POST' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    elements.answer.textContent = payload.error || copy.saveFailed;
    return;
  }
  if (entry.module === 'task') await loadTaskData();
  else await loadToday();
}

function renderActionLog(container, entries, emptyText = 'No actions yet.') {
  if (!container) return;
  if (!entries.length) {
    container.innerHTML = `<p class="empty">${escapeHtml(emptyText)}</p>`;
    return;
  }
  container.replaceChildren(...entries.map((entry) => {
    const node = document.createElement('article');
    node.className = `overview-item action-log-entry ${entry.undoneAt ? 'undone' : ''}`;
    const actor = entry.actorName || entry.actorId || 'Family member';
    const detail = document.createElement('div');
    const status = entry.undoneAt ? ` · undone ${relativeDateTime(entry.undoneAt)}` : '';
    detail.innerHTML = `<strong>${escapeHtml(actor)}</strong><span>${escapeHtml(entry.message || entry.action)} · ${escapeHtml(relativeDateTime(entry.createdAt))}${escapeHtml(status)}</span>`;
    if (entry.canUndo) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'compact-button';
      button.textContent = 'Undo';
      button.addEventListener('click', () => undoActionLog(entry));
      node.replaceChildren(detail, button);
    } else {
      node.replaceChildren(detail);
    }
    return node;
  }));
}

function renderSleepStatus() {
  const openSleep = currentOpenSleep();
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
  wakeButton.className = 'sleep-status-action';
  wakeButton.innerHTML = `${actionIcon('wake')}<span>Wake</span>`;
  wakeButton.addEventListener('click', () => saveLog('woke up', { parserMode: 'heuristic', inputSource: 'button' }));
  elements.sleepStatus.replaceChildren(copyEl, wakeButton);
}


function actionIcon(name) {
  const paths = {
    edit: '<path d="M4 15.5V20h4.5L18.9 9.6l-4.5-4.5L4 15.5Z"/><path d="m13.2 6.3 4.5 4.5"/>',
    delete: '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
    like: '<path d="M7 11v9"/><path d="M3 11h4v9H3z"/><path d="M7 11l4-7a2 2 0 0 1 3 2v3h5a2 2 0 0 1 2 2l-2 7a2 2 0 0 1-2 2H7"/>',
    save: '<path d="M5 5a2 2 0 0 1 2-2h8l4 4v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5Z"/><path d="M8 21v-7h8v7"/><path d="M8 3v5h7"/>',
    breakfast: '<path d="M4 11h16"/><path d="M6 11a6 6 0 0 1 12 0"/><path d="M8 15h8"/><path d="M10 19h4"/><path d="M12 3v2"/>',
    lunch: '<path d="M5 4v8"/><path d="M9 4v8"/><path d="M7 4v17"/><path d="M15 4v17"/><path d="M15 4c3 2 4 6 1 9"/>',
    dinner: '<path d="M4 12a8 8 0 0 1 16 0"/><path d="M3 12h18"/><path d="M5 16h14"/><path d="M8 20h8"/>',
    formula: '<path d="M10 3h4"/><path d="M11 3v3l-3 3v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9l-3-3V3"/><path d="M9 13h6"/><path d="M9 17h6"/>',
    breast: '<path d="M12 4c3.2 2 5 4.7 5 8a5 5 0 0 1-10 0c0-3.3 1.8-6 5-8Z"/><path d="M9.8 13.2a2.2 2.2 0 0 0 4.4 0"/>',
    sleep: '<path d="M20 14.5A7.5 7.5 0 0 1 9.5 4 7.5 7.5 0 1 0 20 14.5Z"/><path d="M15 4h5l-5 5h5"/>',
    wake: '<path d="M12 5V3"/><path d="M12 21v-2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M3 12h2"/><path d="M19 12h2"/><path d="m4.9 19.1 1.4-1.4"/><path d="m17.7 6.3 1.4-1.4"/><path d="M8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z"/>',
    dirty: '<path d="M7 10c0-3 2-5 5-5s5 2 5 5v7a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-7Z"/><path d="M9.5 13h.01"/><path d="M14.5 13h.01"/><path d="M10 16h4"/>',
    wet: '<path d="M12 3s5 5.2 5 9a5 5 0 0 1-10 0c0-3.8 5-9 5-9Z"/><path d="M10 14a2 2 0 0 0 4 0"/>',
    solids: '<path d="M5 4v8"/><path d="M9 4v8"/><path d="M7 4v17"/><path d="M15 4v17"/><path d="M15 4c3 2 4 6 1 9"/>',
    note: '<path d="M6 4h9l3 3v13H6Z"/><path d="M14 4v4h4"/><path d="M9 13h6"/><path d="M9 17h4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    moment: '<path d="M12 4.5 14.2 9l5 .7-3.6 3.5.9 5-4.5-2.3-4.5 2.3.9-5L4.8 9.7l5-.7Z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    reopen: '<path d="M3 12a9 9 0 0 1 15.5-6.2"/><path d="M18.5 5.8V2.5"/><path d="M18.5 5.8h-3.3"/><path d="M21 12a9 9 0 0 1-15.5 6.2"/><path d="M5.5 18.2v3.3"/><path d="M5.5 18.2h3.3"/>',
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
  const swipeId = `swipe-${swipeState.nextId += 1}`;
  shell.className = `swipe-item ${className}`.trim();
  shell.tabIndex = 0;
  shell.setAttribute('aria-label', 'Swipe left to reveal actions');

  const rail = document.createElement('div');
  rail.className = 'swipe-actions';
  rail.setAttribute('aria-hidden', 'true');
  rail.replaceChildren(...actions);

  content.classList.add('swipe-card');
  content.dataset.swipeId = swipeId;
  shell.replaceChildren(rail, content);

  const actionWidth = () => Math.max(88, actions.length * 76, rail.getBoundingClientRect().width || 0);
  const markOpen = (isOpen) => {
    shell.classList.toggle('is-open', isOpen);
    rail.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    if (isOpen) {
      if (swipeState.openItem && swipeState.openItem !== shell) closeSwipeItem(swipeState.openItem);
      swipeState.openItem = shell;
    } else if (swipeState.openItem === shell) {
      swipeState.openItem = null;
    }
  };

  let swipeInstance = null;
  const ensureSwipe = () => {
    if (swipeInstance || typeof window.Swiped?.init !== 'function' || !document.documentElement.contains(content)) {
      return swipeInstance;
    }
    const width = actionWidth();
    swipeInstance = window.Swiped.init({
      query: `[data-swipe-id="${swipeId}"]`,
      right: width,
      tolerance: Math.max(32, Math.round(width * 0.38)),
      duration: 180,
      onOpen() {
        markOpen(true);
      },
      onClose() {
        markOpen(false);
      },
    });
    return swipeInstance;
  };
  queueMicrotask(ensureSwipe);

  const moveCard = (offset, duration = 180) => {
    content.style.transition = `transform ${duration}ms ease`;
    content.style.transform = `translate3d(${offset}px, 0px, 0px)`;
  };

  const openWithFallback = () => {
    const width = actionWidth();
    moveCard(-width);
    markOpen(true);
  };

  const openWithSwiped = () => {
    const swipe = ensureSwipe();
    if (!swipe) {
      openWithFallback();
      return;
    }
    swipe.dir = -1;
    swipe.width = actionWidth();
    swipe.right = swipe.width;
    swipe.open(true);
    markOpen(true);
  };

  const closeWithFallback = () => {
    moveCard(0);
    markOpen(false);
  };

  shell.__closeSwipe = () => {
    const swipe = ensureSwipe();
    if (swipe) swipe.close(true);
    else closeWithFallback();
    markOpen(false);
  };

  let pointerDrag = null;
  let suppressClickAfterDrag = false;
  const pointerThreshold = 10;
  const isDesktopPointer = (event) => !event.pointerType || event.pointerType === 'mouse' || event.pointerType === 'pen';

  content.addEventListener('pointerdown', (event) => {
    if (!isDesktopPointer(event) || event.button !== 0) return;
    pointerDrag = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      active: false,
      wasOpen: shell.classList.contains('is-open'),
      width: actionWidth(),
    };
    content.setPointerCapture?.(event.pointerId);
  });

  content.addEventListener('pointermove', (event) => {
    if (!pointerDrag || event.pointerId !== pointerDrag.id) return;
    const deltaX = event.clientX - pointerDrag.startX;
    const deltaY = event.clientY - pointerDrag.startY;
    pointerDrag.lastX = event.clientX;
    if (!pointerDrag.active) {
      if (Math.abs(deltaX) < pointerThreshold || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return;
      pointerDrag.active = true;
      content.style.transition = 'none';
    }
    event.preventDefault();
    const baseOffset = pointerDrag.wasOpen ? -pointerDrag.width : 0;
    const nextOffset = Math.max(-pointerDrag.width, Math.min(0, baseOffset + deltaX));
    moveCard(nextOffset, 0);
  });

  const finishPointerDrag = (event) => {
    if (!pointerDrag || event.pointerId !== pointerDrag.id) return;
    const deltaX = event.clientX - pointerDrag.startX;
    const shouldSettleOpen = pointerDrag.wasOpen
      ? deltaX > pointerDrag.width * 0.35
        ? false
        : true
      : deltaX < -Math.max(36, pointerDrag.width * 0.28);
    const didDrag = pointerDrag.active;
    pointerDrag = null;
    content.releasePointerCapture?.(event.pointerId);
    if (!didDrag) return;
    suppressClickAfterDrag = true;
    window.setTimeout(() => { suppressClickAfterDrag = false; }, 0);
    if (shouldSettleOpen) openWithFallback();
    else closeWithFallback();
  };

  content.addEventListener('pointerup', finishPointerDrag);
  content.addEventListener('pointercancel', finishPointerDrag);
  content.addEventListener('click', (event) => {
    if (!suppressClickAfterDrag) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  content.addEventListener('wheel', (event) => {
    if (Math.abs(event.deltaX) <= Math.max(24, Math.abs(event.deltaY) * 1.2)) return;
    event.preventDefault();
    if (event.deltaX > 0) openWithSwiped();
    else closeSwipeItem(shell);
  }, { passive: false });

  shell.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      openWithSwiped();
    } else if (event.key === 'ArrowRight' || event.key === 'Escape') {
      event.preventDefault();
      closeSwipeItem(shell);
      if (event.key === 'Escape') closeTimelineDetail();
    }
  });

  return shell;
}

function closeSwipeItem(item) {
  item?.__closeSwipe?.();
}

function renderTimeline() {
  const visible = state.events.filter((event) => !event.hiddenFromTimeline);
  const filtered = sortedTimelineEvents(visible).filter((event) => (
    state.timelineFilter === 'all' || event.type === state.timelineFilter
  ));
  elements.eventCount.textContent = `${filtered.length} of ${visible.length} items`;
  if (!visible.length) {
    elements.timeline.innerHTML = `<p class="empty">${copy.emptyTimeline}</p>`;
    return;
  }
  if (!filtered.length) {
    elements.timeline.innerHTML = `<p class="empty">${copy.emptyFilteredTimeline}</p>`;
    return;
  }
  elements.timeline.replaceChildren(...filtered.map(renderEvent));
}

function renderTimelineControls() {
  if (elements.timelineSort) elements.timelineSort.value = state.timelineSort;
  if (elements.timelineFilter) {
    Array.from(elements.timelineFilter.options).forEach((option) => {
      option.hidden = option.value !== 'all' && !isBabyTrackerActive(option.value);
      option.disabled = option.hidden;
    });
    if (!state.activeBabyTrackers.includes(state.timelineFilter)) state.timelineFilter = 'all';
    elements.timelineFilter.value = state.timelineFilter;
  }
}

function sortedTimelineEvents(events) {
  return [...events].sort((left, right) => {
    const direction = state.timelineSort === 'desc' ? -1 : 1;
    return direction * compareTimelineEvents(left, right);
  });
}

function compareTimelineEvents(left, right) {
  const timeDiff = timelineEventTimestamp(left) - timelineEventTimestamp(right);
  if (timeDiff) return timeDiff;
  const createdDiff = timestamp(left.createdAt) - timestamp(right.createdAt);
  if (createdDiff) return createdDiff;
  return String(left.id || '').localeCompare(String(right.id || ''));
}

function timelineEventTimestamp(event) {
  return timestamp(eventTimeValue(event)) || timestamp(event.createdAt);
}

function eventTimeValue(event) {
  if (event.type === 'sleep') return event.startAt?.value || event.occurredAt?.value || event.endAt?.value;
  return event.occurredAt?.value || event.startAt?.value || event.endAt?.value;
}

function timestamp(value) {
  if (!value) return 0;
  const date = new Date(value);
  const numeric = date.getTime();
  return Number.isNaN(numeric) ? 0 : numeric;
}

function renderEvent(event) {
  const item = document.createElement('article');
  item.className = 'timeline-item';
  item.style.setProperty('--event-accent', colorForBabyEventType(event.type));

  const title = document.createElement('div');
  title.className = 'timeline-title';
  const titleText = document.createElement('span');
  titleText.textContent = eventTitle(event);
  title.replaceChildren(titleText);

  const meta = document.createElement('div');
  meta.className = 'timeline-meta';
  meta.textContent = eventMeta(event);
  const raw = document.createElement('p');
  raw.className = 'raw-text';
  raw.textContent = event.rawText;
  const main = document.createElement('div');
  main.className = 'timeline-main';
  main.replaceChildren(meta, raw);
  if (event.type === 'milestone') item.classList.add('moment-timeline-item');

  const badges = document.createElement('div');
  badges.className = 'badges';
  badges.replaceChildren(parserBadge(event), ...inferredBadges(event));

  const detailButton = document.createElement('button');
  detailButton.type = 'button';
  detailButton.className = 'timeline-detail-button';
  detailButton.setAttribute('aria-label', `Show details for ${eventTitle(event)}`);
  detailButton.innerHTML = actionIcon('info');
  const detailPanel = document.createElement('div');
  detailPanel.className = 'timeline-detail-popover';
  detailPanel.hidden = true;
  detailPanel.innerHTML = timelineDetailMarkup(event);
  detailButton.addEventListener('click', (clickEvent) => {
    clickEvent.stopPropagation();
    toggleTimelineDetail(detailPanel, detailButton);
  });

  const actions = document.createElement('div');
  actions.className = 'timeline-row-actions';
  actions.replaceChildren(badges, detailButton, detailPanel);

  item.replaceChildren(title, main, actions);
  const rowActions = event.type === 'milestone'
    ? [makeSwipeAction({ label: 'Delete', icon: 'delete', tone: 'danger', onClick: () => deleteBabyLog(event) })]
    : [
      makeSwipeAction({ label: 'Edit', icon: 'edit', onClick: () => editBabyLog(event) }),
      makeSwipeAction({ label: 'Delete', icon: 'delete', tone: 'danger', onClick: () => deleteBabyLog(event) }),
    ];
  return makeSwipeItem(item, rowActions, 'timeline-swipe');
}

function timelineDetailMarkup(event) {
  const details = [
    ['Original text', event.rawText || 'Not recorded'],
    ['Recorded time', eventMeta(event)],
  ];
  if (event.type === 'milestone') {
    details.push(['Moment note', event.note || 'No note']);
    details.push(['Attachments', `${(event.attachments || []).length} item(s)`]);
  }
  if (event.amountMl?.value != null) details.push(['Milk amount', `${event.amountMl.value}ml`]);
  if (event.durationMinutes?.value != null) details.push(['Sleep duration', durationLabel(Number(event.durationMinutes.value) || 0)]);
  if (event.diaperKind?.value) details.push(['Diaper type', event.diaperKind.value]);
  return `<strong>Record details</strong>${details.map(([label, value]) => `<p><span>${escapeHtml(label)}</span>${escapeHtml(String(value))}</p>`).join('')}`;
}

function toggleTimelineDetail(panel, button) {
  if (openTimelineDetail && openTimelineDetail !== panel) closeTimelineDetail();
  const nextOpen = panel.hidden;
  panel.hidden = !nextOpen;
  button.setAttribute('aria-expanded', String(nextOpen));
  panel.closest('.timeline-item')?.classList.toggle('detail-open', nextOpen);
  panel.closest('.timeline-swipe')?.classList.toggle('detail-open', nextOpen);
  openTimelineDetail = nextOpen ? panel : null;
}

function closeTimelineDetail() {
  if (!openTimelineDetail) return;
  const panel = openTimelineDetail;
  panel.hidden = true;
  panel.closest('.timeline-item')?.classList.remove('detail-open');
  panel.closest('.timeline-swipe')?.classList.remove('detail-open');
  panel.parentElement?.querySelector('.timeline-detail-button')?.setAttribute('aria-expanded', 'false');
  openTimelineDetail = null;
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


function renderHomeDashboard() {
  if (!elements.homeSummaryGrid) return;
  const visibleBabyEvents = state.events.filter((event) => !event.hiddenFromTimeline);
  const openTasks = state.tasks.filter((task) => task.status !== 'done');
  const completedTasks = state.tasks.filter((task) => task.status === 'done');
  const urgentTasks = homeUrgentTasks(openTasks);
  const mealStatus = homeMealStatus();
  const unplannedMeals = mealStatus.filter((slot) => !slot.items.length);
  const attentionItems = [
    ...urgentTasks.slice(0, 2).map((task) => ({ label: task.dueMode === 'before_date' ? 'Overdue task' : 'Task due', text: task.title })),
    ...unplannedMeals.slice(0, Math.max(0, 3 - Math.min(urgentTasks.length, 2))).map((slot) => ({ label: 'Meal open', text: `${slot.label} not planned` })),
  ].slice(0, 3);

  if (elements.homeDayLabel) elements.homeDayLabel.textContent = dayHeading(state.selectedDay);
  if (elements.homeDeck) {
    elements.homeDeck.textContent = `${visibleBabyEvents.length} baby logs · ${completedTasks.length} tasks done · ${plannedMealCount(mealStatus)} meals planned`;
  }
  if (elements.homeAttentionCount) {
    elements.homeAttentionCount.textContent = attentionItems.length === 1 ? '1 item' : `${attentionItems.length} items`;
  }
  if (elements.homeAttentionStrip) {
    elements.homeAttentionStrip.innerHTML = attentionItems.length
      ? attentionItems.map((item) => `<span class="attention-pill"><strong>${escapeHtml(item.label)}</strong>${escapeHtml(item.text)}</span>`).join('')
      : '<span class="attention-pill calm"><strong>All clear</strong>Nothing urgent for this day</span>';
  }

  elements.homeSummaryGrid.innerHTML = [
    homeBabyCard(visibleBabyEvents),
    homeTaskCard(urgentTasks, completedTasks),
    homeMealCard(mealStatus),
  ].join('');
}

function homeBabyCard(events) {
  const latest = latestClientEvent(events);
  const timelineItems = homeBabyTimelineItems(events);
  const visibleItems = timelineItems.slice(0, HOME_BABY_MARKER_LIMIT);
  const markers = visibleItems.map((item, index) => (item.events
    ? homeBabyClusterMarker(item, index)
    : homeTimelineMarker({
      className: `home-marker baby-marker marker-${item.event.type}`,
      value: eventTimeValue(item.event),
      index,
      label: `${eventTitle(item.event)} · ${eventMeta(item.event)}`,
      icon: babyEventIcon(item.event),
    }))).join('');
  const hiddenEventCount = timelineItems.slice(HOME_BABY_MARKER_LIMIT).reduce((sum, item) => sum + (item.events?.length || 1), 0);
  const overflow = hiddenEventCount ? `<span class="home-marker-overflow">+${hiddenEventCount}</span>` : '';
  return `
    <article class="home-card home-card-baby">
      <header class="home-card-header">
        <div><p class="eyebrow">Baby today</p><h3>${events.length} logs</h3></div>
        <a class="home-card-link" href="/baby?day=${encodeURIComponent(state.selectedDay)}">View Baby →</a>
      </header>
      <p class="home-card-copy">${latest ? `Last: ${escapeHtml(eventTitle(latest))} at ${escapeHtml(timeLabel({ value: eventTimeValue(latest) }))}` : 'No baby logs yet.'}</p>
      <div class="home-timeline" aria-label="Baby event timeline">
        ${homeTimelineTicks()}
        <div class="home-timeline-rail">${markers}${overflow}${homeNowMarker()}</div>
      </div>
    </article>`;
}

function homeBabyTimelineItems(events) {
  const chronologicalEvents = [...events].sort(compareTimelineEvents);
  const clusters = [];
  chronologicalEvents.forEach((event) => {
    const eventTimestamp = timelineEventTimestamp(event);
    const lastCluster = clusters.at(-1);
    if (lastCluster && eventTimestamp - lastCluster.lastTimestamp <= HOME_BABY_CLUSTER_WINDOW_MINUTES * 60000) {
      lastCluster.events.push(event);
      lastCluster.lastTimestamp = eventTimestamp;
      return;
    }
    clusters.push({ events: [event], firstTimestamp: eventTimestamp, lastTimestamp: eventTimestamp });
  });
  return clusters.map((cluster) => (cluster.events.length === 1
    ? { event: cluster.events[0] }
    : cluster));
}

function homeBabyClusterMarker(cluster, index) {
  const firstEvent = cluster.events[0];
  const icons = cluster.events.slice(0, HOME_BABY_CLUSTER_ICON_LIMIT).map((event) => (
    `<span class="home-cluster-icon marker-${escapeHtml(event.type)}">${babyEventIcon(event)}</span>`
  )).join('');
  const extra = cluster.events.length > HOME_BABY_CLUSTER_ICON_LIMIT
    ? `<span class="home-cluster-more">+${cluster.events.length - HOME_BABY_CLUSTER_ICON_LIMIT}</span>`
    : '';
  const labels = cluster.events.slice(0, 6).map((event) => `${eventTitle(event)} ${timeLabel({ value: eventTimeValue(event) })}`);
  const moreLabel = cluster.events.length > 6 ? ` · +${cluster.events.length - 6} more` : '';
  return homeTimelineMarker({
    className: 'home-marker baby-marker baby-cluster-marker',
    value: eventTimeValue(firstEvent),
    index,
    label: `${cluster.events.length} logs near ${timeLabel({ value: eventTimeValue(firstEvent) })} · ${labels.join(' · ')}${moreLabel}`,
    icon: `<span class="home-cluster-icons">${icons}${extra}</span>`,
  });
}

function homeTaskCard(urgentTasks, completedTasks) {
  const duePills = urgentTasks.slice(0, 3).map((task) => homeTooltipButton({
    className: `task-due-pill ${task.dueMode === 'before_date' ? 'overdue' : ''}`,
    label: `${task.dueMode === 'before_date' ? 'Overdue' : 'Due today'} · ${task.title} · ${task.assigneeName || 'Unassigned'}`,
    content: `<strong>${task.dueMode === 'before_date' ? 'Overdue' : 'Today'}</strong>${escapeHtml(task.title)}`,
  })).join('');
  const more = urgentTasks.length > 3 ? `<span class="task-due-pill muted">+${urgentTasks.length - 3} more</span>` : '';
  const doneMarkers = completedTasks.slice(0, 10).map((task, index) => homeTimelineMarker({
    className: 'home-marker task-marker',
    value: task.completedAt || task.updatedAt || task.createdAt,
    index,
    label: `${task.title} · ${task.assigneeName || 'Unassigned'}`,
    icon: '✓',
  })).join('');
  return `
    <article class="home-card home-card-task">
      <header class="home-card-header">
        <div><p class="eyebrow">Tasks today</p><h3>${completedTasks.length} done · ${urgentTasks.length} due</h3></div>
        <a class="home-card-link" href="/tasks?day=${encodeURIComponent(state.selectedDay)}">View Tasks →</a>
      </header>
      <div class="home-due-row">${duePills || '<span class="home-empty-inline">No open tasks due today.</span>'}${more}</div>
      <div class="home-timeline compact" aria-label="Completed task timeline">
        ${homeTimelineTicks()}
        <div class="home-timeline-rail">${doneMarkers}${homeNowMarker()}</div>
      </div>
    </article>`;
}

function homeMealCard(slots) {
  return `
    <article class="home-card home-card-meal">
      <header class="home-card-header">
        <div><p class="eyebrow">Meals today</p><h3>${plannedMealCount(slots)} of 3 planned</h3></div>
        <a class="home-card-link" href="/meals?day=${encodeURIComponent(state.selectedDay)}">View Meals →</a>
      </header>
      <div class="home-meal-dots">
        ${slots.map((slot) => {
          const item = slot.items[0];
          const label = `${slot.label} · ${item?.name || 'Not planned'}`;
          return homeTooltipButton({
            className: `home-meal-dot-item ${item ? 'planned' : ''}`,
            label,
            content: `<span class="home-meal-dot" style="--meal-dot-color:${escapeHtml(slot.color)}"></span><strong>${escapeHtml(slot.label)}</strong><small>${escapeHtml(item?.name || 'Not planned')}</small>`,
          });
        }).join('')}
      </div>
    </article>`;
}

function homeUrgentTasks(tasks) {
  const today = state.selectedDay;
  return [...tasks].filter((task) => {
    if (task.dueMode === 'asap') return true;
    if (task.dueMode === 'someday') return false;
    if (!task.dueDate) return false;
    if (task.dueMode === 'before_date') return task.dueDate <= today;
    return task.dueDate === today;
  }).sort((left, right) => {
    const priority = (task) => task.dueMode === 'before_date' ? 0 : task.dueMode === 'asap' ? 1 : 2;
    return priority(left) - priority(right) || String(left.dueDate || '').localeCompare(String(right.dueDate || '')) || String(left.title || '').localeCompare(String(right.title || ''));
  });
}

function homeMealStatus() {
  const plan = planForDay();
  return [
    { key: 'breakfast', label: 'Breakfast', color: mealSlotColors.breakfast, items: plan.breakfast || [] },
    { key: 'lunch', label: 'Lunch', color: mealSlotColors.lunch, items: plan.lunch || [] },
    { key: 'dinner', label: 'Dinner', color: mealSlotColors.dinner, items: plan.dinner || [] },
  ];
}

function plannedMealCount(slots) {
  return slots.filter((slot) => slot.items.length).length;
}

function homeTimelineTicks() {
  return '<div class="home-timeline-ticks"><span>00</span><span>06</span><span>12</span><span>18</span><span>Now</span></div>';
}

function homeTimelineMarker({ className, value, index = 0, label, icon }) {
  const left = timelineDayPercent(value);
  const lane = index % 3;
  return homeTooltipButton({
    className: `${className} lane-${lane}`,
    label,
    content: icon,
    style: `left:${left}%`,
  });
}

function homeTooltipButton({ className, label, content, style = '' }) {
  const safeLabel = escapeHtml(label || 'Details');
  const styleAttr = style ? ` style="${escapeHtml(style)}"` : '';
  return `<button type="button" class="${escapeHtml(className)}"${styleAttr} aria-label="${safeLabel}" aria-expanded="false" data-home-tooltip-toggle>${content}<span class="home-tooltip" role="tooltip" hidden>${safeLabel}</span></button>`;
}

function toggleHomeTooltip(button) {
  const tooltip = button.querySelector('.home-tooltip');
  if (!tooltip) return;
  if (openHomeTooltip && openHomeTooltip !== tooltip) closeHomeTooltip();
  const nextOpen = tooltip.hidden;
  tooltip.hidden = !nextOpen;
  button.setAttribute('aria-expanded', String(nextOpen));
  button.closest('.home-card')?.classList.toggle('tooltip-open', nextOpen);
  openHomeTooltip = nextOpen ? tooltip : null;
}

function closeHomeTooltip() {
  if (!openHomeTooltip) return;
  const tooltip = openHomeTooltip;
  tooltip.hidden = true;
  const button = tooltip.closest('[data-home-tooltip-toggle]');
  button?.setAttribute('aria-expanded', 'false');
  button?.closest('.home-card')?.classList.remove('tooltip-open');
  openHomeTooltip = null;
}

function homeNowMarker() {
  if (state.selectedDay !== localDateKey(new Date())) return '';
  return `<span class="home-now-marker" style="left:${timelineDayPercent(new Date().toISOString())}%" aria-hidden="true"></span>`;
}

function timelineDayPercent(value) {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  const minutes = date.getHours() * 60 + date.getMinutes();
  return Math.max(0, Math.min(100, (minutes / 1439) * 100));
}

function babyEventIcon(event) {
  if (event.type === 'sleep') return '💤';
  if (event.type === 'feeding_milk') return '🍼';
  if (event.type === 'feeding_solid') return '🥣';
  if (event.type === 'diaper') return event.diaperKind?.value === 'dirty' ? '💩' : '💧';
  if (event.type === 'milestone') return '🌱';
  return '•';
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
  renderActionLog(elements.taskActionLog, state.taskActionLog, 'No task actions yet.');
  renderMeals();
  renderHomeDashboard();
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

async function updateRemoteSyncBaseline() {
  await checkRemoteChanges({ baselineOnly: true, force: true, minIntervalMs: 0 });
}

function startRemoteSyncWatcher() {
  window.setInterval(() => {
    checkRemoteChanges({ reason: 'interval' });
  }, REMOTE_SYNC_CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkRemoteChanges({ reason: 'visible', minIntervalMs: REMOTE_SYNC_FOCUS_MIN_INTERVAL_MS });
    }
  });
  window.addEventListener('focus', () => {
    checkRemoteChanges({ reason: 'focus', minIntervalMs: REMOTE_SYNC_FOCUS_MIN_INTERVAL_MS });
  });
}

async function checkRemoteChanges(options = {}) {
  const {
    baselineOnly = false,
    force = false,
    minIntervalMs = REMOTE_SYNC_CHECK_INTERVAL_MS,
  } = options;
  if (!state.user || state.syncCheckInFlight) return false;
  if (!force && typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
  const now = Date.now();
  if (!force && minIntervalMs > 0 && now - state.syncLastCheckedAt < minIntervalMs) return false;
  state.syncCheckInFlight = true;
  state.syncLastCheckedAt = now;
  try {
    const response = await fetch(`/api/sync/state?ts=${Date.now()}`, { cache: 'no-store' });
    if (handleAuthFailure(response)) return false;
    if (!response.ok) return false;
    const payload = await response.json();
    const nextVersions = normalizeSyncVersions(payload.modules || payload);
    const previousVersions = state.syncVersions;
    state.syncVersions = nextVersions;
    if (baselineOnly || !previousVersions) return false;
    const changedModules = syncChangedModules(previousVersions, nextVersions);
    if (!changedModules.length) return false;
    await refreshChangedModules(changedModules);
    return true;
  } catch {
    return false;
  } finally {
    state.syncCheckInFlight = false;
  }
}

function normalizeSyncVersions(modules = {}) {
  return {
    baby: String(modules.baby?.version || ''),
    task: String(modules.task?.version || ''),
    profile: String(modules.profile?.version || ''),
  };
}

function syncChangedModules(previous, next) {
  return Object.keys(next).filter((module) => previous?.[module] !== next[module]);
}

async function refreshChangedModules(changedModules = []) {
  if (!state.user) return;
  const changed = new Set(changedModules);
  const jobs = [];
  if (state.activeTab === 'home') {
    if (changed.has('profile')) jobs.push(loadBabyProfile());
    if (changed.has('baby')) jobs.push(loadToday());
    if (changed.has('task')) jobs.push(loadTaskData());
  } else if (state.activeTab === 'baby') {
    if (changed.has('profile')) jobs.push(loadBabyProfile());
    if (changed.has('baby')) jobs.push(loadToday());
  } else if (state.activeTab === 'task' && changed.has('task')) {
    jobs.push(loadTaskData());
  }
  if (jobs.length) await Promise.all(jobs);
}

function setupPullToRefresh() {
  if (!elements.pullRefresh) return;
  document.addEventListener('touchstart', handlePullRefreshStart, { passive: true });
  document.addEventListener('touchmove', handlePullRefreshMove, { passive: false });
  document.addEventListener('touchend', handlePullRefreshEnd, { passive: true });
  document.addEventListener('touchcancel', resetPullRefresh, { passive: true });
}

function handlePullRefreshStart(event) {
  if (!canStartPullRefresh(event)) return;
  const touch = event.touches?.[0];
  if (!touch) return;
  state.pullRefresh = { active: true, ready: false, refreshing: false, startY: touch.clientY, distance: 0 };
}

function handlePullRefreshMove(event) {
  if (!state.pullRefresh.active || state.pullRefresh.refreshing) return;
  const touch = event.touches?.[0];
  if (!touch) return;
  const delta = touch.clientY - state.pullRefresh.startY;
  if (delta <= 0) {
    resetPullRefresh();
    return;
  }
  if (window.scrollY > 0) return;
  event.preventDefault();
  const distance = Math.min(PULL_REFRESH_MAX_DISTANCE_PX, delta * 0.48);
  state.pullRefresh.distance = distance;
  state.pullRefresh.ready = distance >= PULL_REFRESH_THRESHOLD_PX;
  renderPullRefresh();
}

function handlePullRefreshEnd() {
  if (!state.pullRefresh.active || state.pullRefresh.refreshing) return;
  if (!state.pullRefresh.ready) {
    resetPullRefresh();
    return;
  }
  triggerPullRefresh();
}

function canStartPullRefresh(event) {
  if (!state.user || state.pullRefresh.refreshing || window.scrollY > 0) return false;
  if (!event.touches || event.touches.length !== 1) return false;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('input, textarea, select, button, a, dialog, [role="button"], .floating-window, .menu-panel')) return false;
  return true;
}

async function triggerPullRefresh() {
  state.pullRefresh.refreshing = true;
  state.pullRefresh.distance = PULL_REFRESH_THRESHOLD_PX;
  renderPullRefresh('Refreshing...');
  try {
    await refreshActiveTab({ reason: 'pull' });
    renderPullRefresh('Updated');
  } catch {
    renderPullRefresh('Could not refresh');
  } finally {
    window.setTimeout(resetPullRefresh, 650);
  }
}

function renderPullRefresh(label) {
  if (!elements.pullRefresh) return;
  const { active, ready, refreshing, distance } = state.pullRefresh;
  const progress = Math.min(1, distance / PULL_REFRESH_THRESHOLD_PX);
  elements.pullRefresh.style.setProperty('--pull-distance', `${Math.round(distance)}px`);
  elements.pullRefresh.style.setProperty('--pull-progress', String(progress));
  elements.pullRefresh.classList.toggle('visible', active || refreshing);
  elements.pullRefresh.classList.toggle('ready', ready);
  elements.pullRefresh.classList.toggle('refreshing', refreshing);
  elements.pullRefresh.setAttribute('aria-hidden', String(!active && !refreshing));
  if (elements.pullRefreshLabel) {
    elements.pullRefreshLabel.textContent = label || (refreshing ? 'Refreshing...' : ready ? 'Release to refresh' : 'Pull to refresh');
  }
}

function resetPullRefresh() {
  state.pullRefresh = { active: false, ready: false, refreshing: false, startY: 0, distance: 0 };
  renderPullRefresh();
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


function renderHomeDayControls() {
  if (elements.homeDayPicker) elements.homeDayPicker.value = state.selectedDay;
  if (elements.homeDayLabel) elements.homeDayLabel.textContent = dayHeading(state.selectedDay);
  if (elements.homeCalendarToggle) elements.homeCalendarToggle.setAttribute('aria-label', 'Open home calendar');
  renderHomeCalendar();
}

async function loadHomeCalendarDots(monthKey) {
  const [babyDots, taskDots] = await Promise.all([
    fetch(`/api/logs/calendar?month=${encodeURIComponent(monthKey)}&timezone=${encodeURIComponent(localTimezone())}`)
      .then((response) => response.ok ? response.json() : { days: {} })
      .then((payload) => payload.days || {})
      .catch(() => ({})),
    fetch(`/api/tasks/calendar?month=${encodeURIComponent(monthKey)}`)
      .then((response) => response.ok ? response.json() : { days: {} })
      .then((payload) => payload.days || {})
      .catch(() => ({})),
  ]);
  const merged = {};
  for (const [day, colors] of Object.entries(babyDots)) merged[day] = [...(merged[day] || []), ...(colors || [])];
  for (const [day, colors] of Object.entries(taskDots)) merged[day] = [...(merged[day] || []), ...(colors || [])];
  const mealDots = mealCalendarDotsForMonth(monthKey);
  for (const [day, colors] of Object.entries(mealDots)) merged[day] = [...(merged[day] || []), ...(colors || [])];
  state.homeCalendarDots = merged;
  renderHomeCalendar();
}

function setHomeCalendarOpen(open) {
  elements.homeCalendarPopover?.classList.toggle('hidden', !open);
  elements.homeCalendarToggle?.setAttribute('aria-expanded', String(open));
  elements.homeCalendarToggle?.setAttribute('aria-label', open ? 'Close home calendar' : 'Open home calendar');
}

function toggleHomeCalendar() {
  if (!elements.homeCalendarPopover) return;
  const open = elements.homeCalendarPopover.classList.contains('hidden');
  if (open) {
    state.homeCalendarMonth = state.selectedDay.slice(0, 7);
    loadHomeCalendarDots(state.homeCalendarMonth);
  }
  setHomeCalendarOpen(open);
}

function shiftHomeCalendarMonth(delta) {
  const monthKey = state.homeCalendarMonth || state.selectedDay.slice(0, 7);
  const base = new Date(`${monthKey}-01T00:00:00`);
  base.setMonth(base.getMonth() + delta);
  state.homeCalendarMonth = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`;
  loadHomeCalendarDots(state.homeCalendarMonth);
}

function renderHomeCalendar() {
  if (!elements.homeCalendarGrid || !state.homeCalendarMonth) return;
  renderCalendarGrid({
    monthKey: state.homeCalendarMonth,
    selectedDay: state.selectedDay,
    dotsByDay: state.homeCalendarDots,
    monthElement: elements.homeCalendarMonth,
    gridElement: elements.homeCalendarGrid,
    onSelect: (iso) => {
      setHomeCalendarOpen(false);
      setSelectedDay(iso, { pushHistory: true });
    },
  });
}

function renderTaskDayControls() {
  elements.taskDayPicker.value = state.selectedDay;
  renderTaskComposerDueState();
  elements.taskDayLabel.textContent = dayHeading(state.selectedDay);
  if (elements.taskCalendarToggle) elements.taskCalendarToggle.setAttribute('aria-label', 'Open task calendar');
  renderTaskCalendar();
}


function setTaskPanel(panel) {
  state.taskPanel = panel === 'summary' || panel === 'actionLog' ? panel : 'today';
  renderTaskPanel();
}

function renderTaskPanel() {
  if (!elements.taskSummaryPanel || !elements.openTaskSummary || !elements.taskTodayPanel) return;
  const summaryOpen = state.taskPanel === 'summary';
  const actionLogOpen = state.taskPanel === 'actionLog';
  elements.taskSummaryPanel.classList.toggle('hidden', !summaryOpen);
  elements.taskSummaryPanel.setAttribute('aria-hidden', String(!summaryOpen));
  elements.openTaskSummary.classList.toggle('active', summaryOpen);
  elements.openTaskSummary.setAttribute('aria-expanded', String(summaryOpen));
  elements.taskActionLogPanel?.classList.toggle('hidden', !actionLogOpen);
  elements.taskActionLogPanel?.setAttribute('aria-hidden', String(!actionLogOpen));
  elements.openTaskActionLog?.classList.toggle('active', actionLogOpen);
  elements.openTaskActionLog?.setAttribute('aria-expanded', String(actionLogOpen));
  const composerOpen = elements.taskForm && !elements.taskForm.classList.contains('hidden');
  elements.openTaskLog?.classList.toggle('active', !summaryOpen && !actionLogOpen && !composerOpen);
  elements.openTaskLog?.setAttribute('aria-expanded', String(!summaryOpen && !actionLogOpen && !composerOpen));
  if (elements.taskForm && (summaryOpen || actionLogOpen) && composerOpen) setTaskComposerOpen(false);
}

function setTaskCalendarOpen(open) {
  elements.taskCalendarPopover?.classList.toggle('hidden', !open);
  elements.taskCalendarToggle?.setAttribute('aria-expanded', String(open));
  elements.taskCalendarToggle?.setAttribute('aria-label', open ? 'Close task calendar' : 'Open task calendar');
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
  if (elements.babyCalendarToggle) elements.babyCalendarToggle.setAttribute('aria-label', 'Open baby calendar');
  renderBabyCalendar();
}

function setBabyCalendarOpen(open) { elements.babyCalendarPopover?.classList.toggle('hidden', !open); elements.babyCalendarToggle?.setAttribute('aria-expanded', String(open)); elements.babyCalendarToggle?.setAttribute('aria-label', open ? 'Close baby calendar' : 'Open baby calendar'); }
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
  if (elements.mealCalendarToggle) elements.mealCalendarToggle.setAttribute('aria-label', 'Open meal calendar');
  renderMealCalendar();
}

function mealCalendarDotsForMonth(monthKey) {
  const dots = {};
  Object.keys(state.meals.plannedByDay || {}).filter((day) => day.startsWith(monthKey)).forEach((day) => {
    const plan = state.meals.plannedByDay[day] || {};
    const colors = [];
    if ((plan.breakfast || []).length) colors.push(mealSlotColors.breakfast);
    if ((plan.lunch || []).length) colors.push(mealSlotColors.lunch);
    if ((plan.dinner || []).length) colors.push(mealSlotColors.dinner);
    if (colors.length) dots[day] = colors;
  });
  return dots;
}

function loadMealCalendarDots(monthKey) {
  state.mealCalendarDots = mealCalendarDotsForMonth(monthKey);
  renderMealCalendar();
}
function setMealCalendarOpen(open) { elements.mealCalendarPopover?.classList.toggle('hidden', !open); elements.mealCalendarToggle?.setAttribute('aria-expanded', String(open)); elements.mealCalendarToggle?.setAttribute('aria-label', open ? 'Close meal calendar' : 'Open meal calendar'); }
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
  checkbox.setAttribute('aria-label', `${task.status === 'done' ? 'Reopen' : 'Complete'} ${task.title}`);
  checkbox.addEventListener('click', (event) => event.stopPropagation());
  checkbox.addEventListener('change', () => toggleTask(task));
  const marker = document.createElement('span');
  marker.className = 'assignee-marker';
  marker.style.background = task.assigneeColor;
  const text = document.createElement('div');
  text.className = 'task-text';
  text.innerHTML = `<strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.assigneeName || 'Unassigned')} · ${escapeHtml(taskDueText(task))}</span>`;
  row.replaceChildren(checkbox, marker, text);
  const statusAction = task.status === 'done'
    ? { label: 'Reopen', icon: 'reopen' }
    : { label: 'Complete', icon: 'check' };
  return makeSwipeItem(row, [
    makeSwipeAction({ ...statusAction, onClick: () => toggleTask(task) }),
  ], 'task-swipe');
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
  if (event.type === 'feeding_solid') return event.food?.value || 'Baby food';
  if (event.type === 'diaper') return diaperTitle(event);
  if (event.type === 'milestone') return event.title || 'Growth moment';
  return 'Log';
}

function diaperTitle(event) {
  if (event.diaperKind?.value === 'dirty') return 'Diaper (poop)';
  if (looksLikePeeDiaper(event.rawText)) return 'Diaper (pee)';
  return 'Diaper';
}

function looksLikePeeDiaper(text = '') {
  return /쉬|소변|\bwet\b|\bpee\b|ướt|\buot\b/i.test(String(text));
}

function eventMeta(event) {
  if (event.type === 'sleep') return `${timeLabel(event.startAt)} to ${timeLabel(event.endAt)} · ${event.durationMinutes?.value || 0} min`;
  if (event.type === 'feeding_milk') return `${timeLabel(event.occurredAt)} · ${event.amountMl?.value || 0}ml`;
  if (event.type === 'feeding_solid') return `${timeLabel(event.occurredAt)} · ${event.amount?.value || ''}`;
  if (event.type === 'milestone') {
    const count = (event.attachments || []).length;
    const mediaText = count ? ` · ${count} media` : '';
    const firstText = event.isFirst ? ' · first' : '';
    return `${timeLabel(event.occurredAt)}${mediaText}${firstText}`;
  }
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

function rememberRecentBabyLog(text, events = []) {
  if (!events.some((event) => !event.hiddenFromTimeline)) return;
  const cleanText = String(text || '').trim();
  if (!cleanText || cleanText.length > 120) return;
  const existing = state.recentBabyLogs.find((item) => item.text === cleanText);
  const next = existing
    ? { ...existing, useCount: existing.useCount + 1, lastUsedAt: Date.now() }
    : { text: cleanText, useCount: 1, lastUsedAt: Date.now() };
  state.recentBabyLogs = [next, ...state.recentBabyLogs.filter((item) => item.text !== cleanText)]
    .sort((a, b) => (b.useCount - a.useCount) || (b.lastUsedAt - a.lastUsedAt))
    .slice(0, 5);
  localStorage.setItem(storageKeys.recentBabyLogs, JSON.stringify(state.recentBabyLogs));
  renderQuickActions();
}

function loadRecentBabyLogs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKeys.recentBabyLogs) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item.text === 'string').slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

async function refreshActiveTab(options = {}) {
  if (!state.user) return false;
  const jobs = [];
  if (state.activeTab === 'home') {
    jobs.push(loadBabyProfile(), loadToday(), loadTaskData());
    renderMeals();
  } else if (state.activeTab === 'baby') {
    jobs.push(loadBabyProfile(), loadToday());
  } else if (state.activeTab === 'meal') {
    renderMeals();
  } else {
    jobs.push(loadTaskData());
  }
  if (jobs.length) await Promise.all(jobs);
  if (options.updateSync !== false) await updateRemoteSyncBaseline();
  return true;
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

function normalizeTimelineSort(value) {
  return value === 'desc' ? 'desc' : 'asc';
}

function normalizeTimelineFilter(value) {
  return ['sleep', 'feeding_milk', 'feeding_solid', 'diaper', 'milestone'].includes(value) ? value : 'all';
}

function normalizeActiveBabyTrackers(value) {
  if (value === null || value === undefined) return babyTrackerTypes.map((item) => item.type);
  const selected = String(value).split(',').filter((item) => babyTrackerTypeSet.has(item));
  return [...new Set(selected)];
}

function normalizePatternTypes(value) {
  const allowed = ['sleep', 'feeding_milk', 'feeding_solid', 'diaper'];
  const selected = String(value || '').split(',').filter((item) => allowed.includes(item));
  return selected.length ? [...new Set(selected)] : allowed;
}

function normalizePatternPeriodDays(value) {
  const parsed = Number(value);
  return [1, 7, 14, 30].includes(parsed) ? parsed : 7;
}

function normalizePatternStatUnit(value) {
  return ['day', 'week', 'month'].includes(value) ? value : 'week';
}

function normalizeTab(value) {
  return ['home', 'baby', 'task', 'meal'].includes(value) ? value : 'home';
}

function tabFromLocation() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return 'home';
  if (path === '/baby') return 'baby';
  if (path === '/tasks') return 'task';
  if (path === '/meals') return 'meal';
  return null;
}

function getInitialTab() {
  return tabFromLocation() || normalizeTab(localStorage.getItem(storageKeys.activeTab));
}

function syncUrlForTab(tab, { pushHistory = false } = {}) {
  const targetPath = tab === 'baby' ? '/baby' : tab === 'task' ? '/tasks' : tab === 'meal' ? '/meals' : '/';
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
  showFloatingDialog(elements.mealModal);
}

function closeMealModal() {
  hideFloatingDialog(elements.mealModal);
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
  renderHomeDashboard();
}

function renderMealItem(item, slot) {
  let dragArmed = false;
  let swipe = null;

  const card = document.createElement('div');
  card.className = 'meal-card';

  const header = document.createElement('div');
  header.className = 'meal-card-header';

  const title = document.createElement('strong');
  title.className = 'meal-item-handle';
  title.textContent = `☰ ${item.name}`;
  title.setAttribute('aria-label', `Drag ${item.name}`);
  header.appendChild(title);

  if (slot !== 'wish') {
    const likeButton = document.createElement('button');
    likeButton.type = 'button';
    likeButton.className = 'meal-like-button';
    likeButton.setAttribute('aria-label', `Thumbs up ${item.name}`);
    likeButton.innerHTML = `${actionIcon('like')}<span>${item.likes || 0}</span>`;
    likeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      likeMeal(item.id);
    });
    header.appendChild(likeButton);
  }

  card.appendChild(header);

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

async function deleteMeal(id) {
  const found = findMeal(id);
  if (!found) return;
  const ok = await openFloatingAction({
    kicker: 'Meal item',
    title: 'Delete meal item?',
    description: found.item.name,
    confirmLabel: 'Delete',
  });
  if (!ok) return;
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

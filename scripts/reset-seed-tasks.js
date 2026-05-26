import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createBabyStore } from '../src/server/db/store-factory.js';
import { defaultFamilyId } from '../src/domain/profile-defaults.js';
import { createId } from '../src/utils/ids.js';

const root = resolve('.');
loadEnv();
ensureProxyAwareRerun();

const store = await createBabyStore();
try {
  const familyId = defaultFamilyId;
  await store.clearTasksForFamily(familyId);

  const assignees = await store.ensureDefaultTaskAssignees(familyId);
  const mom = assignees.find((item) => item.name === 'Mom') || assignees[0];
  const dad = assignees.find((item) => item.name === 'Dad') || assignees[1] || assignees[0];

  const momTaskPool = [
    'Defrost baby food ingredients', 'Review nap records', 'Label pumped milk storage bags', 'Pack snacks for stroller bag',
    'Set bath towels for evening routine', 'Check night light batteries', 'Refill diaper pouch', 'Organize overnight feeding logs',
    'Portion baby food containers', 'Sort weekly growth photos', 'Update daycare notes', 'Sort freshly laundered baby clothes'
  ];
  const dadTaskPool = [
    'Refill formula kettle', 'Empty bottle sterilizer', 'Inspect stroller wheel condition', 'Dust and clean play mat',
    'Check thermometer charge level', 'Set evening routine timer', 'Refill travel wipes pack', 'Tidy baby crib sheets',
    'Adjust sleep camera angle', 'Run bib laundry cycle', 'Check weekly diaper stock', 'Clean nursery humidifier'
  ];

  const dueModeOrder = [
    ...Array(50).fill('on_date'),
    ...Array(20).fill('before_date'),
    ...Array(3).fill('asap'),
    ...Array(2).fill('someday'),
  ];

  const base = new Date('2026-05-25T12:00:00.000Z');
  let created = 0;
  for (let dayOffset = 0; created < dueModeOrder.length; dayOffset += 1) {
    const dayDate = new Date(base);
    dayDate.setUTCDate(base.getUTCDate() - dayOffset);
    const day = dayDate.toISOString().slice(0, 10);
    for (let i = 0; i < 10 && created < dueModeOrder.length; i += 1) {
      const assignee = i < 5 ? mom : dad;
      const roleIndex = i % 5;
      const title = i < 5
        ? momTaskPool[(dayOffset * 5 + roleIndex) % momTaskPool.length]
        : dadTaskPool[(dayOffset * 5 + roleIndex) % dadTaskPool.length];
      const dueMode = dueModeOrder[created];
      await store.createTask({
        id: createId('task'),
        familyId,
        title,
        assigneeId: assignee.id,
        dueMode,
        dueDate: dueMode === 'asap' || dueMode === 'someday' ? '' : day,
      });
      created += 1;
    }
  }

  const tasks = await store.listAllTasks({ familyId });
  const counts = tasks.reduce((acc, task) => {
    acc[task.dueMode] = (acc[task.dueMode] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    ok: true,
    familyId,
    total: tasks.length,
    counts,
  }, null, 2));
} finally {
  store.close?.();
}

function loadEnv() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function ensureProxyAwareRerun() {
  const hasProxyArg = process.execArgv.includes('--use-env-proxy');
  const hasDnsArg = process.execArgv.some((arg) => arg.startsWith('--dns-result-order='));
  if (hasProxyArg && hasDnsArg) return;

  const rerun = spawnSync(
    process.execPath,
    ['--use-env-proxy', '--dns-result-order=ipv4first', ...process.execArgv, ...process.argv.slice(1)],
    {
      stdio: 'inherit',
      env: { ...process.env, NODE_USE_ENV_PROXY: process.env.NODE_USE_ENV_PROXY || '1' },
    },
  );
  process.exit(rerun.status ?? 1);
}

export const defaultFamilyId = 'local-family';
export const defaultBabyId = 'local-baby';
export const defaultAuthorId = 'local-user';

export const genericDefaults = {
  milkAmountMl: 160,
  napDurationMinutes: 75,
  solidAmount: '보통',
};

const ageBandDefaults = [
  { maxMonths: 3, milkAmountMl: 120, napDurationMinutes: 80, solidAmount: '없음' },
  { maxMonths: 6, milkAmountMl: 170, napDurationMinutes: 75, solidAmount: '소량' },
  { maxMonths: 9, milkAmountMl: 190, napDurationMinutes: 70, solidAmount: '보통' },
  { maxMonths: 12, milkAmountMl: 200, napDurationMinutes: 65, solidAmount: '보통' },
  { maxMonths: Infinity, milkAmountMl: 180, napDurationMinutes: 60, solidAmount: '보통' },
];

export function createDefaultProfile(options = {}) {
  return {
    familyId: options.familyId || defaultFamilyId,
    babyId: options.babyId || defaultBabyId,
    babyName: options.babyName || '',
    birthDate: options.birthDate || '',
    milkAmountMlOverride: options.milkAmountMlOverride ?? null,
    napDurationMinutesOverride: options.napDurationMinutesOverride ?? null,
    solidAmountOverride: options.solidAmountOverride || '',
    createdAt: options.createdAt,
    updatedAt: options.updatedAt,
  };
}

export function defaultsForProfile(profile = {}, now = new Date()) {
  const ageDefaults = defaultsForAgeMonths(ageMonths(profile.birthDate, now));
  return {
    milkAmountMl: Number.isFinite(profile.milkAmountMlOverride)
      ? profile.milkAmountMlOverride
      : ageDefaults.milkAmountMl,
    napDurationMinutes: Number.isFinite(profile.napDurationMinutesOverride)
      ? profile.napDurationMinutesOverride
      : ageDefaults.napDurationMinutes,
    solidAmount: profile.solidAmountOverride || ageDefaults.solidAmount,
  };
}

export function ageMonths(birthDate, now = new Date()) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime()) || birth > now) return null;
  return Math.max(0, (now.getFullYear() - birth.getFullYear()) * 12 + now.getMonth() - birth.getMonth());
}

function defaultsForAgeMonths(months) {
  if (!Number.isFinite(months)) return genericDefaults;
  return ageBandDefaults.find((band) => months <= band.maxMonths) || genericDefaults;
}


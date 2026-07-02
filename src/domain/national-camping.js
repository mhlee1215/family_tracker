const RECREATION_SEARCH_URL = 'https://www.recreation.gov/api/search';
const RECREATION_AVAILABILITY_URL = 'https://www.recreation.gov/api/camps/availability/campground';

export function normalizeCampingDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? '' : text;
}

export function reservationUrl({ campgroundId, campsiteId, startDate, endDate }) {
  const url = new URL(`https://www.recreation.gov/camping/campgrounds/${encodeURIComponent(campgroundId)}`);
  if (startDate) url.searchParams.set('checkin', startDate);
  if (endDate) url.searchParams.set('checkout', endDate);
  if (campsiteId) url.searchParams.set('campsite', campsiteId);
  return url.toString();
}

export async function searchNationalCampgrounds(query, { fetchImpl = fetch } = {}) {
  const search = String(query || '').trim();
  if (search.length < 2) return [];
  const url = new URL(RECREATION_SEARCH_URL);
  url.searchParams.set('fq', 'entity_type:campground');
  url.searchParams.set('q', search);
  url.searchParams.set('size', '8');
  const response = await fetchImpl(url, { headers: recreationHeaders() });
  if (!response.ok) throw new Error('Recreation.gov search failed.');
  const data = await response.json();
  return (data.results || []).map((item) => ({
    id: String(item.entity_id || item.asset_id || ''),
    name: String(item.name || item.entity_name || item.asset_name || '').trim(),
    location: String(item.location || item.city || item.state_code || '').trim(),
    reservable: Boolean(item.reservable || item.campsites_count),
  })).filter((item) => item.id && item.name);
}

export async function findNationalAvailability({ campgroundId, startDate, endDate }, { fetchImpl = fetch } = {}) {
  const campground = String(campgroundId || '').trim();
  const start = normalizeCampingDate(startDate);
  const end = normalizeCampingDate(endDate);
  if (!campground) throw new Error('Campground is required.');
  if (!start || !end || start >= end) throw new Error('A valid date range is required.');

  const monthKeys = monthsBetween(start, end);
  const monthly = await Promise.all(monthKeys.map((month) => fetchAvailabilityMonth(campground, month, fetchImpl)));
  const nights = nightsBetween(start, end);
  const campsites = new Map();
  for (const month of monthly) {
    for (const campsite of Object.values(month.campsites || {})) {
      campsites.set(String(campsite.campsite_id), campsite);
    }
  }

  const matches = [...campsites.values()].filter((campsite) => nights.every((night) => campsite.availabilities?.[`${night}T00:00:00Z`] === 'Available'));
  return matches.map((campsite) => ({
    campgroundId: campground,
    campsiteId: String(campsite.campsite_id),
    site: String(campsite.site || campsite.campsite_id),
    loop: String(campsite.loop || ''),
    type: String(campsite.campsite_reserve_type || ''),
    nights,
    checkoutUrl: reservationUrl({ campgroundId: campground, campsiteId: campsite.campsite_id, startDate: start, endDate: end }),
  }));
}

async function fetchAvailabilityMonth(campgroundId, monthKey, fetchImpl) {
  const url = new URL(`${RECREATION_AVAILABILITY_URL}/${encodeURIComponent(campgroundId)}/month`);
  url.searchParams.set('start_date', `${monthKey}-01T00:00:00.000Z`);
  const response = await fetchImpl(url, { headers: recreationHeaders() });
  if (!response.ok) throw new Error('Recreation.gov availability failed.');
  return response.json();
}

function monthsBetween(startDate, endDate) {
  const start = new Date(`${startDate.slice(0, 7)}-01T00:00:00.000Z`);
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00.000Z`);
  const months = [];
  for (const cursor = start; cursor <= end; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

function nightsBetween(startDate, endDate) {
  const nights = [];
  for (const cursor = new Date(`${startDate}T00:00:00.000Z`), end = new Date(`${endDate}T00:00:00.000Z`); cursor < end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    nights.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(cursor.getUTCDate()).padStart(2, '0')}`);
  }
  return nights;
}

function recreationHeaders() {
  return {
    accept: 'application/json',
    'user-agent': 'family-tracker-camping/1.0',
  };
}

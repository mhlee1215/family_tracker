const RECREATION_SEARCH_URL = 'https://www.recreation.gov/api/search';
const RECREATION_AVAILABILITY_URL = 'https://www.recreation.gov/api/camps/availability/campground';
const ZIP_LOOKUP_URL = 'https://api.zippopotam.us/us';

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
  const zipCoordinates = await lookupZipCoordinates(search, fetchImpl);
  if (zipCoordinates) {
    url.searchParams.set('lat', zipCoordinates.latitude);
    url.searchParams.set('lng', zipCoordinates.longitude);
    url.searchParams.set('radius', '75');
  } else {
    url.searchParams.set('q', search);
  }
  url.searchParams.set('size', '20');
  const response = await fetchImpl(url, { headers: recreationHeaders() });
  if (!response.ok) throw new Error('Recreation.gov search failed.');
  const data = await response.json();
  return (data.results || []).map((item) => ({
    id: String(item.entity_id || item.asset_id || ''),
    name: String(item.name || item.entity_name || item.asset_name || '').trim(),
    location: String(item.location || item.city || item.state_code || '').trim(),
    rating: optionalNumber(item.average_rating),
    ratingCount: optionalNumber(item.number_of_ratings),
    campsiteCount: optionalNumber(item.campsites_count),
    distance: optionalNumber(item.distance),
    reservable: Boolean(item.reservable || item.campsites_count),
  })).filter((item) => item.id && item.name)
    .sort(zipCoordinates ? byDistance : byRatingCount);
}

export function searchWindows({ rangeStart, rangeEnd, startDate, endDate, stayNights = 2, weekendOnly = false }) {
  const start = normalizeCampingDate(rangeStart || startDate);
  const end = normalizeCampingDate(rangeEnd || endDate);
  const nights = Number.isInteger(Number(stayNights)) ? Math.max(1, Math.min(14, Number(stayNights))) : 2;
  if (!start || !end || start >= end) throw new Error('A valid date range is required.');
  const windows = [];
  const lastStart = new Date(`${end}T00:00:00.000Z`);
  lastStart.setUTCDate(lastStart.getUTCDate() - nights);
  for (const cursor = new Date(`${start}T00:00:00.000Z`); cursor <= lastStart; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const day = cursor.getUTCDay();
    if (weekendOnly && ![5, 6].includes(day)) continue;
    const checkout = new Date(cursor);
    checkout.setUTCDate(checkout.getUTCDate() + nights);
    windows.push({
      startDate: dateKey(cursor),
      endDate: dateKey(checkout),
      nights: nightsBetween(dateKey(cursor), dateKey(checkout)),
    });
  }
  return windows;
}

export async function findNationalAvailability({ campgroundId, startDate, endDate, rangeStart, rangeEnd, stayNights, weekendOnly = false }, { fetchImpl = fetch } = {}) {
  const campground = String(campgroundId || '').trim();
  if (!campground) throw new Error('Campground is required.');
  const windows = searchWindows({ rangeStart, rangeEnd, startDate, endDate, stayNights, weekendOnly });
  const start = windows[0].startDate;
  const end = windows[windows.length - 1].endDate;

  const monthKeys = monthsBetween(start, end);
  const monthly = await Promise.all(monthKeys.map((month) => fetchAvailabilityMonth(campground, month, fetchImpl)));
  const campsites = new Map();
  for (const month of monthly) {
    for (const campsite of Object.values(month.campsites || {})) {
      campsites.set(String(campsite.campsite_id), campsite);
    }
  }

  const matches = [];
  for (const campsite of campsites.values()) {
    for (const window of windows) {
      if (!window.nights.every((night) => campsite.availabilities?.[`${night}T00:00:00Z`] === 'Available')) continue;
      matches.push({
        campgroundId: campground,
        campsiteId: String(campsite.campsite_id),
        site: String(campsite.site || campsite.campsite_id),
        loop: String(campsite.loop || ''),
        type: String(campsite.campsite_reserve_type || ''),
        startDate: window.startDate,
        endDate: window.endDate,
        nights: window.nights,
        checkoutUrl: reservationUrl({ campgroundId: campground, campsiteId: campsite.campsite_id, startDate: window.startDate, endDate: window.endDate }),
      });
    }
  }
  return matches;
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
    nights.push(dateKey(cursor));
  }
  return nights;
}

function dateKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function optionalNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function byRatingCount(left, right) {
  return right.ratingCount - left.ratingCount;
}

function byDistance(left, right) {
  const leftDistance = left.distance > 0 ? left.distance : Number.POSITIVE_INFINITY;
  const rightDistance = right.distance > 0 ? right.distance : Number.POSITIVE_INFINITY;
  return leftDistance - rightDistance || byRatingCount(left, right);
}

async function lookupZipCoordinates(search, fetchImpl) {
  if (!/^\d{5}$/.test(search)) return null;
  try {
    const response = await fetchImpl(`${ZIP_LOOKUP_URL}/${search}`, { headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    const place = (await response.json()).places?.[0];
    const latitude = Number(place?.latitude);
    const longitude = Number(place?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude: String(latitude), longitude: String(longitude) };
  } catch {
    return null;
  }
}

function recreationHeaders() {
  return {
    accept: 'application/json',
    'user-agent': 'family-tracker-camping/1.0',
  };
}

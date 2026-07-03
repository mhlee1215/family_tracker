import { normalizeCampingDate, searchWindows } from './national-camping.js';

const RESERVE_CALIFORNIA_RDR_URL = 'https://california-rdr.prod.cali.rd12.recreation-management.tylerapp.com';
const RESERVE_CALIFORNIA_BOOKING_URL = 'https://www.reservecalifornia.com';

export function californiaReservationUrl({ placeId, facilityId, campsiteId, startDate, endDate }) {
  const place = encodeURIComponent(String(placeId || ''));
  const facility = encodeURIComponent(String(facilityId || ''));
  const url = new URL(`${RESERVE_CALIFORNIA_BOOKING_URL}/park/${place}/${facility}`);
  if (campsiteId) url.searchParams.set('site', String(campsiteId));
  if (startDate) url.searchParams.set('arrivalDate', reserveCaliforniaDate(startDate));
  if (endDate) url.searchParams.set('departureDate', reserveCaliforniaDate(endDate));
  return url.toString();
}

export async function searchCaliforniaStateCampgrounds(query, { fetchImpl = fetch } = {}) {
  const search = String(query || '').trim().toLowerCase();
  if (search.length < 2) return [];
  const zipCoordinates = /^\d{5}$/.test(search) ? await lookupZipCoordinates(search, fetchImpl) : null;
  const [places, facilities] = await Promise.all([
    fetchReserveCaliforniaJson('/rdr/fd/places', fetchImpl),
    fetchReserveCaliforniaJson('/rdr/fd/facilities', fetchImpl),
  ]);
  const placeById = new Map((Array.isArray(places) ? places : []).map((place) => [String(place.PlaceId), place]));
  const results = (Array.isArray(facilities) ? facilities : [])
    .filter((facility) => isCampingFacility(facility))
    .map((facility) => {
      const place = placeById.get(String(facility.PlaceId)) || {};
      return {
        id: String(facility.FacilityId || ''),
        provider: 'california_state',
        providerLabel: 'State Park',
        name: String(facility.Name || facility.ShortName || '').trim(),
        location: [place.Name, place.City, place.State || 'CA'].filter(Boolean).join(' · '),
        rating: 0,
        ratingCount: 0,
        campsiteCount: optionalNumber(facility.TotalUnits || facility.UnitCount || facility.Capacity),
        distance: zipCoordinates ? milesBetween(zipCoordinates, { latitude: place.Latitude, longitude: place.Longitude }) : 0,
        reservable: facility.AllowWebBooking !== false,
        placeId: String(facility.PlaceId || ''),
        bookingUrl: californiaReservationUrl({ placeId: facility.PlaceId, facilityId: facility.FacilityId }),
      };
    })
    .filter((item) => {
      if (!item.id || !item.name) return false;
      if (zipCoordinates) return Number.isFinite(item.distance) && item.distance <= 250;
      return [item.name, item.location].join(' ').toLowerCase().includes(search);
    })
    .sort((left, right) => {
      if (zipCoordinates) return left.distance - right.distance;
      return Number(right.reservable) - Number(left.reservable) || left.name.localeCompare(right.name);
    });
  return results.slice(0, 20);
}

export async function findCaliforniaStateAvailability({ campgroundId, placeId, startDate, endDate, rangeStart, rangeEnd, stayNights, weekendOnly = false, windowOffset = 0, maxWindows = Number.POSITIVE_INFINITY }, { fetchImpl = fetch } = {}) {
  const facilityId = String(campgroundId || '').trim();
  if (!facilityId) throw new Error('Campground is required.');
  const allWindows = searchWindows({ rangeStart, rangeEnd, startDate, endDate, stayNights, weekendOnly });
  if (!allWindows.length) return [];
  const offset = Math.max(0, Number.parseInt(windowOffset, 10) || 0) % allWindows.length;
  const limit = Math.max(1, Number.isFinite(Number(maxWindows)) ? Number.parseInt(maxWindows, 10) || 1 : allWindows.length);
  const windows = allWindows.slice(offset, offset + limit);
  const results = [];
  for (const window of windows) {
    results.push(await fetchAvailabilityWindow({
    facilityId,
    placeId,
    startDate: window.startDate,
    endDate: window.endDate,
    fetchImpl,
    }));
  }
  return results.flat();
}

async function fetchAvailabilityWindow({ facilityId, placeId, startDate, endDate, fetchImpl }) {
  const body = {
    FacilityId: Number(facilityId),
    StartDate: reserveCaliforniaDate(startDate),
    EndDate: reserveCaliforniaDate(endDate),
    WebOnly: true,
    UnitSort: 'orderby',
    InSeasonOnly: true,
  };
  const response = await fetchImpl(`${RESERVE_CALIFORNIA_RDR_URL}/rdr/search/grid`, {
    method: 'POST',
    headers: reserveCaliforniaHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('ReserveCalifornia availability failed.');
  return parseReserveCaliforniaAvailability(await response.json(), { facilityId, placeId, startDate, endDate });
}

export function parseReserveCaliforniaAvailability(payload = {}, { facilityId = '', placeId = '', startDate = '', endDate = '' } = {}) {
  const facility = payload.Facility || payload.facility || payload;
  const units = normalizeUnits(facility.Units || facility.units || payload.Units || payload.units);
  const matches = [];
  for (const unit of units) {
    const slices = normalizeSlices(unit.Slices || unit.slices || unit.Availability || unit.availability);
    if (!slices.length || !slices.every((slice) => isAvailableStatus(slice.Status || slice.status || slice.AvailabilityStatus || slice.availabilityStatus))) continue;
    const site = String(unit.Name || unit.UnitName || unit.ShortName || unit.UnitId || unit.unitId || '').trim();
    const campsiteId = String(unit.UnitId || unit.unitId || unit.Id || unit.id || site);
    matches.push({
      provider: 'california_state',
      campgroundId: String(facilityId || facility.FacilityId || facility.facilityId || ''),
      placeId: String(placeId || facility.PlaceId || facility.placeId || ''),
      campsiteId,
      site,
      loop: String(unit.Loop || unit.loop || facility.Name || ''),
      type: String(unit.UnitTypeName || unit.unitTypeName || ''),
      campsiteType: String(unit.UnitCategoryName || unit.unitCategoryName || ''),
      typeOfUse: 'Overnight',
      capacityRating: String(unit.MaxOccupancy || unit.maxOccupancy || ''),
      minPeople: optionalNumber(unit.MinOccupancy || unit.minOccupancy),
      maxPeople: optionalNumber(unit.MaxOccupancy || unit.maxOccupancy),
      startDate,
      endDate,
      nights: nightsBetween(startDate, endDate),
      checkoutUrl: californiaReservationUrl({ placeId, facilityId, campsiteId, startDate, endDate }),
    });
  }
  return matches;
}

async function fetchReserveCaliforniaJson(path, fetchImpl) {
  const response = await fetchImpl(`${RESERVE_CALIFORNIA_RDR_URL}${path}`, { headers: reserveCaliforniaHeaders() });
  if (!response.ok) throw new Error('ReserveCalifornia search failed.');
  return response.json();
}

async function lookupZipCoordinates(zipCode, fetchImpl) {
  const response = await fetchImpl(`https://api.zippopotam.us/us/${encodeURIComponent(zipCode)}`);
  if (!response.ok) return null;
  const payload = await response.json();
  const place = Array.isArray(payload.places) ? payload.places[0] : null;
  const latitude = Number(place?.latitude);
  const longitude = Number(place?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

function reserveCaliforniaHeaders() {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    origin: RESERVE_CALIFORNIA_BOOKING_URL,
    referer: `${RESERVE_CALIFORNIA_BOOKING_URL}/`,
    'user-agent': 'family-tracker-camping/1.0',
  };
}

function isCampingFacility(facility = {}) {
  const text = [facility.Name, facility.ShortName, facility.Description].join(' ').toLowerCase();
  return facility.AllowWebBooking !== false && !/(tour|museum|day use|parking|picnic|visitor center)/.test(text);
}

function normalizeUnits(units) {
  if (Array.isArray(units)) return units;
  if (units && typeof units === 'object') return Object.values(units);
  return [];
}

function normalizeSlices(slices) {
  if (Array.isArray(slices)) return slices;
  if (slices && typeof slices === 'object') return Object.values(slices);
  return [];
}

function isAvailableStatus(status) {
  return String(status || '').toLowerCase() === 'available';
}

function reserveCaliforniaDate(value) {
  const date = normalizeCampingDate(value);
  if (!date) return String(value || '');
  const [year, month, day] = date.split('-');
  return `${month}-${day}-${year}`;
}

function optionalNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function milesBetween(origin, destination) {
  const lat1 = Number(origin.latitude);
  const lon1 = Number(origin.longitude);
  const lat2 = Number(destination.latitude);
  const lon2 = Number(destination.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function nightsBetween(startDate, endDate) {
  const nights = [];
  for (const cursor = new Date(`${startDate}T00:00:00.000Z`), end = new Date(`${endDate}T00:00:00.000Z`); cursor < end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    nights.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(cursor.getUTCDate()).padStart(2, '0')}`);
  }
  return nights;
}

const AMADEUS_AUTH_URL = 'https://test.api.amadeus.com/v1/security/oauth2/token';
const AMADEUS_FLIGHT_OFFERS_URL = 'https://test.api.amadeus.com/v2/shopping/flight-offers';
const AMADEUS_FLIGHT_DATES_URL = 'https://test.api.amadeus.com/v1/shopping/flight-dates';
const AVIATIONSTACK_FLIGHTS_URL = 'https://api.aviationstack.com/v1/flights';

export const travelSources = [
  { id: 'amadeus', name: 'Amadeus', env: ['AMADEUS_CLIENT_ID', 'AMADEUS_CLIENT_SECRET'], coverage: 'Flight fares and cached deal dates' },
  { id: 'aviationstack', name: 'Aviationstack', env: ['AVIATIONSTACK_API_KEY'], coverage: 'Flight status and schedule lookup' },
  { id: 'opensky', name: 'OpenSky', env: [], coverage: 'Live aircraft positions only; not useful for route fare search' },
];

export function normalizeTravelQuery(input = {}) {
  const origin = normalizeAirport(input.origin);
  const destination = normalizeAirport(input.destination);
  const departureDate = normalizeDate(input.departureDate);
  const returnDate = normalizeDate(input.returnDate);
  const adults = clampInt(input.adults, 1, 1, 9);
  const maxPrice = input.maxPrice === '' || input.maxPrice === undefined ? null : clampInt(input.maxPrice, null, 1, 100000);
  return { origin, destination, departureDate, returnDate, adults, maxPrice };
}

export async function searchTravel(query, { env = process.env, fetchImpl = fetch } = {}) {
  const normalized = normalizeTravelQuery(query);
  if (!normalized.origin || !normalized.destination || !normalized.departureDate) {
    throw new Error('Origin, destination, and departure date are required.');
  }

  const sources = sourceStatuses(env);
  const settled = await Promise.allSettled([
    searchAmadeusOffers(normalized, { env, fetchImpl }),
    searchAviationstackFlights(normalized, { env, fetchImpl }),
  ]);
  const results = settled.flatMap((item) => item.status === 'fulfilled' ? item.value : []);
  markErrors(sources, settled);
  return { query: normalized, sources, results: sortTravelResults(results) };
}

export async function searchTravelDeals(query, { env = process.env, fetchImpl = fetch } = {}) {
  const normalized = normalizeTravelQuery(query);
  if (!normalized.origin || !normalized.destination) throw new Error('Origin and destination are required.');
  const sources = sourceStatuses(env);
  const settled = await Promise.allSettled([
    searchAmadeusDeals(normalized, { env, fetchImpl }),
  ]);
  markErrors(sources, settled);
  return { query: normalized, sources, deals: sortTravelResults(settled.flatMap((item) => item.status === 'fulfilled' ? item.value : [])) };
}

export function sourceStatuses(env = process.env) {
  return travelSources.map((source) => {
    const configured = source.env.every((key) => Boolean(env[key]));
    return {
      ...source,
      configured,
      active: configured && source.id !== 'opensky',
      status: source.id === 'opensky' ? 'not_applicable' : configured ? 'ready' : 'missing_key',
    };
  });
}

async function searchAmadeusOffers(query, { env, fetchImpl }) {
  if (!env.AMADEUS_CLIENT_ID || !env.AMADEUS_CLIENT_SECRET) return [];
  const token = await amadeusToken({ env, fetchImpl });
  const url = new URL(AMADEUS_FLIGHT_OFFERS_URL);
  url.searchParams.set('originLocationCode', query.origin);
  url.searchParams.set('destinationLocationCode', query.destination);
  url.searchParams.set('departureDate', query.departureDate);
  if (query.returnDate) url.searchParams.set('returnDate', query.returnDate);
  url.searchParams.set('adults', String(query.adults));
  url.searchParams.set('currencyCode', 'USD');
  url.searchParams.set('max', '20');
  if (query.maxPrice) url.searchParams.set('maxPrice', String(query.maxPrice));
  const data = await getJson(url, {
    fetchImpl,
    headers: { authorization: `Bearer ${token}` },
    error: 'Amadeus flight search failed.',
  });
  const carriers = data.dictionaries?.carriers || {};
  return (data.data || []).map((offer) => mapAmadeusOffer(offer, carriers)).filter(Boolean);
}

async function searchAmadeusDeals(query, { env, fetchImpl }) {
  if (!env.AMADEUS_CLIENT_ID || !env.AMADEUS_CLIENT_SECRET) return [];
  const token = await amadeusToken({ env, fetchImpl });
  const url = new URL(AMADEUS_FLIGHT_DATES_URL);
  url.searchParams.set('origin', query.origin);
  url.searchParams.set('destination', query.destination);
  url.searchParams.set('currencyCode', 'USD');
  if (query.departureDate) url.searchParams.set('departureDate', query.returnDate ? `${query.departureDate},${query.returnDate}` : query.departureDate);
  if (query.maxPrice) url.searchParams.set('maxPrice', String(query.maxPrice));
  const data = await getJson(url, {
    fetchImpl,
    headers: { authorization: `Bearer ${token}` },
    error: 'Amadeus deal search failed.',
  });
  return (data.data || []).map((deal) => ({
    id: `amadeus-deal-${deal.origin}-${deal.destination}-${deal.departureDate}-${deal.returnDate || 'oneway'}`,
    source: 'Amadeus',
    kind: 'deal',
    title: `${deal.origin} to ${deal.destination}`,
    origin: deal.origin,
    destination: deal.destination,
    departureAt: deal.departureDate,
    arrivalAt: deal.returnDate || '',
    price: Number(deal.price?.total || 0),
    currency: 'USD',
    airline: '',
    detail: deal.returnDate ? `Return ${deal.returnDate}` : 'One way',
    bookingUrl: flightSearchUrl(deal.origin, deal.destination, deal.departureDate, deal.returnDate || ''),
  })).filter((item) => item.price > 0);
}

async function searchAviationstackFlights(query, { env, fetchImpl }) {
  if (!env.AVIATIONSTACK_API_KEY) return [];
  const url = new URL(AVIATIONSTACK_FLIGHTS_URL);
  url.searchParams.set('access_key', env.AVIATIONSTACK_API_KEY);
  url.searchParams.set('dep_iata', query.origin);
  url.searchParams.set('arr_iata', query.destination);
  url.searchParams.set('flight_date', query.departureDate);
  url.searchParams.set('limit', '20');
  const data = await getJson(url, { fetchImpl, error: 'Aviationstack search failed.' });
  return (data.data || []).map((flight) => ({
    id: `aviationstack-${flight.flight?.iata || flight.flight?.icao || Math.random()}`,
    source: 'Aviationstack',
    kind: 'status',
    title: flight.flight?.iata || flight.flight?.icao || `${query.origin} to ${query.destination}`,
    origin: flight.departure?.iata || query.origin,
    destination: flight.arrival?.iata || query.destination,
    departureAt: flight.departure?.scheduled || '',
    arrivalAt: flight.arrival?.scheduled || '',
    price: null,
    currency: '',
    airline: flight.airline?.name || '',
    detail: flight.flight_status || 'Scheduled flight',
    bookingUrl: flightSearchUrl(query.origin, query.destination, query.departureDate, query.returnDate),
  }));
}

async function amadeusToken({ env, fetchImpl }) {
  const body = new URLSearchParams();
  body.set('grant_type', 'client_credentials');
  body.set('client_id', env.AMADEUS_CLIENT_ID);
  body.set('client_secret', env.AMADEUS_CLIENT_SECRET);
  const response = await fetchImpl(AMADEUS_AUTH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new Error('Amadeus auth failed.');
  const data = await response.json();
  if (!data.access_token) throw new Error('Amadeus auth failed.');
  return data.access_token;
}

async function getJson(url, { fetchImpl, headers = {}, error }) {
  const response = await fetchImpl(url, { headers: { accept: 'application/json', ...headers } });
  if (!response.ok) throw new Error(error);
  return response.json();
}

function mapAmadeusOffer(offer, carriers) {
  const first = offer.itineraries?.[0]?.segments?.[0];
  const last = offer.itineraries?.[0]?.segments?.at(-1);
  if (!first || !last) return null;
  const carrier = first.carrierCode || offer.validatingAirlineCodes?.[0] || '';
  return {
    id: `amadeus-${offer.id}`,
    source: 'Amadeus',
    kind: 'fare',
    title: `${first.departure?.iataCode} to ${last.arrival?.iataCode}`,
    origin: first.departure?.iataCode || '',
    destination: last.arrival?.iataCode || '',
    departureAt: first.departure?.at || '',
    arrivalAt: last.arrival?.at || '',
    price: Number(offer.price?.grandTotal || offer.price?.total || 0),
    currency: offer.price?.currency || 'USD',
    airline: carriers[carrier] || carrier,
    detail: `${offer.itineraries?.[0]?.segments?.length || 1} segment${offer.itineraries?.[0]?.segments?.length === 1 ? '' : 's'}`,
    bookingUrl: flightSearchUrl(first.departure?.iataCode || '', last.arrival?.iataCode || '', first.departure?.at?.slice(0, 10) || '', ''),
  };
}

function flightSearchUrl(origin, destination, departureDate, returnDate = '') {
  const query = [`Flights from ${origin} to ${destination}`];
  if (departureDate) query.push(`departing ${departureDate}`);
  if (returnDate) query.push(`returning ${returnDate}`);
  const url = new URL('https://www.google.com/travel/flights/search');
  url.searchParams.set('q', query.join(' '));
  return url.toString();
}

function sortTravelResults(results) {
  return [...results].sort((a, b) => {
    const priceA = a.price === null || a.price === undefined ? Number.POSITIVE_INFINITY : a.price;
    const priceB = b.price === null || b.price === undefined ? Number.POSITIVE_INFINITY : b.price;
    return priceA - priceB || String(a.departureAt).localeCompare(String(b.departureAt));
  });
}

function markErrors(sources, settled) {
  const ids = ['amadeus', 'aviationstack'];
  settled.forEach((item, index) => {
    if (item.status !== 'rejected') return;
    const source = sources.find((entry) => entry.id === ids[index]);
    if (source) {
      source.status = 'error';
      source.error = item.reason?.message || 'Search failed.';
    }
  });
}

function normalizeAirport(value) {
  const text = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(text) ? text : '';
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  return Number.isNaN(new Date(`${text}T00:00:00.000Z`).getTime()) ? '' : text;
}

function clampInt(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

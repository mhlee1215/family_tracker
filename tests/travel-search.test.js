import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { searchTravel, searchTravelDeals, sourceStatuses } from '../src/domain/travel-search.js';

describe('travel search', () => {
  it('reports configured and missing free sources without exposing keys', () => {
    const sources = sourceStatuses({ AMADEUS_CLIENT_ID: 'id', AMADEUS_CLIENT_SECRET: 'secret' });
    assert.equal(sources.find((source) => source.id === 'amadeus').status, 'ready');
    assert.equal(sources.find((source) => source.id === 'aviationstack').status, 'missing_key');
    assert.equal(JSON.stringify(sources).includes('secret'), false);
  });

  it('combines fare and status results by price first', async () => {
    const result = await searchTravel({
      origin: 'sfo',
      destination: 'icn',
      departureDate: '2026-10-10',
      adults: 1,
    }, {
      env: {
        AMADEUS_CLIENT_ID: 'id',
        AMADEUS_CLIENT_SECRET: 'secret',
        AVIATIONSTACK_API_KEY: 'aviation',
      },
      fetchImpl: travelFetch,
    });

    assert.equal(result.results.length, 2);
    assert.equal(result.results[0].source, 'Amadeus');
    assert.equal(result.results[0].price, 721.4);
    assert.match(result.results[0].bookingUrl, /google\.com\/travel\/flights\/search/);
    assert.equal(result.results[1].source, 'Aviationstack');
  });

  it('returns cached Amadeus deals under the requested route', async () => {
    const result = await searchTravelDeals({
      origin: 'SFO',
      destination: 'ICN',
      departureDate: '2026-10-01',
      returnDate: '2026-10-31',
      maxPrice: 800,
    }, {
      env: { AMADEUS_CLIENT_ID: 'id', AMADEUS_CLIENT_SECRET: 'secret' },
      fetchImpl: travelFetch,
    });

    assert.equal(result.deals.length, 1);
    assert.equal(result.deals[0].kind, 'deal');
    assert.equal(result.deals[0].price, 640);
    assert.match(result.deals[0].bookingUrl, /google\.com\/travel\/flights\/search/);
  });
});

async function travelFetch(input) {
  const url = String(input);
  if (url.includes('/security/oauth2/token')) return okJson({ access_token: 'token' });
  if (url.includes('/v2/shopping/flight-offers')) {
    return okJson({
      dictionaries: { carriers: { UA: 'United Airlines' } },
      data: [{
        id: '1',
        price: { grandTotal: '721.40', currency: 'USD' },
        itineraries: [{ segments: [{ carrierCode: 'UA', departure: { iataCode: 'SFO', at: '2026-10-10T11:00:00' }, arrival: { iataCode: 'ICN', at: '2026-10-11T16:00:00' } }] }],
      }],
    });
  }
  if (url.includes('/v1/shopping/flight-dates')) {
    return okJson({ data: [{ origin: 'SFO', destination: 'ICN', departureDate: '2026-10-10', returnDate: '2026-10-20', price: { total: '640.00' } }] });
  }
  if (url.includes('aviationstack.com')) {
    return okJson({ data: [{ flight_status: 'scheduled', airline: { name: 'United Airlines' }, flight: { iata: 'UA893' }, departure: { iata: 'SFO', scheduled: '2026-10-10T11:00:00' }, arrival: { iata: 'ICN', scheduled: '2026-10-11T16:00:00' } }] });
  }
  throw new Error(`Unexpected URL: ${url}`);
}

function okJson(payload) {
  return { ok: true, json: async () => payload };
}

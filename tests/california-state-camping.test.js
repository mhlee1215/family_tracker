import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  californiaReservationUrl,
  findCaliforniaStateAvailability,
  parseReserveCaliforniaAvailability,
  searchCaliforniaStateCampgrounds,
} from '../src/domain/california-state-camping.js';

describe('california state camping', () => {
  it('maps ReserveCalifornia campground search results', async () => {
    const requestedUrls = [];
    const results = await searchCaliforniaStateCampgrounds('pinnacles', {
      fetchImpl: async (url) => {
        requestedUrls.push(String(url));
        if (String(url).endsWith('/rdr/fd/places')) {
          return okJson([{ PlaceId: 42, Name: 'Pinnacles', City: 'Paicines', State: 'CA' }]);
        }
        return okJson([
          { FacilityId: 327, PlaceId: 42, Name: 'PINNACLES CAMPGROUND', AllowWebBooking: true, TotalUnits: 134 },
          { FacilityId: 328, PlaceId: 42, Name: 'Pinnacles Visitor Center', AllowWebBooking: true },
        ]);
      },
    });

    assert.equal(requestedUrls.length, 2);
    assert.deepEqual(results, [{
      id: '327',
      provider: 'california_state',
      providerLabel: 'CA State',
      name: 'PINNACLES CAMPGROUND',
      location: 'Pinnacles · Paicines · CA',
      rating: 0,
      ratingCount: 0,
      campsiteCount: 134,
      distance: 0,
      reservable: true,
      placeId: '42',
      bookingUrl: 'https://www.reservecalifornia.com/park/42/327',
    }]);
  });

  it('uses ZIP code coordinates for nearby ReserveCalifornia search', async () => {
    const results = await searchCaliforniaStateCampgrounds('95060', {
      fetchImpl: async (url) => {
        const requestUrl = String(url);
        if (requestUrl.startsWith('https://api.zippopotam.us')) {
          return okJson({ places: [{ latitude: '36.9741', longitude: '-122.0308' }] });
        }
        if (requestUrl.endsWith('/rdr/fd/places')) {
          return okJson([
            { PlaceId: 3, Name: 'Big Basin Redwoods SP', City: 'Boulder Creek', State: 'CA', Latitude: 37.1729, Longitude: -122.2115 },
            { PlaceId: 680, Name: 'Morro Bay SP', City: 'Morro Bay', State: 'CA', Latitude: 35.3466, Longitude: -120.8396 },
          ]);
        }
        return okJson([
          { FacilityId: 336, PlaceId: 3, Name: 'Huckleberry Campground', AllowWebBooking: true, TotalUnits: 30 },
          { FacilityId: 582, PlaceId: 680, Name: 'Lower Section', AllowWebBooking: true, TotalUnits: 85 },
        ]);
      },
    });

    assert.equal(results.length, 2);
    assert.deepEqual(results.map((item) => item.name), ['Huckleberry Campground', 'Lower Section']);
    assert.ok(results[0].distance < results[1].distance);
  });

  it('finds available ReserveCalifornia units and builds dated reservation links', async () => {
    const requestedBodies = [];
    const matches = await findCaliforniaStateAvailability({
      campgroundId: '327',
      placeId: '42',
      rangeStart: '2026-09-01',
      rangeEnd: '2026-09-08',
      stayNights: 2,
      weekendOnly: true,
    }, {
      fetchImpl: async (_url, options = {}) => {
        requestedBodies.push(JSON.parse(options.body));
        return okJson({
          Facility: {
            FacilityId: 327,
            PlaceId: 42,
            Units: {
              126: unit('126', 'Site 126', ['Available', 'Available']),
              127: unit('127', 'Site 127', ['Available', 'Reserved']),
            },
          },
        });
      },
    });

    assert.deepEqual(requestedBodies.map((body) => [body.StartDate, body.EndDate]), [
      ['09-04-2026', '09-06-2026'],
      ['09-05-2026', '09-07-2026'],
    ]);
    assert.equal(matches.length, 2);
    assert.equal(matches[0].provider, 'california_state');
    assert.equal(matches[0].site, 'Site 126');
    assert.equal(matches[0].checkoutUrl, 'https://www.reservecalifornia.com/park/42/327?site=126&arrivalDate=09-04-2026&departureDate=09-06-2026');
  });

  it('parses ReserveCalifornia unit slices', () => {
    const matches = parseReserveCaliforniaAvailability({
      Facility: {
        FacilityId: 327,
        PlaceId: 42,
        Units: [
          unit('126', 'Site 126', ['Available', 'Available']),
          unit('127', 'Site 127', ['Available', 'Reserved']),
        ],
      },
    }, { facilityId: '327', placeId: '42', startDate: '2026-09-04', endDate: '2026-09-06' });

    assert.equal(matches.length, 1);
    assert.equal(matches[0].campsiteId, '126');
    assert.deepEqual(matches[0].nights, ['2026-09-04', '2026-09-05']);
    assert.equal(matches[0].checkoutUrl, californiaReservationUrl({
      placeId: '42',
      facilityId: '327',
      campsiteId: '126',
      startDate: '2026-09-04',
      endDate: '2026-09-06',
    }));
  });
});

function unit(id, name, statuses) {
  return {
    UnitId: id,
    Name: name,
    UnitTypeName: 'Tent',
    UnitCategoryName: 'STANDARD',
    MaxOccupancy: 6,
    Slices: statuses.map((status) => ({ Status: status })),
  };
}

function okJson(payload) {
  return {
    ok: true,
    json: async () => payload,
  };
}

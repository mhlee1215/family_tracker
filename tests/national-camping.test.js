import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findNationalAvailability, reservationUrl, searchNationalCampgrounds, searchWindows } from '../src/domain/national-camping.js';

describe('national camping', () => {
  it('maps campground search results', async () => {
    const results = await searchNationalCampgrounds('upper', {
      fetchImpl: async () => okJson({
        results: [
          { entity_id: '232450', name: 'Lower Pines Campground', location: 'Yosemite National Park, CA', average_rating: 4.1, number_of_ratings: 1200, campsites_count: 60 },
          { entity_id: '232447', name: 'Upper Pines Campground', location: 'Yosemite National Park, CA', average_rating: 4.3869452, number_of_ratings: 3830, campsites_count: 238 },
        ],
      }),
    });
    assert.deepEqual(results, [
      {
        id: '232447',
        name: 'Upper Pines Campground',
        location: 'Yosemite National Park, CA',
        rating: 4.3869452,
        ratingCount: 3830,
        campsiteCount: 238,
        distance: 0,
        reservable: true,
      },
      {
        id: '232450',
        name: 'Lower Pines Campground',
        location: 'Yosemite National Park, CA',
        rating: 4.1,
        ratingCount: 1200,
        campsiteCount: 60,
        distance: 0,
        reservable: true,
      },
    ]);
  });

  it('uses ZIP code coordinates for nearby campground search', async () => {
    const requestedUrls = [];
    const results = await searchNationalCampgrounds('94117', {
      fetchImpl: async (url) => {
        requestedUrls.push(String(url));
        if (String(url).startsWith('https://api.zippopotam.us')) {
          return okJson({ places: [{ latitude: '37.7712', longitude: '-122.4413' }] });
        }
        return okJson({
          results: [
            { entity_id: 'rob-hill', name: 'Rob Hill Group Campground', location: 'San Francisco, CA', average_rating: 4.2, number_of_ratings: 32, campsites_count: 4, distance: '4.20' },
            { entity_id: 'kirby', name: 'Kirby Cove Campground', location: 'Sausalito, CA', average_rating: 4.8, number_of_ratings: 191, campsites_count: 5, distance: '8.75' },
          ],
        });
      },
    });

    assert.equal(new URL(requestedUrls[1]).searchParams.get('lat'), '37.7712');
    assert.equal(new URL(requestedUrls[1]).searchParams.get('lng'), '-122.4413');
    assert.deepEqual(results.map((item) => [item.name, item.distance]), [
      ['Rob Hill Group Campground', 4.2],
      ['Kirby Cove Campground', 8.75],
    ]);
  });

  it('finds sites available for every requested night', async () => {
    const matches = await findNationalAvailability({
      campgroundId: '232447',
      startDate: '2026-08-10',
      endDate: '2026-08-12',
    }, {
      fetchImpl: async () => okJson({
        campsites: {
          100: campsite('100', '044', { '2026-08-10T00:00:00Z': 'Available', '2026-08-11T00:00:00Z': 'Available' }),
          101: campsite('101', '045', { '2026-08-10T00:00:00Z': 'Available', '2026-08-11T00:00:00Z': 'Reserved' }),
        },
      }),
    });

    assert.equal(matches.length, 1);
    assert.equal(matches[0].site, '044');
    assert.deepEqual(matches[0].nights, ['2026-08-10', '2026-08-11']);
    assert.equal(matches[0].checkoutUrl, 'https://www.recreation.gov/camping/campsites/100?checkin=08%2F10%2F2026&checkout=08%2F12%2F2026');
    assert.equal(matches[0].checkoutUrl, reservationUrl({ campgroundId: '232447', campsiteId: '100', startDate: '2026-08-10', endDate: '2026-08-12' }));
  });

  it('builds campsite reservation links with Recreation.gov date query format', () => {
    assert.equal(
      reservationUrl({ campgroundId: '232447', campsiteId: '100', startDate: '2026-09-04', endDate: '2026-09-06' }),
      'https://www.recreation.gov/camping/campsites/100?checkin=09%2F04%2F2026&checkout=09%2F06%2F2026',
    );
    assert.equal(
      reservationUrl({ campgroundId: '232447', startDate: '2026-09-04', endDate: '2026-09-06' }),
      'https://www.recreation.gov/camping/campgrounds/232447?checkin=09%2F04%2F2026&checkout=09%2F06%2F2026',
    );
  });

  it('builds weekend-only windows inside a search range', () => {
    const windows = searchWindows({
      rangeStart: '2026-09-01',
      rangeEnd: '2026-09-08',
      stayNights: 2,
      weekendOnly: true,
    });

    assert.deepEqual(windows.map((item) => [item.startDate, item.endDate]), [
      ['2026-09-04', '2026-09-06'],
      ['2026-09-05', '2026-09-07'],
    ]);
  });

  it('finds available windows inside a weekend search range', async () => {
    const matches = await findNationalAvailability({
      campgroundId: '232447',
      rangeStart: '2026-09-01',
      rangeEnd: '2026-09-08',
      stayNights: 2,
      weekendOnly: true,
    }, {
      fetchImpl: async () => okJson({
        campsites: {
          100: campsite('100', '044', {
            '2026-09-04T00:00:00Z': 'Reserved',
            '2026-09-05T00:00:00Z': 'Available',
            '2026-09-06T00:00:00Z': 'Available',
          }),
        },
      }),
    });

    assert.equal(matches.length, 1);
    assert.equal(matches[0].startDate, '2026-09-05');
    assert.equal(matches[0].endDate, '2026-09-07');
  });
});

function campsite(campsiteId, site, availabilities) {
  return { campsite_id: campsiteId, site, loop: 'Upper Pines', campsite_reserve_type: 'Site-Specific', availabilities };
}

function okJson(payload) {
  return { ok: true, json: async () => payload };
}

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findNationalAvailability, reservationUrl, searchNationalCampgrounds, searchWindows } from '../src/domain/national-camping.js';

describe('national camping', () => {
  it('maps campground search results', async () => {
    const results = await searchNationalCampgrounds('upper', {
      fetchImpl: async () => okJson({
        results: [{ entity_id: '232447', name: 'Upper Pines Campground', location: 'Yosemite National Park, CA', campsites_count: 238 }],
      }),
    });
    assert.deepEqual(results, [{
      id: '232447',
      name: 'Upper Pines Campground',
      location: 'Yosemite National Park, CA',
      reservable: true,
    }]);
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
    assert.equal(matches[0].checkoutUrl, reservationUrl({ campgroundId: '232447', campsiteId: '100', startDate: '2026-08-10', endDate: '2026-08-12' }));
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

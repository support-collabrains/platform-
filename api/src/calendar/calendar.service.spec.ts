// Covers: ensureCollection (two-step MKCOL+MKCALENDAR to correct URLs, swallows errors),
// getEvents (REPORT request with time-range, parses timed and all-day events,
//   returns empty array on error), createEvent (returns UID, PUTs iCal content,
//   DATE format for all-day, includes optional LOCATION/DESCRIPTION),
// parseVevent internals via getEvents (null when SUMMARY missing, uid fallback)

import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { CalendarService } from './calendar.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeService(overrides: Record<string, string> = {}): CalendarService {
  const cfg: Record<string, string> = { RADICALE_URL: 'http://radicale:5232', ...overrides };
  return new CalendarService({ get: (k: string) => cfg[k] ?? '' } as unknown as ConfigService);
}

const TIMED_EVENT_XML = `<?xml version="1.0" ?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <C:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:abc-123
SUMMARY:Team Meeting
DTSTART:20240301T100000Z
DTEND:20240301T110000Z
LOCATION:Office
DESCRIPTION:Weekly sync
END:VEVENT
END:VCALENDAR</C:calendar-data>
  </D:response>
</D:multistatus>`;

const ALLDAY_EVENT_XML = `<?xml version="1.0" ?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <C:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:allday-1
SUMMARY:Holiday
DTSTART;VALUE=DATE:20240401
DTEND;VALUE=DATE:20240402
END:VEVENT
END:VCALENDAR</C:calendar-data>
  </D:response>
</D:multistatus>`;

const NO_SUMMARY_XML = `<?xml version="1.0" ?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <C:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:no-summary
DTSTART:20240301T100000Z
DTEND:20240301T110000Z
END:VEVENT
END:VCALENDAR</C:calendar-data>
  </D:response>
</D:multistatus>`;

const TWO_EVENTS_XML = `<?xml version="1.0" ?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <C:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:ev1
SUMMARY:Event One
DTSTART:20240301T090000Z
DTEND:20240301T100000Z
END:VEVENT
END:VCALENDAR</C:calendar-data>
  </D:response>
  <D:response>
    <C:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:ev2
SUMMARY:Event Two
DTSTART:20240302T140000Z
DTEND:20240302T150000Z
END:VEVENT
END:VCALENDAR</C:calendar-data>
  </D:response>
</D:multistatus>`;

describe('CalendarService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('ensureCollection()', () => {
    it('sends MKCOL to the parent user home URL then MKCALENDAR to the calendar URL', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' }) // parent MKCOL
        .mockResolvedValueOnce({ status: 201, data: '' }); // MKCALENDAR
      await makeService().ensureCollection('alice');
      // First call: plain MKCOL to the user home collection
      expect(mockedAxios.request.mock.calls[0][0]).toMatchObject({
        method: 'MKCOL',
        url: 'http://radicale:5232/alice/',
      });
      // Second call: MKCALENDAR to the calendar sub-collection
      expect(mockedAxios.request.mock.calls[1][0]).toMatchObject({
        method: 'MKCALENDAR',
        url: 'http://radicale:5232/alice/calendar/',
      });
    });

    it('uses custom RADICALE_URL from config', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ status: 201, data: '' });
      await makeService({ RADICALE_URL: 'http://custom:9999' }).ensureCollection('alice');
      expect(mockedAxios.request.mock.calls[0][0]).toMatchObject({ url: 'http://custom:9999/alice/' });
      expect(mockedAxios.request.mock.calls[1][0]).toMatchObject({ url: 'http://custom:9999/alice/calendar/' });
    });

    it('does not throw when MKCOL fails (collection may already exist)', async () => {
      mockedAxios.request.mockRejectedValueOnce(new Error('conn refused'));
      await expect(makeService().ensureCollection('alice')).resolves.toBeUndefined();
    });

    it('sends XML body with caldav content type on the MKCALENDAR request', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' }) // parent MKCOL
        .mockResolvedValueOnce({ status: 201, data: '' }); // MKCALENDAR
      await makeService().ensureCollection('alice');
      // calls[1] is the MKCALENDAR request that carries the mkcalendar XML body
      const opts = mockedAxios.request.mock.calls[1][0] as { headers: Record<string, string>; data: string };
      expect(opts.headers['Content-Type']).toContain('application/xml');
      expect(opts.data).toContain('mkcalendar');
    });
  });

  describe('getEvents()', () => {
    it('calls ensureCollection (2 requests) before REPORT — 3 calls total', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' }) // parent MKCOL
        .mockResolvedValueOnce({ status: 201, data: '' }) // MKCALENDAR
        .mockResolvedValueOnce({ data: '' });              // REPORT
      await makeService().getEvents('alice', new Date(), new Date());
      expect(mockedAxios.request).toHaveBeenCalledTimes(3);
      const calls = mockedAxios.request.mock.calls as Array<[{ method: string }]>;
      expect(calls[0][0].method).toBe('MKCOL');
      expect(calls[1][0].method).toBe('MKCALENDAR');
      expect(calls[2][0].method).toBe('REPORT');
    });

    it('sends REPORT with from/to date range', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ data: '' });
      const from = new Date('2024-03-01T00:00:00Z');
      const to = new Date('2024-04-01T00:00:00Z');
      await makeService().getEvents('alice', from, to);
      // calls[2] is the REPORT
      const opts = mockedAxios.request.mock.calls[2][0] as { data: string };
      expect(opts.data).toContain('20240301');
      expect(opts.data).toContain('20240401');
    });

    it('sends REPORT with Depth:1 header', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ data: '' });
      await makeService().getEvents('alice', new Date(), new Date());
      // calls[2] is the REPORT
      const opts = mockedAxios.request.mock.calls[2][0] as { headers: Record<string, string> };
      expect(opts.headers['Depth']).toBe('1');
    });

    it('parses timed event from CalDAV REPORT response', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ data: TIMED_EVENT_XML });
      const events = await makeService().getEvents('alice', new Date(), new Date());
      expect(events).toHaveLength(1);
      expect(events[0].uid).toBe('abc-123');
      expect(events[0].summary).toBe('Team Meeting');
      expect(events[0].location).toBe('Office');
      expect(events[0].description).toBe('Weekly sync');
      expect(events[0].allDay).toBe(false);
    });

    it('parses all-day event as allDay:true with DATE-only start', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ data: ALLDAY_EVENT_XML });
      const events = await makeService().getEvents('alice', new Date(), new Date());
      expect(events[0].allDay).toBe(true);
      expect(events[0].start).toBe('2024-04-01');
    });

    it('skips events without SUMMARY', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ data: NO_SUMMARY_XML });
      const events = await makeService().getEvents('alice', new Date(), new Date());
      expect(events).toHaveLength(0);
    });

    it('parses multiple events from a single REPORT response', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ data: TWO_EVENTS_XML });
      const events = await makeService().getEvents('alice', new Date(), new Date());
      expect(events).toHaveLength(2);
      expect(events.map((e) => e.uid)).toEqual(['ev1', 'ev2']);
    });

    it('returns empty array on REPORT network error', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockRejectedValueOnce(new Error('timeout'));
      const events = await makeService().getEvents('alice', new Date(), new Date());
      expect(events).toEqual([]);
    });

    it('returns empty array when response is empty string', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ data: '' });
      const events = await makeService().getEvents('alice', new Date(), new Date());
      expect(events).toEqual([]);
    });
  });

  describe('createEvent()', () => {
    it('returns a UID string containing @collabrains', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' }) // parent MKCOL
        .mockResolvedValueOnce({ status: 201, data: '' }); // MKCALENDAR
      mockedAxios.put.mockResolvedValueOnce({ data: '' });
      const uid = await makeService().createEvent('alice', {
        summary: 'Stand-up',
        start: '2024-03-01T09:00:00Z',
        end: '2024-03-01T09:30:00Z',
        allDay: false,
      });
      expect(typeof uid).toBe('string');
      expect(uid).toContain('@collabrains');
    });

    it('PUTs iCal to collection URL with .ics extension', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ status: 201, data: '' });
      mockedAxios.put.mockResolvedValueOnce({ data: '' });
      await makeService().createEvent('alice', {
        summary: 'Meet',
        start: '2024-03-01T10:00:00Z',
        end: '2024-03-01T11:00:00Z',
        allDay: false,
      });
      const putUrl = mockedAxios.put.mock.calls[0][0] as string;
      expect(putUrl).toMatch(/http:\/\/radicale:5232\/alice\/calendar\/.+\.ics/);
    });

    it('generates valid iCal with BEGIN/END VCALENDAR and VEVENT', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ status: 201, data: '' });
      mockedAxios.put.mockResolvedValueOnce({ data: '' });
      await makeService().createEvent('alice', {
        summary: 'Stand-up',
        start: '2024-03-01T09:00:00Z',
        end: '2024-03-01T09:30:00Z',
        allDay: false,
      });
      const ical = mockedAxios.put.mock.calls[0][1] as string;
      expect(ical).toContain('BEGIN:VCALENDAR');
      expect(ical).toContain('END:VCALENDAR');
      expect(ical).toContain('BEGIN:VEVENT');
      expect(ical).toContain('SUMMARY:Stand-up');
    });

    it('uses VALUE=DATE format for all-day events', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ status: 201, data: '' });
      mockedAxios.put.mockResolvedValueOnce({ data: '' });
      await makeService().createEvent('alice', {
        summary: 'Vacation',
        start: '2024-07-01T00:00:00Z',
        end: '2024-07-08T00:00:00Z',
        allDay: true,
      });
      const ical = mockedAxios.put.mock.calls[0][1] as string;
      expect(ical).toContain('DTSTART;VALUE=DATE:20240701');
      expect(ical).toContain('DTEND;VALUE=DATE:20240708');
    });

    it('uses DATETIME format (no VALUE=DATE) for timed events', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ status: 201, data: '' });
      mockedAxios.put.mockResolvedValueOnce({ data: '' });
      await makeService().createEvent('alice', {
        summary: 'Call',
        start: '2024-03-01T14:00:00Z',
        end: '2024-03-01T15:00:00Z',
        allDay: false,
      });
      const ical = mockedAxios.put.mock.calls[0][1] as string;
      expect(ical).toContain('DTSTART:20240301');
      expect(ical).not.toContain('DTSTART;VALUE=DATE');
    });

    it('includes LOCATION line when location is provided', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ status: 201, data: '' });
      mockedAxios.put.mockResolvedValueOnce({ data: '' });
      await makeService().createEvent('alice', {
        summary: 'Meeting',
        start: '2024-03-01T10:00:00Z',
        end: '2024-03-01T11:00:00Z',
        allDay: false,
        location: 'Room A',
      });
      const ical = mockedAxios.put.mock.calls[0][1] as string;
      expect(ical).toContain('LOCATION:Room A');
    });

    it('includes DESCRIPTION line when description is provided', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ status: 201, data: '' });
      mockedAxios.put.mockResolvedValueOnce({ data: '' });
      await makeService().createEvent('alice', {
        summary: 'Meeting',
        start: '2024-03-01T10:00:00Z',
        end: '2024-03-01T11:00:00Z',
        allDay: false,
        description: 'Important sync',
      });
      const ical = mockedAxios.put.mock.calls[0][1] as string;
      expect(ical).toContain('DESCRIPTION:Important sync');
    });

    it('omits LOCATION when not provided', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ status: 201, data: '' });
      mockedAxios.put.mockResolvedValueOnce({ data: '' });
      await makeService().createEvent('alice', {
        summary: 'Stand-up',
        start: '2024-03-01T09:00:00Z',
        end: '2024-03-01T09:30:00Z',
        allDay: false,
      });
      const ical = mockedAxios.put.mock.calls[0][1] as string;
      expect(ical).not.toContain('LOCATION:');
    });

    it('uses text/calendar content type', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ status: 201, data: '' });
      mockedAxios.put.mockResolvedValueOnce({ data: '' });
      await makeService().createEvent('alice', {
        summary: 'Stand-up',
        start: '2024-03-01T09:00:00Z',
        end: '2024-03-01T09:30:00Z',
        allDay: false,
      });
      const opts = mockedAxios.put.mock.calls[0][2] as { headers: Record<string, string> };
      expect(opts.headers['Content-Type']).toContain('text/calendar');
    });
  });
});

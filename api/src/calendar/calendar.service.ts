import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface CalEvent {
  uid: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  allDay: boolean;
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = config.get('RADICALE_URL') ?? 'http://radicale:5232';
  }

  private collectionUrl(username: string): string {
    return `${this.baseUrl}/${username.toLowerCase()}/calendar/`;
  }

  async ensureCollection(username: string): Promise<void> {
    const homeUrl = `${this.baseUrl}/${username.toLowerCase()}/`;
    const calUrl = this.collectionUrl(username);
    const opts = { validateStatus: (s: number) => s < 500 };
    try {
      // Step 1: create user home collection (required parent before MKCALENDAR)
      await axios.request({ method: 'MKCOL', url: homeUrl, headers: { 'Content-Type': 'application/xml; charset=utf-8' }, data: `<?xml version="1.0" encoding="utf-8" ?><D:mkcol xmlns:D="DAV:"><D:set><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:set></D:mkcol>`, ...opts });
      // Step 2: create calendar collection
      await axios.request({ method: 'MKCALENDAR', url: calUrl, headers: { 'Content-Type': 'application/xml; charset=utf-8' }, data: `<?xml version="1.0" encoding="utf-8" ?><C:mkcalendar xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:set><D:prop><D:displayname>CollaBrains</D:displayname><C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set></D:prop></D:set></C:mkcalendar>`, ...opts });
    } catch {
      // ignore — collections may already exist
    }
  }

  async getEvents(username: string, from: Date, to: Date): Promise<CalEvent[]> {
    await this.ensureCollection(username);
    const url = this.collectionUrl(username);

    const fmt = (d: Date) =>
      d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

    const body = `<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><D:getetag/><C:calendar-data/></D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${fmt(from)}" end="${fmt(to)}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

    try {
      const { data } = await axios.request<string>({
        method: 'REPORT',
        url,
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Depth': '1',
        },
        data: body,
        responseType: 'text',
        validateStatus: (s: number) => s < 500,
      });
      return this.parseMultiStatus(data);
    } catch (err) {
      this.logger.warn(`CalDAV REPORT failed: ${String(err)}`);
      return [];
    }
  }

  async createEvent(username: string, event: Omit<CalEvent, 'uid'>): Promise<string> {
    await this.ensureCollection(username);
    const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@collabrains`;
    const url = `${this.collectionUrl(username)}${uid}.ics`;

    const ical = this.buildIcal({ ...event, uid });
    await axios.put(url, ical, {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
      validateStatus: (s: number) => s < 500,
    });
    return uid;
  }

  private fmtIcal(dateStr: string, allDay: boolean): string {
    const [datePart, timePart = '000000'] = dateStr.split('T');
    const d = datePart.replace(/-/g, '');
    if (allDay) return d.slice(0, 8);
    const t = timePart.replace(/:/g, '').slice(0, 6).padEnd(6, '0');
    return `${d}T${t}`;
  }

  private buildIcal(event: CalEvent): string {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CollaBrains//EN',
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `SUMMARY:${event.summary}`,
      `DTSTART${event.allDay ? ';VALUE=DATE' : ''}:${this.fmtIcal(event.start, event.allDay)}`,
      `DTEND${event.allDay ? ';VALUE=DATE' : ''}:${this.fmtIcal(event.end, event.allDay)}`,
    ];
    if (event.location) lines.push(`LOCATION:${event.location}`);
    if (event.description) lines.push(`DESCRIPTION:${event.description}`);
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.join('\r\n');
  }

  private parseMultiStatus(xml: string): CalEvent[] {
    const events: CalEvent[] = [];
    // Extract calendar-data sections
    const calDataMatches = xml.matchAll(/<[^:]*:calendar-data[^>]*>([\s\S]*?)<\/[^:]*:calendar-data>/gi);
    for (const m of calDataMatches) {
      const ical = m[1];
      const event = this.parseVevent(ical);
      if (event) events.push(event);
    }
    return events;
  }

  private parseVevent(ical: string): CalEvent | null {
    const get = (key: string) => {
      const m = ical.match(new RegExp(`^${key}[^:]*:(.+)$`, 'm'));
      return m ? m[1].trim() : undefined;
    };
    const summary = get('SUMMARY');
    const uid = get('UID') ?? `${Date.now()}`;
    const dtstart = get('DTSTART');
    const dtend = get('DTEND') ?? get('DURATION');
    if (!summary || !dtstart) return null;

    const parseDate = (raw: string): { iso: string; allDay: boolean } => {
      // Strip property name and parameters (e.g. "DTSTART;VALUE=DATE:"), keep only the value
      const val = raw.includes(':') ? raw.split(':').slice(1).join(':').trim() : raw.trim();
      // Remove trailing timezone suffix like Z or timezone identifiers
      const d = val.replace(/Z$/, '');
      const allDay = d.length === 8 || d.indexOf('T') === -1;
      if (allDay) {
        const date = d.slice(0, 8);
        return { iso: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`, allDay: true };
      }
      const tIdx = d.indexOf('T');
      const datePart = d.slice(0, tIdx);
      const timePart = d.slice(tIdx + 1);
      const iso = `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(6, 8)}T${timePart.slice(0, 2)}:${timePart.slice(2, 4)}:${timePart.slice(4, 6)}`;
      return { iso, allDay: false };
    };

    const { iso: start, allDay } = parseDate(dtstart);
    const { iso: end } = parseDate(dtend ?? dtstart);

    return {
      uid,
      summary,
      start,
      end,
      allDay,
      location: get('LOCATION'),
      description: get('DESCRIPTION'),
    };
  }
}

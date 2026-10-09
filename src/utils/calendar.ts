import { Language, RentalBooking, RentalCalendarBlock, Task } from '../types';

/** Monday-first month grid helpers. All dates are YYYY-MM-DD business keys. */

export interface CalendarDay {
  dateKey: string;
  dayNumber: number;
  inMonth: boolean;
  isToday: boolean;
}

export function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function dateKeyOf(year: number, monthIndex: number, day: number): string {
  const date = new Date(Date.UTC(year, monthIndex, day));
  return date.toISOString().slice(0, 10);
}

/** 6 rows × 7 days (Monday first), including leading/trailing days for a stable grid. */
export function buildMonthGrid(monthKey: string, todayKey: string): CalendarDay[] {
  const [year, month] = monthKey.split('-').map(Number);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  // Monday-first offset: Sunday (0) becomes 6.
  const leadDays = (firstWeekday + 6) % 7;
  const days: CalendarDay[] = [];
  for (let i = 0; i < 42; i++) {
    const dayOffset = i - leadDays + 1;
    const key = dateKeyOf(year, month - 1, dayOffset);
    const parts = key.split('-').map(Number);
    days.push({
      dateKey: key,
      dayNumber: parts[2],
      inMonth: key.slice(0, 7) === monthKey,
      isToday: key === todayKey,
    });
  }
  return days;
}

export function monthLabel(monthKey: string, language: Language): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  try {
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar' : language === 'fr' ? 'fr' : 'en', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  } catch {
    return monthKey;
  }
}

export function weekdayLabels(language: Language): string[] {
  if (language === 'fr') return ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  if (language === 'ar') return ['إثنين', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت', 'أحد'];
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
}

export interface CalendarTaskRef {
  taskId: string;
  projectId: string;
  projectName: string;
  title: string;
  status: Task['status'];
  overdue: boolean;
}

/** Open (non-completed) tasks with a due date, grouped for the agenda. */
export function groupTasksByDate(  tasks: { task: Task; projectId: string; projectName: string }[],
  todayKey: string
): Map<string, CalendarTaskRef[]> {
  const map = new Map<string, CalendarTaskRef[]>();
  for (const { task, projectId, projectName } of tasks) {
    if (task.status === 'completed') continue;
    const due = task.baselineDeadline || task.deadline;
    if (!due) continue;
    const list = map.get(due) || [];
    list.push({
      taskId: task.id,
      projectId,
      projectName,
      title: task.title,
      status: task.status,
      overdue: due < todayKey,
    });
    map.set(due, list);
  }
  return map;
}

export interface RentalDayRef {
  bookingId: string;
  projectId: string;
  projectName: string;
  guestName: string;
}

export interface RentalBlockRef {
  blockId: string;
  projectId: string;
  projectName: string;
  title: string;
  type: RentalCalendarBlock['type'];
}

export interface RentalDay {
  arrivals: RentalDayRef[];
  departures: RentalDayRef[];
  cleanings: RentalDayRef[];
  blocks: RentalBlockRef[];
}

function emptyRentalDay(): RentalDay {
  return { arrivals: [], departures: [], cleanings: [], blocks: [] };
}

/**
 * Familiar month-calendar content for rentals: guest arrivals on check-in day,
 * departures + cleaning due on check-out day, and active holds/maintenance blocks
 * spanning their whole period. Cancelled bookings and stays never enter the map.
 */
export function groupRentalDays(
  stays: { booking: RentalBooking; projectId: string; projectName: string }[],
  blocks: { block: RentalCalendarBlock; projectId: string; projectName: string }[]
): Map<string, RentalDay> {
  const map = new Map<string, RentalDay>();
  const at = (dateKey: string): RentalDay => {
    const existing = map.get(dateKey);
    if (existing) return existing;
    const created = emptyRentalDay();
    map.set(dateKey, created);
    return created;
  };

  for (const { booking, projectId, projectName } of stays) {
    if (booking.status === 'cancelled') continue;
    const ref: RentalDayRef = {
      bookingId: booking.id,
      projectId,
      projectName,
      guestName: booking.clientName,
    };
    if (booking.checkIn) at(booking.checkIn).arrivals.push(ref);
    if (booking.checkOut) {
      const day = at(booking.checkOut);
      day.departures.push(ref);
      if (booking.operations?.cleaningStatus !== 'completed') {
        day.cleanings.push(ref);
      }
    }
  }

  for (const { block, projectId, projectName } of blocks) {
    if (block.status !== 'active' || !block.startDate || !block.endDate) continue;
    for (let key = block.startDate; key < block.endDate; key = nextDateKey(key)) {
      at(key).blocks.push({
        blockId: block.id,
        projectId,
        projectName,
        title: block.title,
        type: block.type,
      });
    }
  }

  return map;
}

/** Next calendar day for an ISO date key (UTC-safe, DST-proof). */
export function nextDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

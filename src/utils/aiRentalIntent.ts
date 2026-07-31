import { Project } from '../types';
import type { AIProposedAction } from './aiActions';

const MONTHS: Record<string, number> = {
  january: 1,
  janvier: 1,
  jan: 1,
  february: 2,
  fevrier: 2,
  feb: 2,
  fev: 2,
  march: 3,
  mars: 3,
  mar: 3,
  april: 4,
  avril: 4,
  apr: 4,
  avr: 4,
  may: 5,
  mai: 5,
  june: 6,
  juin: 6,
  jun: 6,
  july: 7,
  juillet: 7,
  jul: 7,
  august: 8,
  aout: 8,
  out: 8,
  aug: 8,
  september: 9,
  septembre: 9,
  sep: 9,
  october: 10,
  octobre: 10,
  oct: 10,
  november: 11,
  novembre: 11,
  nov: 11,
  december: 12,
  decembre: 12,
  dec: 12,
};

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}.]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeProjectValue = (value: string) =>
  normalize(value).replace(/[.]+/g, ' ').replace(/\s+/g, ' ').trim();

const isoDate = (year: number, month: number, day: number): string | null => {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const titleCase = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');

function resolveRentalProject(
  message: string,
  projects: Project[],
  activeProject: Project | null
): Project | null {
  const normalizedMessage = normalizeProjectValue(message);
  const rentals = projects.filter((project) => project.projectType === 'rental' && project.rentalProperty);

  const exact = rentals
    .map((project) => ({
      project,
      values: [
        project.rentalProperty?.buildingNumber,
        project.name,
        project.address,
      ]
        .filter(Boolean)
        .map((value) => normalizeProjectValue(String(value)))
        .filter((value) => value.length >= 2),
    }))
    .sort((left, right) =>
      Math.max(...right.values.map((value) => value.length))
      - Math.max(...left.values.map((value) => value.length))
    )
    .find(({ values }) => values.some((value) => normalizedMessage.includes(value)));

  if (exact) return exact.project;
  return activeProject?.projectType === 'rental' ? activeProject : null;
}

function extractDateRange(message: string): { checkIn: string; checkOut: string } | null {
  const monthNames = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
  const range = new RegExp(
    `(?:men|mn|from|du|de)?\\s*(\\d{1,2})\\s+(${monthNames})\\s+(?:l|to|au|a|ila|jusqu a|-)\\s*(\\d{1,2})\\s+(${monthNames})\\s+(\\d{4})`,
    'i'
  ).exec(normalize(message));
  if (!range) return null;

  const checkIn = isoDate(Number(range[5]), MONTHS[range[2]], Number(range[1]));
  const checkOut = isoDate(Number(range[5]), MONTHS[range[4]], Number(range[3]));
  if (!checkIn || !checkOut || checkOut <= checkIn) return null;
  return { checkIn, checkOut };
}

function extractClientName(message: string): string {
  const normalized = normalize(message);
  const match = /(?:client|guest)\s+(?:(?:smitou|smito|smiytou|smiyto|name is|name|nom|s appelle)\s+)?([\p{L}][\p{L}'-]*)/iu.exec(normalized);
  return match ? titleCase(match[1]) : '';
}

function extractNightlyRate(message: string): number | undefined {
  const normalized = normalize(message);
  const match = /(\d+(?:[.,]\d+)?)\s*(?:dh)?\s*(?:per|par|f|\/)\s*(?:night|nuit|lila)/i.exec(normalized);
  if (!match) return undefined;
  const value = Number(match[1].replace(',', '.'));
  return value > 0 ? value : undefined;
}

/**
 * Deterministic fallback for complete rental-booking commands when the model
 * replies conversationally but omits the structured add_booking action.
 */
export function inferRentalBookingAction(
  userMessage: string,
  projects: Project[],
  activeProject: Project | null
): AIProposedAction | null {
  const message = normalize(userMessage);
  const asksForBooking =
    /\b(booking|reservation)\b/i.test(message)
    && /\b(zidli|zid|dir|add|create|ajoute|ajouter|nouveau|new|jedid)\b/i.test(message);
  if (!asksForBooking) return null;

  const target = resolveRentalProject(userMessage, projects, activeProject);
  const dates = extractDateRange(userMessage);
  const clientName = extractClientName(userMessage);
  if (!target || !dates || !clientName) return null;

  const nightlyRate = extractNightlyRate(userMessage);
  return {
    id: `act_local_booking_${Date.now()}`,
    type: 'add_booking',
    summary: `Add booking for ${clientName} at ${target.rentalProperty?.buildingNumber || target.name}`,
    params: {
      projectId: target.id,
      clientName,
      checkIn: dates.checkIn,
      checkOut: dates.checkOut,
      ...(nightlyRate ? { nightlyRate } : {}),
    },
  };
}

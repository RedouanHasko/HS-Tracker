import { Expense, RentalBooking } from '../types';
import { appDateKey } from './dateTime';
import { LegacyRentalManifest, LegacyRentalProject } from './rentalLegacyImport';

type Cell = string | number | boolean | Date | null | undefined;
type SheetRows = { name: string; rows: Cell[][]; source: string };

const normalize = (value: Cell) => String(value ?? '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const aliases: Record<string, string[]> = {
  property: ['property', 'apartment', 'appartement', 'apt', 'building', 'logement', 'bien', 'code'],
  owner: ['owner', 'proprietaire', 'property owner'],
  address: ['address', 'adresse', 'location', 'emplacement'],
  guest: ['guest', 'client', 'tenant', 'locataire', 'name', 'nom client'],
  phone: ['phone', 'telephone', 'tel', 'mobile'],
  checkIn: ['check in', 'checkin', 'arrival', 'arrivee', 'date debut', 'from'],
  checkOut: ['check out', 'checkout', 'departure', 'depart', 'date fin', 'to'],
  nights: ['nights', 'nuits', 'nombre nuits'],
  nightlyRate: ['nightly rate', 'price per night', 'prix nuit', 'tarif nuit'],
  total: ['total', 'booking total', 'montant sejour', 'revenue', 'revenu'],
  paid: ['paid', 'paye', 'avance', 'deposit', 'acompte'],
  commission: ['commission', 'commission rate', 'taux commission'],
  cleaning: ['cleaning', 'cleaning fee', 'menage', 'frais menage'],
  source: ['source', 'channel', 'canal', 'platform', 'plateforme'],
  currency: ['currency', 'devise', 'monnaie'],
  notes: ['notes', 'note', 'comment', 'commentaire', 'details'],
  expenseTitle: ['expense', 'expense title', 'depense', 'libelle depense', 'service'],
  expenseAmount: ['expense amount', 'montant depense', 'cost', 'cout'],
  expenseDate: ['expense date', 'date depense'],
  supplier: ['supplier', 'fournisseur', 'prestataire'],
};

const csvRows = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
};

const dateKey = (value: Cell): string => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return appDateKey(value);
  const text = String(value ?? '').trim();
  if (!text) return '';
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const local = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (local) return `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`;
  return '';
};

const amount = (value: Cell): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? '').replace(/[^0-9,.-]/g, '').replace(/,(?=\d{1,2}$)/, '.').replace(/,/g, '');
  return Number(normalized) || 0;
};

const daysBetween = (start: string, end: string) =>
  Math.max(0, Math.round((new Date(`${end}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / 86400000));

const headerMap = (headers: Cell[]) => {
  const result = new Map<string, number>();
  headers.forEach((header, index) => {
    const value = normalize(header);
    for (const [field, names] of Object.entries(aliases)) {
      if (!result.has(field) && names.some((name) => value === name || value.includes(name))) result.set(field, index);
    }
  });
  return result;
};

const readCell = (row: Cell[], columns: Map<string, number>, field: string): Cell => {
  const index = columns.get(field);
  return index == null ? '' : row[index];
};

const propertyCode = (value: Cell, fallback: string) => String(value || fallback).trim();

export async function parseRentalTabularFiles(files: File[]): Promise<LegacyRentalManifest> {
  const sheets: SheetRows[] = [];
  for (const file of files) {
    if (file.name.toLowerCase().endsWith('.csv')) {
      sheets.push({ name: file.name.replace(/\.csv$/i, ''), rows: csvRows(await file.text()), source: file.name });
    } else if (file.name.toLowerCase().endsWith('.xlsx')) {
      const { default: readXlsxFile } = await import('read-excel-file/browser');
      const workbook = await readXlsxFile(file);
      workbook.forEach((sheet) => sheets.push({ name: sheet.sheet, rows: sheet.data as Cell[][], source: file.name }));
    } else {
      throw new Error(`Unsupported file: ${file.name}. Select .xlsx or .csv files.`);
    }
  }

  const projects = new Map<string, LegacyRentalProject>();
  const warnings: string[] = [];
  const today = appDateKey();
  for (const sheet of sheets) {
    const headerIndex = sheet.rows.findIndex((row) => {
      const columns = headerMap(row);
      return columns.has('property') || columns.has('guest') || columns.has('checkIn') || columns.has('expenseTitle');
    });
    if (headerIndex < 0) {
      warnings.push(`${sheet.source} / ${sheet.name}: no recognizable header row.`);
      continue;
    }
    const columns = headerMap(sheet.rows[headerIndex]);
    sheet.rows.slice(headerIndex + 1).forEach((row, offset) => {
      if (!row.some((cell) => String(cell ?? '').trim())) return;
      const code = propertyCode(readCell(row, columns, 'property'), sheet.name);
      if (!code) return;
      const key = normalize(code);
      const owner = String(readCell(row, columns, 'owner') || '').trim();
      const currency = String(readCell(row, columns, 'currency') || 'DH').trim().toUpperCase();
      const current = projects.get(key) || {
        legacyPropertyCode: code,
        name: code,
        address: String(readCell(row, columns, 'address') || '').trim(),
        currency,
        rentalProperty: {
          ownerName: owner || 'Owner to complete',
          buildingNumber: code,
          pricePerNight: amount(readCell(row, columns, 'nightlyRate')),
          commissionRate: amount(readCell(row, columns, 'commission')),
        },
        rentalBookings: [],
        expenses: [],
        rentalOwnerPayments: [],
      } satisfies LegacyRentalProject;

      const checkIn = dateKey(readCell(row, columns, 'checkIn'));
      const checkOut = dateKey(readCell(row, columns, 'checkOut'));
      const guest = String(readCell(row, columns, 'guest') || '').trim();
      if (guest && checkIn && checkOut && checkOut > checkIn) {
        const nights = amount(readCell(row, columns, 'nights')) || daysBetween(checkIn, checkOut);
        const nightlyRate = amount(readCell(row, columns, 'nightlyRate')) || current.rentalProperty.pricePerNight;
        const total = amount(readCell(row, columns, 'total')) || nights * nightlyRate;
        const paid = Math.min(total, Math.max(0, amount(readCell(row, columns, 'paid'))));
        const commissionRate = amount(readCell(row, columns, 'commission'));
        const commission = total * commissionRate / 100;
        const booking: RentalBooking = {
          id: `tabular_booking_${key}_${headerIndex + offset + 2}_${checkIn}`,
          legacySourceId: `${sheet.source}:${sheet.name}:${headerIndex + offset + 2}:booking`,
          clientName: guest,
          clientPhone: String(readCell(row, columns, 'phone') || '').trim(),
          source: String(readCell(row, columns, 'source') || 'Legacy import').trim(),
          numberOfGuests: 1,
          checkIn,
          checkOut,
          totalNights: nights,
          nightlyRate,
          totalAmount: total,
          commissionRate,
          commission,
          cleaningFee: amount(readCell(row, columns, 'cleaning')),
          cleaningChargeTo: 'owner',
          ownerPayout: total - commission - amount(readCell(row, columns, 'cleaning')),
          status: checkOut <= today ? 'completed' : checkIn <= today ? 'active' : 'upcoming',
          notes: String(readCell(row, columns, 'notes') || '').trim(),
          paidAmount: paid,
          balanceDue: Math.max(0, total - paid),
          historicalEntry: checkOut <= today,
          recordedAt: new Date().toISOString(),
        };
        current.rentalBookings!.push(booking);
      }

      const expenseTitle = String(readCell(row, columns, 'expenseTitle') || '').trim();
      const expenseAmount = amount(readCell(row, columns, 'expenseAmount'));
      if (expenseTitle && expenseAmount > 0) {
        const expenseDate = dateKey(readCell(row, columns, 'expenseDate')) || checkIn || today;
        const expense: Expense = {
          id: `tabular_expense_${key}_${headerIndex + offset + 2}_${expenseDate}`,
          legacySourceId: `${sheet.source}:${sheet.name}:${headerIndex + offset + 2}:expense`,
          title: expenseTitle,
          description: String(readCell(row, columns, 'notes') || '').trim(),
          amount: expenseAmount,
          currency,
          category: 'maintenance',
          date: expenseDate,
          paidBy: '',
          supplier: String(readCell(row, columns, 'supplier') || '').trim(),
          receipts: [],
          rentalChargeTo: 'owner',
        };
        current.expenses!.push(expense);
      }
      projects.set(key, current);
    });
  }

  if (projects.size === 0) throw new Error('No rental records were recognized. Check the column headers and dates.');
  return {
    schemaVersion: 1,
    sourceFiles: files.map((file) => file.name),
    generatedAt: new Date().toISOString(),
    warnings,
    projects: Array.from(projects.values()),
  };
}

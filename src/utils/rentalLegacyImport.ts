import { AppUser, Expense, Project, RentalBooking, RentalOwnerPayment } from '../types';
import { appDateKey } from './dateTime';

export interface LegacyRentalProject {
  legacyPropertyCode: string;
  name: string;
  address?: string;
  currency?: string;
  rentalProperty: NonNullable<Project['rentalProperty']>;
  rentalBookings?: RentalBooking[];
  expenses?: Expense[];
  rentalOwnerPayments?: RentalOwnerPayment[];
}

export interface LegacyRentalManifest {
  schemaVersion: number;
  sourceFiles: string[];
  generatedAt: string;
  warnings: string[];
  projects: LegacyRentalProject[];
}

const normalizedCode = (value = '') => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
const normalizedText = (value = '') => value.trim().toLowerCase().replace(/\s+/g, ' ');

export function parseLegacyRentalManifest(text: string): LegacyRentalManifest {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object') throw new Error('The selected file is not a rental migration package.');
  const manifest = parsed as Partial<LegacyRentalManifest>;
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.projects)) {
    throw new Error('Unsupported rental migration package version.');
  }
  for (const project of manifest.projects) {
    if (!project?.legacyPropertyCode || !project.rentalProperty?.buildingNumber || !Array.isArray(project.rentalBookings)) {
      throw new Error('A property in the migration package is missing required fields.');
    }
  }
  return {
    schemaVersion: 1,
    sourceFiles: Array.isArray(manifest.sourceFiles) ? manifest.sourceFiles.map(String) : [],
    generatedAt: String(manifest.generatedAt || ''),
    warnings: Array.isArray(manifest.warnings) ? manifest.warnings.map(String) : [],
    projects: manifest.projects,
  };
}

const mergeUnique = <T extends { id: string; legacySourceId?: string }>(
  existing: T[],
  incoming: T[],
  fallbackKey: (item: T) => string
) => {
  const sourceIds = new Set(existing.map((item) => item.legacySourceId).filter(Boolean));
  const fallbackKeys = new Set(existing.map(fallbackKey));
  const additions = incoming.filter((item) => {
    if (item.legacySourceId && sourceIds.has(item.legacySourceId)) return false;
    const key = fallbackKey(item);
    if (fallbackKeys.has(key)) return false;
    if (item.legacySourceId) sourceIds.add(item.legacySourceId);
    fallbackKeys.add(key);
    return true;
  });
  return { values: [...existing, ...additions], added: additions.length };
};

export function mergeLegacyRentalManifest(
  manifest: LegacyRentalManifest,
  existingProjects: Project[],
  user: AppUser & { uid: string }
) {
  const projects = [...existingProjects];
  let created = 0;
  let updated = 0;
  let bookingsAdded = 0;
  let expensesAdded = 0;
  let paymentsAdded = 0;

  for (const incoming of manifest.projects) {
    const code = normalizedCode(incoming.legacyPropertyCode);
    const index = projects.findIndex((project) =>
      project.projectType === 'rental'
      && normalizedCode(project.rentalProperty?.buildingNumber || project.name) === code
    );
    const current = index >= 0 ? projects[index] : undefined;
    const bookingMerge = mergeUnique(
      current?.rentalBookings || [],
      incoming.rentalBookings || [],
      (booking) => `${normalizedText(booking.clientName)}|${booking.checkIn}|${booking.checkOut}`
    );
    const normalizedIncomingExpenses = (incoming.expenses || []).map((expense) => ({
      ...expense,
      paidBy: expense.paidBy || user.email.toLowerCase(),
      createdBy: expense.createdBy || user.email.toLowerCase(),
      createdByName: expense.createdByName || user.name || user.email.split('@')[0],
    }));
    const expenseMerge = mergeUnique(
      current?.expenses || [],
      normalizedIncomingExpenses,
      (expense) => `${normalizedText(expense.title)}|${expense.date}|${expense.amount}`
    );
    const paymentMerge = mergeUnique(
      current?.rentalOwnerPayments || [],
      incoming.rentalOwnerPayments || [],
      (payment) => `${payment.date}|${payment.amount}|${normalizedText(payment.notes)}`
    );
    bookingsAdded += bookingMerge.added;
    expensesAdded += expenseMerge.added;
    paymentsAdded += paymentMerge.added;

    if (current) {
      if (bookingMerge.added + expenseMerge.added + paymentMerge.added === 0) continue;
      projects[index] = {
        ...current,
        rentalBookings: bookingMerge.values,
        expenses: expenseMerge.values,
        rentalOwnerPayments: paymentMerge.values,
      };
      updated += 1;
      continue;
    }

    const email = user.email.toLowerCase();
    const now = appDateKey();
    projects.push({
      id: `legacy_rental_${code.toLowerCase()}`,
      storageVersion: 2,
      name: incoming.name || `Rental ${incoming.legacyPropertyCode}`,
      clientName: incoming.rentalProperty.ownerName,
      address: incoming.address || '',
      description: `Rental property imported from ${manifest.sourceFiles.join(' and ')}.`,
      startDate: bookingMerge.values.map((booking) => booking.checkIn).sort()[0] || now,
      estimatedEndDate: '',
      budget: 0,
      currency: incoming.currency || 'DH',
      status: 'in_progress',
      projectType: 'rental',
      creatorEmail: email,
      members: [{ email, name: user.name || email.split('@')[0], role: 'owner', status: 'accepted' }],
      memberEmails: [email],
      invitedEmails: [],
      memberRoleByEmail: { [email]: 'owner' },
      sections: [],
      expenses: expenseMerge.values,
      tasks: [],
      photos: [],
      documents: [],
      reimbursements: [],
      rentalProperty: incoming.rentalProperty,
      rentalBookings: bookingMerge.values,
      rentalOwnerPayments: paymentMerge.values,
    });
    created += 1;
  }

  return {
    projects,
    changedProjects: projects.filter((project) => {
      const previous = existingProjects.find((item) => item.id === project.id);
      return !previous || previous !== project;
    }),
    stats: { created, updated, bookingsAdded, expensesAdded, paymentsAdded },
  };
}

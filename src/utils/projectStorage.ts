import {
  ConstructionBudgetCommitment,
  ConstructionChangeOrder,
  ConstructionFundingEntry,
  ConstructionPurchaseOrder,
  ConstructionSiteLog,
  ContactRecord,
  Document,
  Expense,
  Photo,
  Project,
  ProjectRecordKind,
  ProjectSection,
  Reimbursement,
  RentalBooking,
  RentalCalendarBlock,
  RentalOwnerPayment,
  RentalOwnerStatement,
  Task,
} from '../types';

export const PROJECT_STORAGE_VERSION = 2 as const;
export const PROJECT_RECORDS_COLLECTION = 'records';
export const PROJECT_TRASH_COLLECTION = 'trash';

export interface ProjectRecordDocument {
  projectId: string;
  kind: ProjectRecordKind;
  entityId: string;
  payload: unknown;
  updatedAt: string;
  updatedBy: string;
}

export interface ProjectTrashDocument extends ProjectRecordDocument {
  deletedAt: string;
  deletedBy: string;
}

type RecordSource = {
  kind: ProjectRecordKind;
  items: Array<{ id: string }>;
};

const sourcesForProject = (project: Project): RecordSource[] => [
  { kind: 'section', items: project.sections || [] },
  { kind: 'expense', items: project.expenses || [] },
  { kind: 'task', items: project.tasks || [] },
  { kind: 'photo', items: project.photos || [] },
  { kind: 'document', items: project.documents || [] },
  { kind: 'reimbursement', items: project.reimbursements || [] },
  { kind: 'rental_booking', items: project.rentalBookings || [] },
  { kind: 'rental_owner_payment', items: project.rentalOwnerPayments || [] },
  { kind: 'rental_calendar_block', items: project.rentalCalendarBlocks || [] },
  { kind: 'rental_owner_statement', items: project.rentalOwnerStatements || [] },
  { kind: 'contact', items: project.contacts || [] },
  { kind: 'construction_funding', items: project.constructionFunding || [] },
  { kind: 'construction_change_order', items: project.constructionChangeOrders || [] },
  { kind: 'construction_purchase_order', items: project.constructionPurchaseOrders || [] },
  { kind: 'construction_site_log', items: project.constructionSiteLogs || [] },
  { kind: 'construction_budget_commitment', items: project.constructionBudgetCommitments || [] },
];

const recordDocumentId = (kind: ProjectRecordKind, entityId: string) =>
  `${kind}__${encodeURIComponent(entityId)}`;

export function splitVersionedProject(
  project: Project,
  updatedBy: string,
  updatedAt = new Date().toISOString()
): {
  root: Omit<Project, 'sections' | 'expenses' | 'tasks' | 'photos' | 'documents' | 'reimbursements' | 'rentalBookings' | 'rentalOwnerPayments' | 'rentalCalendarBlocks' | 'rentalOwnerStatements' | 'contacts' | 'constructionFunding' | 'constructionChangeOrders' | 'constructionPurchaseOrders' | 'constructionSiteLogs' | 'constructionBudgetCommitments'>;
  records: Map<string, ProjectRecordDocument>;
} {
  const records = new Map<string, ProjectRecordDocument>();
  const recordCounts: Partial<Record<ProjectRecordKind, number>> = {};

  for (const source of sourcesForProject(project)) {
    recordCounts[source.kind] = source.items.length;
    for (const item of source.items) {
      if (!item.id) throw new Error(`Cannot save ${source.kind} without an ID.`);
      records.set(recordDocumentId(source.kind, item.id), {
        projectId: project.id,
        kind: source.kind,
        entityId: item.id,
        payload: item,
        updatedAt,
        updatedBy: updatedBy.toLowerCase(),
      });
    }
  }

  const {
    sections: _sections,
    expenses: _expenses,
    tasks: _tasks,
    photos: _photos,
    documents: _documents,
    reimbursements: _reimbursements,
    rentalBookings: _rentalBookings,
    rentalOwnerPayments: _rentalOwnerPayments,
    rentalCalendarBlocks: _rentalCalendarBlocks,
    rentalOwnerStatements: _rentalOwnerStatements,
    contacts: _contacts,
    constructionFunding: _constructionFunding,
    constructionChangeOrders: _constructionChangeOrders,
    constructionPurchaseOrders: _constructionPurchaseOrders,
    constructionSiteLogs: _constructionSiteLogs,
    constructionBudgetCommitments: _constructionBudgetCommitments,
    ...root
  } = project;

  return {
    root: {
      ...root,
      storageVersion: PROJECT_STORAGE_VERSION,
      recordRevision: updatedAt,
      recordCounts,
    },
    records,
  };
}

export function hydrateVersionedProject(
  root: Project,
  recordDocuments: ProjectRecordDocument[]
): Project {
  const hydrated: Project = {
    ...root,
    sections: [],
    expenses: [],
    tasks: [],
    photos: [],
    documents: [],
    reimbursements: [],
    rentalBookings: [],
    rentalOwnerPayments: [],
    rentalCalendarBlocks: [],
    rentalOwnerStatements: [],
    contacts: [],
    constructionFunding: [],
    constructionChangeOrders: [],
    constructionPurchaseOrders: [],
    constructionSiteLogs: [],
    constructionBudgetCommitments: [],
  };

  for (const record of recordDocuments) {
    if (record.projectId !== root.id || !record.payload) continue;
    switch (record.kind) {
      case 'section':
        hydrated.sections.push(record.payload as ProjectSection);
        break;
      case 'expense':
        hydrated.expenses.push(record.payload as Expense);
        break;
      case 'task':
        hydrated.tasks.push(record.payload as Task);
        break;
      case 'photo':
        hydrated.photos.push(record.payload as Photo);
        break;
      case 'document':
        hydrated.documents.push(record.payload as Document);
        break;
      case 'reimbursement':
        hydrated.reimbursements!.push(record.payload as Reimbursement);
        break;
      case 'rental_booking':
        hydrated.rentalBookings!.push(record.payload as RentalBooking);
        break;
      case 'rental_owner_payment':
        hydrated.rentalOwnerPayments!.push(record.payload as RentalOwnerPayment);
        break;
      case 'rental_calendar_block':
        hydrated.rentalCalendarBlocks!.push(record.payload as RentalCalendarBlock);
        break;
      case 'rental_owner_statement':
        hydrated.rentalOwnerStatements!.push(record.payload as RentalOwnerStatement);
        break;
      case 'contact':
        hydrated.contacts!.push(record.payload as ContactRecord);
        break;
      case 'construction_funding':
        hydrated.constructionFunding!.push(record.payload as ConstructionFundingEntry);
        break;
      case 'construction_change_order':
        hydrated.constructionChangeOrders!.push(record.payload as ConstructionChangeOrder);
        break;
      case 'construction_purchase_order':
        hydrated.constructionPurchaseOrders!.push(record.payload as ConstructionPurchaseOrder);
        break;
      case 'construction_site_log':
        hydrated.constructionSiteLogs!.push(record.payload as ConstructionSiteLog);
        break;
      case 'construction_budget_commitment':
        hydrated.constructionBudgetCommitments!.push(record.payload as ConstructionBudgetCommitment);
        break;
    }
  }

  return hydrated;
}

export const projectRecordFingerprint = (record: ProjectRecordDocument) =>
  JSON.stringify(record.payload);

export function collectProjectRecordStoragePaths(payload: unknown): string[] {
  const paths = new Set<string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'storagePath' && typeof child === 'string' && child) {
        paths.add(child);
      } else {
        visit(child);
      }
    }
  };
  visit(payload);
  return Array.from(paths);
}

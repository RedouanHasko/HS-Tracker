import assert from 'node:assert/strict';
import test from 'node:test';

import { Project } from '../src/types';
import {
  collectProjectRecordStoragePaths,
  hydrateVersionedProject,
  PROJECT_STORAGE_VERSION,
  splitVersionedProject,
} from '../src/utils/projectStorage';

const project = {
  id: 'project-storage-test',
  name: 'Storage test',
  clientName: 'Client',
  address: 'Site',
  description: '',
  startDate: '2026-01-01',
  estimatedEndDate: '2026-12-31',
  budget: 0,
  currency: 'DH',
  status: 'planning',
  projectType: 'rental',
  creatorEmail: 'owner@example.com',
  members: [{ email: 'owner@example.com', name: 'Owner', role: 'owner', status: 'accepted' }],
  sections: [{ id: 'section-1', projectId: 'project-storage-test', title: 'Preparation', progress: 0, status: 'planning' }],
  expenses: [{
    id: 'expense-1',
    projectId: 'project-storage-test',
    title: 'Cleaning',
    description: '',
    amount: 200,
    currency: 'DH',
    category: 'cleaning',
    date: '2026-07-31',
    paidBy: 'owner@example.com',
    supplier: 'Cleaner',
  }],
  tasks: [],
  photos: [],
  documents: [],
  reimbursements: [],
  rentalBookings: [{
    id: 'booking-1',
    clientName: 'Guest',
    clientPhone: '',
    numberOfGuests: 2,
    checkIn: '2026-08-01',
    checkOut: '2026-08-04',
    totalNights: 3,
    totalAmount: 1500,
    commission: 300,
    ownerPayout: 1200,
    status: 'upcoming',
    paidAmount: 500,
    balanceDue: 1000,
  }],
  rentalOwnerPayments: [],
} as Project;

test('versioned storage removes growing arrays from the root and round-trips records', () => {
  const split = splitVersionedProject(
    project,
    'OWNER@EXAMPLE.COM',
    '2026-07-31T12:00:00.000Z'
  );
  assert.equal(split.root.storageVersion, PROJECT_STORAGE_VERSION);
  assert.equal('expenses' in split.root, false);
  assert.equal('rentalBookings' in split.root, false);
  assert.equal(split.records.size, 3);
  assert.equal(split.root.recordCounts?.expense, 1);
  assert.equal(split.root.recordCounts?.rental_booking, 1);

  const hydrated = hydrateVersionedProject(
    split.root as Project,
    Array.from(split.records.values())
  );
  assert.deepEqual(hydrated.sections, project.sections);
  assert.deepEqual(hydrated.expenses, project.expenses);
  assert.deepEqual(hydrated.rentalBookings, project.rentalBookings);
  assert.equal(Array.from(split.records.values())[0].updatedBy, 'owner@example.com');
});

test('media cleanup finds nested storage paths once', () => {
  assert.deepEqual(
    collectProjectRecordStoragePaths({
      receiptFiles: [
        { storagePath: 'firestore:project_task_media/receipt-1' },
        { storagePath: 'firestore:project_task_media/receipt-1' },
      ],
      beforeImages: [{ storagePath: 'projects/p/tasks/t/before/photo.jpg' }],
      unrelated: { url: 'https://example.com/image.jpg' },
    }).sort(),
    [
      'firestore:project_task_media/receipt-1',
      'projects/p/tasks/t/before/photo.jpg',
    ]
  );
});

test('versioned storage rejects records without stable IDs', () => {
  assert.throws(
    () => splitVersionedProject(
      { ...project, expenses: [{ ...project.expenses[0], id: '' }] },
      'owner@example.com'
    ),
    /without an ID/
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { Project } from '../src/types';
import {
  applyAIAction,
  AIProposedAction,
  isAIConfirmationMessage,
  isAICancellationMessage,
  parseAIConfirmationMessage,
} from '../src/utils/aiActions';
import { parseDocumentDraft } from '../src/utils/aiDocumentDraft';
import { compileUIActions } from '../src/utils/aiNavigation';
import { getProjectPermissions } from '../src/utils/permissions';
import { resolveProjectFromParams } from '../src/utils/aiWorkspaceContext';
import { buildRentalPaymentReceiptDraft } from '../src/utils/rentalPaymentReceipt';
import { inferRentalBookingAction } from '../src/utils/aiRentalIntent';
import { buildAICurrentTimeContext } from '../src/utils/aiAgent';

const project = {
  id: 'rental-b12',
  name: 'Samir apartment',
  projectType: 'rental',
  clientName: 'Samir',
  address: 'Asilah',
  description: '',
  startDate: '2026-01-01',
  estimatedEndDate: '2026-12-31',
  budget: 0,
  currency: 'DH',
  status: 'in_progress',
  creatorEmail: 'owner@example.com',
  members: [{ email: 'owner@example.com', name: 'Owner', role: 'owner', status: 'accepted' }],
  sections: [],
  expenses: [],
  tasks: [],
  photos: [],
  documents: [],
  rentalProperty: {
    ownerName: 'Samir',
    buildingNumber: 'B12',
    pricePerNight: 500,
    commissionRate: 20,
  },
  rentalBookings: [],
  rentalOwnerPayments: [],
} as Project;

const ctx = {
  userEmail: 'owner@example.com',
  userName: 'Owner',
  userRole: 'owner' as const,
  perm: getProjectPermissions('owner'),
};

const action = (type: AIProposedAction['type'], params: Record<string, unknown>): AIProposedAction => ({
  id: `test-${type}`,
  type,
  summary: `Test ${type}`,
  params,
});

test('AI receives an authoritative timezone-aware current date and time', () => {
  const context = buildAICurrentTimeContext(
    new Date('2026-07-30T05:15:20.000Z'),
    'Africa/Casablanca',
  );

  assert.match(context, /UTC_ISO: 2026-07-30T05:15:20.000Z/);
  assert.match(context, /LOCAL_DATE: 2026-07-30/);
  assert.match(context, /LOCAL_TIME_24H: 06:15:20/);
  assert.match(context, /LOCAL_WEEKDAY: Thursday/);
  assert.match(context, /TIME_ZONE: Africa\/Casablanca/);
});

test('AI creates one task with all requested subtasks', () => {
  const result = applyAIAction(
    project,
    action('create_task', {
      title: 'Prepare apartment',
      priority: 'high',
      deadline: '2026-08-02',
      subtasks: ['Inspect plumbing', 'Replace towels', 'Confirm keys'],
    }),
    ctx
  );

  assert.equal(result.error, undefined);
  assert.equal(result.project.tasks.length, 1);
  assert.deepEqual(
    result.project.tasks[0].subtasks.map((item) => item.title),
    ['Inspect plumbing', 'Replace towels', 'Confirm keys']
  );
});

test('AI stores historical bookings and can update a saved commission to zero', () => {
  const created = applyAIAction(
    project,
    action('add_booking', {
      clientName: 'Legacy Guest',
      checkIn: '2024-01-02',
      checkOut: '2024-01-05',
      totalAmount: 1500,
      paidAmount: 1500,
      commissionRate: 20,
    }),
    ctx
  );

  assert.equal(created.error, undefined);
  assert.equal(created.project.rentalBookings?.[0].historicalEntry, true);
  assert.equal(created.project.rentalBookings?.[0].commission, 300);

  const bookingId = created.project.rentalBookings![0].id;
  const updated = applyAIAction(
    created.project,
    action('update_booking', { bookingId, commissionRate: 0 }),
    ctx
  );

  assert.equal(updated.error, undefined);
  assert.equal(updated.project.rentalBookings?.[0].commissionRate, 0);
  assert.equal(updated.project.rentalBookings?.[0].commission, 0);
  assert.equal(updated.project.rentalBookings?.[0].ownerPayout, 1500);
});

test('AI resolves an apartment by building number and compiles rental navigation', () => {
  assert.equal(resolveProjectFromParams([project], { projectName: 'B12' })?.id, project.id);
  assert.deepEqual(
    compileUIActions(
      [{ type: 'open_rental_dashboard', params: { section: 'bookings' } }],
      [project],
      null
    ),
    { rentalSection: 'bookings' }
  );
  assert.deepEqual(
    compileUIActions(
      [
        { type: 'open_project', params: { projectId: project.id } },
        { type: 'open_tab', params: { tab: 'rental' } },
      ],
      [project],
      null
    ),
    { projectId: project.id, tab: 'rental' }
  );
});

test('construction gallery navigation targets the gallery tab', () => {
  const constructionProject = {
    ...project,
    id: 'construction-villa',
    name: 'Villa project',
    projectType: 'construction',
    rentalProperty: undefined,
    rentalBookings: undefined,
  } as Project;

  assert.deepEqual(
    compileUIActions(
      [
        { type: 'open_project', params: { projectId: constructionProject.id } },
        { type: 'open_tab', params: { tab: 'gallery' } },
      ],
      [constructionProject],
      null,
    ),
    { projectId: constructionProject.id, tab: 'gallery' },
  );
});

test('document draft preserves confirmed automatic PDF export intent', () => {
  const draft = parseDocumentDraft({
    docType: 'invoice',
    recipientName: 'Client',
    autoExport: true,
    items: [{ description: 'Rental service', quantity: 1, unitPrice: 1200 }],
  });

  assert.equal(draft.autoExport, true);
  assert.equal(draft.items?.[0].unitPrice, 1200);
});

test('AI records an installment without overwriting previous payments', () => {
  const withBooking = applyAIAction(
    project,
    action('add_booking', {
      clientName: 'Paying Guest',
      checkIn: '2026-08-10',
      checkOut: '2026-08-14',
      totalAmount: 2000,
      paidAmount: 500,
    }),
    ctx
  ).project;
  const bookingId = withBooking.rentalBookings![0].id;

  const paid = applyAIAction(
    withBooking,
    action('record_booking_payment', {
      bookingId,
      amount: 700,
      date: '2026-07-30',
      method: 'bank_transfer',
      prepareReceipt: true,
    }),
    ctx
  );

  assert.equal(paid.error, undefined);
  const booking = paid.project.rentalBookings![0];
  assert.equal(booking.payments?.length, 2);
  assert.equal(booking.paidAmount, 1200);
  assert.equal(booking.balanceDue, 800);

  const receipt = buildRentalPaymentReceiptDraft(
    paid.project,
    booking,
    booking.payments![1]
  );
  assert.equal(receipt.docType, 'receipt');
  assert.equal(receipt.recipientName, 'Paying Guest');
  assert.equal(receipt.items?.[0].unitPrice, 700);
  assert.match(receipt.notes || '', /Remaining balance: 800 DH/);
});

test('typed confirmation applies to an existing pending proposal instead of returning to the model', () => {
  assert.equal(isAIConfirmationMessage('confirm'), true);
  assert.equal(isAIConfirmationMessage('Apply changes'), true);
  assert.equal(isAIConfirmationMessage('wakha'), true);
  assert.equal(isAIConfirmationMessage('confirm and open the booking to see what you did'), true);
  assert.equal(isAIConfirmationMessage('ah confirme'), true);
  assert.deepEqual(
    parseAIConfirmationMessage('confirm and open the booking to see what you did'),
    { followUp: 'open the booking to see what you did' }
  );
  assert.equal(isAIConfirmationMessage('yes, but change the dates'), false);
  assert.equal(isAICancellationMessage('cancel'), true);
});

test('AI creates the reported Hussein booking from a nightly rate', () => {
  const created = applyAIAction(
    {
      ...project,
      id: 'rental-b6-1-4',
      name: 'Rafifi appartement',
      rentalProperty: {
        ...project.rentalProperty!,
        buildingNumber: 'B6 1.4',
      },
    },
    action('add_booking', {
      clientName: 'Hussein',
      checkIn: '2026-08-23',
      checkOut: '2026-08-27',
      nightlyRate: 1600,
    }),
    ctx
  );

  assert.equal(created.error, undefined);
  assert.equal(created.project.rentalBookings?.length, 1);
  assert.equal(created.project.rentalBookings?.[0].totalNights, 4);
  assert.equal(created.project.rentalBookings?.[0].totalAmount, 6400);
});

test('Darija booking request becomes a real structured action without relying on Gemini JSON', () => {
  const rental = {
    ...project,
    id: 'rental-b6-1-4',
    name: 'Rafifi appartement',
    rentalProperty: {
      ...project.rentalProperty!,
      buildingNumber: 'B6 1.4',
      pricePerNight: 900,
    },
  };
  const inferred = inferRentalBookingAction(
    'zidli wahd booking jedid dyal B6 1.4, dir fih men 23 out l 27 out 2026, client smitou Hucein',
    [rental],
    null
  );

  assert.ok(inferred);
  assert.equal(inferred.type, 'add_booking');
  assert.deepEqual(inferred.params, {
    projectId: rental.id,
    clientName: 'Hucein',
    checkIn: '2026-08-23',
    checkOut: '2026-08-27',
  });

  const applied = applyAIAction(rental, inferred, ctx);
  assert.equal(applied.error, undefined);
  assert.equal(applied.project.rentalBookings?.[0].clientName, 'Hucein');
  assert.equal(applied.project.rentalBookings?.[0].totalAmount, 3600);
});

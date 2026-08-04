import assert from 'node:assert/strict';
import test from 'node:test';

import { Project, RentalBooking, RentalBookingPayment } from '../src/types';
import {
  addRentalBookingPayment,
  addRentalBookingRefund,
  bookingMonthSlice,
  isOwnerExpense,
  rentalBookingBalanceDue,
  rentalBookingGuestTotal,
  rentalBookingCommission,
  rentalBookingOpeningBalance,
  rentalBookingOverpayment,
  rentalBookingPaidAmount,
  rentalBookingRefundedAmount,
  rentalBookingStatusForDates,
  rentalBookingDatesOverlap,
  findRentalBookingConflict,
  removeRentalBookingPayment,
  syncRentalBookingPaymentTotals,
} from '../src/utils/rentalAccounting';
import { mergeLegacyRentalManifest } from '../src/utils/rentalLegacyImport';
import { rentalText } from '../src/utils/rentalTranslations';
import { parseRentalTabularFiles } from '../src/utils/rentalTabularImport';

const project = {
  rentalProperty: {
    ownerName: 'Owner',
    buildingNumber: 'D4/3.4',
    pricePerNight: 1000,
    commissionRate: 20,
    monthlyCommissionRates: { '2026-08': 0 },
  },
} as Project;

const booking: RentalBooking = {
  id: 'booking',
  clientName: 'Guest',
  clientPhone: '',
  numberOfGuests: 1,
  checkIn: '2026-07-28',
  checkOut: '2026-08-04',
  totalNights: 7,
  totalAmount: 7000,
  commission: 1400,
  ownerPayout: 5600,
  status: 'completed',
  paidAmount: 7000,
  balanceDue: 0,
  cleaningFee: 140,
  cleaningChargeTo: 'owner',
};

test('monthly zero commission is a real decision and prorates owner cleaning', () => {
  assert.equal(rentalBookingCommission(booking, project, 3000, '2026-08'), 0);
  assert.deepEqual(bookingMonthSlice(booking, project, '2026-08-01', '2026-09-01'), {
    nights: 3,
    ratio: 3 / 7,
    amount: 3000,
    commissionRate: 0,
    commission: 0,
    cleaning: 60,
    channelFee: 0,
  });
});

test('booking-specific commission overrides monthly and property defaults', () => {
  assert.equal(rentalBookingCommission({ ...booking, commissionRate: 10 }, project), 700);
});

test('only owner and rent allocations reduce the owner payout', () => {
  assert.equal(isOwnerExpense({ rentalChargeTo: 'owner' } as never), true);
  assert.equal(isOwnerExpense({ rentalChargeTo: 'rent' } as never), true);
  assert.equal(isOwnerExpense({ rentalChargeTo: 'management' } as never), false);
  assert.equal(isOwnerExpense({ rentalChargeTo: 'guest' } as never), false);
});

test('historical and current booking dates derive the correct operational status', () => {
  assert.equal(rentalBookingStatusForDates('2024-01-02', '2024-01-08', '2026-07-30'), 'completed');
  assert.equal(rentalBookingStatusForDates('2026-07-28', '2026-08-02', '2026-07-30'), 'active');
  assert.equal(rentalBookingStatusForDates('2026-08-02', '2026-08-08', '2026-07-30'), 'upcoming');
});

test('booking conflicts block overlaps but allow adjacent and cancelled stays', () => {
  const existing = {
    ...booking,
    id: 'existing',
    clientName: 'Existing Guest',
    checkIn: '2026-08-10',
    checkOut: '2026-08-14',
    status: 'upcoming',
  } as RentalBooking;

  assert.equal(rentalBookingDatesOverlap('2026-08-12', '2026-08-16', existing.checkIn, existing.checkOut), true);
  assert.equal(rentalBookingDatesOverlap('2026-08-14', '2026-08-17', existing.checkIn, existing.checkOut), false);
  assert.equal(findRentalBookingConflict([existing], '2026-08-12', '2026-08-16')?.id, existing.id);
  assert.equal(findRentalBookingConflict([existing], '2026-08-14', '2026-08-17'), undefined);
  assert.equal(
    findRentalBookingConflict([{ ...existing, status: 'cancelled' }], '2026-08-12', '2026-08-16'),
    undefined
  );
  assert.equal(findRentalBookingConflict([existing], '2026-08-12', '2026-08-16', existing.id), undefined);
});

test('legacy import is idempotent and preserves existing project data', () => {
  const manifest = {
    schemaVersion: 1,
    sourceFiles: ['legacy.xlsx'],
    generatedAt: '2026-07-29',
    warnings: [],
    projects: [{
      legacyPropertyCode: 'D4/3.4',
      name: 'Rental D4/3.4',
      currency: 'DH',
      rentalProperty: project.rentalProperty!,
      rentalBookings: [{ ...booking, legacySourceId: 'legacy:booking' }],
      expenses: [],
      rentalOwnerPayments: [],
    }],
  };
  const user = { uid: 'user', email: 'owner@example.com', name: 'Owner' };
  const first = mergeLegacyRentalManifest(manifest, [], user);
  const second = mergeLegacyRentalManifest(manifest, first.projects, user);
  assert.equal(first.stats.created, 1);
  assert.equal(first.stats.bookingsAdded, 1);
  assert.equal(second.changedProjects.length, 0);
  assert.equal(second.stats.bookingsAdded, 0);
});

test('direct CSV rental import recognizes bookings and expenses without a JSON manifest', async () => {
  const csv = [
    'Apartment,Owner,Guest,Check in,Check out,Price per night,Paid,Expense,Expense amount,Expense date',
    'B6 1.4,Owner A,Hussein,23/08/2026,27/08/2026,1600,2000,Cleaning,300,27/08/2026',
  ].join('\n');
  const manifest = await parseRentalTabularFiles([new File([csv], 'rentals.csv', { type: 'text/csv' })]);
  assert.equal(manifest.projects.length, 1);
  assert.equal(manifest.projects[0].rentalBookings?.[0].clientName, 'Hussein');
  assert.equal(manifest.projects[0].rentalBookings?.[0].totalAmount, 6400);
  assert.equal(manifest.projects[0].expenses?.[0].amount, 300);
});

test('payment ledger preserves an existing paid total as its opening balance', () => {
  const legacy = { ...booking, paidAmount: 1200, balanceDue: 5800, payments: undefined };
  assert.equal(rentalBookingOpeningBalance(legacy), 1200);

  const payment: RentalBookingPayment = {
    id: 'payment-1',
    date: '2026-07-30',
    amount: 800,
    method: 'cash',
    receiptNumber: 'REC-2026-101',
    recordedAt: '2026-07-30T10:00:00.000Z',
  };
  const updated = addRentalBookingPayment(legacy, payment);
  assert.equal(rentalBookingPaidAmount(updated), 2000);
  assert.equal(rentalBookingBalanceDue(updated), 5000);
  assert.equal(updated.paymentOpeningBalance, 1200);

  const restored = removeRentalBookingPayment(updated, payment.id);
  assert.equal(rentalBookingPaidAmount(restored), 1200);
  assert.equal(rentalBookingBalanceDue(restored), 5800);
});

test('lowering a booking price keeps payment history and exposes overpayment', () => {
  const repriced = syncRentalBookingPaymentTotals({ ...booking, totalAmount: 6500 });
  assert.equal(rentalBookingPaidAmount(repriced), 7000);
  assert.equal(rentalBookingBalanceDue(repriced), 0);
  assert.equal(rentalBookingOverpayment(repriced), 500);
});

test('guest fees, deposits, and refunds update the balance without changing accommodation commission', () => {
  const withCharges = {
    ...booking,
    paidAmount: 0,
    paymentOpeningBalance: 0,
    payments: [{ id: 'paid', date: '2026-08-01', amount: 7600, method: 'cash', receiptNumber: 'REC-1', recordedAt: '2026-08-01T10:00:00Z' }],
    securityDeposit: 500,
    taxAmount: 100,
  } as RentalBooking;
  assert.equal(rentalBookingGuestTotal(withCharges), 7600);
  assert.equal(rentalBookingBalanceDue(withCharges), 0);
  assert.equal(rentalBookingCommission(withCharges, project), 1400);

  const refunded = addRentalBookingRefund(withCharges, { id: 'refund', date: '2026-08-02', amount: 500, reason: 'Deposit returned', method: 'cash', recordedAt: '2026-08-02T10:00:00Z' });
  assert.equal(rentalBookingRefundedAmount(refunded), 500);
  assert.equal(rentalBookingPaidAmount(refunded), 7100);
  assert.equal(rentalBookingBalanceDue(refunded), 500);
});

test('rental copy resolves consistently in every supported language', () => {
  assert.equal(rentalText('en', 'Booking center', 'Centre des reservations'), 'Booking center');
  assert.equal(rentalText('fr', 'Booking center', 'Centre des reservations'), 'Centre des reservations');
  assert.equal(rentalText('ar', 'Booking center', 'Centre des reservations'), '\u0645\u0631\u0643\u0632 \u0627\u0644\u062d\u062c\u0648\u0632\u0627\u062a');
  assert.equal(rentalText('ar', 'Unregistered rental label', 'Libelle inconnu'), 'Unregistered rental label');
});

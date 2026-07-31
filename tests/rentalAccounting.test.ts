import assert from 'node:assert/strict';
import test from 'node:test';

import { Project, RentalBooking, RentalBookingPayment } from '../src/types';
import {
  addRentalBookingPayment,
  bookingMonthSlice,
  isOwnerExpense,
  rentalBookingBalanceDue,
  rentalBookingCommission,
  rentalBookingOpeningBalance,
  rentalBookingOverpayment,
  rentalBookingPaidAmount,
  rentalBookingStatusForDates,
  removeRentalBookingPayment,
  syncRentalBookingPaymentTotals,
} from '../src/utils/rentalAccounting';
import { mergeLegacyRentalManifest } from '../src/utils/rentalLegacyImport';
import { rentalText } from '../src/utils/rentalTranslations';

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

test('rental copy resolves consistently in every supported language', () => {
  assert.equal(rentalText('en', 'Booking center', 'Centre des reservations'), 'Booking center');
  assert.equal(rentalText('fr', 'Booking center', 'Centre des reservations'), 'Centre des reservations');
  assert.equal(rentalText('ar', 'Booking center', 'Centre des reservations'), '\u0645\u0631\u0643\u0632 \u0627\u0644\u062d\u062c\u0648\u0632\u0627\u062a');
  assert.equal(rentalText('ar', 'Unregistered rental label', 'Libelle inconnu'), 'Unregistered rental label');
});

import {
  Expense,
  Project,
  RentalBooking,
  RentalBookingPayment,
  RentalRefund,
  RentalBookingStatus,
} from '../types';
import { appDateKey } from './dateTime';

const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export const rentalBookingStatusForDates = (
  checkIn: string,
  checkOut: string,
  today = appDateKey()
): RentalBookingStatus => {
  if (checkOut <= today) return 'completed';
  if (checkIn <= today) return 'active';
  return 'upcoming';
};

export const rentalDaysBetween = (start: string, end: string) =>
  Math.max(0, Math.round(
    (new Date(`${end}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / 86_400_000
  ));

export const rentalBookingDatesOverlap = (
  firstCheckIn: string,
  firstCheckOut: string,
  secondCheckIn: string,
  secondCheckOut: string
) => firstCheckIn < secondCheckOut && firstCheckOut > secondCheckIn;

export const findRentalBookingConflict = (
  bookings: RentalBooking[],
  checkIn: string,
  checkOut: string,
  excludeBookingId?: string
): RentalBooking | undefined =>
  bookings.find(
    (booking) =>
      booking.id !== excludeBookingId &&
      booking.status !== 'cancelled' &&
      rentalBookingDatesOverlap(checkIn, checkOut, booking.checkIn, booking.checkOut)
  );

export const rentalBookingRate = (booking: RentalBooking, fallbackRate = 0) => {
  if (Number.isFinite(booking.nightlyRate)) return Math.max(0, Number(booking.nightlyRate));
  if (booking.totalNights > 0) return Math.max(0, booking.totalAmount / booking.totalNights);
  return Math.max(0, fallbackRate);
};

export const rentalBookingOpeningBalance = (booking: RentalBooking) => {
  if (Number.isFinite(booking.paymentOpeningBalance)) {
    return Math.max(0, Number(booking.paymentOpeningBalance));
  }
  const recordedPayments = (booking.payments || []).reduce(
    (sum, payment) => sum + Math.max(0, Number(payment.amount) || 0),
    0
  );
  return roundMoney(Math.max(0, (Number(booking.paidAmount) || 0) - recordedPayments));
};

export const rentalBookingGuestTotal = (booking: RentalBooking) => roundMoney(
  Math.max(0, booking.totalAmount || 0) +
  Math.max(0, booking.securityDeposit || 0) +
  Math.max(0, booking.taxAmount || 0) +
  Math.max(0, booking.cancellationFee || 0) +
  (booking.cleaningChargeTo === 'guest' ? Math.max(0, booking.cleaningFee || 0) : 0)
);

export const rentalBookingRefundedAmount = (booking: RentalBooking) => roundMoney(
  (booking.refunds || []).reduce((sum, refund) => sum + Math.max(0, Number(refund.amount) || 0), 0)
);

export const rentalBookingPaidAmount = (booking: RentalBooking) =>
  roundMoney(Math.max(0,
    rentalBookingOpeningBalance(booking) +
      (booking.payments || []).reduce(
        (sum, payment) => sum + Math.max(0, Number(payment.amount) || 0),
        0
      ) - rentalBookingRefundedAmount(booking)
  ));

export const rentalBookingBalanceDue = (booking: RentalBooking) =>
  roundMoney(Math.max(0, rentalBookingGuestTotal(booking) - rentalBookingPaidAmount(booking)));

export const rentalBookingOverpayment = (booking: RentalBooking) =>
  roundMoney(Math.max(0, rentalBookingPaidAmount(booking) - rentalBookingGuestTotal(booking)));

export const syncRentalBookingPaymentTotals = (booking: RentalBooking): RentalBooking => {
  const paidAmount = rentalBookingPaidAmount(booking);
  return {
    ...booking,
    paidAmount,
    balanceDue: roundMoney(Math.max(0, rentalBookingGuestTotal(booking) - paidAmount)),
  };
};

export const addRentalBookingPayment = (
  booking: RentalBooking,
  payment: RentalBookingPayment
): RentalBooking =>
  syncRentalBookingPaymentTotals({
    ...booking,
    paymentOpeningBalance: rentalBookingOpeningBalance(booking),
    payments: [...(booking.payments || []), payment],
  });

export const removeRentalBookingPayment = (
  booking: RentalBooking,
  paymentId: string
): RentalBooking =>
  syncRentalBookingPaymentTotals({
    ...booking,
    paymentOpeningBalance: rentalBookingOpeningBalance(booking),
    payments: (booking.payments || []).filter((payment) => payment.id !== paymentId),
  });

export const addRentalBookingRefund = (booking: RentalBooking, refund: RentalRefund): RentalBooking =>
  syncRentalBookingPaymentTotals({ ...booking, refunds: [...(booking.refunds || []), refund] });

export const removeRentalBookingRefund = (booking: RentalBooking, refundId: string): RentalBooking =>
  syncRentalBookingPaymentTotals({ ...booking, refunds: (booking.refunds || []).filter((refund) => refund.id !== refundId) });

export const rentalBookingCommissionRate = (
  booking: RentalBooking,
  project: Pick<Project, 'rentalProperty'>,
  month = booking.checkIn.slice(0, 7)
) => {
  if (Number.isFinite(booking.commissionRate)) return Math.max(0, Number(booking.commissionRate));
  const monthlyRate = project.rentalProperty?.monthlyCommissionRates?.[month];
  if (Number.isFinite(monthlyRate)) return Math.max(0, Number(monthlyRate));
  if (booking.commission > 0 && booking.totalAmount > 0) {
    return roundMoney((booking.commission / booking.totalAmount) * 100);
  }
  return Math.max(0, project.rentalProperty?.commissionRate || 0);
};

export const rentalBookingCommission = (
  booking: RentalBooking,
  project: Pick<Project, 'rentalProperty'>,
  amount = booking.totalAmount,
  month = booking.checkIn.slice(0, 7)
) => roundMoney(amount * rentalBookingCommissionRate(booking, project, month) / 100);

export const ownerCleaningDeduction = (booking: RentalBooking, ratio = 1) =>
  booking.cleaningChargeTo === 'management' || booking.cleaningChargeTo === 'guest'
    ? 0
    : roundMoney(Math.max(0, booking.cleaningFee || 0) * ratio);

export const isOwnerExpense = (expense: Expense) =>
  !expense.rentalChargeTo || expense.rentalChargeTo === 'owner' || expense.rentalChargeTo === 'rent';

export const bookingMonthSlice = (
  booking: RentalBooking,
  project: Pick<Project, 'rentalProperty'>,
  monthStart: string,
  monthEnd: string
) => {
  const overlapStart = booking.checkIn > monthStart ? booking.checkIn : monthStart;
  const overlapEnd = booking.checkOut < monthEnd ? booking.checkOut : monthEnd;
  const nights = rentalDaysBetween(overlapStart, overlapEnd);
  const ratio = booking.totalNights > 0 ? nights / booking.totalNights : 0;
  const amount = roundMoney(booking.totalAmount * ratio);
  return {
    nights,
    ratio,
    amount,
    commissionRate: rentalBookingCommissionRate(booking, project, monthStart.slice(0, 7)),
    commission: rentalBookingCommission(booking, project, amount, monthStart.slice(0, 7)),
    cleaning: ownerCleaningDeduction(booking, ratio),
    channelFee: roundMoney(Math.max(0, booking.channelFee || 0) * ratio),
  };
};

import { Project, RentalBooking, RentalBookingPayment } from '../types';
import { AIDocumentDraft } from './aiDocumentDraft';
import {
  rentalBookingBalanceDue,
  rentalBookingPaidAmount,
  rentalBookingOverpayment,
} from './rentalAccounting';

export function buildRentalPaymentReceiptDraft(
  project: Project,
  booking: RentalBooking,
  payment: RentalBookingPayment
): AIDocumentDraft {
  const paidToDate = rentalBookingPaidAmount(booking);
  const balanceDue = rentalBookingBalanceDue(booking);
  const overpayment = rentalBookingOverpayment(booking);
  const propertyName = project.rentalProperty?.buildingNumber || project.name;
  const details = [
    `Booking total: ${booking.totalAmount} ${project.currency}`,
    `Paid to date: ${paidToDate} ${project.currency}`,
    `Remaining balance: ${balanceDue} ${project.currency}`,
    ...(overpayment > 0 ? [`Overpayment / refund due: ${overpayment} ${project.currency}`] : []),
    `Stay: ${booking.checkIn} to ${booking.checkOut}`,
    `Payment method: ${payment.method.replace('_', ' ')}`,
    ...(payment.notes ? [`Notes: ${payment.notes}`] : []),
  ];

  return {
    docType: 'receipt',
    docNumber: payment.receiptNumber,
    docDate: payment.date,
    taxRate: 0,
    paperFormat: 'A4',
    recipientKind: 'client',
    recipientName: booking.clientName,
    recipientPhone: booking.clientPhone,
    notes: details.join('\n'),
    items: [
      {
        description: `Payment received - ${propertyName}`,
        quantity: 1,
        unitPrice: payment.amount,
      },
    ],
  };
}

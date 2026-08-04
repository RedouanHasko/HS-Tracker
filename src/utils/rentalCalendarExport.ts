import { Project } from '../types';

const escapeIcs = (value: string) => value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const dateValue = (value: string) => value.replaceAll('-', '');

export function downloadRentalCalendar(projects: Project[], fileName = 'rental-calendar.ics') {
  const events: string[] = [];
  projects.forEach((project) => {
    (project.rentalBookings || []).filter((booking) => booking.status !== 'cancelled').forEach((booking) => {
      events.push('BEGIN:VEVENT', `UID:booking-${booking.id}@hs-tracker`, `DTSTART;VALUE=DATE:${dateValue(booking.checkIn)}`, `DTEND;VALUE=DATE:${dateValue(booking.checkOut)}`, `SUMMARY:${escapeIcs(`${project.rentalProperty?.buildingNumber || project.name} - ${booking.clientName}`)}`, `DESCRIPTION:${escapeIcs(`${booking.numberOfGuests} guest(s)${booking.clientPhone ? ` · ${booking.clientPhone}` : ''}`)}`, 'END:VEVENT');
    });
    (project.rentalCalendarBlocks || []).filter((block) => block.status === 'active').forEach((block) => {
      events.push('BEGIN:VEVENT', `UID:block-${block.id}@hs-tracker`, `DTSTART;VALUE=DATE:${dateValue(block.startDate)}`, `DTEND;VALUE=DATE:${dateValue(block.endDate)}`, `SUMMARY:${escapeIcs(`${project.rentalProperty?.buildingNumber || project.name} - ${block.title}`)}`, `DESCRIPTION:${escapeIcs(block.notes || block.type.replaceAll('_', ' '))}`, 'END:VEVENT');
    });
  });
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HS Tracker//Rental Calendar//EN', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR', ''].join('\r\n');
  const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

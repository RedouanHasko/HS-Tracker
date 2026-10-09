import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Building, KeyRound, DollarSign, Calendar, CalendarDays, TrendingUp, Plus, Users, ChevronLeft, ChevronRight, Phone, User as UserIcon, CheckCircle2, X, Trash2, Clock, Percent, Filter, LayoutGrid, Search, Table, BedDouble, AlertTriangle, Wrench, FileDown, Printer, ArrowUpRight, WalletCards, Upload, Pencil, Download } from 'lucide-react';
import TopNavbar from './TopNavbar';
import ConfirmDialog from './ConfirmDialog';
import { Project, Language, RentalBooking, RentalBookingStatus, RentalCalendarBlock } from '../types';
import { TRANSLATIONS } from '../utils/mockData';
import { useAuth } from '../lib/AuthContext';
import { deleteProjectFromDB, saveProjectToDB, subscribeToProjects } from '../lib/db';
import { getProjectPermissions, isProjectOwner, resolveUserRole } from '../utils/permissions';
import { useMotionConfig } from '../utils/motionPresets';
import { saveCivilDocumentAsPdf } from '../utils/printCivilDocument';
import {
  bookingMonthSlice,
  isOwnerExpense,
  rentalBookingBalanceDue,
  rentalBookingCommission,
} from '../utils/rentalAccounting';
import { LegacyRentalManifest, mergeLegacyRentalManifest, parseLegacyRentalManifest } from '../utils/rentalLegacyImport';
import { parseRentalTabularFiles } from '../utils/rentalTabularImport';
import { rentalText } from '../utils/rentalTranslations';
import {
  buildMonthGrid,
  groupRentalDays,
  monthKeyOf,
  monthLabel,
  shiftMonthKey,
  weekdayLabels,
} from '../utils/calendar';
import { clampCommission, formErrorText, isValidEmail } from '../utils/forms';
import DatePickerInput from './ui/DatePickerInput';
import { appDateKey as localDateKey } from '../utils/dateTime';
import { downloadRentalCalendar } from '../utils/rentalCalendarExport';

interface RentalDashboardProps {
  onSelectProject: (projectId: string, tab?: 'rental' | 'expenses' | 'tasks') => void;
  onEditProject: (projectId: string) => void;
  section?: 'portfolio' | 'calendar' | 'bookings' | 'revenue';
  language: Language;
  onLanguageChange: (lang: Language) => void;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onBack: () => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  sidebarToggleLabel?: string;
  unreadCount?: number;
  onToggleNotifications?: () => void;
  onOpenSearch?: () => void;
}

const currentMonthKey = () => localDateKey().slice(0, 7);

const activeBookings = (project: Project) =>
  (project.rentalBookings || []).filter((booking) => booking.status !== 'cancelled');

const bookingOverlaps = (booking: RentalBooking, start: string, end: string) =>
  booking.status !== 'cancelled' && booking.checkIn < end && booking.checkOut > start;

const nextBookingFor = (project: Project, today: string) =>
  activeBookings(project)
    .filter((booking) => booking.checkOut > today)
    .sort((left, right) => left.checkIn.localeCompare(right.checkIn))[0];

const daysBetween = (start: string, end: string) =>
  Math.max(0, Math.round((new Date(`${end}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / 86400000));

export default function RentalDashboard({
  onSelectProject,
  onEditProject,
  section = 'portfolio',
  language,
  onLanguageChange,
  theme,
  onThemeToggle,
  onBack,
  sidebarOpen,
  onToggleSidebar,
  sidebarToggleLabel,
  unreadCount,
  onToggleNotifications,
  onOpenSearch,
}: RentalDashboardProps) {
  const { user } = useAuth();
  const [rentalProjects, setRentalProjects] = useState<Project[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [propertyQuery, setPropertyQuery] = useState('');
  const [propertyOccupancy, setPropertyOccupancy] = useState<'all' | 'available' | 'reserved' | 'active' | 'blocked'>('all');
  const [availabilityStart, setAvailabilityStart] = useState('');
  const [availabilityEnd, setAvailabilityEnd] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<'any' | 'available' | 'booked'>('any');
  const [propertyOwner, setPropertyOwner] = useState('all');
  const [propertySort, setPropertySort] = useState<'name' | 'revenue' | 'price' | 'next_booking'>('name');
  const [reportMonth, setReportMonth] = useState(currentMonthKey);
  const [reportOwner, setReportOwner] = useState('all');
  const [showOwnerReport, setShowOwnerReport] = useState(false);
  const [showLegacyImport, setShowLegacyImport] = useState(false);
  const [propertyView, setPropertyView] = useState<'cards' | 'table'>(() =>
    localStorage.getItem('hs_tracker_rental_view') === 'cards' ? 'cards' : 'table'
  );
  const [propertyPage, setPropertyPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deletingProperty, setDeletingProperty] = useState(false);
  const t = TRANSLATIONS[language];
  const today = localDateKey();
  const monthStart = `${reportMonth}-01`;
  const monthEndDate = new Date(`${monthStart}T12:00:00`);
  monthEndDate.setMonth(monthEndDate.getMonth() + 1);
  const monthEnd = localDateKey(monthEndDate);
  const userEmail = (user?.email || '').toLowerCase();
  const canEditProperty = (project: Project) =>
    Boolean(userEmail && getProjectPermissions(resolveUserRole(project, userEmail)).canModifySettings);
  const canDeleteProperty = (project: Project) =>
    Boolean(userEmail && isProjectOwner(project, userEmail));

  const handleDeleteProperty = async () => {
    if (!user?.uid || !deleteTarget || !canDeleteProperty(deleteTarget)) return;
    setDeletingProperty(true);
    try {
      await deleteProjectFromDB(user.uid, deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeletingProperty(false);
    }
  };

  useEffect(() => {
    if (!user?.email) return;
    const unsub = subscribeToProjects(user.email, (all) => {
      setRentalProjects(all.filter(p => p.projectType === 'rental'));
    });
    return unsub;
  }, [user]);

  const ownerOptions = useMemo(() => Array.from(new Set(
    rentalProjects.map((project) => project.rentalProperty?.ownerName?.trim()).filter(Boolean) as string[]
  )).sort((left, right) => left.localeCompare(right)), [rentalProjects]);

  const operationalStats = useMemo(() => {
    const projectsInScope = propertyOwner === 'all'
      ? rentalProjects
      : rentalProjects.filter((project) => project.rentalProperty?.ownerName === propertyOwner);
    const bookings = projectsInScope.flatMap((project) =>
      activeBookings(project).map((booking) => ({ booking, project }))
    );
    const monthBookings = bookings.filter(({ booking }) => bookingOverlaps(booking, monthStart, monthEnd));
    const occupied = projectsInScope.filter((project) =>
      activeBookings(project).some((booking) => booking.checkIn <= today && booking.checkOut > today)
    ).length;
    const unavailable = projectsInScope.filter((project) =>
      activeBookings(project).some((booking) => booking.checkIn <= today && booking.checkOut > today)
      || (project.rentalCalendarBlocks || []).some((block) => block.status === 'active' && block.startDate <= today && block.endDate > today)
    ).length;
    const nextWeek = localDateKey(new Date(new Date(`${today}T12:00:00`).getTime() + 7 * 86400000));
    const arrivals = bookings.filter(({ booking }) => booking.checkIn >= today && booking.checkIn <= nextWeek);
    const monthRevenue = monthBookings.reduce((sum, { booking }) => {
      const overlapStart = booking.checkIn > monthStart ? booking.checkIn : monthStart;
      const overlapEnd = booking.checkOut < monthEnd ? booking.checkOut : monthEnd;
      const ratio = booking.totalNights > 0 ? daysBetween(overlapStart, overlapEnd) / booking.totalNights : 0;
      return sum + booking.totalAmount * ratio;
    }, 0);
    const monthCommission = monthBookings.reduce((sum, { booking, project }) => {
      const overlapStart = booking.checkIn > monthStart ? booking.checkIn : monthStart;
      const overlapEnd = booking.checkOut < monthEnd ? booking.checkOut : monthEnd;
      const ratio = booking.totalNights > 0 ? daysBetween(overlapStart, overlapEnd) / booking.totalNights : 0;
      return sum + rentalBookingCommission(booking, project) * ratio;
    }, 0);
    const outstanding = bookings
      .filter(({ booking }) => booking.checkOut >= today)
      .reduce((sum, { booking }) => sum + rentalBookingBalanceDue(booking), 0);
    const monthExpenses = projectsInScope.reduce((sum, project) => sum + (project.expenses || [])
      .filter((expense) => expense.date >= monthStart && expense.date < monthEnd)
      .filter(isOwnerExpense)
      .reduce((expenseSum, expense) => expenseSum + expense.amount, 0), 0);
    const workflowReminders = bookings.filter(({ booking }) =>
      (booking.checkIn >= today && booking.checkIn <= nextWeek && booking.operations?.checkInStatus !== 'ready' && booking.operations?.checkInStatus !== 'completed')
      || (booking.checkOut === today && booking.operations?.checkOutStatus !== 'completed')
      || (booking.checkOut <= today && booking.operations?.cleaningStatus && booking.operations.cleaningStatus !== 'completed')
    ).length;
    return {
      total: projectsInScope.length,
      available: Math.max(0, projectsInScope.length - unavailable),
      occupied,
      arrivals,
      monthRevenue: Math.round(monthRevenue * 100) / 100,
      monthCommission: Math.round(monthCommission * 100) / 100,
      monthExpenses,
      outstanding,
      workflowReminders,
    };
  }, [rentalProjects, propertyOwner, monthStart, monthEnd, today]);
  const stats = {
    total: operationalStats.total,
    totalBookings: rentalProjects.reduce((sum, project) => sum + (project.rentalBookings || []).length, 0),
    totalRevenue: operationalStats.monthRevenue,
    totalCommission: operationalStats.monthCommission,
  };

  const propertyOccupancyState = (project: Project) => {
    const bookings = activeBookings(project);
    if (bookings.some((booking) => booking.checkIn <= today && booking.checkOut > today)) return 'active' as const;
    if ((project.rentalCalendarBlocks || []).some((block) => block.status === 'active' && block.startDate <= today && block.endDate > today)) return 'blocked' as const;
    if (bookings.some((booking) => booking.checkIn > today)) return 'reserved' as const;
    return 'available' as const;
  };

  const hasAvailabilityRange = Boolean(availabilityStart && availabilityEnd && availabilityEnd > availabilityStart);

  const isAvailableForPeriod = (project: Project) => {
    if (!hasAvailabilityRange) return true;
    return !activeBookings(project)
      .some((booking) => booking.checkIn < availabilityEnd && booking.checkOut > availabilityStart)
      && !(project.rentalCalendarBlocks || []).some((block) =>
        block.status === 'active' && block.startDate < availabilityEnd && block.endDate > availabilityStart
      );
  };

  const filteredRentalProjects = useMemo(() => {
    const query = propertyQuery.trim().toLowerCase();
    return rentalProjects
      .filter((project) => {
        const property = project.rentalProperty;
        const matchesQuery = !query || [project.name, project.address, property?.buildingNumber, property?.ownerName]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(query));
        const matchesOccupancy = propertyOccupancy === 'all' || propertyOccupancyState(project) === propertyOccupancy;
        const matchesOwner = propertyOwner === 'all' || property?.ownerName === propertyOwner;
        const periodAvailable = isAvailableForPeriod(project);
        const matchesAvailability = !hasAvailabilityRange
          || availabilityFilter === 'any'
          || (availabilityFilter === 'available' && periodAvailable)
          || (availabilityFilter === 'booked' && !periodAvailable);
        return matchesQuery && matchesOccupancy && matchesAvailability && matchesOwner;
      })
      .sort((left, right) => {
        if (propertySort === 'revenue') {
          const leftRevenue = (left.rentalBookings || []).reduce((sum, booking) => sum + booking.totalAmount, 0);
          const rightRevenue = (right.rentalBookings || []).reduce((sum, booking) => sum + booking.totalAmount, 0);
          return rightRevenue - leftRevenue;
        }
        if (propertySort === 'price') {
          return (right.rentalProperty?.pricePerNight || 0) - (left.rentalProperty?.pricePerNight || 0);
        }
        if (propertySort === 'next_booking') {
          return (nextBookingFor(left, today)?.checkIn || '9999').localeCompare(nextBookingFor(right, today)?.checkIn || '9999');
        }
        return left.name.localeCompare(right.name);
      });
  }, [rentalProjects, propertyQuery, propertyOccupancy, propertyOwner, propertySort, availabilityStart, availabilityEnd, availabilityFilter, hasAvailabilityRange, today]);

  const propertyPageCount = Math.max(1, Math.ceil(filteredRentalProjects.length / 11));
  const activePropertyPage = Math.min(propertyPage, propertyPageCount);
  const visibleRentalProjects = filteredRentalProjects.slice((activePropertyPage - 1) * 11, activePropertyPage * 11);

  useEffect(() => {
    setPropertyPage(1);
  }, [propertyQuery, propertyOccupancy, propertyOwner, propertySort, availabilityStart, availabilityEnd, availabilityFilter]);

  const setRentalView = (view: 'cards' | 'table') => {
    setPropertyView(view);
    localStorage.setItem('hs_tracker_rental_view', view);
  };

  return (
    <div className="flex min-h-full w-full flex-col">
      <TopNavbar
        language={language}
        onLanguageChange={onLanguageChange}
        theme={theme}
        onThemeToggle={onThemeToggle}
        user={user}
        onToggleSidebar={onToggleSidebar}
        sidebarOpen={sidebarOpen}
        sidebarToggleLabel={sidebarToggleLabel}
        showSidebarToggle
        mode="dashboard"
        onBack={onBack}
        backLabel={rentalText(language, 'All Workspaces', 'Tous les espaces')}
        createLabel={rentalText(language, 'New Rental', 'Nouvelle Location')}
        onCreateProject={() => setShowCreateForm(true)}
        unreadCount={unreadCount}
        onToggleNotifications={onToggleNotifications}
        onOpenSearch={onOpenSearch}
        langLabel={rentalText(language, 'Language', 'Langue')}
      />
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 pb-8 pt-5 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className={`mb-1 flex items-center gap-2 text-[10px] font-bold uppercase ${
              section === 'calendar'
                ? 'text-violet-600 dark:text-violet-400'
                : section === 'bookings'
                ? 'text-sky-600 dark:text-sky-400'
                : section === 'revenue'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-teal-600 dark:text-teal-400'
            }`}>
              {section === 'calendar'
                ? <Calendar className="h-3.5 w-3.5" />
                : section === 'bookings'
                ? <Calendar className="h-3.5 w-3.5" />
                : section === 'revenue'
                  ? <DollarSign className="h-3.5 w-3.5" />
                  : <KeyRound className="h-3.5 w-3.5" />}
              {section === 'calendar'
                ? rentalText(language, 'Portfolio calendar', 'Calendrier du portefeuille')
                : section === 'bookings'
                ? (rentalText(language, 'Booking center', 'Centre de reservations'))
                : section === 'revenue'
                  ? (rentalText(language, 'Rental finances', 'Finances locatives'))
                  : (rentalText(language, 'Rental operations', 'Operations locatives'))}
            </div>
            <h1 className="text-2xl font-bold text-slate-950 dark:text-white">
              {section === 'calendar'
                ? rentalText(language, 'Availability calendar', 'Calendrier des disponibilites')
                : section === 'bookings'
                ? (rentalText(language, 'Bookings and stays', 'Reservations et sejours'))
                : section === 'revenue'
                  ? (rentalText(language, 'Revenue and payouts', 'Revenus et versements'))
                  : (rentalText(language, 'Rental portfolio', 'Portefeuille de locations'))}
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {section === 'calendar'
                ? rentalText(language, 'Bookings, tentative holds, and maintenance blocks across every apartment.', 'Reservations, options et maintenances pour tous les appartements.')
                : section === 'bookings'
                ? (rentalText(language, 'Every guest, arrival, departure, and balance in one working list.', 'Tous les clients, arrivees, departs et soldes dans une seule liste.'))
                : section === 'revenue'
                  ? (rentalText(language, 'Revenue, commission, expenses, and owner payouts.', 'Revenus, commissions, depenses et versements aux proprietaires.'))
                  : `${operationalStats.total} ${rentalText(
                    language,
                    'properties monitored in real time',
                    'biens suivis en temps réel'
                  )}`}
            </p>
          </div>
          {section === 'portfolio' && <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <DatePickerInput
              type="month"
              value={reportMonth}
              onChange={(value) => value && setReportMonth(value)}
              className="col-span-2 w-full sm:col-span-1 sm:w-40"
              ariaLabel={rentalText(language, 'Report month', 'Mois du rapport')}
            />
            <button
              type="button"
              onClick={() => setShowOwnerReport(true)}
              className="flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm hover:border-teal-400 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            >
              <FileDown className="h-4 w-4" />
              {rentalText(language, 'Owner report', 'Rapport proprietaire')}
            </button>
            <button
              type="button"
              onClick={() => setShowLegacyImport(true)}
              className="flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm hover:border-purple-400 hover:text-purple-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            >
              <Upload className="h-4 w-4" />
              {rentalText(language, 'Import legacy data', 'Importer ancien suivi')}
            </button>
            <button
              onClick={() => setShowCreateForm(true)}
              className="col-span-2 flex h-9 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-xs font-bold text-white shadow-sm hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500 sm:col-span-1"
            >
              <Plus className="h-4 w-4" />
              {rentalText(language, 'Add property', 'Ajouter un bien')}
            </button>
          </div>}
        </div>

        {section === 'portfolio' && <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <RentalMetric icon={Building} label={rentalText(language, 'Properties', 'Biens')} value={String(operationalStats.total)} tone="slate" />
            <RentalMetric icon={CheckCircle2} label={rentalText(language, 'Available now', 'Disponibles')} value={String(operationalStats.available)} tone="emerald" />
            <RentalMetric icon={BedDouble} label={rentalText(language, 'Occupied now', 'Occupes')} value={String(operationalStats.occupied)} tone="amber" />
            <RentalMetric icon={TrendingUp} label={rentalText(language, 'Month revenue', 'Revenus du mois')} value={`${operationalStats.monthRevenue.toLocaleString()} DH`} tone="teal" />
            <RentalMetric icon={WalletCards} label={rentalText(language, 'Month commission', 'Commission du mois')} value={`${operationalStats.monthCommission.toLocaleString()} DH`} tone="violet" />
          </div>

          <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(19rem,0.6fr)]">
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <div>
                <h2 className="text-xs font-bold text-slate-900 dark:text-white">{rentalText(language, 'Upcoming arrivals', 'Prochaines arrivees')}</h2>
                <p className="mt-0.5 text-[10px] text-slate-400">{rentalText(language, 'Next seven days', 'Sept prochains jours')}</p>
              </div>
              <span className="rounded-full bg-teal-50 px-2 py-1 text-[10px] font-bold text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">{operationalStats.arrivals.length}</span>
            </div>
            <div className="grid min-h-24 divide-y divide-slate-100 dark:divide-slate-800 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-3">
              {operationalStats.arrivals.length === 0 ? (
                <div className="col-span-full flex items-center justify-center gap-2 px-4 py-6 text-xs text-slate-400">
                  <Calendar className="h-4 w-4" />
                  {rentalText(language, 'No arrivals this week', 'Aucune arrivee cette semaine')}
                </div>
              ) : operationalStats.arrivals.slice(0, 3).map(({ booking, project }) => (
                <button key={`${project.id}_${booking.id}`} type="button" onClick={() => onSelectProject(project.id)} className="p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-950/40">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-bold text-teal-600">{booking.checkIn}</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-slate-300" />
                  </div>
                  <p className="mt-2 truncate text-xs font-bold text-slate-900 dark:text-white">{booking.clientName}</p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-400">{project.rentalProperty?.buildingNumber || project.name} · {booking.totalNights} {rentalText(language, 'nights', 'nuits')}</p>
                </button>
              ))}
            </div>
          </section>
          <section className="rounded-lg border border-slate-200 bg-white p-4 text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <h2 className="text-xs font-bold">{rentalText(language, 'Needs attention', 'A surveiller')}</h2>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">{rentalText(language, 'Guest balance', 'Solde clients')}</p>
                <p className="mt-1 font-mono text-lg font-bold text-amber-600 dark:text-amber-300">{operationalStats.outstanding.toLocaleString()} DH</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">{rentalText(language, 'Workflow reminders', 'Rappels opérations')}</p>
                <p className="mt-1 font-mono text-lg font-bold text-sky-600 dark:text-sky-300">{operationalStats.workflowReminders}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">{rentalText(language, 'Month expenses', 'Depenses du mois')}</p>
                <p className="mt-1 font-mono text-lg font-bold text-rose-600 dark:text-rose-300">{operationalStats.monthExpenses.toLocaleString()} DH</p>
              </div>
            </div>
            <p className="mt-4 border-t border-slate-200 pt-3 text-[10px] leading-4 text-slate-500 dark:border-white/10 dark:text-slate-400">
              {rentalText(language, 'Figures use the bookings and expenses already saved for the selected month.', 'Montants calcules depuis les donnees deja enregistrees.')}
            </p>
          </section>
          </div>
        </>}

        {section === 'bookings' && (
          <RentalBookingsCenter
            projects={rentalProjects}
            language={language}
            onOpenProject={(projectId) => onSelectProject(projectId, 'rental')}
          />
        )}

        {section === 'calendar' && (
          <RentalUnifiedCalendar
            projects={rentalProjects}
            language={language}
            onOpenProject={(projectId) => onSelectProject(projectId, 'rental')}
          />
        )}

        {section === 'revenue' && (
          <RentalRevenueCenter
            projects={rentalProjects}
            language={language}
            month={reportMonth}
            owner={propertyOwner}
            ownerOptions={ownerOptions}
            onMonthChange={setReportMonth}
            onOwnerChange={setPropertyOwner}
            onOpenReport={() => {
              setReportOwner(propertyOwner);
              setShowOwnerReport(true);
            }}
            onOpenProject={(projectId) => onSelectProject(projectId, 'rental')}
          />
        )}

        {/* Header */}
        <div className="hidden">
          <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                {language === 'en' ? 'Rental Management' : language === 'fr' ? 'Gestion des Locations' : 'إدارة الإيجارات'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {rentalProjects.length} {language === 'en' ? 'properties' : language === 'fr' ? 'propriétés' : 'عقارات'}
              </p>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition-all cursor-pointer lg:hidden"
          >
            <Plus className="w-3.5 h-3.5" />
            {language === 'en' ? 'New Rental' : language === 'fr' ? 'Nouvelle Location' : 'إيجار جديد'}
          </button>
        </div>

        {/* Stats Cards */}
        <div className="hidden">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{language === 'en' ? 'Properties' : language === 'fr' ? 'Propriétés' : 'العقارات'}</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">{stats.total}</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{language === 'en' ? 'Bookings' : language === 'fr' ? 'Réservations' : 'الحجوزات'}</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">{stats.totalBookings}</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{t.rental.totalRevenue}</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">{stats.totalRevenue.toLocaleString()} DH</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{t.rental.totalCommission}</p>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">+{stats.totalCommission.toLocaleString()} DH</p>
          </div>
        </div>

        {/* Property directory */}
        {section === 'portfolio' && (rentalProjects.length === 0 ? (
          <div className="text-center py-20">
            <Building className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700 mb-4" />
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">
              {language === 'en' ? 'No rental properties yet.' : language === 'fr' ? 'Aucune propriété locative.' : 'لا توجد عقارات للإيجار بعد.'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-6">
              {language === 'en' ? 'Add your first rental property to get started.' : language === 'fr' ? 'Ajoutez votre première propriété.' : 'أضف أول عقار إيجاري للبدء.'}
            </p>
            <button onClick={() => setShowCreateForm(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white cursor-pointer">
              <Plus className="w-3.5 h-3.5" />
              {language === 'en' ? 'Add Property' : language === 'fr' ? 'Ajouter' : 'إضافة عقار'}
            </button>
          </div>
        ) : (
          <section className="space-y-3">
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={propertyQuery}
                  onChange={(event) => setPropertyQuery(event.target.value)}
                  placeholder={rentalText(language, 'Search property, building, or owner...', 'Rechercher un bien ou propriétaire...')}
                  className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-900 outline-none transition-colors focus:border-purple-400 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2 sm:flex sm:items-center">
                <label className="relative min-w-0">
                  <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <select
                    value={propertyOccupancy}
                    onChange={(event) => setPropertyOccupancy(event.target.value as typeof propertyOccupancy)}
                    className="h-9 w-full appearance-none rounded-md border border-slate-200 bg-white pl-8 pr-7 text-[11px] font-semibold text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 sm:w-28"
                  >
                    <option value="all">{rentalText(language, 'All', 'Tous')}</option>
                    <option value="available">{rentalText(language, 'Available', 'Disponible')}</option>
                    <option value="reserved">{rentalText(language, 'Reserved', 'Réservé')}</option>
                    <option value="active">{rentalText(language, 'Active', 'Occupé')}</option>
                    <option value="blocked">{rentalText(language, 'Blocked', 'Bloqué')}</option>
                  </select>
                </label>
                <select
                  value={propertyOwner}
                  onChange={(event) => setPropertyOwner(event.target.value)}
                  className="h-9 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 sm:w-36"
                  aria-label={rentalText(language, 'Filter by owner', 'Filtrer par proprietaire')}
                >
                  <option value="all">{rentalText(language, 'All owners', 'Tous proprietaires')}</option>
                  {ownerOptions.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
                </select>
                <select
                  value={propertySort}
                  onChange={(event) => setPropertySort(event.target.value as typeof propertySort)}
                  className="h-9 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 sm:w-32"
                >
                  <option value="name">{rentalText(language, 'Name', 'Nom')}</option>
                  <option value="revenue">{rentalText(language, 'Revenue', 'Revenus')}</option>
                  <option value="price">{rentalText(language, 'Price / night', 'Prix / nuit')}</option>
                  <option value="next_booking">{rentalText(language, 'Next arrival', 'Prochaine arrivee')}</option>
                </select>
              </div>
              <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2 sm:grid-cols-3 lg:min-w-[25rem]">
                <DatePickerInput
                  value={availabilityStart}
                  onChange={setAvailabilityStart}
                  ariaLabel={rentalText(language, 'Desired check-in', 'Arrivée souhaitée')}
                />
                <DatePickerInput
                  value={availabilityEnd}
                  min={availabilityStart || undefined}
                  onChange={setAvailabilityEnd}
                  ariaLabel={rentalText(language, 'Desired check-out', 'Départ souhaité')}
                />
                <select
                  value={availabilityFilter}
                  onChange={(event) => setAvailabilityFilter(event.target.value as typeof availabilityFilter)}
                  disabled={!hasAvailabilityRange}
                  className="h-9 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 min-[390px]:col-span-2 sm:col-span-1"
                >
                  <option value="any">{rentalText(language, 'Period', 'Periode')}</option>
                  <option value="available">{rentalText(language, 'Free', 'Libre')}</option>
                  <option value="booked">{rentalText(language, 'Booked', 'Reserve')}</option>
                </select>
              </div>
              <div className="flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-800 dark:bg-slate-950">
                <button type="button" onClick={() => setRentalView('table')} title="Table view" className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${propertyView === 'table' ? 'bg-white text-purple-600 shadow-sm dark:bg-slate-800 dark:text-purple-300' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}><Table className="h-4 w-4" /></button>
                <button type="button" onClick={() => setRentalView('cards')} title="Card view" className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${propertyView === 'cards' ? 'bg-white text-purple-600 shadow-sm dark:bg-slate-800 dark:text-purple-300' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}><LayoutGrid className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="flex items-center justify-between px-1 text-[11px] text-slate-500 dark:text-slate-400">
              <span>{filteredRentalProjects.length} {rentalText(language, 'properties found', 'biens trouvés')}</span>
              <span>{rentalText(language, 'Page', 'Page')} {activePropertyPage} / {propertyPageCount}</span>
            </div>

            {visibleRentalProjects.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 py-14 text-center text-xs text-slate-400 dark:border-slate-700">
                {rentalText(language, 'No properties match the current filters.', 'Aucun bien ne correspond aux filtres.')}
              </div>
            ) : propertyView === 'table' ? (
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <table className="w-full min-w-[50rem] text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase text-slate-400 dark:border-slate-800 dark:bg-slate-950/50">
                    <tr><th className="px-4 py-3">{rentalText(language, 'Property', 'Bien')}</th><th className="px-4 py-3">{rentalText(language, 'Owner', 'Propriétaire')}</th><th className="px-4 py-3">{rentalText(language, 'Occupancy', 'Statut')}</th><th className="px-4 py-3 text-right">{rentalText(language, 'Nightly rate', 'Prix / nuit')}</th><th className="px-4 py-3 text-right">{rentalText(language, 'Revenue', 'Revenus')}</th><th className="px-4 py-3 text-right">{rentalText(language, 'Bookings', 'Réservations')}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {visibleRentalProjects.map((project) => {
                      const occupancy = propertyOccupancyState(project);
                      const periodAvailable = isAvailableForPeriod(project);
                      const bookings = project.rentalBookings || [];
                      const revenue = bookings.reduce((sum, booking) => sum + booking.totalAmount, 0);
                      return <tr key={project.id} onClick={() => onSelectProject(project.id)} className="cursor-pointer transition-colors hover:bg-purple-50/60 dark:hover:bg-purple-950/20">
                        <td className="px-4 py-3"><div className="flex items-center gap-2"><Building className="h-4 w-4 text-purple-600" /><div><p className="font-semibold text-slate-900 dark:text-white">{project.rentalProperty?.buildingNumber || project.name}</p><p className="mt-0.5 text-[10px] text-slate-400">{project.name}</p></div></div></td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{project.rentalProperty?.ownerName || '—'}</td>
                        <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${occupancy === 'active' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : occupancy === 'reserved' ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' : occupancy === 'blocked' ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'}`}>{occupancy === 'active' ? rentalText(language, 'Active', 'Occupé') : occupancy === 'reserved' ? rentalText(language, 'Reserved', 'Réservé') : occupancy === 'blocked' ? rentalText(language, 'Blocked', 'Bloqué') : rentalText(language, 'Available', 'Disponible')}</span></td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-200">{project.rentalProperty?.pricePerNight?.toLocaleString() || 0} {project.currency}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 dark:text-white">{revenue.toLocaleString()} {project.currency}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <span className="mr-2 font-mono text-slate-500">{bookings.length}</span>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onSelectProject(project.id);
                              }}
                              title={rentalText(language, 'Open property', 'Ouvrir le bien')}
                              className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-purple-50 hover:text-purple-700 dark:hover:bg-purple-500/10 dark:hover:text-purple-300"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                            {canEditProperty(project) && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onEditProject(project.id);
                                }}
                                title={rentalText(language, 'Edit property', 'Modifier le bien')}
                                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-sky-50 hover:text-sky-700 dark:hover:bg-sky-500/10 dark:hover:text-sky-300"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {canDeleteProperty(project) && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDeleteTarget(project);
                                }}
                                title={rentalText(language, 'Delete property', 'Supprimer le bien')}
                                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visibleRentalProjects.map((project) => {
                  const bookings = project.rentalBookings || [];
                  const occupancy = propertyOccupancyState(project);
                  const periodAvailable = isAvailableForPeriod(project);
                  const revenue = bookings.reduce((sum, booking) => sum + booking.totalAmount, 0);
                  const commission = bookings.reduce((sum, booking) => sum + rentalBookingCommission(booking, project), 0);
                  const nextBooking = nextBookingFor(project, today);
                  return <article key={project.id} className="rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-purple-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-purple-700">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><Building className="h-4 w-4 shrink-0 text-purple-600" /><h3 className="truncate text-sm font-bold text-slate-900 dark:text-white">{project.rentalProperty?.buildingNumber || project.name}</h3></div><p className="mt-1 truncate text-[11px] text-slate-500">{project.rentalProperty?.ownerName || '—'}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${occupancy === 'active' ? 'bg-amber-100 text-amber-700' : occupancy === 'reserved' ? 'bg-sky-100 text-sky-700' : occupancy === 'blocked' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>{occupancy}</span></div>
                    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-[10px] dark:border-slate-800"><div><span className="block text-slate-400">{rentalText(language, 'Night', 'Nuit')}</span><span className="font-mono font-bold text-slate-700 dark:text-slate-200">{project.rentalProperty?.pricePerNight || 0}</span></div><div><span className="block text-slate-400">{rentalText(language, 'Revenue', 'Revenus')}</span><span className="font-mono font-bold text-slate-700 dark:text-slate-200">{revenue.toLocaleString()}</span></div><div><span className="block text-slate-400">{rentalText(language, 'Bookings', 'Réservations')}</span><span className="font-mono font-bold text-slate-700 dark:text-slate-200">{bookings.length}</span></div></div>
                    <AvailabilityStrip project={project} startDate={today} language={language} />
                    <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
                      <span className="text-slate-400">{rentalText(language, 'Next arrival', 'Prochaine arrivee')}</span>
                      <span className="font-mono font-bold text-slate-600 dark:text-slate-300">{nextBooking?.checkIn || (rentalText(language, 'None', 'Aucune'))}</span>
                    </div>
                    {hasAvailabilityRange && <div className={`mt-3 rounded-md px-2 py-1.5 text-[10px] font-bold ${periodAvailable ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'}`}>{periodAvailable ? (rentalText(language, 'Free for selected period', 'Libre pour cette periode')) : (rentalText(language, 'Booked in selected period', 'Reserve sur cette periode'))}</div>}
                    <p className="mt-3 text-[10px] text-emerald-600 dark:text-emerald-400">{rentalText(language, 'Commission', 'Commission')}: +{commission.toLocaleString()} {project.currency}</p>
                    <div className="mt-3 flex items-center justify-end gap-1 border-t border-slate-100 pt-3 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => onSelectProject(project.id)}
                        title={rentalText(language, 'Open property', 'Ouvrir le bien')}
                        className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[10px] font-bold text-purple-700 hover:bg-purple-50 dark:text-purple-300 dark:hover:bg-purple-500/10"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                        {rentalText(language, 'Open', 'Ouvrir')}
                      </button>
                      {canEditProperty(project) && (
                        <button
                          type="button"
                          onClick={() => onEditProject(project.id)}
                          title={rentalText(language, 'Edit property', 'Modifier le bien')}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-sky-50 hover:text-sky-700 dark:hover:bg-sky-500/10 dark:hover:text-sky-300"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canDeleteProperty(project) && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(project)}
                          title={rentalText(language, 'Delete property', 'Supprimer le bien')}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </article>;
                })}
              </div>
            )}

            {propertyPageCount > 1 && (
              <div className="flex items-center justify-center gap-2 pt-1">
                <button type="button" disabled={activePropertyPage === 1} onClick={() => setPropertyPage((page) => Math.max(1, page - 1))} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:text-slate-300">{rentalText(language, 'Previous', 'Précédent')}</button>
                <span className="min-w-16 text-center font-mono text-[11px] text-slate-500">{activePropertyPage} / {propertyPageCount}</span>
                <button type="button" disabled={activePropertyPage === propertyPageCount} onClick={() => setPropertyPage((page) => Math.min(propertyPageCount, page + 1))} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:text-slate-300">{rentalText(language, 'Next', 'Suivant')}</button>
              </div>
            )}
          </section>
        ))}

        {/* Create Rental Form Modal */}
        {showCreateForm && (
          <CreateRentalForm
            language={language}
            t={t}
            user={user}
            onClose={() => setShowCreateForm(false)}
            onCreated={(id) => {
              setShowCreateForm(false);
              onSelectProject(id);
            }}
          />
        )}
        {showOwnerReport && (
          <OwnerReportModal
            projects={rentalProjects}
            ownerOptions={ownerOptions}
            selectedOwner={reportOwner}
            onOwnerChange={setReportOwner}
            month={reportMonth}
            onMonthChange={setReportMonth}
            language={language}
            onClose={() => setShowOwnerReport(false)}
          />
        )}
        {showLegacyImport && user?.uid && user.email && (
          <LegacyRentalImportModal
            projects={rentalProjects}
            user={{ uid: user.uid, email: user.email, name: user.displayName || user.email.split('@')[0] }}
            language={language}
            onClose={() => setShowLegacyImport(false)}
          />
        )}
        <ConfirmDialog
          open={Boolean(deleteTarget)}
          title={rentalText(language, 'Delete this property?', 'Supprimer ce bien ?')}
          message={language === 'fr'
            ? `Supprimer définitivement « ${deleteTarget?.rentalProperty?.buildingNumber || deleteTarget?.name || ''} » avec toutes ses réservations, dépenses, paiements et données. Cette action est irréversible.`
            : language === 'ar'
              ? `حذف « ${deleteTarget?.rentalProperty?.buildingNumber || deleteTarget?.name || ''} » نهائياً مع جميع الحجوزات والمصاريف والمدفوعات والبيانات. لا يمكن التراجع عن هذا الإجراء.`
              : `Permanently delete "${deleteTarget?.rentalProperty?.buildingNumber || deleteTarget?.name || ''}" with all bookings, expenses, payments, and records. This cannot be undone.`}
          language={language}
          confirmLabel={rentalText(language, 'Delete property', 'Supprimer le bien')}
          loading={deletingProperty}
          onConfirm={handleDeleteProperty}
          onCancel={() => {
            if (!deletingProperty) setDeleteTarget(null);
          }}
        />
      </div>
    </div>
  );
}

/* ─── Inline Create Rental Form Modal ─── */
function RentalBookingsCenter({
  projects,
  language,
  onOpenProject,
}: {
  projects: Project[];
  language: Language;
  onOpenProject: (projectId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | RentalBookingStatus>('all');
  const [month, setMonth] = useState('');
  const rows = useMemo(() => projects.flatMap((project) =>
    (project.rentalBookings || []).map((booking) => ({ project, booking }))
  ).filter(({ project, booking }) => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery = !normalizedQuery || [
      booking.clientName,
      booking.clientPhone,
      booking.source,
      project.name,
      project.rentalProperty?.buildingNumber,
      project.rentalProperty?.ownerName,
    ].filter(Boolean).some((value) => value!.toLowerCase().includes(normalizedQuery));
    const matchesStatus = status === 'all' || booking.status === status;
    const selectedMonthStart = month ? `${month}-01` : '';
    const selectedMonthEndDate = month ? new Date(`${selectedMonthStart}T12:00:00`) : null;
    selectedMonthEndDate?.setMonth(selectedMonthEndDate.getMonth() + 1);
    const selectedMonthEnd = selectedMonthEndDate ? localDateKey(selectedMonthEndDate) : '';
    const matchesMonth = !month || bookingOverlaps(booking, selectedMonthStart, selectedMonthEnd);
    return matchesQuery && matchesStatus && matchesMonth;
  }).sort((left, right) => left.booking.checkIn.localeCompare(right.booking.checkIn)),
  [projects, query, status, month]);
  const today = localDateKey();
  const currentStays = rows.filter(({ booking }) => booking.status !== 'cancelled' && booking.checkIn <= today && booking.checkOut > today).length;
  const upcoming = rows.filter(({ booking }) => booking.status !== 'cancelled' && booking.checkIn > today).length;
  const outstanding = rows.reduce((sum, { booking }) => sum + rentalBookingBalanceDue(booking), 0);
  const statusStyle: Record<RentalBookingStatus, string> = {
    upcoming: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
    active: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
    completed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    cancelled: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  };

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-3">
        <CompactMetric label={rentalText(language, 'Staying now', 'En sejour')} value={currentStays.toString()} />
        <CompactMetric label={rentalText(language, 'Upcoming', 'A venir')} value={upcoming.toString()} />
        <CompactMetric label={rentalText(language, 'Balance due', 'Solde a recevoir')} value={`${outstanding.toLocaleString()} DH`} warning={outstanding > 0} />
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 md:flex-row">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={rentalText(language, 'Guest, phone, property, or source...', 'Client, telephone, bien ou source...')} className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-950" />
        </label>
        <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold dark:border-slate-700 dark:bg-slate-950">
          <option value="all">{rentalText(language, 'All statuses', 'Tous statuts')}</option>
          <option value="upcoming">{rentalText(language, 'Upcoming', 'A venir')}</option>
          <option value="active">{rentalText(language, 'Active', 'Actif')}</option>
          <option value="completed">{rentalText(language, 'Completed', 'Termine')}</option>
          <option value="cancelled">{rentalText(language, 'Cancelled', 'Annule')}</option>
        </select>
        <DatePickerInput type="month" value={month} onChange={setMonth} ariaLabel={rentalText(language, 'Stay month', 'Mois du séjour')} className="md:w-44" />
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[58rem] text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase text-slate-400 dark:border-slate-800 dark:bg-slate-950/60">
            <tr>
              <th className="px-4 py-3">{rentalText(language, 'Guest', 'Client')}</th>
              <th className="px-4 py-3">{rentalText(language, 'Property', 'Appartement')}</th>
              <th className="px-4 py-3">{rentalText(language, 'Stay', 'Sejour')}</th>
              <th className="px-4 py-3">{rentalText(language, 'Status', 'Statut')}</th>
              <th className="px-4 py-3 text-right">{rentalText(language, 'Total', 'Total')}</th>
              <th className="px-4 py-3 text-right">{rentalText(language, 'Balance', 'Solde')}</th>
              <th className="w-10 px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.length === 0 ? <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">{rentalText(language, 'No bookings match these filters.', 'Aucune reservation trouvee.')}</td></tr> : rows.map(({ project, booking }) => (
              <tr key={`${project.id}_${booking.id}`} className="hover:bg-slate-50 dark:hover:bg-slate-950/40">
                <td className="px-4 py-3"><p className="font-bold text-slate-900 dark:text-white">{booking.clientName}</p><p className="mt-0.5 text-[10px] text-slate-400">{booking.clientPhone || booking.source || '-'}</p></td>
                <td className="px-4 py-3"><p className="font-semibold">{project.rentalProperty?.buildingNumber || project.name}</p><p className="mt-0.5 text-[10px] text-slate-400">{project.rentalProperty?.ownerName || '-'}</p></td>
                <td className="px-4 py-3 font-mono text-[10px]"><p>{booking.checkIn} - {booking.checkOut}</p><p className="mt-0.5 text-slate-400">{booking.totalNights} {rentalText(language, 'nights', 'nuits')} · {booking.numberOfGuests} {rentalText(language, 'guests', 'clients')}</p></td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${statusStyle[booking.status]}`}>{TRANSLATIONS[language].rental.statuses[booking.status]}</span></td>
                <td className="px-4 py-3 text-right font-mono font-bold">{booking.totalAmount.toLocaleString()} {project.currency}</td>
                <td className={`px-4 py-3 text-right font-mono font-bold ${rentalBookingBalanceDue(booking) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{rentalBookingBalanceDue(booking).toLocaleString()} {project.currency}</td>
                <td className="px-2 py-3"><button type="button" onClick={() => onOpenProject(project.id)} title={rentalText(language, 'Open bookings', 'Ouvrir les reservations')} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-teal-500/10"><ChevronRight className="h-4 w-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RentalUnifiedCalendar({
  projects,
  language,
  onOpenProject,
}: {
  projects: Project[];
  language: Language;
  onOpenProject: (projectId: string) => void;
}) {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentMonthKey);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [blockType, setBlockType] = useState<RentalCalendarBlock['type']>('tentative_hold');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<{ project: Project; block: RentalCalendarBlock } | null>(null);
  /** Familiar month grid next to the occupancy matrix (same data, calendar layout). */
  const [matrixView, setMatrixView] = useState(true);
  const [selectedDay, setSelectedDay] = useState(() => localDateKey());

  const [year, monthNumber] = month.split('-').map(Number);
  const numberOfDays = new Date(year, monthNumber, 0).getDate();
  const dayKeys = Array.from({ length: numberOfDays }, (_, index) =>
    `${month}-${String(index + 1).padStart(2, '0')}`
  );
  const canManage = (project: Project) => Boolean(
    user?.email && !getProjectPermissions(resolveUserRole(project, user.email)).isReadOnly
  );
  const selectableProjects = projects.filter(canManage);

  const openBlockForm = () => {
    const firstProject = selectableProjects[0];
    setProjectId(firstProject?.id || '');
    setBlockType('tentative_hold');
    setStartDate(`${month}-01`);
    setEndDate(`${month}-${String(Math.min(2, numberOfDays)).padStart(2, '0')}`);
    setTitle('');
    setNotes('');
    setError('');
    setShowBlockForm(true);
  };

  const saveBlock = async () => {
    if (!user?.uid || !user.email) return;
    const project = projects.find((item) => item.id === projectId);
    if (!project || !canManage(project)) return;
    if (!title.trim() || !startDate || !endDate || endDate <= startDate) {
      setError(rentalText(language, 'Add a title and a valid start/end period.', 'Ajoutez un titre et une periode valide.'));
      return;
    }
    const bookingConflict = activeBookings(project).some((booking) =>
      booking.checkIn < endDate && booking.checkOut > startDate
    );
    const blockConflict = (project.rentalCalendarBlocks || []).some((block) =>
      block.status === 'active' && block.startDate < endDate && block.endDate > startDate
    );
    if (bookingConflict || blockConflict) {
      setError(rentalText(language, 'This period overlaps an existing booking or block.', 'Cette periode chevauche une reservation ou un blocage.'));
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const block: RentalCalendarBlock = {
        id: `calendar_block_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: blockType,
        startDate,
        endDate,
        title: title.trim(),
        notes: notes.trim() || undefined,
        status: 'active',
        createdAt: now,
        createdBy: user.email.toLowerCase(),
      };
      await saveProjectToDB(user.uid, {
        ...project,
        rentalCalendarBlocks: [...(project.rentalCalendarBlocks || []), block],
      });
      setShowBlockForm(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this calendar block.');
    } finally {
      setSaving(false);
    }
  };

  const cancelBlock = async () => {
    if (!user?.uid || !cancelTarget || !canManage(cancelTarget.project)) return;
    setSaving(true);
    try {
      await saveProjectToDB(user.uid, {
        ...cancelTarget.project,
        rentalCalendarBlocks: (cancelTarget.project.rentalCalendarBlocks || []).map((block) =>
          block.id === cancelTarget.block.id ? { ...block, status: 'cancelled' as const } : block
        ),
      });
      setCancelTarget(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <DatePickerInput type="month" value={month} onChange={(value) => value && setMonth(value)} ariaLabel={rentalText(language, 'Calendar month', 'Mois du calendrier')} className="w-44" />
          <div className="flex flex-wrap gap-3 text-[10px] font-semibold text-slate-500">
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-teal-500" />{rentalText(language, 'Booking', 'Reservation')}</span>
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-violet-500" />{rentalText(language, 'Tentative hold', 'Option')}</span>
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-amber-500" />{rentalText(language, 'Maintenance', 'Maintenance')}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-800 dark:bg-slate-950">
            <button
              type="button"
              onClick={() => setMatrixView(true)}
              title={rentalText(language, 'Occupancy matrix', 'Matrice')}
              className={`flex h-8 items-center gap-1.5 rounded px-2.5 text-[11px] font-bold transition-colors ${matrixView ? 'bg-white text-teal-700 shadow-sm dark:bg-slate-800 dark:text-teal-300' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />{rentalText(language, 'Matrix', 'Matrice')}
            </button>
            <button
              type="button"
              onClick={() => setMatrixView(false)}
              title={rentalText(language, 'Month calendar', 'Calendrier mensuel')}
              className={`flex h-8 items-center gap-1.5 rounded px-2.5 text-[11px] font-bold transition-colors ${!matrixView ? 'bg-white text-teal-700 shadow-sm dark:bg-slate-800 dark:text-teal-300' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
            >
              <CalendarDays className="h-3.5 w-3.5" />{rentalText(language, 'Month', 'Mois')}
            </button>
          </div>
          <button type="button" onClick={() => downloadRentalCalendar(projects, `rentals-${month}.ics`)} className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200"><Download className="h-4 w-4" />ICS</button>
        {selectableProjects.length > 0 && (
          <button type="button" onClick={openBlockForm} className="flex h-9 items-center justify-center gap-1.5 rounded-md bg-violet-600 px-3 text-xs font-bold text-white hover:bg-violet-700">
            <Plus className="h-4 w-4" />{rentalText(language, 'Add hold / block', 'Ajouter option / blocage')}
          </button>
        )}
        </div>
      </div>

      {matrixView ? (
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-max border-collapse text-[10px]">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-950">
            <tr>
              <th className="sticky left-0 z-20 min-w-48 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left font-bold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950">{rentalText(language, 'Apartment', 'Appartement')}</th>
              {dayKeys.map((day) => {
                const weekday = new Date(`${day}T12:00:00`).getDay();
                return <th key={day} className={`h-11 w-9 min-w-9 border-b border-r border-slate-200 text-center font-mono dark:border-slate-800 ${weekday === 0 || weekday === 6 ? 'bg-slate-100 dark:bg-slate-900' : ''}`}><span className="block text-[8px] uppercase text-slate-400">{new Intl.DateTimeFormat(language === 'fr' ? 'fr' : 'en', { weekday: 'short' }).format(new Date(`${day}T12:00:00`)).slice(0, 2)}</span>{Number(day.slice(-2))}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id}>
                <th className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-2 text-left dark:border-slate-800 dark:bg-slate-900">
                  <button type="button" onClick={() => onOpenProject(project.id)} className="max-w-44 truncate font-bold text-slate-900 hover:text-teal-600 dark:text-white">{project.rentalProperty?.buildingNumber || project.name}</button>
                  <span className="block max-w-44 truncate font-normal text-slate-400">{project.rentalProperty?.ownerName || project.name}</span>
                </th>
                {dayKeys.map((day) => {
                  const booking = activeBookings(project).find((item) => item.checkIn <= day && item.checkOut > day);
                  const block = (project.rentalCalendarBlocks || []).find((item) => item.status === 'active' && item.startDate <= day && item.endDate > day);
                  const tone = booking ? 'bg-teal-500' : block?.type === 'maintenance' ? 'bg-amber-500' : block ? 'bg-violet-500' : 'bg-transparent';
                  const label = booking ? `${booking.clientName}: ${booking.checkIn} - ${booking.checkOut}` : block ? `${block.title}: ${block.startDate} - ${block.endDate}` : rentalText(language, 'Available', 'Disponible');
                  return (
                    <td key={day} className="border-b border-r border-slate-100 p-0.5 dark:border-slate-800">
                      <button
                        type="button"
                        title={label}
                        aria-label={`${day}: ${label}`}
                        onClick={() => booking ? onOpenProject(project.id) : block && canManage(project) ? setCancelTarget({ project, block }) : undefined}
                        className={`h-8 w-8 rounded-sm ${tone} ${booking || block ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {projects.length === 0 && <p className="p-10 text-center text-xs text-slate-400">{rentalText(language, 'Add a property to start the calendar.', 'Ajoutez un bien pour commencer.')}</p>}
      </div>
      ) : (
        <RentalMonthCalendar
          projects={projects}
          language={language}
          monthKey={month}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          onSelectMonth={setMonth}
          onOpenProject={onOpenProject}
          onCancelBlock={(project, block) => canManage(project) && setCancelTarget({ project, block })}
        />
      )}

      {showBlockForm && (
        <div className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && !saving && setShowBlockForm(false)}>
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800"><div><h3 className="text-sm font-bold">{rentalText(language, 'Add calendar block', 'Ajouter un blocage')}</h3><p className="mt-0.5 text-[10px] text-slate-400">{rentalText(language, 'The selected apartment will be unavailable for this period.', 'Le bien sera indisponible pendant cette periode.')}</p></div><button type="button" onClick={() => setShowBlockForm(false)} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button></div>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className="mb-1 block text-[9px] font-bold uppercase text-slate-500">{rentalText(language, 'Apartment', 'Appartement')}</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-950">{selectableProjects.map((project) => <option key={project.id} value={project.id}>{project.rentalProperty?.buildingNumber || project.name} - {project.rentalProperty?.ownerName}</option>)}</select></label>
              <label><span className="mb-1 block text-[9px] font-bold uppercase text-slate-500">{rentalText(language, 'Type', 'Type')}</span><select value={blockType} onChange={(event) => setBlockType(event.target.value as RentalCalendarBlock['type'])} className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-950"><option value="tentative_hold">{rentalText(language, 'Tentative hold', 'Option temporaire')}</option><option value="maintenance">{rentalText(language, 'Maintenance', 'Maintenance')}</option></select></label>
              <label><span className="mb-1 block text-[9px] font-bold uppercase text-slate-500">{rentalText(language, 'Title', 'Titre')}</span><input value={title} onChange={(event) => setTitle(event.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-950" placeholder={blockType === 'maintenance' ? 'Plumbing repair' : 'Guest decision pending'} /></label>
              <label><span className="mb-1 block text-[9px] font-bold uppercase text-slate-500">{rentalText(language, 'Start', 'Debut')}</span><DatePickerInput value={startDate} onChange={setStartDate} ariaLabel="Block start" /></label>
              <label><span className="mb-1 block text-[9px] font-bold uppercase text-slate-500">{rentalText(language, 'End', 'Fin')}</span><DatePickerInput value={endDate} min={startDate || undefined} onChange={setEndDate} ariaLabel="Block end" /></label>
              <label className="sm:col-span-2"><span className="mb-1 block text-[9px] font-bold uppercase text-slate-500">{rentalText(language, 'Notes', 'Notes')}</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} className="w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950" /></label>
              {error && <p className="sm:col-span-2 rounded-md bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800"><button type="button" disabled={saving} onClick={() => setShowBlockForm(false)} className="h-9 rounded-md border border-slate-200 px-3 text-xs font-bold dark:border-slate-700">{rentalText(language, 'Cancel', 'Annuler')}</button><button type="button" disabled={saving} onClick={saveBlock} className="h-9 rounded-md bg-violet-600 px-4 text-xs font-bold text-white disabled:opacity-50">{saving ? '...' : rentalText(language, 'Save block', 'Enregistrer')}</button></div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title={rentalText(language, 'Cancel this calendar block?', 'Annuler ce blocage ?')}
        message={cancelTarget ? `${cancelTarget.block.title}: ${cancelTarget.block.startDate} - ${cancelTarget.block.endDate}` : ''}
        confirmLabel={rentalText(language, 'Cancel block', 'Annuler le blocage')}
        language={language}
        loading={saving}
        onConfirm={cancelBlock}
        onCancel={() => !saving && setCancelTarget(null)}
      />
    </section>
  );
}

/**
 * Familiar month-grid calendar for rentals: guest arrivals, departures, cleanings
 * due, and holds/maintenance per day, with a tap-to-inspect agenda. Same data as
 * the occupancy matrix, in the layout people expect from a calendar.
 */
function RentalMonthCalendar({
  projects,
  language,
  monthKey,
  selectedDay,
  onSelectDay,
  onSelectMonth,
  onOpenProject,
  onCancelBlock,
}: {
  projects: Project[];
  language: Language;
  monthKey: string;
  selectedDay: string;
  onSelectDay: (dateKey: string) => void;
  onSelectMonth: (monthKey: string) => void;
  onOpenProject: (projectId: string) => void;
  onCancelBlock: (project: Project, block: RentalCalendarBlock) => void;
}) {
  const todayKey = localDateKey();
  const days = buildMonthGrid(monthKey, todayKey);
  const byDate = groupRentalDays(
    projects.flatMap((project) =>
      (project.rentalBookings || []).map((booking) => ({
        booking,
        projectId: project.id,
        projectName: project.rentalProperty?.buildingNumber || project.name,
      }))
    ),
    projects.flatMap((project) =>
      (project.rentalCalendarBlocks || []).map((block) => ({
        block,
        projectId: project.id,
        projectName: project.rentalProperty?.buildingNumber || project.name,
      }))
    )
  );
  const agenda = byDate.get(selectedDay);

  const chip = (key: string, label: string, className: string, title: string) => (
    <span key={key} title={title} className={`block truncate rounded px-1 py-px text-[8px] font-bold leading-tight ${className}`}>
      {label}
    </span>
  );

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
      <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 lg:col-span-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelectMonth(shiftMonthKey(monthKey, -1))}
              aria-label={rentalText(language, 'Previous month', 'Mois precedent')}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => { onSelectMonth(monthKeyOf(todayKey)); onSelectDay(todayKey); }}
              className="rounded-md px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {rentalText(language, 'Today', "Aujourd'hui")}
            </button>
            <button
              type="button"
              onClick={() => onSelectMonth(shiftMonthKey(monthKey, 1))}
              aria-label={rentalText(language, 'Next month', 'Mois suivant')}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <span className="text-sm font-bold capitalize text-slate-900 dark:text-white">
            {monthLabel(monthKey, language)}
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {weekdayLabels(language).map((label) => (
            <span key={label} className="py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
              {label}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const entry = byDate.get(day.dateKey);
            const chips: React.ReactNode[] = [];
            entry?.arrivals.slice(0, 2).forEach((stay) =>
              chips.push(chip(`a-${stay.bookingId}`, `→ ${stay.guestName}`, 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300', `${rentalText(language, 'Arrival', 'Arrivee')}: ${stay.guestName} · ${stay.projectName}`))
            );
            entry?.departures.slice(0, 2).forEach((stay) =>
              chips.push(chip(`d-${stay.bookingId}`, `← ${stay.guestName}`, 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300', `${rentalText(language, 'Departure', 'Depart')}: ${stay.guestName} · ${stay.projectName}`))
            );
            entry?.cleanings.slice(0, 1).forEach((stay) =>
              chips.push(chip(`c-${stay.bookingId}`, `✦ ${stay.projectName}`, 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300', `${rentalText(language, 'Cleaning due', 'Menage a faire')}: ${stay.projectName}`))
            );
            entry?.blocks.slice(0, 1).forEach((block) =>
              chips.push(chip(`b-${block.blockId}`, block.title, 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300', `${block.title} · ${block.projectName}`))
            );
            const overflow =
              (entry ? entry.arrivals.length + entry.departures.length + entry.cleanings.length + entry.blocks.length : 0) - chips.length;
            const isSelected = day.dateKey === selectedDay;
            return (
              <button
                key={day.dateKey}
                type="button"
                onClick={() => {
                  onSelectDay(day.dateKey);
                  if (day.dateKey.slice(0, 7) !== monthKey) onSelectMonth(monthKeyOf(day.dateKey));
                }}
                className={`flex min-h-14 flex-col rounded-lg border px-1 py-1 text-left transition-colors sm:min-h-16 ${
                  isSelected
                    ? 'border-teal-500 bg-teal-50/60 dark:border-teal-500 dark:bg-teal-950/30'
                    : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:border-slate-700 dark:hover:bg-slate-950/50'
                } ${day.inMonth ? '' : 'opacity-40'}`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] ${day.isToday ? 'bg-slate-900 font-bold text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-500 dark:text-slate-400'}`}>
                  {day.dayNumber}
                </span>
                <span className="mt-0.5 space-y-0.5">
                  {chips}
                  {overflow > 0 && (
                    <span className="block px-1 font-mono text-[8px] font-bold text-slate-400">+{overflow}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-1"><span className="font-bold text-sky-600">→</span>{rentalText(language, 'Arrival', 'Arrivee')}</span>
          <span className="flex items-center gap-1"><span className="font-bold text-amber-600">←</span>{rentalText(language, 'Departure', 'Depart')}</span>
          <span className="flex items-center gap-1"><span className="font-bold text-violet-600">✦</span>{rentalText(language, 'Cleaning', 'Menage')}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-slate-300 dark:bg-slate-600" />{rentalText(language, 'Hold / maintenance', 'Option / maintenance')}</span>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/50 lg:col-span-2">
        <p className="mb-2 font-mono text-xs font-bold text-slate-700 dark:text-slate-200">{selectedDay}</p>
        {!agenda || (agenda.arrivals.length + agenda.departures.length + agenda.cleanings.length + agenda.blocks.length === 0) ? (
          <p className="py-6 text-center text-[11px] text-slate-400">
            {rentalText(language, 'Nothing scheduled this day.', 'Rien de prevu ce jour.')}
          </p>
        ) : (
          <ul className="max-h-80 space-y-1.5 overflow-y-auto">
            {agenda.arrivals.map((stay) => (
              <li key={`a-${stay.bookingId}`}>
                <button
                  type="button"
                  onClick={() => onOpenProject(stay.projectId)}
                  className="flex w-full items-center gap-2 rounded-lg border border-sky-200/70 bg-white px-2.5 py-1.5 text-left hover:border-sky-300 dark:border-sky-900/50 dark:bg-slate-900"
                >
                  <span className="font-bold text-sky-600">→</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-100">{stay.guestName}</span>
                    <span className="block truncate text-[10px] text-slate-400">{rentalText(language, 'Arrival', 'Arrivee')} · {stay.projectName}</span>
                  </span>
                </button>
              </li>
            ))}
            {agenda.departures.map((stay) => (
              <li key={`d-${stay.bookingId}`}>
                <button
                  type="button"
                  onClick={() => onOpenProject(stay.projectId)}
                  className="flex w-full items-center gap-2 rounded-lg border border-amber-200/70 bg-white px-2.5 py-1.5 text-left hover:border-amber-300 dark:border-amber-900/50 dark:bg-slate-900"
                >
                  <span className="font-bold text-amber-600">←</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-100">{stay.guestName}</span>
                    <span className="block truncate text-[10px] text-slate-400">{rentalText(language, 'Departure', 'Depart')} · {stay.projectName}</span>
                  </span>
                </button>
              </li>
            ))}
            {agenda.cleanings.map((stay) => (
              <li key={`c-${stay.bookingId}`}>
                <button
                  type="button"
                  onClick={() => onOpenProject(stay.projectId)}
                  className="flex w-full items-center gap-2 rounded-lg border border-violet-200/70 bg-white px-2.5 py-1.5 text-left hover:border-violet-300 dark:border-violet-900/50 dark:bg-slate-900"
                >
                  <span className="font-bold text-violet-600">✦</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-100">{stay.projectName}</span>
                    <span className="block truncate text-[10px] text-slate-400">{rentalText(language, 'Cleaning due', 'Menage a faire')} · {stay.guestName}</span>
                  </span>
                </button>
              </li>
            ))}
            {agenda.blocks.map((block) => {
              const target = projects
                .find((item) => item.id === block.projectId)
                ?.rentalCalendarBlocks?.find((item) => item.id === block.blockId);
              const project = projects.find((item) => item.id === block.projectId);
              return (
                <li key={`b-${block.blockId}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900">
                  <span className="h-2 w-2 shrink-0 rounded-sm bg-slate-300 dark:bg-slate-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-100">{block.title}</span>
                    <span className="block truncate text-[10px] text-slate-400">{block.projectName}</span>
                  </span>
                  {project && target && (
                    <button
                      type="button"
                      onClick={() => onCancelBlock(project, target)}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                    >
                      {rentalText(language, 'Cancel', 'Annuler')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function RentalRevenueCenter({
  projects,
  language,
  month,
  owner,
  ownerOptions,
  onMonthChange,
  onOwnerChange,
  onOpenReport,
  onOpenProject,
}: {
  projects: Project[];
  language: Language;
  month: string;
  owner: string;
  ownerOptions: string[];
  onMonthChange: (month: string) => void;
  onOwnerChange: (owner: string) => void;
  onOpenReport: () => void;
  onOpenProject: (projectId: string) => void;
}) {
  const monthStart = `${month}-01`;
  const endDate = new Date(`${monthStart}T12:00:00`);
  endDate.setMonth(endDate.getMonth() + 1);
  const monthEnd = localDateKey(endDate);
  const rows = projects.filter((project) => owner === 'all' || project.rentalProperty?.ownerName === owner).map((project) => {
    const bookings = activeBookings(project).filter((booking) => bookingOverlaps(booking, monthStart, monthEnd));
    const values = bookings.reduce((result, booking) => {
      const slice = bookingMonthSlice(booking, project, monthStart, monthEnd);
      return {
        nights: result.nights + slice.nights,
        revenue: result.revenue + slice.amount,
        commission: result.commission + slice.commission,
        cleaning: result.cleaning + slice.cleaning,
      };
    }, { nights: 0, revenue: 0, commission: 0, cleaning: 0 });
    const expenses = (project.expenses || []).filter((expense) => expense.date >= monthStart && expense.date < monthEnd && isOwnerExpense(expense)).reduce((sum, expense) => sum + expense.amount, 0);
    const paid = (project.rentalOwnerPayments || []).filter((payment) => (payment.period || payment.date).slice(0, 7) === month).reduce((sum, payment) => sum + payment.amount, 0);
    return { project, ...values, expenses, paid, payout: values.revenue - values.commission - values.cleaning - expenses - paid };
  }).sort((left, right) => right.revenue - left.revenue);
  const totals = rows.reduce((result, row) => ({
    revenue: result.revenue + row.revenue,
    commission: result.commission + row.commission,
    expenses: result.expenses + row.expenses,
    paid: result.paid + row.paid,
    payout: result.payout + row.payout,
  }), { revenue: 0, commission: 0, expenses: 0, paid: 0, payout: 0 });

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <DatePickerInput type="month" value={month} onChange={(value) => value && onMonthChange(value)} ariaLabel={rentalText(language, 'Report month', 'Mois du rapport')} className="w-44" />
          <select value={owner} onChange={(event) => onOwnerChange(event.target.value)} className="h-9 min-w-44 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold dark:border-slate-700 dark:bg-slate-950">
            <option value="all">{rentalText(language, 'All owners', 'Tous proprietaires')}</option>
            {ownerOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <button type="button" onClick={onOpenReport} className="flex h-9 items-center justify-center gap-2 rounded-md bg-teal-600 px-3 text-xs font-bold text-white hover:bg-teal-700"><FileDown className="h-4 w-4" />{rentalText(language, 'Detailed owner report', 'Rapport detaille')}</button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <CompactMetric label={rentalText(language, 'Gross revenue', 'Revenus bruts')} value={`${Math.round(totals.revenue).toLocaleString()} DH`} />
        <CompactMetric label={rentalText(language, 'Our commission', 'Notre commission')} value={`${Math.round(totals.commission).toLocaleString()} DH`} positive />
        <CompactMetric label={rentalText(language, 'Expenses', 'Depenses')} value={`${Math.round(totals.expenses).toLocaleString()} DH`} warning={totals.expenses > 0} />
        <CompactMetric label={rentalText(language, 'Already paid', 'Deja verse')} value={`${Math.round(totals.paid).toLocaleString()} DH`} />
        <CompactMetric label={rentalText(language, 'Remaining payout', 'Reste a verser')} value={`${Math.round(totals.payout).toLocaleString()} DH`} />
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[52rem] text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase text-slate-400 dark:border-slate-800 dark:bg-slate-950/60"><tr><th className="px-4 py-3">{rentalText(language, 'Property', 'Appartement')}</th><th className="px-4 py-3">{rentalText(language, 'Owner', 'Proprietaire')}</th><th className="px-4 py-3 text-right">{rentalText(language, 'Nights', 'Nuits')}</th><th className="px-4 py-3 text-right">{rentalText(language, 'Revenue', 'Revenus')}</th><th className="px-4 py-3 text-right">{rentalText(language, 'Commission', 'Commission')}</th><th className="px-4 py-3 text-right">{rentalText(language, 'Expenses', 'Depenses')}</th><th className="px-4 py-3 text-right">{rentalText(language, 'Payout', 'Versement')}</th><th className="w-10 px-2 py-3" /></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row) => <tr key={row.project.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/40"><td className="px-4 py-3 font-bold">{row.project.rentalProperty?.buildingNumber || row.project.name}</td><td className="px-4 py-3 text-slate-500">{row.project.rentalProperty?.ownerName || '-'}</td><td className="px-4 py-3 text-right font-mono">{row.nights}</td><td className="px-4 py-3 text-right font-mono font-bold">{Math.round(row.revenue).toLocaleString()}</td><td className="px-4 py-3 text-right font-mono text-emerald-600">{Math.round(row.commission).toLocaleString()}</td><td className="px-4 py-3 text-right font-mono text-rose-600">{Math.round(row.expenses).toLocaleString()}</td><td className="px-4 py-3 text-right font-mono font-bold">{Math.round(row.payout).toLocaleString()} {row.project.currency}</td><td className="px-2 py-3"><button type="button" onClick={() => onOpenProject(row.project.id)} title={rentalText(language, 'Open property', 'Ouvrir le bien')} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-teal-50 hover:text-teal-700"><ChevronRight className="h-4 w-4" /></button></td></tr>)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CompactMetric({ label, value, warning = false, positive = false }: { label: string; value: string; warning?: boolean; positive?: boolean }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><p className="text-[9px] font-bold uppercase text-slate-400">{label}</p><p className={`mt-1 font-mono text-base font-bold ${warning ? 'text-amber-600' : positive ? 'text-emerald-600' : 'text-slate-950 dark:text-white'}`}>{value}</p></div>;
}

function RentalMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: 'slate' | 'emerald' | 'amber' | 'teal' | 'violet';
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
    teal: 'bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-300',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
      <div className={`flex h-8 w-8 items-center justify-center rounded-md ${tones[tone]}`}><Icon className="h-4 w-4" /></div>
      <p className="mt-3 text-[9px] font-bold uppercase text-slate-400">{label}</p>
      <p className="mt-1 truncate font-mono text-lg font-bold text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}

function AvailabilityStrip({ project, startDate, language }: { project: Project; startDate: string; language: Language }) {
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(`${startDate}T12:00:00`);
    date.setDate(date.getDate() + index);
    const key = localDateKey(date);
    const booking = activeBookings(project).find((item) => item.checkIn <= key && item.checkOut > key);
    const block = (project.rentalCalendarBlocks || []).find((item) => item.status === 'active' && item.startDate <= key && item.endDate > key);
    return { key, booking, block };
  });
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between text-[9px] font-bold uppercase text-slate-400">
        <span>{rentalText(language, 'Next 14 days', '14 prochains jours')}</span>
        <span>{rentalText(language, 'Free / occupied', 'Libre / occupe')}</span>
      </div>
      <div className="grid grid-cols-14 gap-0.5" aria-label={rentalText(language, '14-day availability', 'Disponibilite sur 14 jours')}>
        {days.map(({ key, booking, block }) => (
          <span
            key={key}
            title={`${key}: ${booking ? booking.clientName : block ? block.title : rentalText(language, 'Free', 'Libre')}`}
            className={`h-2 rounded-sm ${booking ? 'bg-amber-400 dark:bg-amber-500' : block ? 'bg-violet-400 dark:bg-violet-500' : 'bg-emerald-300 dark:bg-emerald-600'}`}
          />
        ))}
      </div>
    </div>
  );
}

type OwnerReportLine = {
  project: Project;
  bookings: Array<{ booking: RentalBooking; nights: number; amount: number; commission: number; cleaning: number; channelFee: number; commissionRate: number }>;
  expenses: Project['expenses'];
  services: Project['tasks'];
  payments: NonNullable<Project['rentalOwnerPayments']>;
  revenue: number;
  commission: number;
  cleaningTotal: number;
  channelFeeTotal: number;
  expenseTotal: number;
  paidTotal: number;
  ownerPayout: number;
  openingBalance: number;
  closingBalance: number;
  finalized: boolean;
};

function OwnerReportModal({
  projects,
  ownerOptions,
  selectedOwner,
  onOwnerChange,
  month,
  onMonthChange,
  language,
  onClose,
}: {
  projects: Project[];
  ownerOptions: string[];
  selectedOwner: string;
  onOwnerChange: (owner: string) => void;
  month: string;
  onMonthChange: (month: string) => void;
  language: Language;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [finalizing, setFinalizing] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [finalizeError, setFinalizeError] = useState('');
  const monthStart = `${month}-01`;
  const endDate = new Date(`${monthStart}T12:00:00`);
  endDate.setMonth(endDate.getMonth() + 1);
  const monthEnd = localDateKey(endDate);
  const reportProjects = projects.filter((project) => selectedOwner === 'all' || project.rentalProperty?.ownerName === selectedOwner);
  const lines: OwnerReportLine[] = reportProjects.map((project) => {
    const bookings = activeBookings(project)
      .filter((booking) => bookingOverlaps(booking, monthStart, monthEnd))
      .map((booking) => {
        const slice = bookingMonthSlice(booking, project, monthStart, monthEnd);
        return {
          booking,
          ...slice,
        };
      });
    const expenses = (project.expenses || []).filter((expense) => expense.date >= monthStart && expense.date < monthEnd && isOwnerExpense(expense));
    const services = (project.tasks || []).filter((task) => task.deadline >= monthStart && task.deadline < monthEnd);
    const payments = (project.rentalOwnerPayments || []).filter((payment) => (payment.period || payment.date).slice(0, 7) === month);
    const revenue = bookings.reduce((sum, item) => sum + item.amount, 0);
    const commission = bookings.reduce((sum, item) => sum + item.commission, 0);
    const cleaningTotal = bookings.reduce((sum, item) => sum + item.cleaning, 0);
    const channelFeeTotal = bookings.reduce((sum, item) => sum + item.channelFee, 0);
    const expenseTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const paidTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const existingStatement = (project.rentalOwnerStatements || []).find((statement) => statement.month === month && statement.status === 'finalized');
    const previousStatement = (project.rentalOwnerStatements || [])
      .filter((statement) => statement.status === 'finalized' && statement.month < month)
      .sort((left, right) => right.month.localeCompare(left.month))[0];
    const openingBalance = existingStatement?.openingBalance ?? previousStatement?.closingBalance ?? 0;
    const currentPayout = revenue - commission - cleaningTotal - channelFeeTotal - expenseTotal - paidTotal;
    return {
      project,
      bookings,
      expenses,
      services,
      payments,
      revenue: existingStatement?.grossRevenue ?? revenue,
      commission: existingStatement?.commission ?? commission,
      cleaningTotal: existingStatement?.cleaning ?? cleaningTotal,
      channelFeeTotal: existingStatement ? (existingStatement.channelFees ?? 0) : channelFeeTotal,
      expenseTotal: existingStatement?.expenses ?? expenseTotal,
      paidTotal: existingStatement?.ownerPayments ?? paidTotal,
      ownerPayout: existingStatement ? existingStatement.closingBalance - existingStatement.openingBalance : currentPayout,
      openingBalance,
      closingBalance: existingStatement?.closingBalance ?? openingBalance + currentPayout,
      finalized: Boolean(existingStatement),
    };
  });
  const totals = lines.reduce((result, line) => ({
    nights: result.nights + line.bookings.reduce((sum, item) => sum + item.nights, 0),
    revenue: result.revenue + line.revenue,
    commission: result.commission + line.commission,
    cleaning: result.cleaning + line.cleaningTotal,
    channelFees: result.channelFees + line.channelFeeTotal,
    expenses: result.expenses + line.expenseTotal,
    paid: result.paid + line.paidTotal,
    payout: result.payout + line.ownerPayout,
    opening: result.opening + line.openingBalance,
    closing: result.closing + line.closingBalance,
  }), { nights: 0, revenue: 0, commission: 0, cleaning: 0, channelFees: 0, expenses: 0, paid: 0, payout: 0, opening: 0, closing: 0 });

  const canFinalize = Boolean(
    user?.uid
    && user.email
    && selectedOwner !== 'all'
    && lines.length > 0
    && lines.every((line) => getProjectPermissions(resolveUserRole(line.project, user.email!)).canModifySettings)
  );
  const allFinalized = lines.length > 0 && lines.every((line) => line.finalized);

  const finalizeStatements = async () => {
    if (!user?.uid || !user.email || !canFinalize || allFinalized) return;
    setFinalizing(true);
    setFinalizeError('');
    try {
      const now = new Date().toISOString();
      for (const line of lines.filter((item) => !item.finalized)) {
        await saveProjectToDB(user.uid, {
          ...line.project,
          rentalOwnerStatements: [
            ...(line.project.rentalOwnerStatements || []),
            {
              id: `owner_statement_${month}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              month,
              status: 'finalized',
              openingBalance: line.openingBalance,
              grossRevenue: line.revenue,
              commission: line.commission,
              cleaning: line.cleaningTotal,
              channelFees: line.channelFeeTotal,
              expenses: line.expenseTotal,
              ownerPayments: line.paidTotal,
              closingBalance: line.closingBalance,
              finalizedAt: now,
              finalizedBy: user.email.toLowerCase(),
            },
          ],
        });
      }
    } catch (reason) {
      setFinalizeError(reason instanceof Error ? reason.message : 'Could not finalize this statement.');
    } finally {
      setFinalizing(false);
    }
  };

  const escapeCsv = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const downloadCsv = () => {
    const rows: Array<Array<string | number>> = [[
      'Type', 'Property', 'Owner', 'Date / period', 'Description', 'Nights', 'Revenue', 'Commission', 'Cleaning', 'Expense', 'Owner payment', 'Remaining payout', 'Currency',
    ]];
    lines.forEach((line) => {
      line.bookings.forEach(({ booking, nights, amount, commission }) => rows.push([
        'Booking', line.project.name, line.project.rentalProperty?.ownerName || '', `${booking.checkIn} - ${booking.checkOut}`,
        `${booking.clientName}${booking.source ? ` (${booking.source})` : ''}`, nights, amount, commission, booking.cleaningFee || 0, 0, 0, amount - commission - (booking.cleaningChargeTo === 'owner' ? booking.cleaningFee || 0 : 0), line.project.currency,
      ]));
      line.expenses.forEach((expense) => rows.push([
        'Expense', line.project.name, line.project.rentalProperty?.ownerName || '', expense.date,
        `${expense.title}${expense.supplier ? ` (${expense.supplier})` : ''}`, 0, 0, 0, 0, expense.amount, 0, -expense.amount, line.project.currency,
      ]));
      line.services.forEach((task) => rows.push([
        'Service', line.project.name, line.project.rentalProperty?.ownerName || '', task.deadline,
        `${task.title} [${task.status}]`, 0, 0, 0, 0, 0, 0, 0, line.project.currency,
      ]));
      line.payments.forEach((payment) => rows.push([
        'Owner payment', line.project.name, line.project.rentalProperty?.ownerName || '', payment.date,
        `${payment.method || 'other'}${payment.notes ? ` (${payment.notes})` : ''}`, 0, 0, 0, 0, 0, payment.amount, -payment.amount, line.project.currency,
      ]));
    });
    const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `owner-report-${selectedOwner === 'all' ? 'all' : selectedOwner}-${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/70 p-2 backdrop-blur-sm sm:p-6">
      <div className="my-auto flex max-h-[calc(100dvh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-slate-100 shadow-2xl dark:bg-slate-950 sm:max-h-[calc(100dvh-3rem)]">
        <div className="no-print flex flex-col gap-3 border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-950 dark:text-white">{rentalText(language, 'Monthly owner report', 'Rapport mensuel proprietaire')}</h2>
            <p className="mt-0.5 text-[10px] text-slate-400">{rentalText(language, 'Bookings, services, expenses, and payout', 'Reservations, services, depenses et versement')}</p>
          </div>
          <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
            <select value={selectedOwner} onChange={(event) => onOwnerChange(event.target.value)} className="col-span-2 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-white sm:col-span-1 sm:min-w-40 sm:w-auto">
              <option value="all">{rentalText(language, 'All owners', 'Tous proprietaires')}</option>
              {ownerOptions.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
            </select>
            <DatePickerInput type="month" value={month} onChange={(value) => value && onMonthChange(value)} ariaLabel={rentalText(language, 'Report month', 'Mois du rapport')} className="col-span-2 w-full sm:col-span-1 sm:w-44" />
            <button type="button" onClick={downloadCsv} className="flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-white"><FileDown className="h-4 w-4" />CSV</button>
            <button type="button" disabled={!canFinalize || allFinalized || finalizing} onClick={() => setConfirmFinalize(true)} className="col-span-2 flex h-9 items-center justify-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 sm:col-span-1"><CheckCircle2 className="h-4 w-4" />{allFinalized ? rentalText(language, 'Finalized', 'Finalise') : finalizing ? '...' : rentalText(language, 'Finalize', 'Finaliser')}</button>
            <button type="button" onClick={() => saveCivilDocumentAsPdf(`owner-report-${selectedOwner}-${month}`, 'report')} className="flex h-9 items-center gap-1.5 rounded-md bg-teal-600 px-3 text-xs font-bold text-white hover:bg-teal-700"><Printer className="h-4 w-4" />PDF</button>
            <button type="button" onClick={onClose} title={rentalText(language, 'Close', 'Fermer')} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2 sm:p-5">
          {finalizeError && <p className="no-print mx-auto mb-3 max-w-[190mm] rounded-md bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{finalizeError}</p>}
          <article id="printable-civil-bill" className="print-page-a4 mx-auto min-h-[277mm] w-full max-w-[190mm] bg-white p-4 text-slate-900 shadow-sm sm:p-8 print:w-auto print:min-w-[46rem] print:p-8">
            <header className="flex items-start justify-between border-b-2 border-slate-900 pb-5">
              <div>
                <p className="text-[10px] font-bold uppercase text-teal-700">{rentalText(language, 'Rental management', 'Gestion locative')}</p>
                <h1 className="mt-1 text-2xl font-bold">{rentalText(language, 'Owner report', 'Rapport proprietaire')}</h1>
                <p className="mt-1 text-xs text-slate-500">{selectedOwner === 'all' ? (rentalText(language, 'All owners', 'Tous proprietaires')) : selectedOwner}</p>
              </div>
              <div className="text-right"><p className="font-mono text-sm font-bold">{month}</p><p className="mt-1 text-[10px] text-slate-400">{reportProjects.length} {rentalText(language, 'properties', 'biens')}</p></div>
            </header>
            <div className="my-5 grid grid-cols-8 divide-x divide-slate-200 border-y border-slate-200 py-3">
              <ReportMetric label={rentalText(language, 'Opening', 'Ouverture')} value={`${totals.opening.toLocaleString()} DH`} />
              <ReportMetric label={rentalText(language, 'Nights', 'Nuits')} value={String(totals.nights)} />
              <ReportMetric label={rentalText(language, 'Revenue', 'Revenus')} value={`${totals.revenue.toLocaleString()} DH`} />
              <ReportMetric label="Commission" value={`${totals.commission.toLocaleString()} DH`} />
              <ReportMetric label={rentalText(language, 'Costs', 'Frais')} value={`${(totals.cleaning + totals.channelFees + totals.expenses).toLocaleString()} DH`} />
              <ReportMetric label={rentalText(language, 'Paid', 'Deja verse')} value={`${totals.paid.toLocaleString()} DH`} />
              <ReportMetric label={rentalText(language, 'Remaining', 'Reste a verser')} value={`${totals.payout.toLocaleString()} DH`} strong />
              <ReportMetric label={rentalText(language, 'Closing', 'Cloture')} value={`${totals.closing.toLocaleString()} DH`} strong />
            </div>
            <div className="space-y-5">
              {lines.length === 0 ? <p className="py-16 text-center text-xs text-slate-400">{rentalText(language, 'No data for this selection.', 'Aucune donnee pour cette selection.')}</p> : lines.map((line) => (
                <section key={line.project.id} className="break-inside-avoid">
                  <div className="flex items-center justify-between bg-slate-100 px-3 py-2">
                    <div><h2 className="text-xs font-bold">{line.project.rentalProperty?.buildingNumber || line.project.name}</h2><p className="text-[9px] text-slate-500">{line.project.address}</p></div>
                    <div className="text-right"><p className="font-mono text-xs font-bold">{line.closingBalance.toLocaleString()} {line.project.currency}</p><p className={`text-[8px] font-bold uppercase ${line.finalized ? 'text-emerald-600' : 'text-amber-600'}`}>{line.finalized ? rentalText(language, 'Finalized', 'Finalise') : rentalText(language, 'Live draft', 'Brouillon')}</p></div>
                  </div>
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[540px] text-left text-[9px]">
                    <thead className="border-b border-slate-200 uppercase text-slate-400"><tr><th className="px-2 py-1.5">{rentalText(language, 'Type', 'Type')}</th><th className="px-2 py-1.5">{rentalText(language, 'Detail', 'Détail')}</th><th className="px-2 py-1.5">{rentalText(language, 'Period', 'Periode')}</th><th className="px-2 py-1.5 text-right">{rentalText(language, 'Amount', 'Montant')}</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {line.bookings.map(({ booking, nights, amount, commission, commissionRate, cleaning }) => <React.Fragment key={booking.id}><tr><td className="px-2 py-1.5 font-bold text-teal-700">{rentalText(language, 'Stay', 'Sejour')}</td><td className="px-2 py-1.5">{booking.clientName} · {nights} {rentalText(language, 'nights', 'nuits')}</td><td className="px-2 py-1.5 font-mono">{booking.checkIn} - {booking.checkOut}</td><td className="px-2 py-1.5 text-right font-mono font-bold">{amount.toLocaleString()} {line.project.currency}</td></tr><tr><td className="px-2 py-1.5 font-bold text-emerald-700">{rentalText(language, 'Commission', 'Commission')}</td><td className="px-2 py-1.5">{commissionRate}% · {booking.clientName}</td><td className="px-2 py-1.5" /><td className="px-2 py-1.5 text-right font-mono text-emerald-700">-{commission.toLocaleString()} {line.project.currency}</td></tr>{cleaning > 0 && <tr><td className="px-2 py-1.5 font-bold text-amber-700">{rentalText(language, 'Cleaning', 'Menage')}</td><td className="px-2 py-1.5">{booking.clientName}</td><td className="px-2 py-1.5" /><td className="px-2 py-1.5 text-right font-mono text-amber-700">-{cleaning.toLocaleString()} {line.project.currency}</td></tr>}</React.Fragment>)}
                      {line.expenses.map((expense) => <tr key={expense.id}><td className="px-2 py-1.5 font-bold text-rose-600">{rentalText(language, 'Expense', 'Depense')}</td><td className="px-2 py-1.5">{expense.title}{expense.supplier ? ` · ${expense.supplier}` : ''}</td><td className="px-2 py-1.5 font-mono">{expense.date}</td><td className="px-2 py-1.5 text-right font-mono font-bold text-rose-600">-{expense.amount.toLocaleString()} {line.project.currency}</td></tr>)}
                      {line.services.map((task) => <tr key={task.id}><td className="px-2 py-1.5 font-bold text-violet-600">{rentalText(language, 'Service', 'Service')}</td><td className="px-2 py-1.5">{task.title} · {TRANSLATIONS[language].status[task.status]}</td><td className="px-2 py-1.5 font-mono">{task.deadline}</td><td className="px-2 py-1.5 text-right">-</td></tr>)}
                      {line.payments.map((payment) => <tr key={payment.id}><td className="px-2 py-1.5 font-bold text-purple-700">{rentalText(language, 'Owner payment', 'Versement')}</td><td className="px-2 py-1.5">{payment.method}{payment.notes ? ` · ${payment.notes}` : ''}</td><td className="px-2 py-1.5 font-mono">{payment.date}</td><td className="px-2 py-1.5 text-right font-mono font-bold text-purple-700">-{payment.amount.toLocaleString()} {line.project.currency}</td></tr>)}
                      {line.bookings.length + line.expenses.length + line.services.length + line.payments.length === 0 && <tr><td colSpan={4} className="px-2 py-5 text-center text-slate-400">{rentalText(language, 'No activity this month.', 'Aucune activite ce mois.')}</td></tr>}
                    </tbody>
                  </table>
                  </div>
                  <div className="mt-1 flex flex-wrap justify-end gap-x-5 gap-y-1 text-[9px]"><span>{rentalText(language, 'Opening', 'Ouverture')}: <strong>{line.openingBalance.toLocaleString()}</strong></span><span>{rentalText(language, 'Gross', 'Brut')}: <strong>{line.revenue.toLocaleString()}</strong></span><span>{rentalText(language, 'Commission', 'Commission')}: <strong>{line.commission.toLocaleString()}</strong></span><span>{rentalText(language, 'Costs', 'Frais')}: <strong>{(line.cleaningTotal + line.expenseTotal).toLocaleString()}</strong></span><span>{rentalText(language, 'Paid', 'Verse')}: <strong>{line.paidTotal.toLocaleString()}</strong></span><span>{rentalText(language, 'Closing', 'Cloture')}: <strong>{line.closingBalance.toLocaleString()}</strong></span></div>
                </section>
              ))}
            </div>
          </article>
        </div>
      </div>
    </div>
    <ConfirmDialog open={confirmFinalize} title={rentalText(language, 'Finalize owner statement?', 'Finaliser le relevé propriétaire ?')} message={rentalText(language, 'This freezes the current month totals as an accounting snapshot. Later changes will not silently rewrite this statement.', 'Les totaux du mois seront figés. Les modifications ultérieures ne réécriront pas silencieusement ce relevé.')} language={language} confirmLabel={rentalText(language, 'Finalize', 'Finaliser')} variant="default" loading={finalizing} onConfirm={finalizeStatements} onCancel={() => setConfirmFinalize(false)} />
    </>
  );
}

function ReportMetric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="px-2 text-center"><span className="block text-[8px] font-bold uppercase text-slate-400">{label}</span><span className={`mt-1 block font-mono text-[11px] ${strong ? 'font-bold text-teal-700' : 'font-semibold'}`}>{value}</span></div>;
}

function LegacyRentalImportModal({
  projects,
  user,
  language,
  onClose,
}: {
  projects: Project[];
  user: { uid: string; email: string; name: string };
  language: Language;
  onClose: () => void;
}) {
  const [manifest, setManifest] = useState<LegacyRentalManifest | null>(null);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof mergeLegacyRentalManifest>['stats'] | null>(null);

  const loadFiles = async (selected?: FileList | File[]) => {
    const files = selected ? Array.from(selected) : [];
    if (files.length === 0) return;
    setError('');
    setResult(null);
    try {
      const jsonFile = files.length === 1 && files[0].name.toLowerCase().endsWith('.json');
      setManifest(jsonFile
        ? parseLegacyRentalManifest(await files[0].text())
        : await parseRentalTabularFiles(files));
    } catch (reason) {
      setManifest(null);
      setError(reason instanceof Error ? reason.message : 'Could not read the migration package.');
    }
  };

  const runImport = async () => {
    if (!manifest || importing) return;
    setImporting(true);
    setError('');
    try {
      const merged = mergeLegacyRentalManifest(manifest, projects, user);
      for (const project of merged.changedProjects) {
        await saveProjectToDB(user.uid, project);
      }
      setResult(merged.stats);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const totals = manifest?.projects.reduce((value, project) => ({
    bookings: value.bookings + (project.rentalBookings?.length || 0),
    expenses: value.expenses + (project.expenses?.length || 0),
    payments: value.payments + (project.rentalOwnerPayments?.length || 0),
  }), { bookings: 0, expenses: 0, payments: 0 });

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6">
      <div className="my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:max-h-[calc(100dvh-3rem)]">
        <div className="flex items-start justify-between border-b border-slate-200 p-4 dark:border-slate-800">
          <div><h2 className="text-sm font-bold text-slate-950 dark:text-white">{rentalText(language, 'Import historical rental tracking', 'Importer le suivi locatif historique')}</h2><p className="mt-1 text-[11px] text-slate-500">{rentalText(language, 'Additive merge with duplicate detection. Existing records are never removed.', 'Fusion sans suppression, avec détection des doublons.')}</p></div>
          <button type="button" onClick={onClose} title={rentalText(language, 'Close', 'Fermer')} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-4">
          <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 text-center hover:border-purple-400 dark:border-slate-700 dark:bg-slate-950/50">
            <Upload className="mb-2 h-5 w-5 text-purple-600" />
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{rentalText(language, 'Choose XLSX, CSV, or a JSON migration package', 'Choisir XLSX, CSV ou un paquet JSON')}</span>
            <span className="mt-1 text-[10px] text-slate-400">.xlsx · .csv · .json</span>
            <input type="file" multiple accept=".xlsx,.csv,application/json,.json" className="sr-only" onChange={(event) => loadFiles(event.target.files || undefined)} />
          </label>
          {error && <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300">{error}</div>}
          {manifest && totals && (
            <>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800 sm:grid-cols-4">
                <StatementTile label={rentalText(language, 'Properties', 'Biens')} value={manifest.projects.length} />
                <StatementTile label={rentalText(language, 'Bookings', 'Séjours')} value={totals.bookings} />
                <StatementTile label={rentalText(language, 'Expenses', 'Dépenses')} value={totals.expenses} />
                <StatementTile label={rentalText(language, 'Owner payments', 'Versements')} value={totals.payments} />
              </div>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
                <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase text-amber-800 dark:text-amber-300"><AlertTriangle className="h-3.5 w-3.5" />{rentalText(language, 'Review notes preserved from source', 'Points conservés pour vérification')}</p>
                <ul className="space-y-1 text-[11px] text-amber-900 dark:text-amber-200">{manifest.warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full min-w-[34rem] text-left text-xs"><thead className="bg-slate-50 text-[9px] font-bold uppercase text-slate-400 dark:bg-slate-950"><tr><th className="px-3 py-2">{rentalText(language, 'Property', 'Appartement')}</th><th className="px-3 py-2">{rentalText(language, 'Owner', 'Propriétaire')}</th><th className="px-3 py-2 text-right">{rentalText(language, 'Bookings', 'Séjours')}</th><th className="px-3 py-2 text-right">{rentalText(language, 'Expenses', 'Dépenses')}</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{manifest.projects.map((project) => <tr key={project.legacyPropertyCode}><td className="px-3 py-2 font-mono font-bold">{project.legacyPropertyCode}</td><td className="px-3 py-2 text-slate-500">{project.rentalProperty.ownerName}</td><td className="px-3 py-2 text-right font-mono">{project.rentalBookings?.length || 0}</td><td className="px-3 py-2 text-right font-mono">{project.expenses?.length || 0}</td></tr>)}</tbody></table>
              </div>
            </>
          )}
          {result && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300">{rentalText(language, 'Import complete', 'Import terminé')}: {result.created} {rentalText(language, 'properties created', 'biens créés')}, {result.updated} {rentalText(language, 'updated', 'mis à jour')}, {result.bookingsAdded} {rentalText(language, 'bookings added', 'séjours ajoutés')}.</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800">
          <button type="button" onClick={onClose} className="h-9 rounded-md border border-slate-200 px-3 text-xs font-semibold dark:border-slate-700">{result ? (rentalText(language, 'Close', 'Fermer')) : (rentalText(language, 'Cancel', 'Annuler'))}</button>
          {!result && <button type="button" disabled={!manifest || importing} onClick={runImport} className="h-9 rounded-md bg-purple-600 px-4 text-xs font-bold text-white disabled:opacity-50">{importing ? (rentalText(language, 'Importing...', 'Importation...')) : (rentalText(language, 'Merge data', 'Fusionner les données'))}</button>}
        </div>
      </div>
    </div>
  );
}

function StatementTile({ label, value }: { label: string; value: number }) {
  return <div className="bg-white px-3 py-3 dark:bg-slate-900"><p className="text-[9px] font-bold uppercase text-slate-400">{label}</p><p className="mt-1 font-mono text-lg font-bold text-slate-950 dark:text-white">{value}</p></div>;
}

function CreateRentalForm({ language, t, user, onClose, onCreated }: {
  language: Language;
  t: any;
  user: any;
  onClose: () => void;
  onCreated: (projectId: string) => void;
}) {
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [buildingNumber, setBuildingNumber] = useState('');
  const [pricePerNight, setPricePerNight] = useState(0);
  const [commissionRate, setCommissionRate] = useState(10);
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !ownerName.trim() || !buildingNumber.trim() || !user?.uid || !user.email) {
      setFormError(rentalText(language, 'Property name, owner, and building are required.', 'Nom du bien, propriétaire et immeuble requis.'));
      return;
    }
    if (!Number.isFinite(pricePerNight) || pricePerNight <= 0) {
      setFormError(rentalText(language, 'Enter a nightly price greater than zero.', 'Saisissez un prix par nuit supérieur à zéro.'));
      return;
    }
    const commission = clampCommission(commissionRate);
    if (!Number.isFinite(commissionRate) || commission !== commissionRate) {
      setCommissionRate(commission);
      setFormError(formErrorText('invalid_commission', language));
      return;
    }
    if (ownerEmail.trim() && !isValidEmail(ownerEmail)) {
      setFormError(formErrorText('invalid_email', language));
      return;
    }
    setFormError(null);
    setSaving(true);

    const projectId = `proj_${Date.now()}`;
    const newProject: Project = {
      id: projectId,
      storageVersion: 2,
      name: name.trim(),
      clientName: ownerName.trim(),
      address: buildingNumber.trim(),
      description: `${buildingNumber.trim()} — ${ownerName.trim()}`,
      startDate: localDateKey(),
      estimatedEndDate: '',
      budget: 0,
      currency: 'DH',
      status: 'planning',
      projectType: 'rental',
      creatorEmail: user.email.toLowerCase(),
      members: [{ email: user.email.toLowerCase(), name: user.displayName || user.email.split('@')[0], role: 'owner', status: 'accepted' }],
      sections: [],
      expenses: [],
      tasks: [],
      photos: [],
      documents: [],
      rentalProperty: {
        ownerName: ownerName.trim(),
        ownerPhone: ownerPhone.trim(),
        ownerEmail: ownerEmail.trim().toLowerCase(),
        buildingNumber: buildingNumber.trim(),
        pricePerNight,
        commissionRate,
      },
      rentalBookings: [],
    };

    try {
      await saveProjectToDB(user.uid, newProject);
      onCreated(projectId);
    } catch (err) {
      console.error('Failed to create rental', err);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 px-4 py-6 backdrop-blur-[2px] sm:items-center" onClick={onClose}>
      <div className="flex max-h-[calc(100dvh-3rem)] w-full max-w-md flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-5" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            {language === 'en' ? 'New Rental Property' : language === 'fr' ? 'Nouvelle Location' : 'عقار إيجار جديد'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="mt-3.5 min-h-0 flex-1 space-y-3.5 overflow-y-auto pr-1">
          {formError && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              {formError}
            </p>
          )}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{language === 'en' ? 'Property Name' : language === 'fr' ? 'Nom du bien' : 'اسم العقار'}</label>
            <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{t.rental.ownerName}</label>
              <input required type="text" value={ownerName} onChange={e => setOwnerName(e.target.value)} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{t.rental.buildingNumber}</label>
              <input required type="text" value={buildingNumber} onChange={e => setBuildingNumber(e.target.value)} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{language === 'en' ? 'Owner Phone' : language === 'fr' ? 'Tél propriétaire' : 'هاتف المالك'}</label>
              <input type="tel" value={ownerPhone} onChange={e => setOwnerPhone(e.target.value)} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{language === 'en' ? 'Owner Email' : language === 'fr' ? 'Email propriétaire' : 'بريد المالك'}</label>
              <input type="email" value={ownerEmail} onChange={e => { setOwnerEmail(e.target.value); setFormError(null); }} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{t.rental.pricePerNight}</label>
              <input required type="number" min={0} value={pricePerNight || ''} onChange={e => { setPricePerNight(Number(e.target.value)); setFormError(null); }} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400 font-mono" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{t.rental.commissionRate}</label>
              <input type="number" min={0} max={100} step="0.01" value={commissionRate} onChange={e => { setCommissionRate(clampCommission(Number(e.target.value))); setFormError(null); }} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400 font-mono font-semibold" />
            </div>
          </div>
          <div className="pt-3.5 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer">{language === 'en' ? 'Cancel' : language === 'fr' ? 'Annuler' : 'إلغاء'}</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-sm disabled:opacity-50 cursor-pointer">{saving ? '...' : (language === 'en' ? 'Create' : language === 'fr' ? 'Créer' : 'إنشاء')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

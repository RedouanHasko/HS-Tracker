import React, { useState, useEffect } from 'react';
import {
  Plus,
  DollarSign, 
  CheckSquare, 
  Layers, 
  Calendar, 
  MapPin, 
  Users, 
  Clock, 
  ChevronLeft,
  ChevronRight,
  Activity,
  AlertTriangle,
  CheckCircle2,
  X,
  PlusCircle,
  HelpCircle,
  ArrowRight,
  Table,
  LayoutGrid,
  Building,
  KeyRound,
} from 'lucide-react';
import MobileDropdownMenu from './MobileDropdownMenu';
import TopNavbar from './TopNavbar';
import { AnimatePresence, motion } from 'motion/react';
import { Project, TimelineActivity, Language, ProjectType } from '../types';
import { TRANSLATIONS } from '../utils/mockData';
import { useAuth } from '../lib/AuthContext';
import { 
  saveProjectToDB, 
  getDashboardActivities,
  saveActivityToDB, 
  subscribeToProjects, 
} from '../lib/db';
import { buildActivityMemberEmails } from '../utils/activityHelpers';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useMotionConfig } from '../utils/motionPresets';

const PROJECTS_PER_PAGE = 11;

interface DashboardProps {
  onSelectProject: (projectId: string) => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  sidebarToggleLabel?: string;
  unreadCount?: number;
  onToggleNotifications?: () => void;
  workspaceType?: 'construction';
  onBack?: () => void;
  backLabel?: string;
}

export default function Dashboard({ 
  onSelectProject, 
  language, 
  onLanguageChange, 
  theme, 
  onThemeToggle,
  sidebarOpen = true,
  onToggleSidebar,
  sidebarToggleLabel = 'Toggle sidebar',
  unreadCount = 0,
  onToggleNotifications,
  workspaceType,
  onBack,
  backLabel = 'All Workspaces',
}: DashboardProps) {
  const { user } = useAuth();
  // Database States
  const [projects, setProjects] = useState<Project[]>([]);
  const [activities, setActivities] = useState<TimelineActivity[]>([]);
  
  // UI States
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [projectPage, setProjectPage] = useState(1);
  useEscapeToClose(showCreateModal, () => setShowCreateModal(false));
  const { modal, modalVariants, overlayVariants, overlay } = useMotionConfig();
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(() => {
    return (localStorage.getItem("buildtrack_view_mode") as 'table' | 'cards') || 'table';
  });
  
  // Create New Project Form States
  const [projName, setProjName] = useState('');
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [budget, setBudget] = useState(0);
  const [currency, setCurrency] = useState('DH');
  const [projectType, setProjectType] = useState<ProjectType>('construction');
  // Rental-specific fields
  const [rentalOwnerName, setRentalOwnerName] = useState('');
  const [rentalBuildingNumber, setRentalBuildingNumber] = useState('');
  const [rentalPricePerNight, setRentalPricePerNight] = useState(0);
  const [rentalCommissionRate, setRentalCommissionRate] = useState(10);

  const t = TRANSLATIONS[language];

  // Load and refresh state in real-time
  useEffect(() => {
    if (!user) return;

    if (!user.email) return;

    // Load recent activities scoped to the user's projects (required by Firestore security rules).
    const loadActivities = async (userEmail: string, projectIds: string[]) => {
      try {
        const dbActivities = await getDashboardActivities(userEmail, projectIds);
        const projectIdSet = new Set(projectIds);
        setActivities(
          dbActivities
            .filter((activity) => projectIdSet.has(activity.projectId))
            .slice(0, 10)
        );
      } catch (err) {
        console.warn('Activities load error:', err);
      }
    };

    const unsubProjects = subscribeToProjects(user.email, (updatedProjects) => {
      setProjects(updatedProjects);
      const scopedProjects = workspaceType
        ? updatedProjects.filter(
            (project) => (project.projectType || 'construction') === workspaceType
          )
        : updatedProjects;
      loadActivities(user.email, scopedProjects.map((project) => project.id));
    });

    return () => {
      unsubProjects();
    };
  }, [user, workspaceType]);

  // Sync state back to LocalStorage is removed and individually updated to DB
  const updateProjectsState = async (updated: Project[]) => {
    setProjects(updated);
    // This is a bulk save, which isn't optimal for Firebase, but we'll loop for safety if needed
    // Actually we will just update local state here; DB gets updated individually where needed.
  };

  // Add new project
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projName.trim() || !user?.uid || !user.email) return;

    const projectId = `proj_${Date.now()}`;
    const userEmail = user.email.toLowerCase();
    const creationProjectType = workspaceType || projectType;

    const defaultBudget = creationProjectType === 'construction' ? Math.max(0, Number(budget) || 0) : 0;
    const defaultSections = creationProjectType === 'construction'
      ? [
          { id: `sec_p_${Date.now()}`, projectId: projectId, title: t.sections.painting, progress: 0, status: 'planning' },
          { id: `sec_pl_${Date.now()}`, projectId: projectId, title: t.sections.plumbing, progress: 0, status: 'planning' }
        ] as Project['sections']
      : [];

    const newProject: Project = {
      id: projectId,
      name: projName,
      clientName: clientName || t.dashboard,
      address: address || "N/A",
      description: description || "No description provided.",
      startDate: startDate || new Date().toISOString().split('T')[0],
      estimatedEndDate: endDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      budget: defaultBudget,
      currency: currency || 'DH',
      status: 'planning',
      projectType: creationProjectType,
      creatorEmail: userEmail,
      members: [
        { email: userEmail, name: user.displayName || userEmail.split('@')[0], role: 'owner', status: 'accepted' }
      ],
      sections: defaultSections,
      expenses: [],
      tasks: [
        {
          id: `tsk_init_${Date.now()}_1`,
          title: "Initial Workspace Setup & Review",
          description: "Inspect raw drawings and evaluate initial budget bounds with general partners.",
          assignedTo: userEmail,
          priority: "high",
          deadline: endDate || new Date().toISOString().split('T')[0],
          status: "pending",
          subtasks: [
            { id: `sub_1_${Date.now()}`, title: "Confirm client specifications", isCompleted: false },
            { id: `sub_2_${Date.now()}`, title: "Finalize contractor materials list", isCompleted: false }
          ]
        }
      ],
      photos: [],
      documents: [],
      ...(creationProjectType === 'rental' && {
        rentalProperty: {
          ownerName: rentalOwnerName,
          buildingNumber: rentalBuildingNumber,
          pricePerNight: rentalPricePerNight,
          commissionRate: rentalCommissionRate,
        },
        rentalBookings: [],
      }),
    };

    try {
      const updatedProjects = [newProject, ...projects];
      setProjects(updatedProjects);
      await saveProjectToDB(user.uid, newProject);

      // Track in Timeline
      const newActivity: TimelineActivity = {
        id: `act_${Date.now()}`,
        projectId: newProject.id,
        userEmail: user.email || 'system',
        userName: user.displayName || 'System',
        actionType: 'project_created',
        actionDetails: `Created and initialized workspace '${newProject.name}' under planning status.`,
        timestamp: new Date().toISOString(),
        memberEmails: buildActivityMemberEmails(newProject),
      };
      await saveActivityToDB(user.uid, newActivity);
      setActivities([newActivity, ...activities].slice(0, 8));

      // Reset fields
      setProjName('');
      setClientName('');
      setAddress('');
      setDescription('');
      setStartDate('');
      setEndDate('');
      setBudget(0);
      setCurrency('DH');
      setProjectType('construction');
      setRentalOwnerName('');
      setRentalBuildingNumber('');
      setRentalPricePerNight(0);
      setRentalCommissionRate(10);
      setShowCreateModal(false);
      
      // Dispatch storage (keep for backwards compat just in case)
      window.dispatchEvent(new Event('storage'));
    } catch (err) {
      console.error("Failed to save project", err);
    }
  };

  const workspaceProjects = workspaceType
    ? projects.filter((project) => (project.projectType || 'construction') === workspaceType)
    : projects;
  const createProjectType = workspaceType || projectType;

  // Calculations for KPI numbers
  const primaryCurrency = workspaceProjects.length > 0 ? workspaceProjects[0].currency : 'DH';
  const activeProjectsCount = workspaceProjects.filter(p => p.status !== 'completed' && p.status !== 'cancelled').length;
  const completedProjectsCount = workspaceProjects.filter(p => p.status === 'completed').length;
  
  const totalExpensesSum = workspaceProjects.reduce((sum, p) => {
    return sum + p.expenses.reduce((s, e) => s + e.amount, 0);
  }, 0);

  const totalBudgetsSum = workspaceProjects.reduce((sum, p) => sum + p.budget, 0);

  const totalPendingTasksCount = workspaceProjects.reduce((sum, p) => {
    return sum + p.tasks.filter(t => t.status !== 'completed').length;
  }, 0);

  // Filter projects by workspace type and search query
  const filteredProjects = workspaceProjects.filter(project => {
    const query = searchQuery.toLowerCase();
    
    // Search in project metadata
    const mainMatch = project.name.toLowerCase().includes(query) ||
                      project.clientName.toLowerCase().includes(query) ||
                      project.address.toLowerCase().includes(query) ||
                      project.description.toLowerCase().includes(query);
    
    if (mainMatch) return true;

    // Search inside expenses
    const expMatch = project.expenses.some(e => 
      e.title.toLowerCase().includes(query) || 
      e.supplier.toLowerCase().includes(query) ||
      e.category.toLowerCase().includes(query)
    );
    return expMatch;
  });
  const projectPageCount = Math.max(1, Math.ceil(filteredProjects.length / PROJECTS_PER_PAGE));
  const activeProjectPage = Math.min(projectPage, projectPageCount);
  const visibleProjects = filteredProjects.slice(
    (activeProjectPage - 1) * PROJECTS_PER_PAGE,
    activeProjectPage * PROJECTS_PER_PAGE
  );

  return (
    <div className="flex min-h-full w-full flex-col" id="dashboard-viewport">
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
        searchQuery={searchQuery}
        onSearchChange={(value) => {
          setSearchQuery(value);
          setProjectPage(1);
        }}
        searchPlaceholder={t.searchPlaceholder}
        createLabel={t.createNewProject}
        onCreateProject={() => setShowCreateModal(true)}
        unreadCount={unreadCount}
        onToggleNotifications={() => {
          onToggleNotifications?.();
          setShowMobileMenu(false);
        }}
        onToggleMobileMenu={() => {
          setShowMobileMenu(!showMobileMenu);
        }}
        mobileMenuOpen={showMobileMenu}
        langLabel={t.langLabel}
        onBack={onBack}
        backLabel={backLabel}
      />

      {/* Mobile Menu Dropdown */}
      <AnimatePresence>
        {showMobileMenu && (
          <MobileDropdownMenu
            isOpen={showMobileMenu}
            onClose={() => setShowMobileMenu(false)}
            language={language}
            onLanguageChange={onLanguageChange}
            theme={theme}
            onThemeToggle={onThemeToggle}
            onOpenNotifications={() => onToggleNotifications?.()}
            onCreateProject={() => setShowCreateModal(true)}
            onOpenProfile={() => window.dispatchEvent(new CustomEvent('open_profile_settings'))}
            searchQuery={searchQuery}
            setSearchQuery={(value) => {
              setSearchQuery(value);
              setProjectPage(1);
            }}
          />
        )}
      </AnimatePresence>

      {workspaceProjects.length === 0 ? (
        /* Welcome Landing Page — Full bleed outside the container */
        <div className="-mt-14 flex min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center bg-gradient-to-b from-white via-slate-50/80 to-slate-50/40 px-4 pt-14 text-center dark:from-[#121212] dark:via-[#1a1a2e] dark:to-[#121212] sm:px-6">
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 shadow-lg shadow-sky-200 dark:shadow-sky-950 mb-5">
              <span className="text-3xl font-bold text-white">HS</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-3 font-display">
              {language === 'en' ? 'Welcome to HS Tracker' : language === 'fr' ? 'Bienvenue sur HS Tracker' : 'مرحباً بك في HS Tracker'}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
              {language === 'en'
                ? 'Manage your construction projects and rental properties in one place. Select a workspace type to get started.'
                : language === 'fr'
                  ? 'Gérez vos projets de construction et locations en un seul endroit. Choisissez un type pour commencer.'
                  : 'إدارة مشاريع البناء والخدمات والإيجارات في مكان واحد. اختر نوع مساحة العمل للبدء.'}
            </p>
          </div>

          {/* Type Selection Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
            {/* Construction */}
            <button
              onClick={() => { setProjectType('construction'); setShowCreateModal(true); }}
              className="group p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-sky-400 dark:hover:border-sky-500 transition-all cursor-pointer text-left hover:shadow-lg hover:-translate-y-0.5"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <Building className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-1">
                {language === 'en' ? 'Construction' : language === 'fr' ? 'Construction' : 'بناء'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {language === 'en'
                  ? 'Track renovation budgets, expenses, tasks, and team collaboration for building projects.'
                  : language === 'fr'
                    ? 'Suivez les budgets, dépenses, tâches et collaboration pour vos chantiers.'
                    : 'تتبع الميزانيات والمصروفات والمهام والتعاون الجماعي لمشاريع البناء.'}
              </p>
              <span className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-sky-600 dark:text-sky-400 group-hover:gap-1.5 transition-all">
                <PlusCircle className="w-3.5 h-3.5" />
                {language === 'en' ? 'New Project' : language === 'fr' ? 'Nouveau Projet' : 'مشروع جديد'}
              </span>
            </button>

            {/* Rental is only offered on an unscoped dashboard. */}
            {!workspaceType && <button
              onClick={() => { setProjectType('rental'); setShowCreateModal(true); }}
              className="group p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-purple-400 dark:hover:border-purple-500 transition-all cursor-pointer text-left hover:shadow-lg hover:-translate-y-0.5"
            >
              <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <KeyRound className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-1">
                {language === 'en' ? 'Rental' : language === 'fr' ? 'Location' : 'إيجار'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {language === 'en'
                  ? 'Manage apartments, villas bookings, owner payouts, commissions, and guest info.'
                  : language === 'fr'
                    ? 'Gérez les réservations, commissions, paiements propriétaires et infos clients.'
                    : 'إدارة حجوزات الشقق والفيلات والعمولات ومعلومات النزلاء.'}
              </p>
              <span className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-purple-600 dark:text-purple-400 group-hover:gap-1.5 transition-all">
                <PlusCircle className="w-3.5 h-3.5" />
                {language === 'en' ? 'New Rental' : language === 'fr' ? 'Nouvelle Location' : 'إيجار جديد'}
              </span>
            </button>}
          </div>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-7xl flex-1 px-4 pb-8 pt-6 sm:px-6 lg:px-8">
        <p className="mb-6 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          {language === 'en'
            ? 'Intuitive site expense ledger, cost sharing calculations and settlements'
            : language === 'fr'
            ? 'Grille de dépenses intuitive, répartition des coûts par membre et solutions'
            : 'دفتر مصاريف الموقع السلس، حسابات تقاسم التكاليف والتسويات'}
        </p>

        {/* Module Navigation */}
        <div className="flex items-center gap-2 mt-4 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">{language === 'en' ? 'Modules:' : language === 'fr' ? 'Modules :' : 'الوحدات:'}</span>
          <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 cursor-default">
            <Building className="w-3 h-3 inline mr-1" />{language === 'en' ? 'Construction' : language === 'fr' ? 'Construction' : 'بناء'}
          </span>
        </div>

      {/* Bento Grid Highlights Statistics (Shadcn KPI Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6" id="bento-stats-grid">
        {/* Metric 1 */}
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:shadow-sm transition-all relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider font-sans">
              {t.activeProjects}
            </span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white font-mono tracking-tight">
              {activeProjectsCount}
            </span>
            <span className="text-xs text-slate-450 font-mono">
              / {workspaceProjects.length} {language === "en" ? "total" : language === "fr" ? "au total" : "إجمالي"}
            </span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:shadow-sm transition-all relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider font-sans">
              {t.completedProjects}
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white font-mono tracking-tight">
              {completedProjectsCount}
            </span>
            <span className="text-xs text-slate-400">
              {language === 'en' ? 'Archived safely' : language === 'fr' ? 'Finis et archivés' : 'مؤرشف بأمان'}
            </span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:shadow-sm transition-all relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider font-sans">
              {t.totalExpenses}
            </span>
            <DollarSign className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-900 dark:text-white font-mono tracking-tight">
              {totalExpensesSum.toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-400 font-mono font-bold uppercase">
              {primaryCurrency}
            </span>
          </div>
          {/* Progress miniature line */}
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div 
              className="bg-sky-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, (totalExpensesSum / (totalBudgetsSum || 1)) * 100)}%` }}
            />
          </div>
        </div>

        {/* Metric 4 */}
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:shadow-sm transition-all relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider font-sans">
              {t.pendingTasks}
            </span>
            <CheckSquare className="w-4 h-4 text-sky-505" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white font-mono tracking-tight">
              {totalPendingTasksCount}
            </span>
            <span className="text-xs text-rose-500 font-semibold flex items-center gap-0.5">
              <AlertTriangle className="w-3 h-3 inline" /> {language === 'en' ? 'Checkpoints' : language === 'fr' ? 'Jalons' : 'نقاط تفتيش'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        {/* Left Column: Projects Catalog List */}
        <div className="lg:col-span-2 space-y-4 font-sans" id="project-catalog-section">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="min-w-0 font-display font-semibold text-lg text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-600" />
              {language === 'en' ? 'Active Workspaces' : language === 'fr' ? 'Espaces Chantiers Actifs' : 'مساحات العمل النشطة'}
              <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-850 text-slate-500 dark:text-slate-400 font-mono font-bold">
                {filteredProjects.length}
              </span>
            </h3>

            {/* View Mode Switcher */}
            <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-850 p-1 rounded-lg border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setViewMode('table');
                  localStorage.setItem("buildtrack_view_mode", "table");
                }}
                className={`px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-450 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
                title={language === 'en' ? 'Table layout' : language === 'fr' ? 'Disposition tableau' : 'مخطط الجدول'}
              >
                <Table className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{language === 'en' ? 'Table' : language === 'fr' ? 'Tableau' : 'جدول'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('cards');
                  localStorage.setItem("buildtrack_view_mode", "cards");
                }}
                className={`px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-450 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-205'
                }`}
                title={language === 'en' ? 'Cards layout' : language === 'fr' ? 'Disposition cartes' : 'مخطط الكروت'}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{language === 'en' ? 'Cards' : language === 'fr' ? 'Cartes' : 'كروت'}</span>
              </button>
            </div>
          </div>

          {searchQuery && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-sky-100 bg-sky-500/5 px-3.5 py-1.5 font-mono text-xs text-sky-700 dark:border-sky-950/40 dark:bg-slate-900/60 dark:text-sky-305">
              <span className="min-w-0 truncate">{language === 'en' ? `Filtered by: "${searchQuery}"` : language === 'fr' ? `Filtré par: "${searchQuery}"` : `تصفية بواسطة: "${searchQuery}"`}</span>
              <button onClick={() => { setSearchQuery(''); setProjectPage(1); }} className="underline hover:no-underline font-semibold cursor-pointer">
                {language === 'en' ? 'Reset' : language === 'fr' ? 'Réinitialiser' : 'إعادة تعيين'}
              </button>
            </div>
          )}

          {filteredProjects.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
              <HelpCircle className="w-8 h-8 mx-auto text-slate-350" />
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                {language === 'en' ? 'No work spaces match your query.' : language === 'fr' ? 'Aucun chantier ne correspond à la recherche.' : 'لا توجد مساحات عمل تطابق بحثك.'}
              </p>
              <button 
                onClick={() => { setSearchQuery(''); setProjectPage(1); }}
                className="mt-3 inline-flex items-center gap-1 text-xs text-sky-600 hover:underline font-semibold cursor-pointer"
              >
                {language === 'en' ? 'Clear Filters' : language === 'fr' ? 'Effacer les Filtres' : 'مسح التصفية'}
              </button>
            </div>
          ) : viewMode === 'table' ? (
            <div className="overflow-x-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xs">
              <table className="w-full text-left border-collapse table-auto min-w-[600px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-[10px] font-bold text-slate-400 dark:text-slate-450 uppercase tracking-wider">
                    <th className="py-3 px-4">{language === 'en' ? 'Workspace / site' : language === 'fr' ? 'Chantier' : 'مساحة العمل / الموقع'}</th>
                    <th className="py-3 px-4">{language === 'en' ? 'Status' : language === 'fr' ? 'Statut' : 'الحالة'}</th>
                    <th className="py-3 px-4">{language === 'en' ? 'Spent vs Budget' : language === 'fr' ? 'Dépenses / Budget' : 'المستنفد مقابل الميزانية'}</th>
                    <th className="py-3 px-4">{language === 'en' ? 'Tasks Progress' : language === 'fr' ? 'Tâches' : 'منجز المهام'}</th>
                    <th className="py-3 px-4 text-center">{language === 'en' ? 'Team' : language === 'fr' ? 'Équipe' : 'الفريق'}</th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {visibleProjects.map((project, index) => {
                    const totalSpent = project.expenses.reduce((s, e) => s + e.amount, 0);
                    const progressPct = project.tasks.length > 0
                      ? Math.round((project.tasks.filter(t => t.status === 'completed').length / project.tasks.length) * 100)
                      : 0;

                    return (
                      <motion.tr
                        key={project.id}
                        initial={{ opacity: 0, x: 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.24, delay: index * 0.03, ease: [0.22, 1, 0.36, 1] }}
                        onClick={() => onSelectProject(project.id)}
                        className="group hover:bg-slate-50/60 dark:hover:bg-slate-950/40 transition-all cursor-pointer text-xs"
                      >
                        <td className="py-3.5 px-4 font-sans max-w-[240px]">
                          <div className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-450 transition-colors truncate flex items-center gap-1.5">
                            {project.name}
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider font-mono ${
                              project.projectType === 'construction' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400' :
                              project.projectType === 'rental' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400' :
                              'bg-teal-100 text-teal-800 dark:bg-teal-900/20 dark:text-teal-400'
                            }`}>
                              {project.projectType === 'construction' ? 'B' : project.projectType === 'rental' ? 'R' : 'S'}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate flex items-center gap-1">
                            <span>{project.clientName}</span>
                            <span>•</span>
                            <span className="font-mono">{project.address}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider font-mono ${
                            project.status === 'in_progress' ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/15 dark:text-amber-400' :
                            project.status === 'completed' ? 'bg-emerald-100 text-emerald-990 dark:bg-emerald-900/15 dark:text-emerald-400' :
                            'bg-slate-100 text-slate-800 dark:bg-slate-850 dark:text-slate-300'
                          }`}>
                            {t.status[project.status]}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 min-w-[140px]">
                          <div className="space-y-1 max-w-[150px]">
                            {project.projectType === 'construction' && project.budget > 0 ? (
                              <>
                                <div className="flex justify-between items-center text-[10px] font-mono">
                                  <span className={totalSpent > project.budget ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-900 dark:text-slate-200 font-semibold'}>
                                    {totalSpent.toLocaleString()}
                                  </span>
                                  <span className="text-slate-400">/{project.budget.toLocaleString()} {project.currency}</span>
                                </div>
                                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      totalSpent > project.budget ? 'bg-rose-500' : 'bg-slate-900 dark:bg-slate-100'
                                    }`}
                                    style={{ width: `${Math.min(100, (totalSpent / project.budget) * 100)}%` }}
                                  />
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="flex justify-between items-center text-[10px] font-mono">
                                  <span className="text-slate-900 dark:text-slate-200 font-semibold">
                                    {totalSpent.toLocaleString()}
                                  </span>
                                  <span className="text-slate-400">{project.currency}</span>
                                </div>
                                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
                                  <div className="h-full bg-slate-900 dark:bg-slate-100 rounded-full" style={{ width: `${Math.min(100, totalSpent > 0 ? 100 : 0)}%` }} />
                                </div>
                                <span className="text-[8px] text-slate-400 font-mono">{language === 'en' ? 'No budget' : language === 'fr' ? 'Sans budget' : 'بدون ميزانية'}</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-12 bg-slate-150 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-sky-500 rounded-full"
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                            <span className="font-mono font-bold text-[10.5px] text-slate-700 dark:text-slate-300">{progressPct}%</span>
                            <span className="text-[10px] text-slate-400">({project.tasks.filter(t => t.status === 'completed').length}/{project.tasks.length})</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold bg-slate-50 dark:bg-slate-950 px-1.5 py-0.5 rounded border border-slate-100 dark:border-slate-850 text-slate-500 dark:text-slate-400">
                            <Users className="w-2.5 h-2.5" />
                            <span>{project.members.length}</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <ChevronRight className="w-4 h-4 text-slate-350 dark:text-slate-650 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-all translate-x-0 group-hover:translate-x-0.5" />
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {visibleProjects.map((project, index) => {
                const totalSpent = project.expenses.reduce((s, e) => s + e.amount, 0);
                const progressPct = project.tasks.length > 0
                  ? Math.round((project.tasks.filter(t => t.status === 'completed').length / project.tasks.length) * 100)
                  : 0;

                return (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.24, delay: index * 0.03, ease: [0.22, 1, 0.36, 1] }}
                    className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-350 dark:hover:border-slate-700 transition-all rounded-xl cursor-pointer flex flex-col justify-between hover:shadow-md"
                    onClick={() => onSelectProject(project.id)}
                    id={`project-card-${project.id}`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider font-mono ${
                          project.status === 'in_progress' ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/15 dark:text-amber-400' :
                          project.status === 'completed' ? 'bg-emerald-100 text-emerald-990 dark:bg-emerald-900/15 dark:text-emerald-400' :
                          'bg-slate-100 text-slate-800 dark:bg-slate-850 dark:text-slate-300'
                        }`}>
                          {t.status[project.status]}
                        </span>
                        
                        <span className="text-[10px] font-mono text-slate-400">
                          {project.startDate}
                        </span>
                      </div>

                      <h4 className="font-sans font-semibold text-sm text-slate-900 dark:text-white hover:text-sky-600 transition-colors flex items-center gap-1.5">
                        {project.name}
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider font-mono ${
                          project.projectType === 'construction' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400' :
                          project.projectType === 'rental' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400' :
                          'bg-teal-100 text-teal-800 dark:bg-teal-900/20 dark:text-teal-400'
                        }`}>
                          {project.projectType === 'construction' ? 'B' : project.projectType === 'rental' ? 'R' : 'S'}
                        </span>
                      </h4>
                      
                      <p className="text-xs text-slate-500 dark:text-slate-440 mt-1.5 line-clamp-2 leading-relaxed">
                        {project.description}
                      </p>

                      <div className="flex items-center gap-1 text-[10.5px] text-slate-400 mt-2 font-mono">
                        <MapPin className="w-3 h-3 text-sky-600 shrink-0" />
                        <span className="truncate">{project.address}</span>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-850">
                      {project.projectType === 'construction' && project.budget > 0 ? (
                        <>
                          <div className="flex justify-between items-center text-[11px] mb-1.5">
                            <span className="text-slate-500">{language === 'en' ? 'Spent vs Budget' : language === 'fr' ? 'Dépenses / Budget' : 'المستنفد مقابل الميزانية'}</span>
                            <span className="font-mono font-bold text-slate-900 dark:text-slate-200">
                              {totalSpent.toLocaleString()} / <span className="text-slate-400 font-medium">{project.budget.toLocaleString()} {project.currency}</span>
                            </span>
                          </div>

                          {/* Spend Progress Bar */}
                          <div className="w-full bg-slate-100 dark:bg-slate-850 h-1.5 rounded-full overflow-hidden mb-3">
                            <div 
                              className={`h-full rounded-full transition-all duration-300 ${
                                totalSpent > project.budget ? 'bg-rose-500' : 'bg-slate-900 dark:bg-slate-100'
                              }`}
                              style={{ width: `${Math.min(100, (totalSpent / project.budget) * 100)}%` }}
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between items-center text-[11px] mb-1.5">
                            <span className="text-slate-500">{language === 'en' ? 'Total Expenses' : language === 'fr' ? 'Total Dépenses' : 'إجمالي المصروفات'}</span>
                            <span className="font-mono font-bold text-slate-900 dark:text-slate-200">
                              {totalSpent.toLocaleString()} <span className="text-slate-400 font-medium">{project.currency}</span>
                            </span>
                          </div>

                          <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-3">
                            <span>{language === 'en' ? 'No budget set' : language === 'fr' ? 'Aucun budget' : 'لا توجد ميزانية'}</span>
                          </div>
                        </>
                      )}

                      {/* Footer spacing */}
                      <div className="flex items-center justify-between">
                        {/* Member count indicator */}
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold font-mono bg-slate-50 dark:bg-slate-950 px-2 py-0.5 rounded-md border border-slate-100 dark:border-slate-850">
                          <Users className="w-3 h-3 text-slate-400" />
                          <span>{project.members.length} {language === "en" ? "partners" : language === "fr" ? "membres" : "شركاء"}</span>
                        </div>

                        {/* Open details key */}
                        <div className="flex items-center gap-0.5 text-[10.5px] font-sans font-semibold text-slate-800 dark:text-slate-205 group hover:text-sky-500 transition-colors">
                          <span>{progressPct}% {language === 'en' ? 'tasks' : language === 'fr' ? 'tâches' : 'مهام'}</span>
                          <ArrowRight className="w-3.5 h-3.5 translate-x-0 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
          {projectPageCount > 1 && (
            <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>
                {language === 'en' ? 'Page' : language === 'fr' ? 'Page' : 'صفحة'} {activeProjectPage} / {projectPageCount}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setProjectPage((page) => Math.max(1, page - 1))}
                  disabled={activeProjectPage === 1}
                  className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 disabled:opacity-40"
                  aria-label={language === 'en' ? 'Previous page' : language === 'fr' ? 'Page précédente' : 'الصفحة السابقة'}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setProjectPage((page) => Math.min(projectPageCount, page + 1))}
                  disabled={activeProjectPage === projectPageCount}
                  className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 disabled:opacity-40"
                  aria-label={language === 'en' ? 'Next page' : language === 'fr' ? 'Page suivante' : 'الصفحة التالية'}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Mini Activity Timeline (Shadcn clean style) */}
        <div className="space-y-4" id="recent-activity-timeline">
          <h3 className="font-display font-semibold text-lg text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-600" />
            {t.recentActivity}
          </h3>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xs font-sans">
            {activities.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">
                {language === 'en'
                  ? 'No recent activity yet.'
                  : language === 'fr'
                    ? 'Aucune activité récente.'
                    : 'لا يوجد نشاط حديث بعد.'}
              </p>
            ) : (
              <>
                <div
                  className="max-h-[13.5rem] overflow-y-auto pr-0.5 [-ms-overflow-style:auto] [scrollbar-width:thin]"
                  aria-label={t.recentActivity}
                >
                  <ul className="space-y-3">
                    {activities.map((act) => (
                      <li key={act.id} className="relative flex items-start gap-2.5">
                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-100 bg-slate-100 text-[10px] font-bold tracking-wider text-slate-705 dark:border-slate-800 dark:bg-slate-850 dark:text-slate-300">
                          {act.userName.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium leading-snug text-slate-800 dark:text-slate-200 line-clamp-2">
                            <span className="font-semibold text-slate-900 dark:text-white">{act.userName}</span>{' '}
                            {act.actionDetails}
                          </p>
                          <span className="mt-0.5 block font-mono text-[9px] text-slate-400">
                            <Clock className="mr-1 inline h-2.5 w-2.5" />
                            {act.timestamp}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                {activities.length > 3 && (
                  <p className="mt-2 border-t border-slate-100 pt-2 text-center text-[10px] text-slate-400 dark:border-slate-800">
                    {language === 'en'
                      ? `Showing latest · scroll for more (${activities.length})`
                      : language === 'fr'
                        ? `Récent · faites défiler (${activities.length})`
                        : `الأحدث · مرّر لعرض المزيد (${activities.length})`}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
        </div>
      )}


      {/* New Project Dialog Modal (Shadcn style with dark mode overlay) */}
      <AnimatePresence>
      {showCreateModal && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 px-3 py-4 backdrop-blur-[2px] max-sm:backdrop-blur-none sm:items-center sm:px-4"
          id="create-modal"
          onClick={() => setShowCreateModal(false)}
          role="presentation"
          variants={overlayVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={overlay}
        >
          <motion.div
            variants={modalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={modal}
            className="panel-motion-gpu max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-left font-sans shadow-2xl dark:border-slate-805 dark:bg-slate-900 sm:p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-850">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {language === 'en' ? 'Launch New Project' : language === 'fr' ? 'Lancer un Nouveau Chantier' : 'إنشاء مشروع جديد'}
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-450 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-3.5 mt-3.5">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  {language === 'en' ? 'Project Name *' : language === 'fr' ? 'Nom du projet *' : 'اسم المشروع *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={language === 'en' ? "Villa Oasis Home Renovation" : language === 'fr' ? "Villa Oasis Home Rénovation" : "ترميم فيلا الواحة الفاخرة"}
                  value={projName}
                  onChange={(e) => setProjName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    {language === 'en' ? 'Client' : language === 'fr' ? 'Nom du client' : 'اسم الزبون / العميل'}
                  </label>
                  <input
                    type="text"
                    placeholder="Genevieve Montgomery"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    {language === 'en' ? 'Site Address' : language === 'fr' ? 'Adresse du site' : 'عنوان ورشة العمل / الموقع'}
                  </label>
                  <input
                    type="text"
                    placeholder="Malibu Road 402, CA"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    {language === 'en' ? 'Project Type' : language === 'fr' ? 'Type de Projet' : 'نوع المشروع'}
                  </label>
                  <select
                    value={createProjectType}
                    onChange={(e) => setProjectType(e.target.value as ProjectType)}
                    disabled={Boolean(workspaceType)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400 font-semibold"
                  >
                    <option value="construction">{t.projectTypes.construction}</option>
                    {!workspaceType && <option value="rental">{t.projectTypes.rental}</option>}
                  </select>
                </div>
                {createProjectType === 'rental' ? (
                  <>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        {language === 'en' ? 'Owner Name' : language === 'fr' ? 'Nom du propriétaire' : 'اسم المالك'}
                      </label>
                      <input
                        type="text"
                        required
                        value={rentalOwnerName}
                        onChange={(e) => setRentalOwnerName(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        {language === 'en' ? 'Building / Apt #' : language === 'fr' ? 'Bâtiment / Appartement' : 'رقم المبنى / الشقة'}
                      </label>
                      <input
                        type="text"
                        required
                        value={rentalBuildingNumber}
                        onChange={(e) => setRentalBuildingNumber(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        {language === 'en' ? 'Price per Night (DH)' : language === 'fr' ? 'Prix par nuit (DH)' : 'السعر لليلة (درهم)'}
                      </label>
                      <input
                        type="number"
                        required
                        min={0}
                        value={rentalPricePerNight || ''}
                        onChange={(e) => setRentalPricePerNight(Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        {language === 'en' ? 'Commission Rate' : language === 'fr' ? 'Taux de commission' : 'نسبة العمولة'}
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={rentalCommissionRate}
                        onChange={(e) => setRentalCommissionRate(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400 font-mono font-semibold"
                      />
                    </div>
                  </>
                ) : (
                  <>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    {language === 'en' ? 'Budget Limit' : language === 'fr' ? 'Limite du Budget' : 'الحد الأقصى للميزانية'}
                    {createProjectType !== 'construction' && (
                      <span className="text-[9px] text-slate-400 ml-1 font-normal">(optional)</span>
                    )}
                  </label>
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={budget || ''}
                    onChange={(e) => setBudget(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-905 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400 font-mono"
                    disabled={createProjectType !== 'construction'}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    {language === 'en' ? 'Currency Tag' : language === 'fr' ? 'Devise' : 'العملة'}
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400 font-semibold"
                  >
                    <option value="DH">DH</option>
                    <option value="USD">US Dollar ($)</option>
                    <option value="EUR">Euro (€)</option>
                    <option value="GBP">Pound Sterling (£)</option>
                  </select>
                </div>
                </>)}
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  {language === 'en' ? 'Brief Scope Description' : language === 'fr' ? 'Brève description de la mission' : 'وصف موجز لنطاق العمل'}
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Master kitchen blueprint rebuild and materials sourcing..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    {language === 'en' ? 'Start Date' : language === 'fr' ? 'Date d\'ouverture' : 'تاريخ بدء المشروع'}
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    {language === 'en' ? 'Deadline' : language === 'fr' ? 'Date de livraison' : 'موعد الانتهاء أو التسليم'}
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400 font-mono"
                  />
                </div>
              </div>

              <div className="pt-3.5 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-850">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-205 dark:bg-slate-850 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  {language === 'en' ? 'Cancel' : language === 'fr' ? 'Annuler' : 'إلغاء'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-950 hover:bg-slate-850 text-white dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-950 cursor-pointer shadow-sm"
                >
                  {t.createNewProject}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

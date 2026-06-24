import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Home, 
  Plus, 
  Folder, 
  Search, 
  Globe, 
  Sun, 
  Moon, 
  Users, 
  Briefcase,
  X,
  FileText,
  Sliders,
  LogOut
} from 'lucide-react';
import { initializeDB, getLanguage, saveLanguage } from './utils/mockData';
import { saveProjectToDB, subscribeToProjects, registerUserProfileIfNeeded } from './lib/db';
import { Language, Project } from './types';
import Dashboard from './components/Dashboard';
import ProjectDetail from './components/ProjectDetail';
import RentalDashboard from './components/RentalDashboard';
import ProfileModal from './components/ProfileModal';
import NotificationsPanel from './components/NotificationsPanel';
import { HSLogo } from './components/HSLogo';
import { useAuth } from './lib/AuthContext';
import { useAppNotifications } from './hooks/useAppNotifications';
import { NotificationAction } from './types';
import { useEscapeToClose } from './hooks/useEscapeToClose';
import { AppFooter } from './components/AppFooter';
import { useMotionConfig } from './utils/motionPresets';
import InstallAppPrompt from './components/InstallAppPrompt';
import AIAssistantPanel from './components/AIAssistantPanel';
import AIAssistantFab from './components/AIAssistantFab';
import { executeAIUINavigationPlan, PendingAiNav, AIUIAction } from './utils/aiNavigation';
import { AIDocumentDraft } from './utils/aiDocumentDraft';

const SIDEBAR_TRANSLATIONS = {
  en: {
    dashboard: "Dashboard Home",
    newWorkspace: "New Workspace",
    workspaces: "Active Workspaces",
    folders: "Folders / Pages",
    filterPlaceholder: "Search pages...",
    civilEngineer: "Civil Engineer Workspace",
    collapse: "Collapse sidebar",
    expand: "Expand sidebar",
    launchName: "Project / Apartment Name *",
    launchAddress: "Site Address",
    launchClient: "Homeowner Name",
    launchBudget: "Budget Ceiling",
    launchCurrency: "Currency",
    launchDesc: "Workspace Description",
    descPlaceholder: "Provide scope guidelines...",
    currencyDH: "Mad (Moroccan Dirham)",
    currencyEUR: "€ (Euro)",
    currencyUSD: "$ (US Dollar)",
    createBtn: "Launch Page Workspace",
    cancel: "Cancel",
    formTitle: "Launch New Page Workspace",
    noMatch: "No pages found",
    langLabel: "Toggle Language",
    themeLabel: "Toggle Theme"
  },
  fr: {
    dashboard: "Accueil Tableau de Bord",
    newWorkspace: "Nouveau Chantier",
    workspaces: "Mes Espaces Chantiers",
    folders: "Dossiers / Pages",
    filterPlaceholder: "Rechercher...",
    civilEngineer: "Espace Ingénierie Civile",
    collapse: "Masquer le volet",
    expand: "Afficher le volet",
    launchName: "Nom du Chantier / Appart *",
    launchAddress: "Adresse du Chantier",
    launchClient: "Nom du Propriétaire",
    launchBudget: "Plafond du Budget",
    launchCurrency: "Devise",
    launchDesc: "Description de l'Espace",
    descPlaceholder: "Fournir les directives du chantier...",
    currencyDH: "Mad (Dirham Marocain)",
    currencyEUR: "€ (Euro)",
    currencyUSD: "$ (Dollar US)",
    createBtn: "Lancer l'Espace Workspace",
    cancel: "Annuler",
    formTitle: "Lancer un Nouvel Espace Page",
    noMatch: "Aucune page trouvée",
    langLabel: "Changer de Langue",
    themeLabel: "Changer de Thème"
  },
  ar: {
    dashboard: "الرئيسية للوحة التحكم",
    newWorkspace: "مساحة عمل جديدة",
    workspaces: "مساحات العمل النشطة",
    folders: "المجلدات / الصفحات",
    filterPlaceholder: "البحث في الصفحات...",
    civilEngineer: "مساحة عمل المهندس المدني",
    collapse: "طي شريط الجانبي",
    expand: "توسيع شريط الجانبي",
    launchName: "اسم المشروع / الشقة *",
    launchAddress: "عنوان الموقع",
    launchClient: "اسم صاحب المنزل",
    launchBudget: "سقف الميزانية",
    launchCurrency: "العملة",
    launchDesc: "وصف مساحة العمل",
    descPlaceholder: "قدّم توجيهات نطاق المشروع المبدئية...",
    currencyDH: "درهم (الدرهم المغربي)",
    currencyEUR: "€ (يورو)",
    currencyUSD: "$ (دولار أمريكي)",
    createBtn: "إطلاق مساحة العمل الصفحية",
    cancel: "إلغاء",
    formTitle: "إطلاق مساحة عمل جديدة",
    noMatch: "لم يتم العثور على صفحات",
    langLabel: "تغيير اللغة",
    themeLabel: "تغيير المظهر"
  }
};

export default function App() {
  const { user, signOut } = useAuth();
  const { page, modal, modalVariants, overlayVariants, overlay } = useMotionConfig();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'dashboard' | 'rental'>('dashboard');
  const [language, setLanguage] = useState<Language>('en');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  
  // Sidebar custom states
  const [projects, setProjects] = useState<Project[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem("buildtrack_sidebar_open");
    return saved !== null ? saved === "true" : true;
  });
  const [sidebarFilter, setSidebarFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [pendingAiNav, setPendingAiNav] = useState<PendingAiNav | null>(null);
  const [pendingAiDocumentDraft, setPendingAiDocumentDraft] = useState<{
    projectId: string;
    draft: AIDocumentDraft;
  } | null>(null);

  useEscapeToClose(showAddModal, () => setShowAddModal(false));
  useEscapeToClose(showAIAssistant, () => setShowAIAssistant(false));

  const activeProject =
    selectedProjectId != null
      ? projects.find((p) => p.id === selectedProjectId) ?? null
      : null;

  // New Project Form States inside sidebar
  const [projName, setProjName] = useState('');
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState(120000);
  const [currency, setCurrency] = useState('DH');

  // Swipe gesture handling
  useEffect(() => {
    let touchStartX = 0;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const touchEndX = e.changedTouches[0].clientX;
      const diff = touchEndX - touchStartX;

      // Only handle swipe if it's a significant movement
      if (Math.abs(diff) > 50) {
        if (diff > 0) {
          // Swipe right - open sidebar
          setSidebarOpen(true);
        } else {
          // Swipe left - close sidebar
          setSidebarOpen(false);
        }
      }
    };

    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  const sf = SIDEBAR_TRANSLATIONS[language];

  const {
    notifications,
    invitations,
    showPanel: showNotifications,
    setShowPanel: setShowNotifications,
    unreadCount,
    pendingNav,
    consumePendingNav,
    highlightInvitationId,
    setHighlightInvitationId,
    handleMarkRead,
    handleMarkAllRead,
    handleNavigate: navigateFromNotification,
    onAcceptInvitation,
    onDeclineInvitation,
  } = useAppNotifications(user, projects);

  const handleNotificationNavigate = (action: NotificationAction) => {
    navigateFromNotification(action);
    if (action.projectId && !action.highlightInvitation) {
      setSelectedProjectId(action.projectId);
    }
  };

  const handleAiApplyProject = useCallback(
    async (updated: Project) => {
      if (!user?.uid) return;
      await saveProjectToDB(user.uid, updated);
    },
    [user?.uid]
  );

  const handleAiNavigate = useCallback(
    (actions: AIUIAction[]) => {
      executeAIUINavigationPlan(actions, {
        projects,
        activeProject,
        onSelectProject: (id) => setSelectedProjectId(id),
        openDashboard: () => setSelectedProjectId(null),
        openCreateProject: () => {
          setSelectedProjectId(null);
          window.setTimeout(() => setShowAddModal(true), 120);
        },
        setPendingAiNav: (nav) => setPendingAiNav(nav),
      });
    },
    [projects, activeProject]
  );

  useEffect(() => {
    if (pendingNav?.projectId && pendingNav.projectId !== selectedProjectId) {
      setSelectedProjectId(pendingNav.projectId);
    }
  }, [pendingNav, selectedProjectId]);

  useEffect(() => {
    if (!user) {
      setProjects([]);
      return;
    }

    // Register user profile globally for collaboration lookups
    if (user.uid && user.email) {
      registerUserProfileIfNeeded(user.uid, user.email, user.displayName);
    }

    const unsubscribe = subscribeToProjects(user.email, (updatedProjects) => {
      setProjects(updatedProjects);
    });

    return () => {
      unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    // Seed and build LocalStorage Database structures
    initializeDB();
    
    // Set user preferences
    const savedLang = getLanguage();
    setLanguage(savedLang);

    const savedTheme = localStorage.getItem("buildtrack_theme") as 'light' | 'dark' || 'light';
    setTheme(savedTheme);

    const handleOpenProfile = () => {
      setShowProfileModal(true);
    };

    window.addEventListener('open_profile_settings', handleOpenProfile);
    
    return () => {
      window.removeEventListener('open_profile_settings', handleOpenProfile);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("buildtrack_theme", theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("buildtrack_sidebar_open", String(sidebarOpen));
  }, [sidebarOpen]);

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    saveLanguage(lang);
  };

  const handleThemeToggle = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const toggleSidebar = () => setSidebarOpen((open) => !open);

  const closeSidebarOnMobile = () => {
    if (window.matchMedia('(max-width: 1023px)').matches) {
      setSidebarOpen(false);
    }
  };

  const handleSelectProject = (projectId: string | null) => {
    setSelectedProjectId(projectId);
    closeSidebarOnMobile();
  };

  const handleLaunchProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projName.trim() || !user?.email) return;

    const ownerEmail = user.email.toLowerCase();
    const newId = `proj_${Date.now()}`;
    const newProject: Project = {
      id: newId,
      name: projName,
      clientName: clientName || "N/A",
      address: address || "N/A",
      description: description || "No workspace details provided.",
      startDate: new Date().toISOString().split('T')[0],
      estimatedEndDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      budget: Number(budget) || 10000,
      currency: currency || 'DH',
      status: 'planning',
      projectType: 'construction',
      creatorEmail: ownerEmail,
      members: [
        { email: ownerEmail, name: user.displayName || 'Owner', role: 'owner', status: 'accepted' }
      ],
      sections: [
        { id: `sec_p_${Date.now()}`, projectId: newId, title: language === 'en' ? "Painting & Plastering" : language === 'fr' ? "Peinture & Plâtrerie" : "دهان وجبس", progress: 0, status: 'planning' },
        { id: `sec_pl_${Date.now()}`, projectId: newId, title: language === 'en' ? "Bath & Plumbing Services" : language === 'fr' ? "Plomberie & Sanitaires" : "سباكة وصرف صحي", progress: 0, status: 'planning' }
      ],
      expenses: [],
      tasks: [
        {
          id: `tsk_init_${Date.now()}_1`,
          title: "Initial Workspace Setup & Review",
          description: "Inspect raw drawings and evaluate initial budget bounds with general partners.",
          assignedTo: ownerEmail,
          priority: "high",
          deadline: new Date().toISOString().split('T')[0],
          status: "pending",
          subtasks: [
            { id: `sub_1_${Date.now()}`, title: "Confirm client specifications", isCompleted: false },
            { id: `sub_2_${Date.now()}`, title: "Finalize contractor materials list", isCompleted: false }
          ]
        }
      ],
      photos: [],
      documents: []
    };

    // Incorporate persistent updates
    if (user?.uid) {
      await saveProjectToDB(user.uid, newProject);
    }

    // Auto-focus the newly created page
    setSelectedProjectId(newId);
    closeSidebarOnMobile();

    // Reset fields
    setProjName('');
    setClientName('');
    setAddress('');
    setDescription('');
    setBudget(120000);
    setCurrency('DH');
    setShowAddModal(false);
  };

  const filteredPages = projects.filter(p => p.name.toLowerCase().includes(sidebarFilter.toLowerCase()));

  return (
    <div className={`flex min-h-screen text-slate-800 dark:text-slate-100 bg-slate-50/40 dark:bg-[#121212] transition-colors duration-350 font-sans ${theme === 'dark' ? 'dark' : ''}`}>
      
      {/* Backdrop when sidebar is open on mobile / tablet */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            key="sidebar-scrim"
            variants={overlayVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={overlay}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[1px] max-sm:backdrop-blur-none lg:hidden transform-gpu"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Sidebar — slides in on mobile, collapses on desktop */}
      <aside 
        className={`sidebar-motion panel-motion-gpu fixed inset-y-0 left-0 z-40 flex w-64 flex-col justify-between border-r border-slate-200 bg-[#f9f9f8] select-none dark:border-slate-850/70 dark:bg-[#161616] lg:relative lg:shrink-0 ${
          sidebarOpen
            ? 'translate-x-0 lg:w-64'
            : '-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden lg:border-r-0'
        }`}
        aria-hidden={!sidebarOpen}
      >
        <div className={`flex h-full w-64 flex-col justify-between transition-opacity duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${sidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0 lg:invisible'}`}>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-100/30 px-4 py-3.5 dark:border-slate-900 dark:bg-slate-950/20">
              <div className="flex max-w-[80%] items-center gap-2 truncate">
                <div className="shrink-0">
                  <HSLogo className="h-8 w-8" compact />
                </div>
                <div className="truncate">
                  <span className="block truncate font-sans text-[12.5px] font-bold leading-none tracking-tight text-slate-900 dark:text-slate-105">
                    HS Tracker
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[9.5px] tracking-wide text-slate-400">
                    {sf.civilEngineer}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-200/60 hover:text-slate-700 lg:hidden dark:hover:bg-slate-800 dark:hover:text-slate-200"
                title={sf.collapse}
                aria-label={sf.collapse}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Quick Core Actions Menu */}
            <div className="px-3 py-3 border-b border-slate-100 dark:border-slate-900/40 space-y-1.5 font-sans">
              <button
                onClick={() => handleSelectProject(null)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2.5 transition-all cursor-pointer ${
                  selectedProjectId === null 
                    ? 'bg-slate-200/50 dark:bg-slate-850/80 text-sky-600 dark:text-sky-400' 
                    : 'text-slate-600 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-850'
                }`}
              >
                <Home className="w-4 h-4 opacity-80" />
                <span>{sf.dashboard}</span>
              </button>

              <button
                id="sidebar-new-workspace-btn"
                onClick={() => setShowAddModal(true)}
                className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2.5 text-slate-600 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-850 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 opacity-80 text-sky-500" />
                <span>{sf.newWorkspace}</span>
              </button>
            </div>

            {/* Sidebar Projects Filter Search */}
            <div className="px-3 pt-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  placeholder={sf.filterPlaceholder}
                  value={sidebarFilter}
                  onChange={(e) => setSidebarFilter(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-[11px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none transition-all"
                />
                {sidebarFilter && (
                  <button
                    onClick={() => setSidebarFilter('')}
                    className="absolute right-2.5 top-2.5 text-[9px] text-slate-400 hover:text-slate-600 hover:underline"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Open Child Pages & Sub-documents list */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 font-sans">
              <div>
                <span className="px-3 text-[9.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-2">
                  {sf.workspaces}
                </span>
                
                <div className="space-y-0.5">
                  {filteredPages.length === 0 ? (
                    <p className="px-3 py-2 text-[10.5px] text-slate-400 italic">
                      {sf.noMatch}
                    </p>
                  ) : (
                    filteredPages.map(p => {
                      const isActive = selectedProjectId === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => handleSelectProject(p.id)}
                          className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-all group cursor-pointer ${
                            isActive 
                              ? 'bg-slate-200/60 dark:bg-slate-800 text-sky-600 dark:text-sky-400 font-bold' 
                              : 'text-slate-600 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-850'
                          }`}
                        >
                          <div className="flex items-center gap-2 max-w-[85%] truncate">
                            <Folder className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-sky-500' : 'text-slate-400'}`} />
                            <span className="truncate">{p.name}</span>
                          </div>
                          <span className="text-[10px] opacity-0 group-hover:opacity-100 text-slate-400 dark:text-slate-550 font-mono">
                            OPN
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Beautiful Bottom User info & custom togglers */}
          <div className="p-3 border-t border-slate-100 dark:border-slate-900 bg-slate-100/10 dark:bg-slate-950/10 font-sans space-y-3 shrink-0">
            {/* User profile identifier block */}
            <div className="flex items-center justify-between gap-2.5 px-2 py-1">
              <div 
                className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer hover:opacity-80 transition-all" 
                onClick={() => setShowProfileModal(true)}
                title={language === 'en' ? "Profile Settings" : language === 'fr' ? "Paramètres du Profil" : "إعدادات الحساب"}
              >
                <div className="h-7 w-7 shrink-0 rounded-full bg-sky-500 text-white flex items-center justify-center font-bold text-xs ring-2 ring-slate-200 dark:ring-slate-800 uppercase">
                  {user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U'}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block truncate">
                    {user?.displayName || "HS Tracker User"}
                  </span>
                  <span className="text-[10px] text-slate-400 block truncate">
                    {user?.email}
                  </span>
                </div>
              </div>
              <button 
                onClick={signOut}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-colors shrink-0" 
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            {/* Quick System controls bar */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-850 gap-2">
              <button
                onClick={() => handleLanguageChange(language === 'en' ? 'fr' : language === 'fr' ? 'ar' : 'en')}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-650 dark:text-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
                title={sf.langLabel}
              >
                <Globe className="w-3 h-3 text-slate-400" />
                <span className="font-mono">{language === 'en' ? 'FR' : language === 'fr' ? 'AR' : 'EN'}</span>
              </button>

              <button
                onClick={handleThemeToggle}
                className="p-1 px-2.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-650 dark:text-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
                title={sf.themeLabel}
              >
                {theme === 'light' ? (
                  <span className="flex items-center gap-1"><Moon className="w-3 h-3 text-slate-400" /> Dark</span>
                ) : (
                  <span className="flex items-center gap-1"><Sun className="w-3 h-3 text-amber-500" /> Light</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content — navbar lives inside each view, aligned with this column */}
      <main className="relative flex min-h-screen min-w-0 flex-1 flex-col overflow-x-hidden">
        <div className="flex-1">
          <AnimatePresence mode="wait">
            {activeView === 'rental' ? (
              <motion.div
                key="rental-dashboard"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={page}
                className="transform-gpu"
              >
                <RentalDashboard
                  onSelectProject={(id) => handleSelectProject(id)}
                  language={language}
                  onLanguageChange={handleLanguageChange}
                  theme={theme}
                  onThemeToggle={handleThemeToggle}
                  onBack={() => setActiveView('dashboard')}
                  sidebarOpen={sidebarOpen}
                  onToggleSidebar={toggleSidebar}
                  sidebarToggleLabel={sidebarOpen ? sf.collapse : sf.expand}
                  unreadCount={unreadCount}
                  onToggleNotifications={() => {
                    setShowNotifications((open) => !open);
                    setHighlightInvitationId(null);
                  }}
                />
              </motion.div>
            ) : !selectedProjectId ? (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={page}
                className="transform-gpu"
              >
                <Dashboard 
                  onSelectProject={(id) => handleSelectProject(id)}
                  language={language}
                  onLanguageChange={handleLanguageChange}
                  theme={theme}
                  onThemeToggle={handleThemeToggle}
                  sidebarOpen={sidebarOpen}
                  onToggleSidebar={toggleSidebar}
                  sidebarToggleLabel={sidebarOpen ? sf.collapse : sf.expand}
                  unreadCount={unreadCount}
                  onToggleNotifications={() => {
                    setShowNotifications((open) => !open);
                    setHighlightInvitationId(null);
                  }}
                  onOpenRentalDashboard={() => setActiveView('rental')}
                />
              </motion.div>
            ) : (
              <motion.div
                key="project-detail"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={page}
                className="transform-gpu"
              >
                <ProjectDetail 
                  projectId={selectedProjectId}
                  onBack={() => handleSelectProject(null)}
                  onOpenCreateProject={() => {
                    handleSelectProject(null);
                    window.setTimeout(() => setShowAddModal(true), 200);
                  }}
                  language={language}
                  onLanguageChange={handleLanguageChange}
                  theme={theme}
                  onThemeToggle={handleThemeToggle}
                  sidebarOpen={sidebarOpen}
                  onToggleSidebar={toggleSidebar}
                  sidebarToggleLabel={sidebarOpen ? sf.collapse : sf.expand}
                  unreadCount={unreadCount}
                  onToggleNotifications={() => {
                    setShowNotifications((open) => !open);
                    setHighlightInvitationId(null);
                  }}
                  pendingNav={pendingNav}
                  onPendingNavConsumed={consumePendingNav}
                  pendingAiNav={
                    pendingAiNav?.projectId === selectedProjectId ? pendingAiNav : null
                  }
                  onPendingAiNavConsumed={() => setPendingAiNav(null)}
                  pendingDocumentDraft={
                    pendingAiDocumentDraft?.projectId === selectedProjectId
                      ? pendingAiDocumentDraft.draft
                      : null
                  }
                  onPendingDocumentDraftConsumed={() => setPendingAiDocumentDraft(null)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <AppFooter language={language} />
      </main>

      {/* GLOBAL CREATE WORKSPACE DIALOG (Notion aesthetic) */}
      <AnimatePresence>
        {showAddModal && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-[2px] max-sm:backdrop-blur-none"
          id="sidebar-pj-creator-modal"
          onClick={() => setShowAddModal(false)}
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
            className="panel-motion-gpu w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 rounded-xl shadow-2xl p-5 text-left font-sans"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-850">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-sky-500" />
                {sf.formTitle}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleLaunchProject} className="space-y-4 mt-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  {sf.launchName}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Appartement 4B, Tanger Centre"
                  value={projName}
                  onChange={(e) => setProjName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    {sf.launchClient}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. M. El Amrani"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-955 text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    {sf.launchAddress}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Avenue Mohammed V"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-955 text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    {sf.launchBudget}
                  </label>
                  <input
                    type="number"
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-955 text-slate-900 dark:text-white focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    {sf.launchCurrency}
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-955 text-slate-700 dark:text-slate-350 focus:outline-none font-semibold"
                  >
                    <option value="DH">{sf.currencyDH}</option>
                    <option value="EUR">{sf.currencyEUR}</option>
                    <option value="USD">{sf.currencyUSD}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  {sf.launchDesc}
                </label>
                <textarea
                  rows={2}
                  placeholder={sf.descPlaceholder}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-955 text-slate-900 dark:text-white focus:outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer"
                >
                  {sf.cancel}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-950 hover:bg-slate-850 text-white dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-950 cursor-pointer shadow-sm"
                >
                  {sf.createBtn}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
        )}
      </AnimatePresence>

      <ProfileModal 
        isOpen={showProfileModal} 
        onClose={() => setShowProfileModal(false)} 
        language={language} 
      />

      <NotificationsPanel
        open={showNotifications}
        onClose={() => {
          setShowNotifications(false);
          setHighlightInvitationId(null);
        }}
        language={language}
        notifications={notifications}
        invitations={invitations}
        highlightInvitationId={highlightInvitationId}
        onMarkRead={handleMarkRead}
        onMarkAllRead={handleMarkAllRead}
        onAcceptInvitation={onAcceptInvitation}
        onDeclineInvitation={onDeclineInvitation}
        onNavigate={handleNotificationNavigate}
      />

      <AIAssistantFab onClick={() => setShowAIAssistant(true)} language={language} />
      <AIAssistantPanel
        open={showAIAssistant}
        onClose={() => setShowAIAssistant(false)}
        projects={projects}
        activeProject={activeProject}
        language={language}
        userEmail={user?.email ?? ''}
        userName={user?.displayName || 'HS Tracker User'}
        onApplyProject={handleAiApplyProject}
        onSelectProject={setSelectedProjectId}
        onNavigate={handleAiNavigate}
        onApplyDocumentDraft={(draft, projectId) => {
          setPendingAiDocumentDraft({ projectId, draft });
          setSelectedProjectId(projectId);
        }}
      />

      <InstallAppPrompt language={language} />

    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { HSLogo } from './HSLogo';
import { 
  Plus, 
  Search, 
  Bell, 
  DollarSign, 
  CheckSquare, 
  Layers, 
  Calendar, 
  MapPin, 
  Users, 
  Clock, 
  Globe, 
  Sun, 
  Moon, 
  ChevronRight, 
  ChevronDown,
  Activity, 
  Briefcase, 
  AlertTriangle,
  CheckCircle2,
  X,
  PlusCircle,
  HelpCircle,
  ArrowRight,
  Table,
  LayoutGrid,
  Menu,
  MoreVertical
} from 'lucide-react';
import MobileDropdownMenu from './MobileDropdownMenu';
import { AnimatePresence, motion } from 'motion/react';

import { Project, TimelineActivity, AppNotification, Language, Invitation, UserRole } from '../types';
import { TRANSLATIONS } from '../utils/mockData';
import { useAuth } from '../lib/AuthContext';
import { 
  getProjectFromDB, 
  saveProjectToDB, 
  getActivitiesFromDB, 
  saveActivityToDB, 
  saveNotificationToDB, 
  subscribeToProjects, 
  subscribeToInvitations, 
  subscribeToNotifications, 
  updateInvitationStatusInDB, 
  pushNotificationByEmail,
  deleteNotificationFromDB
} from '../lib/db';

interface DashboardProps {
  onSelectProject: (projectId: string) => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export default function Dashboard({ 
  onSelectProject, 
  language, 
  onLanguageChange, 
  theme, 
  onThemeToggle,
  sidebarOpen = false,
  onToggleSidebar
}: DashboardProps) {
  const { user } = useAuth();
  // Database States
  const [projects, setProjects] = useState<Project[]>([]);
  const [activities, setActivities] = useState<TimelineActivity[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  
  // UI States
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
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
  const [budget, setBudget] = useState(100000);
  const [currency, setCurrency] = useState('DH');

  const t = TRANSLATIONS[language];

  // Load and refresh state in real-time
  useEffect(() => {
    if (!user) return;

    // Load overall timeline activities once or periodically
    const loadActivities = async () => {
      try {
        const dbActivities = await getActivitiesFromDB(user.uid);
        setActivities(dbActivities.slice(0, 10));
      } catch (err) {
        console.error("Activities load error:", err);
      }
    };
    loadActivities();

    if (!user.email) return;

    // 1. Subscribe to projects (creator or member)
    const unsubProjects = subscribeToProjects(user.email, (updatedProjects) => {
      setProjects(updatedProjects);
    });

    // 2. Subscribe to incoming collaborator invitations
    const unsubInvitations = subscribeToInvitations(user.email, (updatedInvitations) => {
      setInvitations(updatedInvitations);
    });

    // 3. Subscribe to notifications
    const unsubNotifications = subscribeToNotifications(user.uid, (updatedNotifs) => {
      setNotifications(updatedNotifs);
    });

    return () => {
      unsubProjects();
      unsubInvitations();
      unsubNotifications();
    };
  }, [user]);

  // Sync state back to LocalStorage is removed and individually updated to DB
  const updateProjectsState = async (updated: Project[]) => {
    setProjects(updated);
    // This is a bulk save, which isn't optimal for Firebase, but we'll loop for safety if needed
    // Actually we will just update local state here; DB gets updated individually where needed.
  };

  // Add new project
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projName.trim() || !user?.uid) return;

    const projectId = `proj_${Date.now()}`;
    const userEmail = (user.email || 'relhaskouri2@gmail.com').toLowerCase();

    const newProject: Project = {
      id: projectId,
      name: projName,
      clientName: clientName || t.dashboard,
      address: address || "N/A",
      description: description || "No description provided.",
      startDate: startDate || new Date().toISOString().split('T')[0],
      estimatedEndDate: endDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      budget: Number(budget) || 10000,
      currency: currency || 'DH',
      status: 'planning',
      creatorEmail: userEmail,
      members: [
        { email: userEmail, name: user.displayName || userEmail.split('@')[0], role: 'owner', status: 'accepted' }
      ],
      sections: [
        { id: `sec_p_${Date.now()}`, projectId: projectId, title: t.sections.painting, progress: 0, status: 'planning' },
        { id: `sec_pl_${Date.now()}`, projectId: projectId, title: t.sections.plumbing, progress: 0, status: 'planning' }
      ],
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
      documents: []
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
        timestamp: new Date().toISOString()
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
      setBudget(100000);
      setCurrency('DH');
      setShowCreateModal(false);
      
      // Dispatch storage (keep for backwards compat just in case)
      window.dispatchEvent(new Event('storage'));
    } catch (err) {
      console.error("Failed to save project", err);
    }
  };

  const onAcceptInvitation = async (invite: Invitation) => {
    if (!user) return;
    try {
      // 1. Update status
      await updateInvitationStatusInDB(invite.id, 'accepted');
      
      // 2. Load the project details
      const project = await getProjectFromDB(user.uid, invite.projectId);
      if (project) {
        const cleanInviteeEmail = invite.inviteeEmail.toLowerCase();
        
        // Find existing or push
        let exists = false;
        const updatedMembers = project.members.map(m => {
          if (m.email.toLowerCase() === cleanInviteeEmail) {
            exists = true;
            return { ...m, status: 'accepted' as const, name: user.displayName || m.name };
          }
          return m;
        });

        if (!exists) {
          updatedMembers.push({
            email: cleanInviteeEmail,
            name: user.displayName || invite.inviteeEmail.split('@')[0],
            role: invite.role,
            status: 'accepted'
          });
        }

        const memberEmails = updatedMembers.map(m => m.email.toLowerCase());
        const cleanCreatorEmail = project.creatorEmail.toLowerCase();
        if (!memberEmails.includes(cleanCreatorEmail)) {
          memberEmails.push(cleanCreatorEmail);
        }
        if (!memberEmails.includes(cleanInviteeEmail)) {
          memberEmails.push(cleanInviteeEmail);
        }

        const updatedProj = {
          ...project,
          members: updatedMembers,
          memberEmails
        };

        // 3. Save
        await saveProjectToDB(user.uid, updatedProj);

        // 4. Activity
        const actId = `act_${Date.now()}`;
        await saveActivityToDB(user.uid, {
          id: actId,
          projectId: invite.projectId,
          userEmail: cleanInviteeEmail,
          userName: user.displayName || cleanInviteeEmail.split('@')[0],
          actionType: 'member_joined',
          actionDetails: `${user.displayName || invite.inviteeEmail} joined the project workspace as ${invite.role}.`,
          timestamp: new Date().toISOString()
        });

        // 5. Notify creator
        await pushNotificationByEmail(invite.ownerEmail, 'info', invite.projectId, {
          projectName: invite.projectName,
          text: `${user.displayName || invite.inviteeEmail} accepted your invitation to collaborate on "${invite.projectName}" as ${invite.role}.`,
          read: false,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });

        // 6. Notify invitee
        await saveNotificationToDB(user.uid, 'success', invite.projectId, Date.now(), {
          projectName: invite.projectName,
          text: `You have successfully joined "${invite.projectName}" with ${invite.role} permissions.`,
          read: false,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }
    } catch (e) {
      console.error("Error accepting invitation:", e);
    }
  };

  const onDeclineInvitation = async (invite: Invitation) => {
    if (!user) return;
    try {
      await updateInvitationStatusInDB(invite.id, 'declined');

      const project = await getProjectFromDB(user.uid, invite.projectId);
      if (project) {
        const cleanInvitee = invite.inviteeEmail.toLowerCase();
        const updatedMembers = project.members.map(m => {
          if (m.email.toLowerCase() === cleanInvitee) {
            return { ...m, status: 'declined' as const };
          }
          return m;
        });
        await saveProjectToDB(user.uid, { ...project, members: updatedMembers });
      }

      await pushNotificationByEmail(invite.ownerEmail, 'info', invite.projectId, {
        projectName: invite.projectName,
        text: `${user.displayName || invite.inviteeEmail} declined your invitation to collaborate on "${invite.projectName}".`,
        read: false,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    } catch (err) {
      console.error("Error declining invitation:", err);
    }
  };

  // Mark status notifications as read
  const handleMarkNotificationRead = async (notifId: string) => {
    const updated = notifications.map(n => n.id === notifId ? { ...n, read: true } : n);
    setNotifications(updated);
    if (!user?.uid) return;
    const notifTarget = notifications.find(n => n.id === notifId);
    if (notifTarget) {
      // Re-save with read true
      try {
        const { targetType, targetId, timestamp, ...info } = notifTarget;
        await saveNotificationToDB(user.uid, targetType, targetId, timestamp, { ...info, read: true });
      } catch(e) { console.error(e) }
    }
  };

  const handleMarkAllRead = async () => {
    const updated = notifications.map(n => ({ ...n, read: true }));
    setNotifications(updated);
    if (!user?.uid) return;
    for (const notif of notifications) {
      if (!notif.read) {
         try {
           const { targetType, targetId, timestamp, ...info } = notif;
           await saveNotificationToDB(user.uid, targetType, targetId, timestamp, { ...info, read: true });
         } catch(e) { console.error(e) }
      }
    }
  };

  // Calculations for KPI numbers
  const primaryCurrency = projects.length > 0 ? projects[0].currency : 'DH';
  const activeProjectsCount = projects.filter(p => p.status !== 'completed' && p.status !== 'cancelled').length;
  const completedProjectsCount = projects.filter(p => p.status === 'completed').length;
  
  const totalExpensesSum = projects.reduce((sum, p) => {
    return sum + p.expenses.reduce((s, e) => s + e.amount, 0);
  }, 0);

  const totalBudgetsSum = projects.reduce((sum, p) => sum + p.budget, 0);

  const totalPendingTasksCount = projects.reduce((sum, p) => {
    return sum + p.tasks.filter(t => t.status !== 'completed').length;
  }, 0);

  // Filter projects by search query
  const filteredProjects = projects.filter(project => {
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

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-8 md:py-8" id="dashboard-viewport">
      {/* Top Header Grid */}
      <div className="sticky top-0 z-[110] -mx-4 px-4 sm:mx-0 sm:px-0 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 mb-6 pt-3 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 lg:gap-3">
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex">
                <HSLogo className="w-9 h-9" />
              </div>
              <div className="sm:hidden">
                <HSLogo className="w-7 h-7" />
              </div>
              <span className="font-display font-bold text-lg sm:text-2xl tracking-tight text-slate-900 dark:text-white">
                HS Tracker
              </span>
            </div>
          </div>

          {/* Action Widgets */}
          <div className="flex items-center gap-2 sm:gap-3 relative">
          
          {/* Mobile Actions */}
          <div className="flex lg:hidden items-center">
            <button
              onClick={() => {
                setShowMobileMenu(!showMobileMenu);
                setShowNotifications(false);
              }}
              className="relative p-2 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
            >
              <MoreVertical className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-950 animate-pulse"></span>
              )}
            </button>
          </div>
        
          {/* Desktop Actions */}
          <div className="hidden lg:flex flex-wrap items-center gap-3">
            {/* Universal Search Container */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                id="global-search-query"
                placeholder={t.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-56 pl-9 pr-4 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 transition-all font-mono"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-2 text-[10px] text-sky-500 hover:underline"
                >
                  {language === 'en' ? 'Clear' : language === 'fr' ? 'Effacer' : 'مسح'}
                </button>
              )}
            </div>

            {/* Languages Dropdown */}
            <div className="relative" title={t.langLabel}>
              <button
                onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[10px] sm:text-xs font-semibold cursor-pointer text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all"
              >
                <Globe className="w-3.5 h-3.5 text-slate-400" />
                {language.toUpperCase()}
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>
              <AnimatePresence>
                {showLanguageDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="absolute right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg z-50 text-xs overflow-hidden w-20"
                  >
                    {(['en', 'fr', 'ar'] as const).map((lang) => (
                      <button
                        key={lang}
                        onClick={() => {
                          onLanguageChange(lang);
                          setShowLanguageDropdown(false);
                        }}
                        className={`block w-full text-left px-3 py-1.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 ${language === lang ? 'text-sky-600 dark:text-sky-400 font-bold' : 'text-slate-700 dark:text-slate-300'}`}
                      >
                        {lang.toUpperCase()}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Theme Switcher */}
            <button
              id="theme-toggler"
              onClick={onThemeToggle}
              className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all cursor-pointer animate-none"
            >
              {theme === 'light' ? <Moon className="w-3.5 h-3.5 text-slate-500" /> : <Sun className="w-3.5 h-3.5 text-amber-400" />}
            </button>

            {/* Notifications Trigger */}
            <div className="relative bg-transparent">
              <button
                id="notif-bell-btn"
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  setShowMobileMenu(false);
                }}
                className="relative p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5 text-slate-500" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-rose-500 flex items-center justify-center text-[9px] font-bold text-white tracking-tighter animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>

            {/* Profile trigger on desktop */}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('open_profile_settings'))}
              className="h-8 w-8 rounded-lg bg-sky-500 text-white flex items-center justify-center font-bold text-[11px] hover:bg-sky-400 active:scale-95 transition-all cursor-pointer ring-2 ring-slate-100 dark:ring-slate-800 shrink-0 select-none uppercase font-sans font-extrabold"
              title={language === 'en' ? 'Profile Settings' : language === 'fr' ? 'Paramètres du Profil' : 'إعدادات الملف الشخصي'}
            >
              {user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U'}
            </button>

            {/* Create Button with Shadcn styling */}
            <button
              id="create-project-btn"
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 font-sans font-medium text-xs tracking-wide bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-150 dark:hover:bg-slate-200 dark:text-slate-950 shadow-sm active:scale-98 rounded-lg transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.createNewProject}</span>
            </button>
          </div>
        </div>
        </div>

        {/* Description */}
        <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-2.5 font-medium font-sans max-w-2xl">
          {language === 'en' 
            ? 'Intuitive site expense ledger, cost sharing calculations and settlements' 
            : language === 'fr'
            ? 'Grille de dépenses intuitive, répartition des coûts par membre et solutions'
            : 'دفتر مصاريف الموقع السلس، حسابات تقاسم التكاليف والتسويات'}
        </p>
      </div>
      
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
            onOpenNotifications={() => setShowNotifications(true)}
            onCreateProject={() => setShowCreateModal(true)}
            onOpenProfile={() => window.dispatchEvent(new CustomEvent('open_profile_settings'))}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />
        )}
      </AnimatePresence>

      {/* Notifications Panel (Extracted out of desktop-only wrapper) */}
      <AnimatePresence>
        {showNotifications && (
          <motion.div 
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="fixed top-16 right-4 left-4 lg:left-auto z-[120] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl overflow-hidden text-left sm:w-80 h-auto max-h-[80vh] flex flex-col"
            id="notifications-panel"
          >
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 flex justify-between items-center shrink-0">
              <h4 className="font-display font-semibold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-sky-500" />
                {t.notifications}
              </h4>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button 
                    onClick={handleMarkAllRead}
                    className="text-[10px] text-sky-600 hover:underline font-semibold cursor-pointer"
                  >
                    {language === 'en' ? "Mark all read" : language === 'fr' ? "Tout marquer lu" : "تحديد الكل كمقروء"}
                  </button>
                )}
                <button onClick={() => setShowNotifications(false)} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer transition-colors rounded-sm ml-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 flex-1">
              {/* Real-time pending collaboration invitations */}
              {invitations.map(invite => (
                <div key={invite.id} className="p-3 bg-indigo-50/30 dark:bg-indigo-950/25 border-b border-indigo-100/50 dark:border-indigo-900/40 text-xs">
                  <div className="flex justify-between items-start gap-1">
                    <p className="font-semibold text-indigo-700 dark:text-indigo-400 font-sans flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-indigo-505" />
                      {language === 'en' ? 'Collaborate Request' : language === 'fr' ? 'Demande de Collaboration' : 'طلب انضمام للمشروع'}
                    </p>
                    <span className="text-[9px] font-mono font-bold uppercase text-slate-400 bg-slate-100 dark:bg-slate-850 px-1 rounded-sm">{invite.role}</span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 mt-1.5 leading-relaxed font-sans">
                    <strong>{invite.ownerName || invite.ownerEmail}</strong> invited you to collaborate on <strong>{invite.projectName}</strong>.
                  </p>
                  <div className="flex items-center gap-2 mt-2.5">
                    <button
                      onClick={() => onAcceptInvitation(invite)}
                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-sans font-semibold text-[10px] rounded-md shadow-xs active:scale-95 transition-all cursor-pointer"
                    >
                      {language === 'en' ? 'Accept' : language === 'fr' ? 'Accepter' : 'قبول'}
                    </button>
                    <button
                      onClick={() => onDeclineInvitation(invite)}
                      className="px-2.5 py-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-350 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-sans font-medium text-[10px] rounded-md active:scale-95 transition-all cursor-pointer"
                    >
                      {language === 'en' ? 'Decline' : language === 'fr' ? 'Refuser' : 'رفض'}
                    </button>
                  </div>
                </div>
              ))}

              {notifications.length === 0 && invitations.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs">
                  {language === 'en' ? 'No recent notifications.' : language === 'fr' ? 'Aucune notification.' : 'لا توجد إشعارات حديثة.'}
                </div>
              ) : (
                notifications.map(notif => (
                  <div 
                    key={notif.id} 
                    className={`p-3 text-xs transition-all ${notif.read ? 'opacity-70 bg-transparent' : 'bg-sky-50/30 dark:bg-sky-950/10'}`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <p className="font-semibold text-slate-800 dark:text-slate-200 font-sans">{notif.projectName}</p>
                      <span className="text-[9px] font-mono text-slate-405">{notif.timestamp}</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400 mt-1 leading-relaxed font-sans">{notif.text}</p>
                    {!notif.read && (
                      <button
                        onClick={() => handleMarkNotificationRead(notif.id)}
                        className="mt-1.5 text-[10px] text-sky-600 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                      >
                        <CheckCircle2 className="w-3 h-3 text-sky-500" />
                        {language === 'en' ? 'Dismiss' : language === 'fr' ? 'Ignorer' : 'تجاهل'}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
              / {projects.length} {language === "en" ? "total" : language === "fr" ? "au total" : "إجمالي"}
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
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold text-lg text-slate-900 dark:text-white flex items-center gap-2">
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
            <div className="px-3.5 py-1.5 rounded-lg bg-sky-500/5 dark:bg-slate-900/60 text-xs text-sky-700 dark:text-sky-305 border border-sky-100 dark:border-sky-950/40 flex justify-between items-center font-mono">
              <span>{language === 'en' ? `Filtered by: "${searchQuery}"` : language === 'fr' ? `Filtré par: "${searchQuery}"` : `تصفية بواسطة: "${searchQuery}"`}</span>
              <button onClick={() => setSearchQuery('')} className="underline hover:no-underline font-semibold cursor-pointer">
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
                onClick={() => setSearchQuery('')}
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
                  {filteredProjects.map((project) => {
                    const totalSpent = project.expenses.reduce((s, e) => s + e.amount, 0);
                    const progressPct = project.tasks.length > 0
                      ? Math.round((project.tasks.filter(t => t.status === 'completed').length / project.tasks.length) * 100)
                      : 0;

                    return (
                      <tr
                        key={project.id}
                        onClick={() => onSelectProject(project.id)}
                        className="group hover:bg-slate-50/60 dark:hover:bg-slate-950/40 transition-all cursor-pointer text-xs"
                      >
                        <td className="py-3.5 px-4 font-sans max-w-[240px]">
                          <div className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-450 transition-colors truncate">
                            {project.name}
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredProjects.map((project) => {
                const totalSpent = project.expenses.reduce((s, e) => s + e.amount, 0);
                const progressPct = project.tasks.length > 0
                  ? Math.round((project.tasks.filter(t => t.status === 'completed').length / project.tasks.length) * 100)
                  : 0;

                return (
                  <div
                    key={project.id}
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

                      <h4 className="font-sans font-semibold text-sm text-slate-900 dark:text-white hover:text-sky-600 transition-colors">
                        {project.name}
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
                  </div>
                );
              })}
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
            <div className="flow-root">
              <ul className="space-y-4">
                {activities.map((act) => (
                  <li key={act.id} className="relative flex items-start gap-2.5">
                    <div className="mt-0.5 h-6 w-6 rounded-md bg-slate-100 dark:bg-slate-850 border border-slate-100 dark:border-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-705 dark:text-slate-300 tracking-wider">
                      {act.userName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-normal">
                        <span className="font-semibold text-slate-900 dark:text-white">{act.userName}</span> {act.actionDetails}
                      </p>
                      <span className="text-[9px] font-mono text-slate-400 block mt-0.5">
                        <Clock className="w-2.5 h-2.5 inline mr-1" />
                        {act.timestamp}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* New Project Dialog Modal (Shadcn style with dark mode overlay) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs px-4" id="create-modal">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 rounded-xl shadow-2xl p-5 text-left transform duration-300 font-sans">
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
                    {language === 'en' ? 'Budget Limit' : language === 'fr' ? 'Limite du Budget' : 'الحد الأقصى للميزانية'}
                  </label>
                  <input
                    type="number"
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-905 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400 font-mono"
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

              <div className="grid grid-cols-2 gap-3">
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
          </div>
        </div>
      )}
    </div>
  );
}

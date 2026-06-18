import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Settings, 
  Users, 
  DollarSign, 
  CheckSquare, 
  Plus, 
  Trash2, 
  Check, 
  Calendar, 
  MapPin, 
  User as UserIcon, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  X,
  CreditCard,
  PlusCircle,
  HelpCircle,
  TrendingUp,
  Sliders,
  ChevronRight,
  ShieldAlert,
  Search,
  Filter,
  Moon,
  Sun,
  FileText,
  Printer,
  Download,
  Building,
  Menu
} from 'lucide-react';
import { 
  Project, 
  Expense, 
  Task, 
  Subtask, 
  UserRole, 
  ExpenseCategory, 
  Language, 
  TimelineActivity,
  Reimbursement,
  Invitation,
  ProjectMember
} from '../types';
import { TRANSLATIONS, calculateSettlements } from '../utils/mockData';
import { useAuth } from '../lib/AuthContext';
import { 
  getProjectFromDB, 
  saveProjectToDB, 
  saveActivityToDB, 
  saveNotificationToDB,
  subscribeToProject,
  findUserProfile,
  sendProjectInvitation,
  pushNotificationByEmail
} from '../lib/db';

interface ProjectDetailProps {
  projectId: string;
  onBack: () => void;
  language: Language;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export default function ProjectDetail({ 
  projectId, 
  onBack, 
  language, 
  theme, 
  onThemeToggle,
  sidebarOpen = false,
  onToggleSidebar
}: ProjectDetailProps) {
  const { user } = useAuth();
  const t = TRANSLATIONS[language];

  // Load and state track active project
  const [project, setProject] = useState<Project | null>(null);
  
  // Tab Switcher state
  const [activeTab, setActiveTab] = useState<'overview' | 'expenses' | 'tasks' | 'docs'>('overview');

  // Modal displays
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Add Expense form states
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState<number>(0);
  const [expenseCat, setExpenseCat] = useState<ExpenseCategory>('materials');
  const [expensePaidBy, setExpensePaidBy] = useState('');
  const [expenseSupplier, setExpenseSupplier] = useState('');
  const [expenseNotes, setExpenseNotes] = useState('');

  // Add Task form states
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskAssignedTo, setTaskAssignedTo] = useState('');
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [taskDeadline, setTaskDeadline] = useState('');
  
  // Custom member states
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<UserRole>('contributor');
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  const [memberSearchError, setMemberSearchError] = useState<string | null>(null);

  // Edit Project settings states
  const [editName, setEditName] = useState('');
  const [editClient, setEditClient] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editBudget, setEditBudget] = useState(0);
  const [editCurrency, setEditCurrency] = useState('');
  const [editStatus, setEditStatus] = useState<Project['status']>('in_progress');

  // Expense search & filters
  const [expenseQuery, setExpenseQuery] = useState('');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<string>('all');
  const [expensePaidByFilter, setExpensePaidByFilter] = useState<string>('all');

  // Intelligent dynamic Invoice / Recu / Bon generator states
  const [docType, setDocType] = useState<'invoice' | 'receipt' | 'voucher'>('invoice');
  const [docNumber, setDocNumber] = useState(`FAC-${new Date().getFullYear()}-${Math.floor(100+Math.random()*900)}`);
  const [docDate, setDocDate] = useState(new Date().toISOString().split('T')[0]);
  const [docDueDate, setDocDueDate] = useState(new Date(Date.now() + 15 * 24 * 60 * 60 * 1056).toISOString().split('T')[0]);
  const [docLogo, setDocLogo] = useState<string | null>(null);
  const [docPaperFormat, setDocPaperFormat] = useState<'A4' | 'A5'>('A4');
  
  const [docSenderName, setDocSenderName] = useState('BuildTrack Civil Engineering & Reno');
  const [docSenderEmail, setDocSenderEmail] = useState('contact@buildtrack.ma');
  const [docSenderPhone, setDocSenderPhone] = useState('+212 539-948833');
  const [docSenderAddress, setDocSenderAddress] = useState('Rue de Fès, Tanger, Maroc');

  const [docClientName, setDocClientName] = useState('');
  const [docClientEmail, setDocClientEmail] = useState('');
  const [docClientAddress, setDocClientAddress] = useState('');

  const [docTaxRate, setDocTaxRate] = useState<number>(20); // standard Moroccan 20% TVA
  const [docNotes, setDocNotes] = useState('');

  // Items included in the printed sheet
  const [docItems, setDocItems] = useState<{ id: string; description: string; quantity: number; unitPrice: number }[]>([]);

  // Item builder fields
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemPrice, setNewItemPrice] = useState(0);

  const handleToggleExpenseIntoDoc = (expense: Expense) => {
    const exists = docItems.find(item => item.id === expense.id || item.description.includes(expense.title));
    if (exists) {
      setDocItems(docItems.filter(item => item.id !== expense.id && !item.description.includes(expense.title)));
    } else {
      const parsedItem = {
        id: expense.id,
        description: `${expense.title} (${language === 'en' ? 'Ref expense' : language === 'fr' ? 'Réf' : 'المرجع'}${expense.supplier ? ` - ${expense.supplier}` : ''})`,
        quantity: 1,
        unitPrice: expense.amount
      };
      setDocItems([...docItems, parsedItem]);
    }
  };

  const handleRemoveDocItem = (id: string) => {
    setDocItems(docItems.filter(item => item.id !== id));
  };

  useEffect(() => {
    if (!projectId) return;

    // Utilize subscribeToProject for automatic real-time synchronization between members
    const unsubscribe = subscribeToProject(projectId, (found) => {
      if (found) {
        setProject(found);
        
        // Prep edit states
        setEditName(found.name);
        setEditClient(found.clientName);
        setEditAddress(found.address);
        setEditDesc(found.description);
        setEditBudget(found.budget);
        setEditCurrency(found.currency);
        setEditStatus(found.status);

        // Prep generator defaults from project
        setDocClientName(found.clientName || '');
        setDocClientAddress(found.address || '');
        setDocClientEmail('client.renovation@gmail.com');
        setDocNotes(language === 'en' ? 'Thank you for your construction business cooperation!' : language === 'fr' ? 'La prestation de services. Merci pour votre collaboration !' : 'شكراً لتعاونكم!');

        // Prep form select defaults
        if (found.members.length > 0) {
          setExpensePaidBy(found.members[0].email);
          setTaskAssignedTo(found.members[0].email);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [projectId, language]);

  if (!project) {
    return (
      <div className="p-12 text-center text-slate-500 font-sans">
        {language === 'en' ? 'Scanning Project Workspace...' : language === 'fr' ? 'Chargement de l\'espace projet...' : 'جاري فحص مساحة عمل المشروع...'}
      </div>
    );
  }

  // Cost and dues calculations (respecting reimbursements inside calculateSettlements)
  const { totalSpent, paidMap, expectedShares, settlements } = calculateSettlements(project);

  const userEmail = (user?.email || '').toLowerCase();
  const memberContext = project.members.find(m => m.email.toLowerCase() === userEmail);
  const userRole = memberContext ? memberContext.role : (project.creatorEmail.toLowerCase() === userEmail ? 'owner' : 'read-only');

  const canModifyProject = userRole === 'owner' || userRole === 'manager';
  const canManageMembers = userRole === 'owner' || userRole === 'manager';
  const canAddExpenses = userRole === 'owner' || userRole === 'manager' || userRole === 'editor';
  const canAddTasks = userRole === 'owner' || userRole === 'manager' || userRole === 'editor' || userRole === 'contributor';

  // Sync state back to Firebase
  const syncProjectChanges = async (updatedProj: Project) => {
    setProject(updatedProj);
    if (!user?.uid) return;
    try {
      await saveProjectToDB(user.uid, updatedProj);
      window.dispatchEvent(new Event('storage'));
    } catch (e) {
      console.error(e);
    }
  };

  const trackActivity = async (type: TimelineActivity['actionType'], details: string) => {
    if (!user?.uid || !project) return;
    const newAct: TimelineActivity = {
      id: `act_${Date.now()}`,
      projectId: project.id,
      userEmail: user.email || 'system',
      userName: user.displayName || 'System',
      actionType: type,
      actionDetails: details,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16)
    };
    try {
      await saveActivityToDB(user.uid, newAct);
    } catch (e) {
      console.error(e);
    }
  };

  // Add Expense
  const handleAddExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseTitle.trim() || expenseAmount <= 0) return;

    const newExp: Expense = {
      id: `exp_${Date.now()}`,
      title: expenseTitle.trim(),
      description: expenseDesc.trim() || "No details provided.",
      amount: Number(expenseAmount),
      currency: project.currency,
      category: expenseCat,
      date: new Date().toISOString().split('T')[0],
      paidBy: expensePaidBy || project.members.find(m => m.status === 'accepted' || !m.status)?.email || project.members[0]?.email || 'relhaskouri2@gmail.com',
      supplier: expenseSupplier.trim() || t.dashboard,
      receipts: []
    };

    const isOverBudget = (totalSpent + newExp.amount) > project.budget;

    const updated = {
      ...project,
      expenses: [...project.expenses, newExp]
    };
    syncProjectChanges(updated);
    trackActivity('expense_added', `Logged expense: "${newExp.title}" paid by ${project.members.find(m => m.email === newExp.paidBy)?.name || newExp.paidBy} (${newExp.amount.toLocaleString()} ${project.currency}).`);
    
    // Trigger notification if budget exceeded
    if (isOverBudget) {
      if (user?.uid) {
        try {
          const alarmTimestamp = Date.now();
          await saveNotificationToDB(user.uid, 'alert', `alarm_${alarmTimestamp}`, alarmTimestamp, {
            projectId: project.id,
            projectName: project.name,
            text: `Budget cap of ${project.budget.toLocaleString()} ${project.currency} was exceeded! Spent: ${(totalSpent + newExp.amount).toLocaleString()} ${project.currency}.`,
            read: false,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
            type: 'alert'
          });
        } catch(e) { console.error(e) }
      }
    }

    // Reset Form
    setExpenseTitle('');
    setExpenseDesc('');
    setExpenseAmount(0);
    setExpenseSupplier('');
    setExpenseNotes('');
    setShowAddExpense(false);
  };

  // Delete Expense
  const handleDeleteExpense = (expId: string) => {
    const item = project.expenses.find(e => e.id === expId);
    const filtered = project.expenses.filter(e => e.id !== expId);
    syncProjectChanges({ ...project, expenses: filtered });
    if (item) {
      trackActivity('expense_added', `Removed expense ledger item: "${item.title}".`);
    }
  };

  // Add Reimbursement / Settle Debt
  const handleRecordReimbursement = (from: string, to: string, amount: number) => {
    const fromMember = project.members.find(m => m.email === from);
    const toMember = project.members.find(m => m.email === to);

    const newReimb: Reimbursement = {
      id: `reimb_${Date.now()}`,
      from,
      fromName: fromMember ? fromMember.name : from,
      to,
      toName: toMember ? toMember.name : to,
      amount: Math.round(amount * 100) / 100,
      date: new Date().toISOString().split('T')[0]
    };

    const updatedProj = {
      ...project,
      reimbursements: [...(project.reimbursements || []), newReimb]
    };

    syncProjectChanges(updatedProj);
    trackActivity('expense_added', `Settled payment dues: ${newReimb.fromName} paid ${newReimb.toName} (${newReimb.amount.toLocaleString()} ${project.currency}).`);
  };

  // Undo / Delete Reimbursement
  const handleDeleteReimbursement = (id: string) => {
    const target = (project.reimbursements || []).find(r => r.id === id);
    const filtered = (project.reimbursements || []).filter(r => r.id !== id);
    syncProjectChanges({ ...project, reimbursements: filtered });
    if (target) {
      trackActivity('expense_added', `Cancelled recorded settlement reimbursement: ${target.fromName} to ${target.toName}.`);
    }
  };

  // Add Partner Workspace Member with Profile Checking and Real-time Invitations
  const handleAddMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberEmail.trim()) return;

    setMemberSearchLoading(true);
    setMemberSearchError(null);

    try {
      const queryStr = newMemberEmail.trim();
      let targetEmail = queryStr.toLowerCase();
      let targetName = targetEmail.split('@')[0];

      // 1. Query registered user profiles
      const foundProfile = await findUserProfile(queryStr);
      if (foundProfile) {
        targetEmail = (foundProfile.email || targetEmail).toLowerCase();
        targetName = foundProfile.fullName || targetName;
      }

      // 2. Prevent duplicate entries
      const emailInUse = project.members.some(m => m.email.toLowerCase() === targetEmail);
      if (emailInUse) {
        setMemberSearchError("This collaborator is already registered inside this project workspace.");
        setMemberSearchLoading(false);
        return;
      }

      // 3. Create a member with Pending status
      const pendingMember: ProjectMember = {
        email: targetEmail,
        name: targetName,
        role: newMemberRole,
        status: 'pending',
        avatar: foundProfile?.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(targetName)}&backgroundColor=0284c7`
      };

      const updatedProj = {
        ...project,
        members: [...project.members, pendingMember]
      };

      // 4. Save project synchronously
      await syncProjectChanges(updatedProj);

      // 5. Send invitation
      const inviteId = `invite_${Date.now()}`;
      const invitation: Invitation = {
        id: inviteId,
        projectId: project.id,
        projectName: project.name,
        ownerEmail: (user?.email || '').toLowerCase(),
        ownerName: user?.displayName || 'Project Architect',
        inviteeEmail: targetEmail,
        role: newMemberRole,
        status: 'pending',
        timestamp: new Date().toISOString()
      };
      await sendProjectInvitation(invitation);

      // 6. Push notification to invitee
      await pushNotificationByEmail(targetEmail, 'info', project.id, {
        projectName: project.name,
        text: `You have received an invitation from ${user?.displayName || user?.email} to collaborate on "${project.name}" as ${newMemberRole}.`,
        read: false,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });

      trackActivity('member_joined', `Sent collaboration invitation to ${targetName} (${targetEmail}) as ${newMemberRole}.`);

      // Reset
      setNewMemberEmail('');
      setNewMemberName('');
      setNewMemberRole('contributor');
      setShowAddMember(false);
    } catch (err) {
      console.error(err);
      setMemberSearchError("Error searching global directory. Please verify input user info.");
    } finally {
      setMemberSearchLoading(false);
    }
  };

  // Delete Project Partner
  const handleRemoveMember = async (email: string) => {
    if (email.toLowerCase() === project.creatorEmail.toLowerCase()) {
      alert("Cannot remove the primary project architect / owner.");
      return;
    }
    const filtered = project.members.filter(m => m.email.toLowerCase() !== email.toLowerCase());
    await syncProjectChanges({ ...project, members: filtered });
    trackActivity('member_joined', `Removed project partner: ${email}.`);
  };

  // Task Operations
  const handleAddTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    const newTsk: Task = {
      id: `tsk_${Date.now()}`,
      title: taskTitle.trim(),
      description: taskDesc.trim() || "No details provided.",
      assignedTo: taskAssignedTo || project.members.find(m => m.status === 'accepted' || !m.status)?.email || project.members[0]?.email || 'relhaskouri2@gmail.com',
      priority: taskPriority,
      deadline: taskDeadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1050).toISOString().split('T')[0],
      status: 'pending',
      subtasks: []
    };

    const updated = {
      ...project,
      tasks: [...project.tasks, newTsk]
    };
    syncProjectChanges(updated);
    trackActivity('task_updated', `Created roadmap task: "${newTsk.title}" assigned to ${project.members.find(m => m.email === newTsk.assignedTo)?.name || newTsk.assignedTo}.`);

    // Reset
    setTaskTitle('');
    setTaskDesc('');
    setTaskDeadline('');
    setTaskPriority('medium');
    setShowAddTask(false);
  };

  const updateTaskStatus = (taskId: string, status: Task['status']) => {
    const updatedTasks = project.tasks.map(t => {
      if (t.id === taskId) {
        return { ...t, status };
      }
      return t;
    });
    syncProjectChanges({ ...project, tasks: updatedTasks });
    trackActivity('task_updated', `Updated milestone status on task ledger.`);
  };

  const handleDeleteTask = (taskId: string) => {
    const filtered = project.tasks.filter(t => t.id !== taskId);
    syncProjectChanges({ ...project, tasks: filtered });
  };

  // Edit Project Settings
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;

    const updated = {
      ...project,
      name: editName,
      clientName: editClient,
      address: editAddress,
      description: editDesc,
      budget: Number(editBudget) || 10000,
      currency: editCurrency || 'DH',
      status: editStatus
    };

    syncProjectChanges(updated);
    trackActivity('status_changed', `Updated project parameters & settings.`);
    setShowSettings(false);
  };

  // Filtering expenses
  const filteredExpenses = project.expenses.filter(exp => {
    const qMatches = !expenseQuery ? true : (
      exp.title.toLowerCase().includes(expenseQuery.toLowerCase()) ||
      exp.description.toLowerCase().includes(expenseQuery.toLowerCase()) ||
      exp.supplier.toLowerCase().includes(expenseQuery.toLowerCase())
    );
    const cMatches = expenseCategoryFilter === 'all' ? true : exp.category === expenseCategoryFilter;
    const pMatches = expensePaidByFilter === 'all' ? true : exp.paidBy === expensePaidByFilter;

    return qMatches && cMatches && pMatches;
  });

  const percentSpent = Math.round((totalSpent / project.budget) * 100);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-12 md:py-6 md:mb-12 font-sans" id="project-workspace">
      
      {/* Top Breadcrumb Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-200 dark:border-slate-800 gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{language === 'en' ? "Back to Dashboard" : language === 'fr' ? "Retour au Tableau" : "العودة إلى اللوحة"}</span>
        </button>

        {/* Workspace Management Header */}
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider font-mono ${
            project.status === 'in_progress' ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/15 dark:text-amber-400' :
            project.status === 'completed' ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-905/15 dark:text-emerald-400' :
            'bg-slate-100 text-slate-805 dark:bg-slate-850 dark:text-slate-300'
          }`}>
            {t.status[project.status]}
          </span>

          {/* Theme Switcher Button */}
          <button
            id="detail-theme-toggler"
            onClick={onThemeToggle}
            className="hidden md:inline-flex p-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all cursor-pointer"
            title="Toggle Theme"
          >
            {theme === 'light' ? <Moon className="w-3.5 h-3.5 text-slate-500" /> : <Sun className="w-3.5 h-3.5 text-amber-400" />}
          </button>

          {/* User Profile trigger */}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open_profile_settings'))}
            className="h-7 w-7 rounded-md bg-sky-500 text-white flex items-center justify-center font-bold text-[10px] hover:bg-sky-400 active:scale-95 transition-all cursor-pointer ring-1 ring-slate-100 dark:ring-slate-800 shrink-0 select-none uppercase font-sans font-extrabold"
            title={language === 'en' ? 'Profile Settings' : language === 'fr' ? 'Configuration de Profil' : 'إعدادات الحساب'}
          >
            {user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U'}
          </button>

          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>{language === 'en' ? "Setup" : language === 'fr' ? "Réglages" : "إعدادات"}</span>
          </button>
        </div>
      </div>

      {/* Project Meta Head banner */}
      <div className="py-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
            {project.name}
          </h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center gap-1"><UserIcon className="w-3.5 h-3.5 text-sky-505" /> {language === "en" ? "Client" : "Client"}: {project.clientName}</span>
            <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-sky-505" /> {project.address}</span>
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-sky-505" /> {project.startDate}</span>
          </div>
        </div>

        {/* Spend progress status right panel */}
        <div className="w-full md:w-56 text-right">
          <div className="flex justify-between text-xs font-semibold mb-1">
            <span>{language === 'en' ? "Slipped Budget Limit" : language === 'fr' ? "Limite Utilisée" : "الحد المستخدم"}</span>
            <span className={`${percentSpent > 100 ? 'text-red-600 font-bold' : 'text-slate-900 dark:text-white font-mono'}`}>{percentSpent}%</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-300 ${percentSpent > 100 ? 'bg-red-500' : 'bg-slate-900 dark:bg-slate-50'}`}
              style={{ width: `${Math.min(100, percentSpent)}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-400 font-mono mt-1.5 block">
            {totalSpent.toLocaleString()} / {project.budget.toLocaleString()} {project.currency}
          </span>
        </div>
      </div>

      {/* Three Primary Stats Cards (Shadcn style dashboard indicators) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-1" id="project-kpis">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-slate-450 dark:text-slate-400 tracking-wider block">{language === 'en' ? "Project Budget" : language === 'fr' ? "Budget Alloué" : "الميزانية المخصصة"}</span>
          <div className="mt-1.5 flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-slate-900 dark:text-white">{project.budget.toLocaleString()}</span>
            <span className="text-[10px] text-slate-400 font-bold uppercase font-mono">{project.currency}</span>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-slate-450 dark:text-slate-400 tracking-wider block">{language === "en" ? "Cumulative Spent" : language === "fr" ? "Dépenses Cumulées" : "إجمالي المصروفات"}</span>
          <div className="mt-1.5 flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-slate-900 dark:text-white">{totalSpent.toLocaleString()}</span>
            <span className="text-[10px] text-slate-400 font-bold uppercase font-mono">{project.currency}</span>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 rounded-xl shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-slate-450 dark:text-slate-400 tracking-wider block">{language === 'en' ? "Remaining Capital" : language === 'fr' ? "Capital Restant" : "رأس المال المتبقي"}</span>
          <div className="mt-1.5 flex items-baseline gap-1">
            <span className={`text-xl font-bold font-mono ${(project.budget - totalSpent) < 0 ? 'text-red-500 font-black' : 'text-slate-900 dark:text-white'}`}>
              {(project.budget - totalSpent).toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-400 font-bold uppercase font-mono">{project.currency}</span>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-slate-450 dark:text-slate-400 tracking-wider block">{language === 'en' ? "Equal Partner Share" : language === 'fr' ? "Quote-part par Membre" : "حصة العضو المتساوية"}</span>
          <div className="mt-1.5 flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-slate-904 dark:text-white">
              {Math.round(expectedShares[project.members[0]?.email] || 0).toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-400 font-bold uppercase font-mono">{project.currency}</span>
          </div>
        </div>
      </div>

      {/* Tabs navigation list with Shadcn styles */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 mt-8 gap-4 mb-6">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            activeTab === 'overview' 
              ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white' 
              : 'border-transparent text-slate-450 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          {language === 'en' ? 'Overview & Cost Split' : language === 'fr' ? 'Résumé & Partage' : 'نظرة عامة'}
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`pb-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            activeTab === 'expenses' 
              ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white' 
              : 'border-transparent text-slate-450 hover:text-slate-805 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          {language === 'en' ? 'Expenses Ledger' : language === 'fr' ? 'Dépenses' : 'المصروفات'}
        </button>
        <button
          onClick={() => setActiveTab('tasks')}
          className={`pb-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            activeTab === 'tasks' 
              ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white' 
              : 'border-transparent text-slate-450 hover:text-slate-805 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          {language === 'en' ? 'Roadmap' : language === 'fr' ? 'Tâches' : 'المسار الزمني'}
        </button>
        <button
          onClick={() => setActiveTab('docs')}
          className={`pb-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            activeTab === 'docs' 
              ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white' 
              : 'border-transparent text-slate-450 hover:text-slate-805 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          {language === 'en' ? 'Invoices & Vouchers' : language === 'fr' ? 'Factures & Bons' : 'فواتير وإيصالات'}
        </button>
      </div>

      {/* TAB CONTENT: OVERVIEW & COST SPLITTING */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-none">
          
          {/* Members / Who Paid What Visual Progress Bars (2 cols wide on large) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 p-5 rounded-xl">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center justify-between mb-4">
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-sky-505" />
                  {language === 'en' ? 'Accumulated Expenditure per Member' : language === 'fr' ? 'Total payé par membre' : 'إجمالي النفقات لكل عضو'}
                </span>
                <span className="font-mono text-[10.5px] text-slate-400 font-semibold">{project.members.length} {language === "en" ? "Partakers" : language === "fr" ? "Membres" : "أعضاء"}</span>
              </h3>

              {/* Each Member's contribution progress grid */}
              <div className="space-y-4">
                {project.members.filter(m => m.status === 'accepted' || !m.status).map((member) => {
                  const amtPaid = paidMap[member.email] || 0;
                  const targetShare = expectedShares[member.email] || 0;
                  const balance = amtPaid - targetShare;

                  // High contrast bar share representation
                  const progressWidth = totalSpent > 0 ? (amtPaid / totalSpent) * 100 : 0;

                  return (
                    <div key={member.email} className="text-xs">
                      <div className="flex justify-between items-center mb-1 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-slate-850">
                        <div className="flex items-center gap-2">
                          <div className="h-5 w-5 rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-black flex items-center justify-center font-bold text-[9px]">
                            {member.name.charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-slate-900 dark:text-white">{member.name}</span>
                              <span className="text-[9px] font-semibold text-slate-400 font-mono leading-none">({member.role})</span>
                              {member.status === 'pending' && (
                                <span className="text-[8px] bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 px-1 py-0.5 rounded font-mono font-bold uppercase tracking-wider select-none">
                                  {language === 'en' ? 'Pending' : language === 'fr' ? 'En attente' : 'معلق'}
                                </span>
                              )}
                              {member.status === 'declined' && (
                                <span className="text-[8px] bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400 px-1 py-0.5 rounded font-mono font-bold uppercase tracking-wider select-none">
                                  {language === 'en' ? 'Declined' : language === 'fr' ? 'Refusé' : 'مرفوض'}
                                </span>
                              )}
                            </div>
                            <span className="text-[9.5px] text-slate-400 block font-mono lowercase mt-0.5">{member.email}</span>
                          </div>
                        </div>

                        {/* Financial summary: Paid vs Balance owed */}
                        <div className="text-right">
                          <span className="font-semibold font-mono text-slate-900 dark:text-white">{amtPaid.toLocaleString()} {project.currency}</span>
                          <span className="text-[10px] text-slate-400 block font-sans">
                            {balance >= 0 ? (
                              <span className="text-emerald-600 font-bold flex items-center justify-end gap-0.5">
                                +{Math.round(balance).toLocaleString()} {language === 'en' ? 'surplus' : language === 'fr' ? 'de trop' : 'فائض'}
                              </span>
                            ) : (
                              <span className="text-red-500 font-bold flex items-center justify-end gap-0.5">
                                {Math.round(balance).toLocaleString()} {language === 'en' ? 'due' : language === 'fr' ? 'dû' : 'مستحق'}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Bar tracker */}
                      <div className="w-full bg-slate-100 dark:bg-slate-850 h-2.5 rounded-full overflow-hidden mt-1 mb-2.5">
                        <div 
                          className="bg-slate-900 dark:bg-slate-100 h-full rounded-full transition-all duration-300"
                          style={{ width: `${progressWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Past recorded Settlement Reimbursements */}
            {(project.reimbursements && project.reimbursements.length > 0) && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
                <h3 className="font-bold text-sm text-slate-905 dark:text-white flex items-center gap-1.5 mb-3">
                  <CreditCard className="w-4 h-4 text-emerald-500" />
                  {language === 'en' ? 'Recorded Reimbursements & Settlements' : language === 'fr' ? 'Remboursements Enregistrés' : 'الاستردادات والتسويات المسجلة'}
                </h3>
                <div className="divide-y divide-slate-100 dark:divide-slate-850 max-h-56 overflow-y-auto">
                  {project.reimbursements.map((r) => (
                    <div key={r.id} className="py-2.5 flex justify-between items-center text-xs">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">
                          <span className="font-semibold">{r.fromName}</span> {language === 'en' ? 'reimbursed' : language === 'fr' ? 'a remboursé' : 'قام بسداد'} <span className="font-semibold">{r.toName}</span>
                        </p>
                        <span className="text-[10px] text-slate-400 font-mono font-medium block">{r.date}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100 bg-emerald-500/10 text-emerald-600 px-2.5 py-0.5 rounded-md">
                          +{r.amount.toLocaleString()} {project.currency}
                        </span>
                        <button
                          onClick={() => handleDeleteReimbursement(r.id)}
                          className="p-1 text-slate-400 hover:text-red-500 hover:bg-slate-50 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer"
                          title="Delete recorded settlement"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Smart Splitwise Settlement Advice */}
          <div className="space-y-6">
            {/* Settlements Solver Box */}
            <div className="bg-white dark:bg-slate-900 text-slate-950 dark:text-white rounded-xl p-5 border border-slate-200 dark:border-slate-805 relative shadow-md">
              <h3 className="font-bold text-sm flex items-center gap-1.5 mb-4 text-slate-900 dark:text-white">
                <CreditCard className="w-4 h-4 text-sky-500 dark:text-sky-400" />
                {language === 'en' ? 'Settle Balance Debt Advice' : language === 'fr' ? 'Calculateur d\'Équilibre' : 'نصيحة تسوية الديون'}
              </h3>

              {settlements.length === 0 ? (
                <div className="py-6 text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 dark:text-emerald-400 mx-auto" />
                  <p className="text-xs text-slate-700 dark:text-slate-200 mt-1.5 font-sans font-medium">
                    {language === 'en' ? 'All balances are perfectly settled!' : language === 'fr' ? 'Tous les comptes sont équilibrés !' : 'جميع الأرصدة مسواة بشكل مثالي!'}
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">No actions required.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600 dark:text-slate-350 leading-relaxed font-sans font-medium">
                    {language === 'en' 
                      ? 'The model automatically calculates the fewest cash payments to settle accounts:' 
                      : language === 'fr' 
                      ? 'La formule détermine la répartition la plus courte pour équilibrer les comptes:' 
                      : 'يحسب النموذج تلقائياً أقل عدد من الدفعات النقدية لتسوية الحسابات بين الشركاء:'}
                  </p>
                  
                  <div className="space-y-2.5 pt-2">
                    {settlements.map((s, idx) => (
                      <div 
                        key={idx} 
                        className="p-3 bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-850 rounded-lg flex flex-col justify-between gap-2.5 text-xs font-sans"
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-slate-800 dark:text-slate-200">{s.fromName}</span>
                          <span className="text-[9.5px] font-mono text-slate-400 dark:text-slate-500">{language === 'en' ? 'owes' : language === 'fr' ? 'doit' : 'مدين لـ'}</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">{s.toName}</span>
                        </div>
                        <div className="flex justify-between items-center pt-1.5 border-t border-slate-200 dark:border-slate-800/60">
                          <span className="font-mono font-bold text-xl text-sky-600 dark:text-sky-400">{s.amount.toLocaleString()} {project.currency}</span>
                          {canManageMembers && (
                            <button
                              onClick={() => handleRecordReimbursement(s.from, s.to, s.amount)}
                              className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 text-white dark:text-slate-950 font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer shadow-sm animate-none"
                            >
                              {language === 'en' ? "Record Settle" : language === 'fr' ? "Remit" : "تسجيل الدفع"}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Inline Partner Manager Box */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 p-5 rounded-xl mt-6">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-sky-400" />
                  {language === 'en' ? 'Project Partners' : language === 'fr' ? 'Membres Partenaires' : 'شركاء المشروع'}
                </h3>
                {canManageMembers && (
                  <button
                    onClick={() => {
                      setMemberSearchError(null);
                      setShowAddMember(!showAddMember);
                    }}
                    className="p-1 rounded-md text-sky-600 hover:bg-slate-50 dark:hover:bg-slate-805 transition-all text-xs cursor-pointer flex items-center gap-0.5 font-semibold animate-none"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>{language === 'en' ? 'Invite' : language === 'fr' ? 'Inviter' : 'دعوة'}</span>
                  </button>
                )}
              </div>

              {showAddMember && canManageMembers && (
                <form onSubmit={handleAddMemberSubmit} className="space-y-3 p-3 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-100 dark:border-slate-850 mb-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {language === 'en' ? 'Invite Collaborator' : language === 'fr' ? 'Inviter un collaborateur' : 'دعوة شريك للمشروع'}
                  </h4>
                  
                  <div>
                    <input
                      type="text"
                      required
                      disabled={memberSearchLoading}
                      placeholder={language === 'en' ? "Enter email or registered username" : language === 'fr' ? "Email ou pseudo..." : "أدخل البريد الإلكتروني أو اسم المستخدم..."}
                      value={newMemberEmail}
                      onChange={(e) => setNewMemberEmail(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      {language === 'en' ? "If the user is registered, their profile will be looked up instantly." : "سيتم فحص الملف الشخصي للمستخدم تلقائيًا."}
                    </p>
                  </div>

                  <div>
                    <select
                      value={newMemberRole}
                      disabled={memberSearchLoading}
                      onChange={(e) => setNewMemberRole(e.target.value as UserRole)}
                      className="w-full px-2 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-205 focus:outline-none font-semibold"
                    >
                      <option value="contributor">{language === 'en' ? 'Contributor (Add Expenses, Update Tasks)' : language === 'fr' ? 'Contributeur' : 'مساهم'}</option>
                      <option value="manager">{language === 'en' ? 'Manager (Admin Access)' : language === 'fr' ? 'Gestionnaire (Admin)' : 'مدير (أدمن)'}</option>
                      <option value="read_only">{language === 'en' ? 'Viewer (Read-only)' : language === 'fr' ? 'Lecteur (Lecture seule)' : 'مشاهد (للقراءة فقط)'}</option>
                    </select>
                  </div>

                  {memberSearchError && (
                    <p className="text-[11px] text-red-500 font-semibold">{memberSearchError}</p>
                  )}

                  <div className="flex justify-end gap-1.5 items-center">
                    {memberSearchLoading && (
                      <span className="text-[10px] text-slate-400 font-medium animate-pulse">
                        {language === 'en' ? 'Searching directory...' : 'جاري البحث...'}
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={memberSearchLoading}
                      onClick={() => setShowAddMember(false)}
                      className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-650 dark:text-slate-300 font-semibold rounded disabled:opacity-50"
                    >
                      {language === 'en' ? 'Cancel' : language === 'fr' ? 'Annuler' : 'إلغاء'}
                    </button>
                    <button
                      type="submit"
                      disabled={memberSearchLoading}
                      className="px-2.5 py-1 bg-sky-600 hover:bg-sky-550 text-white text-[10px] font-bold rounded disabled:opacity-50 shadow-xs"
                    >
                      {language === 'en' ? 'Send Invite' : language === 'fr' ? 'Inviter' : 'إرسال الدعوة'}
                    </button>
                  </div>
                </form>
              )}

              {/* Partners simple list */}
              <div className="divide-y divide-slate-100 dark:divide-slate-850">
                {project.members.map((m) => (
                  <div key={m.email} className="py-2.5 flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold font-mono uppercase text-[9px]">
                        {m.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-semibold text-slate-900 dark:text-white leading-none">{m.name}</p>
                          {m.status === 'pending' && (
                            <span className="text-[8px] bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 px-1 py-0.5 rounded font-mono font-bold uppercase tracking-wider animate-pulse leading-none">
                              {language === 'en' ? 'Invited' : 'Invité'}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 font-medium capitalize mt-0.5 block">{m.role.replace('_', ' ')}</span>
                      </div>
                    </div>
                    {canManageMembers && m.email.toLowerCase() !== project.creatorEmail.toLowerCase() && (
                      <button
                        onClick={() => handleRemoveMember(m.email)}
                        className="p-1 text-slate-350 hover:text-red-500 hover:bg-slate-50 dark:hover:bg-slate-850 rounded transition-colors cursor-pointer"
                        title="Remove member"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* TAB CONTENT: DETAILED EXPENSES LEDGER */}
      {activeTab === 'expenses' && (
        <div className="space-y-6 animate-none">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 p-5 rounded-xl">
            
            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 dark:border-slate-850 mb-4 gap-3">
              <h3 className="font-bold text-sm text-slate-905 dark:text-white flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-sky-505" />
                {language === 'en' ? 'Project Expense Ledger' : language === 'fr' ? 'Ledger des Dépenses' : 'سجل نفقات المشروع'}
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold ml-1">
                  {filteredExpenses.length}
                </span>
              </h3>

              <div className="flex flex-wrap items-center gap-2">
                {canAddExpenses && (
                  <button
                    onClick={() => setShowAddExpense(true)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-950 transition-all cursor-pointer shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{language === 'en' ? 'Add Expense' : language === 'fr' ? 'Ajouter dépense' : 'إضافة مصروف'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Searching Filters widget */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6 bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl border border-slate-100 dark:border-slate-850">
              {/* Query search */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400">
                  <Search className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  placeholder={language === 'en' ? "Search item name or supplier..." : language === 'fr' ? "Rechercher..." : "البحث عن..."}
                  value={expenseQuery}
                  onChange={(e) => setExpenseQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1 text-xs rounded border border-slate-200 dark:border-slate-808 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              {/* Category filter */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400 shrink-0 select-none"><Filter className="w-3.5 h-3.5 inline" /></span>
                <select
                  value={expenseCategoryFilter}
                  onChange={(e) => setExpenseCategoryFilter(e.target.value)}
                  className="w-full p-1 text-xs rounded border border-slate-200 dark:border-slate-808 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none"
                >
                  <option value="all">{language === 'en' ? 'All Categories' : language === 'fr' ? 'Toutes Catégories' : 'كل الفئات'}</option>
                  <option value="materials">{t.categories.materials}</option>
                  <option value="workers">{t.categories.workers}</option>
                  <option value="equipment">{t.categories.equipment}</option>
                  <option value="transportation">{t.categories.transportation}</option>
                  <option value="miscellaneous">{t.categories.miscellaneous}</option>
                </select>
              </div>

              {/* Paid by filters */}
              <div className="flex items-center gap-1 text-xs">
                <select
                  value={expensePaidByFilter}
                  onChange={(e) => setExpensePaidByFilter(e.target.value)}
                  className="w-full p-1 text-xs rounded border border-slate-200 dark:border-slate-808 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none animate-none"
                >
                  <option value="all">{language === 'en' ? 'All Payers' : language === 'fr' ? 'Tous Payeurs' : 'كل الدافعين'}</option>
                  {project.members.filter(m => m.status === 'accepted' || !m.status).map(m => (
                    <option key={m.email} value={m.email}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Expenses List Table */}
            {filteredExpenses.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                {language === 'en' ? 'No expense ledger items found.' : language === 'fr' ? 'Aucun frais trouvé.' : 'لا توجد عناصر في سجل النفقات.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-650 dark:text-slate-300">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-850 font-bold uppercase tracking-wider text-slate-450 text-[10px]">
                      <th className="py-2.5">{language === 'en' ? 'Date' : language === 'fr' ? 'Date' : 'التاريخ'}</th>
                      <th className="py-2.5">{language === 'en' ? 'Title / Sourced From' : language === 'fr' ? 'Titre / Fournisseur' : 'العنوان / المورد'}</th>
                      <th className="py-2.5">{language === 'en' ? 'Category' : language === 'fr' ? 'Catégorie' : 'الفئة'}</th>
                      <th className="py-2.5">{language === 'en' ? 'Sender / Paid By' : language === 'fr' ? 'Payeur' : 'الدافع'}</th>
                      <th className="py-2.5 text-right">{language === 'en' ? 'Raw Amount' : language === 'fr' ? 'Montant' : 'المبلغ الأولي'}</th>
                      <th className="py-2.5 text-right font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                    {filteredExpenses.map((exp) => {
                      const payer = project.members.find(m => m.email === exp.paidBy);
                      return (
                        <tr key={exp.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-850/20 transition-colors">
                          <td className="py-3 font-mono text-[10.5px] text-slate-400">{exp.date}</td>
                          <td className="py-3 pr-2">
                            <p className="font-semibold text-slate-900 dark:text-white text-xs">{exp.title}</p>
                            <span className="text-[10px] text-slate-400 font-medium block">{exp.supplier} · {exp.description}</span>
                          </td>
                          <td className="py-3">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-850 text-[9.5px] text-slate-600 dark:text-slate-350 tracking-wide font-medium">
                              {t.categories[exp.category]}
                            </span>
                          </td>
                          <td className="py-3">
                            <p className="font-medium text-slate-800 dark:text-slate-205">{payer ? payer.name : exp.paidBy}</p>
                          </td>
                          <td className="py-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                            {exp.amount.toLocaleString()} <span className="text-[10px] text-slate-400">{project.currency}</span>
                          </td>
                          <td className="py-3 text-right">
                            <button
                              onClick={() => handleDeleteExpense(exp.id)}
                              className="p-1 text-slate-350 hover:text-red-500 hover:bg-slate-50 dark:hover:bg-slate-800 rounded transition"
                              title="Delete task item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: ROADMAP & CHECKLIST PORTAL */}
      {activeTab === 'tasks' && (
        <div className="space-y-6 animate-none">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 p-5 rounded-xl">
            
            {/* Action view */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-850 mb-4">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <CheckSquare className="w-4 h-4 text-sky-505" />
                {language === 'en' ? 'Construction Roadmap & Deliverables' : language === 'fr' ? 'Suivi des jalons & Tâches' : 'المسار الزمني والمهام'}
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono font-bold">
                  {project.tasks.length}
                </span>
              </h3>

              {canAddTasks && (
                <button
                  onClick={() => setShowAddTask(true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-805 text-white dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-950 transition-all cursor-pointer shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>{language === 'en' ? 'Create Task' : language === 'fr' ? 'Créer Tâche' : 'إنشاء مهمة'}</span>
                </button>
              )}
            </div>

            {project.tasks.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                {language === 'en' ? 'No registered tasks in roadmap.' : language === 'fr' ? 'Aucune tâche de planifiée.' : 'لا توجد مهام مجدولة في المسار الزمني.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {project.tasks.map((task) => {
                  const assignedUser = project.members.find(m => m.email === task.assignedTo);
                  
                  return (
                    <div 
                      key={task.id} 
                      className="p-4 rounded-xl border border-slate-150 dark:border-slate-850 bg-slate-50/30 dark:bg-slate-950/20 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider font-mono ${
                            task.priority === 'high' ? 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400' :
                            task.priority === 'medium' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400' :
                            'bg-slate-50 text-slate-750 dark:bg-slate-900/40 dark:text-slate-405'
                          }`}>
                            {task.priority} scope
                          </span>

                          <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-350" />
                            {task.deadline}
                          </span>
                        </div>

                        <h4 className="font-semibold text-slate-900 dark:text-white text-sm">{task.title}</h4>
                        <p className="text-xs text-slate-550 dark:text-slate-400 mt-1 lines-clamp-2 leading-relaxed">{task.description}</p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-850 flex items-center justify-between">
                        {/* Assignee indicator */}
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                          <div className="h-5 w-5 bg-slate-900 dark:bg-slate-50 text-white dark:text-slate-950 font-bold uppercase text-[9px] rounded flex items-center justify-center font-mono">
                            {assignedUser ? assignedUser.name.charAt(0) : "T"}
                          </div>
                          <span className="font-semibold">{assignedUser ? assignedUser.name : task.assignedTo}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            value={task.status}
                            onChange={(e) => updateTaskStatus(task.id, e.target.value as Task['status'])}
                            className="text-[11px] font-semibold p-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none"
                          >
                            <option value="pending">{language === 'en' ? 'Pending' : language === 'fr' ? 'À Faire' : 'معلق'}</option>
                            <option value="in_progress">{language === 'en' ? 'Doing' : language === 'fr' ? 'En Cours' : 'قيد التنفيذ'}</option>
                            <option value="completed">{language === 'en' ? 'Done' : language === 'fr' ? 'Terminé' : 'مكتمل'}</option>
                          </select>

                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            className="p-1 text-slate-350 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer"
                            title="Delete checkpoint"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: INVOICES, BONS & RECEIPTS GENERATOR */}
      {activeTab === 'docs' && (
        <div className="space-y-6 animate-none">
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
            
            {/* Left Column: Interactive Creator Controls (3 Columns wide) */}
            <div className="xl:col-span-2 space-y-6">
              
              {/* Selector Box */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 p-5 rounded-xl">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5 mb-4">
                  <Sliders className="w-4 h-4 text-sky-500" />
                  {language === 'en' ? 'Document Presets' : language === 'fr' ? 'Configuration du Document' : 'إعدادات المستند'}
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1.5">
                      {language === 'en' ? 'Select Document Layout' : language === 'fr' ? 'Type de Pièce' : 'اختر تصميم المستند'}
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDocType('invoice');
                          setDocNumber(`FAC-${new Date().getFullYear()}-${Math.floor(100+Math.random()*900)}`);
                        }}
                        className={`py-2 px-2.5 rounded-lg text-xs font-semibold text-center border cursor-pointer transition-all ${
                          docType === 'invoice'
                            ? 'bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-950 shadow-sm'
                            : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-350 hover:bg-slate-50'
                        }`}
                      >
                        {language === 'en' ? 'Invoice (Facture)' : language === 'fr' ? 'Facture' : 'فاتورة'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDocType('voucher');
                          setDocNumber(`BON-${new Date().getFullYear()}-${Math.floor(100+Math.random()*900)}`);
                        }}
                        className={`py-2 px-2.5 rounded-lg text-xs font-semibold text-center border cursor-pointer transition-all ${
                          docType === 'voucher'
                            ? 'bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-950 shadow-sm'
                            : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-350 hover:bg-slate-50'
                        }`}
                      >
                        {language === 'en' ? 'Voucher (Bon)' : language === 'fr' ? 'Bon' : 'سند'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDocType('receipt');
                          setDocNumber(`REC-${new Date().getFullYear()}-${Math.floor(100+Math.random()*900)}`);
                        }}
                        className={`py-2 px-2.5 rounded-lg text-xs font-semibold text-center border cursor-pointer transition-all ${
                          docType === 'receipt'
                            ? 'bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-950 shadow-sm'
                            : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-350 hover:bg-slate-50'
                        }`}
                      >
                        {language === 'en' ? 'Receipt (Reçu)' : language === 'fr' ? 'Reçu' : 'إيصال'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pb-2.5 border-b border-slate-100 dark:border-slate-850">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        {language === 'en' ? 'Document #' : language === 'fr' ? 'N° Document' : 'رقم المستند'}
                      </label>
                      <input
                        type="text"
                        value={docNumber}
                        onChange={(e) => setDocNumber(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        {language === 'en' ? 'TVA/Tax Rate (%)' : language === 'fr' ? 'Taux de TVA (%)' : 'نسبة الضريبة والرسوم (%)'}
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={docTaxRate}
                        onChange={(e) => setDocTaxRate(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-808 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 dark:border-slate-850">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Logo (PNG)
                      </label>
                      <input
                        type="file"
                        accept="image/png"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                             const reader = new FileReader();
                             reader.onloadend = () => setDocLogo(reader.result as string);
                             reader.readAsDataURL(file);
                          }
                        }}
                        className="w-full text-[10px] file:text-[10px] file:py-1 file:px-2 file:rounded file:border-0 file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Format
                      </label>
                      <select
                        value={docPaperFormat}
                        onChange={(e) => setDocPaperFormat(e.target.value as 'A4' | 'A5')}
                        className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none"
                      >
                        <option value="A4">A4 (210 x 297mm)</option>
                        <option value="A5">A5 (148 x 210mm)</option>
                      </select>
                    </div>
                  </div>

                  <h4 className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                    {language === 'en' ? 'Billing Identifications' : language === 'fr' ? 'Identités de Facturation' : 'بيانات تحديد الفوترة'}
                  </h4>
                    {/* Sender Profile (Sister's profile prefilled) */}
                    <div className="p-3 bg-slate-50 dark:bg-slate-950/60 border border-slate-150 dark:border-slate-850 rounded-lg space-y-2">
                      <span className="text-[9.5px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-widest block font-sans">
                        {language === 'en' ? 'Issuer (e.g. your sister / engineer)' : language === 'fr' ? 'Émetteur (e.g. ingénieur civil)' : 'الجهة المصدرة (مثال: أختك / المهندس)'}
                      </span>
                      <input
                        type="text"
                        placeholder={language === 'en' ? "Company Name or Your Name" : language === 'fr' ? "Nom de l'entreprise ou votre nom" : "اسم الشركة أو اسمك الشخصي"}
                        value={docSenderName}
                        onChange={(e) => setDocSenderName(e.target.value)}
                        className="w-full px-2.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder={language === 'en' ? "Phone Number" : language === 'fr' ? "Numéro de téléphone" : "رقم الهاتف"}
                        value={docSenderPhone}
                        onChange={(e) => setDocSenderPhone(e.target.value)}
                        className="w-full px-2.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder={language === 'en' ? "Address" : language === 'fr' ? "Adresse" : "العنوان"}
                        value={docSenderAddress}
                        onChange={(e) => setDocSenderAddress(e.target.value)}
                        className="w-full px-2.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none"
                      />
                    </div>

                    {/* Client Profile (Homeowner prefilled) */}
                    <div className="p-3 bg-slate-50 dark:bg-slate-950/60 border border-slate-150 dark:border-slate-850 rounded-lg space-y-2">
                      <span className="text-[9.5px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-widest block font-sans">
                        {language === 'en' ? 'Client (Home Owner)' : language === 'fr' ? 'Client (Moul Dar / Propriétaire)' : 'العميل (صاحب المنزل / العقار)'}
                      </span>
                      <input
                        type="text"
                        placeholder={language === 'en' ? "Client Name" : language === 'fr' ? "Nom du client" : "اسم العميل / الزبون"}
                        value={docClientName}
                        onChange={(e) => setDocClientName(e.target.value)}
                        className="w-full px-2.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder={language === 'en' ? "Address of Appartment / Site" : language === 'fr' ? "Adresse de l'appartement / Chantier" : "عنوان الشقة / موقع العمل"}
                        value={docClientAddress}
                        onChange={(e) => setDocClientAddress(e.target.value)}
                        className="w-full px-2.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none"
                      />
                    </div>
                  </div>

                </div>
              </div>

              {/* Dynamic Auto-Selector: Import from project expenses list */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 p-5 rounded-xl">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5 mb-2.5">
                  <CreditCard className="w-4 h-4 text-emerald-500" />
                  {language === 'en' ? 'Import Registered Expenses' : language === 'fr' ? 'Importer des Frais Enregistrés' : 'استيراد المصاريف المسجلة'}
                </h3>
                <p className="text-[11px] text-slate-500 leading-normal mb-3">
                  {language === 'en'
                    ? "Tap on any expense log you or your sister paid to instantly embed it under this printable voucher or invoice automatically:"
                    : language === 'fr'
                    ? "Sélectionnez un ou plusieurs frais payés par vous ou votre soeur pour les ajouter directement sur la facture :"
                    : "اضغط على أي سجل مصاريف قمت بدفعه أنت أو أختك لإدراجه على الفور تحت هذه الفاتورة الملموسة أو السند تلقائياً:"}
                </p>

                {project.expenses.length === 0 ? (
                  <div className="p-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-center text-[11px] text-slate-400">
                    {language === 'en' ? 'No registered expenses found in this folder.' : language === 'fr' ? 'Aucun frais disponible dans ce dossier.' : 'لم يتم العثور على أي مصاريف مسجلة في هذا المجلد.'}
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {project.expenses.map((exp) => {
                      const isChecked = docItems.some(item => item.id === exp.id || item.description.includes(exp.title));
                      const payerName = project.members.find(m => m.email === exp.paidBy)?.name || exp.paidBy;

                      return (
                        <button
                          key={exp.id}
                          type="button"
                          onClick={() => handleToggleExpenseIntoDoc(exp)}
                          className={`w-full text-left p-2.5 rounded-lg border text-xs flex items-center justify-between transition-all cursor-pointer ${
                            isChecked
                              ? 'bg-emerald-500/5 border-emerald-500 text-emerald-950 dark:text-emerald-300'
                              : 'bg-slate-50 dark:bg-slate-950 border-slate-150 dark:border-slate-850 text-slate-750 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-850'
                          }`}
                        >
                          <div className="flex items-center gap-2 max-w-[70%]">
                            <div className={`h-4 w-4 rounded-full border flex items-center justify-center transition-all ${
                              isChecked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300'
                            }`}>
                              {isChecked && <Check className="w-2.5 h-2.5 stroke-[3px]" />}
                            </div>
                            <div className="truncate">
                              <p className="font-semibold truncate">{exp.title}</p>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">Paid by: {payerName}</span>
                            </div>
                          </div>
                          
                          <span className="font-bold font-mono text-slate-900 dark:text-white">
                            {exp.amount.toLocaleString()} {project.currency}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Custom Line Item Manual Builder */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 p-5 rounded-xl">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5 mb-3">
                  <PlusCircle className="w-4 h-4 text-sky-500" />
                  {language === 'en' ? 'Add Manual Custom Row' : language === 'fr' ? 'Ajouter une Ligne de Frais' : 'إضافة بند يدوي مخصص'}
                </h3>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newItemDesc.trim() || newItemPrice <= 0) return;
                    const customId = `manual_item_${Date.now()}`;
                    setDocItems([...docItems, { id: customId, description: newItemDesc, quantity: newItemQty, unitPrice: newItemPrice }]);
                    setNewItemDesc('');
                    setNewItemQty(1);
                    setNewItemPrice(0);
                  }}
                  className="space-y-3"
                >
                  <div>
                    <input
                      type="text"
                      placeholder={language === 'en' ? "Item name / Labor description..." : language === 'fr' ? "Nom de l'article / Description..." : "اسم العنصر / وصف العمل..."}
                      value={newItemDesc}
                      onChange={(e) => setNewItemDesc(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">{language === 'en' ? 'Qty' : language === 'fr' ? 'Quantité' : 'الكمية'}</label>
                      <input
                        type="number"
                        min="1"
                        value={newItemQty}
                        onChange={(e) => setNewItemQty(Math.max(1, Number(e.target.value)))}
                        className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">{language === 'en' ? 'Unit Price' : language === 'fr' ? 'Prix Unitaire' : 'سعر الوحدة'}</label>
                      <input
                        type="number"
                        placeholder={language === 'en' ? "Amount" : language === 'fr' ? "Montant" : "المبلغ"}
                        value={newItemPrice || ''}
                        onChange={(e) => setNewItemPrice(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-955 text-slate-900 dark:text-white focus:outline-none font-mono"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-950 text-xs font-semibold rounded-lg cursor-pointer transition-all"
                  >
                    {language === 'en' ? '+ Append item' : language === 'fr' ? '+ Ajouter la ligne' : '+ إضافة بند'}
                  </button>
                </form>
              </div>

            </div>

            {/* Right Column: Premium Document Real-time Live Letterhead Mockup (3 Columns wide) */}
            <div className="xl:col-span-3 space-y-4">
              
              {/* Toolbar */}
              <div className="flex justify-between items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 p-3 rounded-xl shadow-xs">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 font-mono">
                  {language === 'en' ? 'Live Document Export Preview' : language === 'fr' ? 'Aperçu Impression Document' : 'معاينة تصدير الفاتورة والمستند المباشر'}
                </span>
                
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-500 hover:bg-sky-600 text-white shadow-sm cursor-pointer transition-all animate-none"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{language === 'en' ? 'Print or PDF' : language === 'fr' ? 'Imprimer / Facturer' : 'طباعة أو حفظ كـ PDF'}</span>
                </button>
              </div>

              {/* LIVE PAGE CARD */}
              <div 
                className={"bg-white text-slate-900 rounded-xl border border-slate-200 p-8 shadow-md relative min-h-[48rem] flex flex-col justify-between font-sans print:m-0 print:border-none print:shadow-none print:p-0 " + (docPaperFormat === 'A4' ? 'print-page-a4' : 'print-page-a5')}
                id="printable-civil-bill"
              >
                
                {/* Letterhead Top Logo Details */}
                <div>
                  <div className="flex justify-between items-start pb-6 border-b border-slate-200 gap-4">
                    <div>
                      {/* Brand Logo & Name */}
                      <div className="flex items-center gap-2 mb-1.5">
                        {docLogo ? (
                          <img src={docLogo} alt="Logo" className="h-10 w-auto object-contain" />
                        ) : (
                          <div className="h-7 w-7 rounded bg-slate-900 text-white flex items-center justify-center font-bold text-sm">
                            B
                          </div>
                        )}
                        <span className="font-extrabold text-base tracking-tight font-sans text-slate-900">
                          {docSenderName || 'BuildTrack Renovation'}
                        </span>
                      </div>
                      
                      {/* Sender details */}
                      <p className="text-[10px] text-slate-500 font-sans leading-normal">
                        {docSenderAddress || 'Tanger, Maroc'}
                      </p>
                      <p className="text-[10px] text-slate-500 font-sans font-medium">
                        {language === 'en' ? 'Tel:' : language === 'fr' ? 'Tél:' : 'الهاتف:'} {docSenderPhone || '+212 539-948833'} | Email: {docSenderEmail}
                      </p>
                    </div>

                    {/* Document Meta (Type banner) */}
                    <div className="text-right">
                      <span className="text-[9.5px] font-bold bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-md uppercase tracking-wider block mb-1">
                        {docType === 'invoice' ? (language === 'en' ? 'INVOICE' : language === 'fr' ? 'FACTURE' : 'فاتورة') :
                         docType === 'voucher' ? (language === 'en' ? 'VOUCHER' : language === 'fr' ? 'BON DE COMMANDE' : 'سند استلام') :
                         (language === 'en' ? 'RECEIPT' : language === 'fr' ? 'REÇU DE PAIEMENT' : 'إيصال دفع')}
                      </span>
                      
                      <p className="text-xs font-bold font-mono text-slate-900">{docNumber}</p>
                      <p className="text-[9.5px] text-slate-500 font-serif font-medium mt-1">
                        {language === 'en' ? 'Date:' : language === 'fr' ? 'Émis le:' : 'التاريخ:'} {docDate}
                      </p>
                    </div>
                  </div>

                  {/* Client Identification Segment */}
                  <div className="grid grid-cols-2 gap-6 mt-6 pb-6 border-b border-slate-100">
                    <div>
                      <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                        {language === 'en' ? 'BILL TO (LANDLORD / CLIENT):' : language === 'fr' ? 'BÉNÉFICIAIRE / PROPRIÉTAIRE :' : 'العميل المستلم / صاحب العقار :'}
                      </span>
                      <p className="font-semibold text-xs text-slate-900 font-sans">{docClientName || 'N/A'}</p>
                      <p className="text-[10px] text-slate-500 leading-normal mt-0.5">{docClientAddress || 'N/A'}</p>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">{docClientEmail}</p>
                    </div>

                    <div className="text-right">
                      <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                        {language === 'en' ? 'PROJECT LOCATION :' : language === 'fr' ? 'ADDRESSE DES TRAVAUX :' : 'موقع ورشة العمل / المشروع :'}
                      </span>
                      <p className="font-semibold text-xs text-slate-900">{project.name}</p>
                      <p className="text-[10px] text-slate-500 leading-normal mt-0.5">{project.address}</p>
                      <p className="text-[9.5px] text-slate-400 font-serif mt-1">
                        {docType === 'invoice' && `${language === 'en' ? 'Due Date:' : language === 'fr' ? 'Échéance:' : 'تاريخ الاستحقاق:'} ${docDueDate}`}
                      </p>
                    </div>
                  </div>

                  {/* Items list table */}
                  <div className="mt-6">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="pb-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">{language === 'en' ? 'Description' : language === 'fr' ? 'Description de la prestation' : 'البيان / وصف الخدمة'}</th>
                          <th className="pb-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center w-16">{language === 'en' ? 'Qty' : language === 'fr' ? 'Qté' : 'الكمية'}</th>
                          <th className="pb-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right w-24">{language === 'en' ? 'Unit Price' : language === 'fr' ? 'Prix Unitaire' : 'سعر الوحدة'}</th>
                          <th className="pb-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right w-28 pr-1">{language === 'en' ? 'Total' : language === 'fr' ? 'Total' : 'المجموع'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {docItems.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-8 text-center text-xs text-slate-400 font-sans">
                              {language === 'en' ? 'Select project expenditures from side list or add custom line items.' : language === 'fr' ? 'Sélectionnez ou ajoutez des lignes d\'achats.' : 'اختر المصاريف من القائمة الجانبية أو أضف بنوداً يدوية مخصصة.'}
                            </td>
                          </tr>
                        ) : (
                          docItems.map((item, index) => {
                            const lineTotal = item.quantity * item.unitPrice;
                            return (
                              <tr key={item.id || index} className="text-xs">
                                <td className="py-3 font-sans font-medium text-slate-800 pr-3">
                                  <div className="flex justify-between items-start">
                                    <span>{item.description}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveDocItem(item.id)}
                                      className="text-red-400 hover:text-red-650 opacity-0 group-hover:opacity-100 hover:bg-red-50 p-0.5 rounded ml-1.5 transition-all text-[9px] print:hidden cursor-pointer"
                                      title="Remove item"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </td>
                                <td className="py-3 text-center font-mono text-slate-600">{item.quantity}</td>
                                <td className="py-3 text-right font-mono text-slate-600">{item.unitPrice.toLocaleString()}</td>
                                <td className="py-3 text-right font-mono font-semibold text-slate-900 pr-1">
                                  {lineTotal.toLocaleString()} {project.currency}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary Calculations block */}
                  {docItems.length > 0 && (() => {
                    const subtotal = docItems.reduce((acc, current) => acc + (current.quantity * current.unitPrice), 0);
                    const taxes = subtotal * (docTaxRate / 100);
                    const grandTotal = subtotal + taxes;

                    return (
                      <div className="flex justify-end mt-6">
                        <div className="w-64 space-y-2 text-right text-xs">
                          <div className="flex justify-between text-slate-500">
                            <span>{language === 'en' ? 'Subtotal :' : language === 'fr' ? 'Sous-total :' : 'المجموع الفرعي :'}</span>
                            <span className="font-mono font-medium text-slate-800">{subtotal.toLocaleString()} {project.currency}</span>
                          </div>
                          {docTaxRate > 0 && (
                            <div className="flex justify-between text-slate-500">
                              <span>TVA ({docTaxRate}%) :</span>
                              <span className="font-mono font-medium text-slate-800">{taxes.toLocaleString()} {project.currency}</span>
                            </div>
                          )}
                          <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-bold text-slate-900">
                            <span>Total :</span>
                            <span className="font-mono text-sky-600 tracking-tight">{grandTotal.toLocaleString()} {project.currency}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                </div>

                {/* Footer and Terms signature */}
                <div className="pt-8 border-t border-slate-100 mt-12">
                  <div className="grid grid-cols-2 gap-4 text-[10px] text-slate-400 leading-relaxed font-sans">
                    <div>
                      <span className="font-bold text-slate-600 uppercase tracking-widest text-[8.5px] block mb-1">
                        {language === 'en' ? 'NOTES & BANK INSTRUCTIONS' : language === 'fr' ? 'CONDITIONS & RELEVÉ' : 'ملاحظات وتوجيهات مصرفية / شروط الدفع'}
                      </span>
                      <p className="italic">{docNotes}</p>
                    </div>

                    <div className="text-right flex flex-col justify-end items-end h-full">
                      <div className="w-36 border-t border-slate-300 pt-1 mt-6 text-center text-[9px] text-slate-400 uppercase tracking-wider font-semibold font-sans">
                        {language === 'en' ? 'Contractor Signature' : language === 'fr' ? 'Signature de l\'Entrepreneur' : 'توقيع المقاول / المشرف المعتمد'}
                      </div>
                    </div>
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

      {/* MODAL DIALOG: ADD EXPENSE SHEET */}
      {showAddExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs px-4" id="add-expense-modal">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-5 text-left font-sans">
            <div className="flex justify-between items-center pb-2.5 border-b border-slate-100 dark:border-slate-850">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-sky-505" />
                {language === 'en' ? 'Add Workspace Expenditure' : language === 'fr' ? 'Enregistrer Un Frais' : 'تسجيل مصروفات ورشة العمل / الموقع'}
              </h3>
              <button
                onClick={() => setShowAddExpense(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddExpenseSubmit} className="space-y-3.5 mt-3.5">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">{language === 'en' ? 'Expense Title *' : language === 'fr' ? 'Titre *' : 'عنوان المصروف *'}</label>
                <input
                  type="text"
                  required
                  placeholder={language === 'en' ? "e.g. Carrara Tile Marble Slabs" : language === 'fr' ? "ex. Dalles de marbre de Carrare" : "مثل: ألواح رخام كارارا"}
                  value={expenseTitle}
                  onChange={(e) => setExpenseTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">{language === 'en' ? 'Sourced Cost Amount *' : language === 'fr' ? 'Montant *' : 'قيمة المبلغ المدفوع *'}</label>
                  <input
                    type="number"
                    required
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none font-mono font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">{language === 'en' ? 'Category Tag' : language === 'fr' ? 'Catégorie' : 'فئة نوع المصروف'}</label>
                  <select
                    value={expenseCat}
                    onChange={(e) => setExpenseCat(e.target.value as ExpenseCategory)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none font-semibold"
                  >
                    <option value="materials">{t.categories.materials}</option>
                    <option value="workers">{t.categories.workers}</option>
                    <option value="equipment">{t.categories.equipment}</option>
                    <option value="transportation">{t.categories.transportation}</option>
                    <option value="miscellaneous">{t.categories.miscellaneous}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">{language === 'en' ? 'Paid By Partner' : language === 'fr' ? 'Payé par' : 'الشخص الذي دفع المبلغ'}</label>
                  <select
                    value={expensePaidBy}
                    onChange={(e) => setExpensePaidBy(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none font-semibold"
                  >
                    {project.members.filter(m => m.status === 'accepted' || !m.status).map((m) => (
                      <option key={m.email} value={m.email}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">{language === 'en' ? 'Supplier Name' : language === 'fr' ? 'Fournisseur' : 'اسم المورد / الشركة'}</label>
                  <input
                    type="text"
                    placeholder={language === 'en' ? "Vinci Marble Inc" : language === 'fr' ? "Société Vinci Marbre" : "شركة رخام فينشي"}
                    value={expenseSupplier}
                    onChange={(e) => setExpenseSupplier(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-805 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">{language === 'en' ? 'Short Description' : language === 'fr' ? 'Détails' : 'تفاصيل قصيرة'}</label>
                <textarea
                  rows={2}
                  placeholder={language === 'en' ? "Invoice 4B deposit to support bathroom remodeling..." : language === 'fr' ? "Dépôt Facture 4B pour le réaménagement..." : "دفعة الفاتورة 4B لدعم ترميم الحمام..."}
                  value={expenseDesc}
                  onChange={(e) => setExpenseDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="pt-3.5 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-850">
                <button
                  type="button"
                  onClick={() => setShowAddExpense(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-850 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  {language === 'en' ? 'Cancel' : language === 'fr' ? 'Annuler' : 'إلغاء'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-955 text-white dark:bg-slate-100 dark:text-slate-950 cursor-pointer shadow-sm"
                >
                  {language === 'en' ? 'Save Expense' : language === 'fr' ? 'Créer' : 'حفظ المصروف'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DIALOG: SCHEDULE ROADMAP TASK */}
      {showAddTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs px-4" id="add-task-modal">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-5 text-left font-sans">
            <div className="flex justify-between items-center pb-2.5 border-b border-slate-105 dark:border-slate-850 font-sans">
              <h3 className="font-bold text-sm text-slate-909 dark:text-white flex items-center gap-1.5">
                <CheckSquare className="w-4 h-4 text-sky-505" />
                {language === 'en' ? 'Schedule Milestone Task' : language === 'fr' ? 'Créer un Jalon' : 'إنشاء جلون / مهمة رئيسية'}
              </h3>
              <button
                onClick={() => setShowAddTask(false)}
                className="text-slate-400 hover:text-slate-605 dark:hover:text-slate-202 transition p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddTaskSubmit} className="space-y-3.5 mt-3.5">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">{language === 'en' ? 'Task Title *' : language === 'fr' ? 'Titre *' : 'اسم المهمة *'}</label>
                <input
                  type="text"
                  required
                  placeholder={language === 'en' ? "Verify wall framing dimensions" : language === 'fr' ? "Vérifier les dimensions des cadres muraux" : "التحقق من أبعاد هيكل الحائط"}
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">{language === 'en' ? 'Scope Description' : language === 'fr' ? 'Description' : 'تفاصيل ومجال العمل'}</label>
                <textarea
                  rows={2}
                  placeholder={language === 'en' ? "Architect must sign form B3 for local council records..." : language === 'fr' ? "L'architecte doit signer le formulaire B3..." : "يجب على المهندس التوقيع على النموذج B3 لسجلات المجلس المحلي..."}
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">{language === 'en' ? 'Assign Partner' : language === 'fr' ? 'Assigné à' : 'تعيين شريك'}</label>
                  <select
                    value={taskAssignedTo}
                    onChange={(e) => setTaskAssignedTo(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none font-semibold"
                  >
                    {project.members.filter(m => m.status === 'accepted' || !m.status).map((m) => (
                      <option key={m.email} value={m.email}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">{language === 'en' ? 'Priority Goal' : language === 'fr' ? 'Priorité' : 'أولوية المهمة'}</label>
                  <select
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value as 'low' | 'medium' | 'high')}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-808 bg-white dark:bg-slate-955 text-slate-700 dark:text-slate-300 focus:outline-none font-semibold"
                  >
                    <option value="low">{language === 'en' ? 'Low Priority' : language === 'fr' ? 'Basse Priorité' : 'أولوية منخفضة'}</option>
                    <option value="medium">{language === 'en' ? 'Medium Priority' : language === 'fr' ? 'Priorité Moyenne' : 'أولوية متوسطة'}</option>
                    <option value="high">{language === 'en' ? 'High Priority / Urgent' : language === 'fr' ? 'Haute Priorité / Urgent' : 'أولوية عالية / عاجل'}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">{language === 'en' ? 'Target Deadline' : language === 'fr' ? 'Date d\'échéance' : 'الموعد النهائي'}</label>
                <input
                  type="date"
                  value={taskDeadline}
                  onChange={(e) => setTaskDeadline(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none font-mono"
                />
              </div>

              <div className="pt-3.5 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-850">
                <button
                  type="button"
                  onClick={() => setShowAddTask(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-205 dark:bg-slate-850 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  {language === 'en' ? 'Cancel' : language === 'fr' ? 'Annuler' : 'إلغاء'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-955 text-white dark:bg-slate-100 dark:text-slate-950 cursor-pointer shadow-sm"
                >
                  {language === 'en' ? 'Create Task' : language === 'fr' ? 'Créer' : 'إنشاء مهمة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SETUP DIALOG / PROJECT OPTIONS EDIT DRAWER */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs px-4" id="project-settings-modal">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 rounded-xl shadow-2xl p-5 text-left font-sans">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-850">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-sky-505" />
                {language === 'en' ? 'Workspace Configurations' : language === 'fr' ? 'Options de configuration' : 'خيارات إعداد وتكوين الموقع'}
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4 mt-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{language === 'en' ? 'Project Name' : language === 'fr' ? 'Nom du chantier' : 'اسم المشروع / الورشة'}</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{language === 'en' ? 'Client Name' : language === 'fr' ? 'Nom du client' : 'اسم الزبون / صاحب الورشة'}</label>
                  <input
                    type="text"
                    required
                    value={editClient}
                    onChange={(e) => setEditClient(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-808 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{language === 'en' ? 'Default Currency Tag' : language === 'fr' ? 'Devise par défaut' : 'العملة الافتراضية'}</label>
                  <select
                    value={editCurrency}
                    onChange={(e) => setEditCurrency(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-805 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none font-semibold"
                  >
                    <option value="DH">DH</option>
                    <option value="USD">US Dollar ($)</option>
                    <option value="EUR">Euro (€)</option>
                    <option value="GBP">Pound Sterling (£)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{language === 'en' ? 'Total Sourcing Budget' : language === 'fr' ? 'Budget de financement' : 'ميزانية التمويل الإجمالية'}</label>
                  <input
                    type="number"
                    required
                    value={editBudget}
                    onChange={(e) => setEditBudget(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-808 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{language === 'en' ? 'Project Phase status' : language === 'fr' ? 'Statut de phase' : 'حالة مرحلة المشروع'}</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as Project['status'])}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-808 bg-white dark:bg-slate-950 text-slate-705 dark:text-slate-300 focus:outline-none font-semibold"
                  >
                    <option value="planning">{t.status.planning}</option>
                    <option value="in_progress">{t.status.in_progress}</option>
                    <option value="paused">{t.status.paused}</option>
                    <option value="completed">{t.status.completed}</option>
                    <option value="cancelled">{t.status.cancelled}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{language === 'en' ? 'Site Address' : language === 'fr' ? 'Adresse physique' : 'العنوان الجغرافي للموقع'}</label>
                <input
                  type="text"
                  required
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-955 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{language === 'en' ? 'Mission/Description' : language === 'fr' ? 'Description' : 'الرسالة / الوصف التفصيلي'}</label>
                <textarea
                  rows={2}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-955 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="pt-3.5 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-850">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-205 dark:bg-slate-850 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  {language === 'en' ? 'Discard' : language === 'fr' ? 'Fermer' : 'تجاهل التغييرات'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-955 text-white dark:bg-slate-100 dark:text-slate-955 cursor-pointer shadow-sm"
                >
                  {language === 'en' ? 'Apply changes' : language === 'fr' ? 'Appliquer' : 'حفظ التعديلات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

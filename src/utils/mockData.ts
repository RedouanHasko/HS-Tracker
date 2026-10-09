import { Project, TimelineActivity, AppNotification, Language } from '../types';
import { acceptedMembers, expenseInvoicePrice, projectSpent } from './projectFinance';

// Multi-language translation dictionaries
export const TRANSLATIONS = {
  en: {
    dashboard: "Dashboard",
    projects: "Projects",
    activeProjects: "Active Projects",
    completedProjects: "Completed Projects",
    totalExpenses: "Total Expenses",
    totalPayments: "Total Payments",
    pendingTasks: "Pending Tasks",
    progress: "Progress",
    recentActivity: "Recent Activity",
    budget: "Budget",
    budgetSpent: "Budget Spent",
    remainingBudget: "Remaining Budget",
    expensesByCategory: "Expenses by Category",
    expensesByMember: "Expenses by Member",
    costSharing: "Shared Cost & Settlements",
    totalSpent: "Total Spent",
    paidBy: "Paid By",
    balanceSummary: "Balance Summaries",
    owes: "owes",
    allSettled: "All financial shares are fully settled!",
    createNewProject: "Create New Project",
    addProject: "Add Project",
    viewProject: "View Project",
    editProject: "Edit Project",
    deleteProject: "Delete Project",
    projectCreator: "Project Creator",
    overview: "Overview",
    customSections: "Dynamic Custom Sections",
    addSection: "Add Dynamic Section",
    tasks: "Tasks",
    addTask: "Add Checklist Task",
    expenses: "Expenses",
    addExpense: "Add Expense",
    commissionPercent: "Commission %",
    invoicePrice: "Invoice Price",
    photos: "Photos & Gallery",
    addPhoto: "Upload Photo",
    documents: "Document Vault",
    addDocument: "Add Document",
    invoiceGen: "Invoice Builder",
    quoteGen: "Quote Builder",
    receiptGen: "Receipt Builder",
    notifications: "Notifications",
    searchPlaceholder: "Search projects, expenses, tasks, docs...",
    roles: {
      owner: "Owner (Full Access)",
      manager: "Manager (Full Edit & Admin)",
      co_owner: "Co-owner (Full Access)",
      editor: "Editor (Edit Content)",
      contributor: "Contributor (Add Task/Expense)",
      read_only: "Read-Only Viewer"
    },
    sections: {
      painting: "Painting & Plastering",
      plumbing: "Bath & Plumbing Services",
      electrical: "Power & Electrical Wiring",
      flooring: "Hardwood & Tile Flooring",
      kitchen: "Custom Countertops & Kitchen Cabinets",
      bathroom: "Luxury Bathroom Renovation",
      exterior: "Structural Exterior Facade",
      waterproofing: "Slab Waterproofing Repair"
    },
    status: {
      planning: "Planning",
      in_progress: "In Progress",
      paused: "Paused",
      completed: "Completed",
      cancelled: "Cancelled"
    },
    categories: {
      materials: "Materials & Supplies",
      workers: "Workers & Handymen",
      equipment: "Heavy/Light Equipment",
      transportation: "Transportation & Freight",
      utilities: "Utilities",
      cleaning: "Cleaning",
      maintenance: "Maintenance",
      miscellaneous: "Miscellaneous Overhead"
    },
    projectTypes: {
      construction: 'Construction Project',
      service: 'Service / Maintenance',
      rental: 'Rental Management'
    },
    rental: {
      ownerName: 'Property Owner',
      buildingNumber: 'Building / Apt Number',
      pricePerNight: 'Price per Night',
      commissionRate: 'Commission Rate',
      bookings: 'Bookings',
      addBooking: 'Add Booking',
      clientName: 'Guest Name',
      clientPhone: 'Guest Phone',
      numberOfGuests: 'Number of Guests',
      checkIn: 'Check-In',
      checkOut: 'Check-Out',
      totalNights: 'Nights',
      totalAmount: 'Total Amount',
      commission: 'Commission',
      ownerPayout: 'Owner Payout',
      paidAmount: 'Paid',
      balanceDue: 'Balance Due',
      statuses: {
        upcoming: 'Upcoming',
        active: 'Active',
        completed: 'Completed',
        cancelled: 'Cancelled'
      },
      revenueSummary: 'Revenue Summary',
      totalRevenue: 'Total Revenue',
      totalCommission: 'Total Commission',
      totalPayout: 'Total Owner Payout',
      ownerDetails: 'Owner Details',
      ownerReport: 'Owner Report',
      sendToOwner: 'Send to Owner',
      noBookings: 'No bookings yet. Add your first booking!',
      editRental: 'Edit Rental Settings',
      nights: 'nights',
      perNight: '/night',
      generateReport: 'Generate Owner Report'
    },
    langLabel: "Language / Langue"
  },
  fr: {
    dashboard: "Tableau de bord",
    projects: "Projets",
    activeProjects: "Projets Actifs",
    completedProjects: "Projets Terminés",
    totalExpenses: "Total des Dépenses",
    totalPayments: "Total des Paiements",
    pendingTasks: "Tâches en Attente",
    progress: "Progression",
    recentActivity: "Activité Récente",
    budget: "Budget global",
    budgetSpent: "Budget Dépensé",
    remainingBudget: "Budget Restant",
    expensesByCategory: "Dépenses par Catégorie",
    expensesByMember: "Dépenses par Membre",
    costSharing: "Partage de Frais & Soldes",
    totalSpent: "Total Dépensé",
    paidBy: "Payé Par",
    balanceSummary: "Résumé des Équilibres",
    owes: "doit",
    allSettled: "Toutes les parts financières sont réglées !",
    createNewProject: "Créer un Nouveau Projet",
    addProject: "Ajouter un Projet",
    viewProject: "Visualiser le Projet",
    editProject: "Modifier le Projet",
    deleteProject: "Supprimer le Projet",
    projectCreator: "Créateur du Projet",
    overview: "Vue d'ensemble",
    customSections: "Sections Personnalisées Dynamics",
    addSection: "Ajouter une section personnalisée",
    tasks: "Liste de Tâches",
    addTask: "Créer une Tâche",
    expenses: "Frais & Dépenses",
    addExpense: "Créer une Dépense",
    commissionPercent: "Commission %",
    invoicePrice: "Prix Facture",
    photos: "Galerie Photos & Suivi",
    addPhoto: "Ajouter une Photo",
    documents: "Coffre-fort Documents",
    addDocument: "Ajouter un Document",
    invoiceGen: "Calculateur Facture",
    quoteGen: "Calculateur Devis",
    receiptGen: "Reçu de Paiement",
    notifications: "Notifications",
    searchPlaceholder: "Rechercher projets, dépenses, tâches, plans...",
    roles: {
      owner: "Propriétaire (Accès Total)",
      manager: "Gestionnaire (Édition & Admin)",
      co_owner: "Co-propriétaire (Accès complet)",
      editor: "Éditeur (Modifier le Contenu)",
      contributor: "Contributeur (Ajouter Dépense/Tâche)",
      read_only: "Lecteur Seul (Lecture simple)"
    },
    sections: {
      painting: "Peinture & Plâtrerie",
      plumbing: "Plomberie & Sanitaires",
      electrical: "Câblage & Électricité Générale",
      flooring: "Pose de Parquet & Carrelage",
      kitchen: "Cuisine Équipée & Ébénisterie",
      bathroom: "Rénovation Salle de Bain de Luxe",
      exterior: "Ravalement de Façade & Maçonnerie",
      waterproofing: "Étanchéification des Dalles"
    },
    status: {
      planning: "En Planification",
      in_progress: "En Cours",
      paused: "En Pause",
      completed: "Terminé",
      cancelled: "Annulé"
    },
    categories: {
      materials: "Matériaux & Équipements",
      workers: "Main d'œuvre & Artisans",
      equipment: "Outillage & Machines",
      transportation: "Logistique & Transport",
      utilities: "Charges & services publics",
      cleaning: "Ménage",
      maintenance: "Maintenance",
      miscellaneous: "Autres Frais Divers"
    },
    projectTypes: {
      construction: 'Projet de Construction',
      service: 'Service / Maintenance',
      rental: 'Gestion de Location'
    },
    rental: {
      ownerName: 'Propriétaire',
      buildingNumber: 'Bâtiment / N° Appart',
      pricePerNight: 'Prix par Nuit',
      commissionRate: 'Taux de Commission',
      bookings: 'Réservations',
      addBooking: 'Ajouter Réservation',
      clientName: 'Nom du Client',
      clientPhone: 'Tél du Client',
      numberOfGuests: 'Nombre de Clients',
      checkIn: 'Arrivée',
      checkOut: 'Départ',
      totalNights: 'Nuits',
      totalAmount: 'Montant Total',
      commission: 'Commission',
      ownerPayout: 'Virement Propriétaire',
      paidAmount: 'Payé',
      balanceDue: 'Solde Dû',
      statuses: {
        upcoming: 'À Venir',
        active: 'Actif',
        completed: 'Terminé',
        cancelled: 'Annulé'
      },
      revenueSummary: 'Résumé des Revenus',
      totalRevenue: 'Revenu Total',
      totalCommission: 'Commission Totale',
      totalPayout: 'Total Virement',
      ownerDetails: 'Détails Propriétaire',
      ownerReport: 'Rapport Propriétaire',
      sendToOwner: 'Envoyer au Propriétaire',
      noBookings: 'Aucune réservation. Ajoutez votre première réservation !',
      editRental: 'Modifier Paramètres Location',
      nights: 'nuits',
      perNight: '/nuit',
      generateReport: 'Générer Rapport'
    },
    langLabel: "Language / Langue"
  },
  ar: {
    dashboard: "لوحة التحكم",
    projects: "المشاريع",
    activeProjects: "المشاريع النشطة",
    completedProjects: "المشاريع المكتملة",
    totalExpenses: "إجمالي المصاريف",
    totalPayments: "إجمالي المدفوعات",
    pendingTasks: "المهام المعلقة",
    progress: "التقدم",
    recentActivity: "النشاط الأخير",
    budget: "الميزانية الإجمالية",
    budgetSpent: "الميزانية المستهلكة",
    remainingBudget: "الميزانية المتبقية",
    expensesByCategory: "المصاريف حسب الفئة",
    expensesByMember: "المصاريف حسب العضو",
    costSharing: "تقاسم التكاليف والتسويات",
    totalSpent: "إجمالي المصروفات",
    paidBy: "دفعت بواسطة",
    balanceSummary: "ملخص الأرصدة",
    owes: "يدين لـ",
    allSettled: "جميع الحصص المالية تمت تسويتها بالكامل!",
    createNewProject: "إنشاء مشروع جديد",
    addProject: "إضافة مشروع",
    viewProject: "عرض المشروع",
    editProject: "تعديل المشروع",
    deleteProject: "حذف المشروع",
    projectCreator: "منشئ المشروع",
    overview: "نظرة عامة",
    customSections: "الأقسام المخصصة الديناميكية",
    addSection: "إضافة قسم ديناميكي",
    tasks: "قائمة المهام",
    addTask: "إضافة مهمة جديدة",
    expenses: "التكاليف والمصاريف",
    addExpense: "إضافة مصروف",
    commissionPercent: "نسبة العمولة",
    invoicePrice: "سعر الفاتورة",
    photos: "معرض الصور والمتابعة",
    addPhoto: "تحميل صورة",
    documents: "خزنة المستندات",
    addDocument: "إضافة مستند",
    invoiceGen: "منشئ الفواتير",
    quoteGen: "منشئ عروض الأسعار",
    receiptGen: "إيصال الدفع",
    notifications: "الإشعارات",
    searchPlaceholder: "البحث في المشاريع، المصاريف، المهام، المستندات...",
    roles: {
      owner: "المالك (وصول كامل)",
      manager: "المدير (تعديل كامل وصلاحيات إدارية)",
      co_owner: "شريك مالك (صلاحيات كاملة)",
      editor: "المحرر (تعديل المحتوى)",
      contributor: "المساهم (إضافة مهام/مصاريف)",
      read_only: "قارئ فقط (عرض مبسط)"
    },
    sections: {
      painting: "الدهان والجبس",
      plumbing: "السباكة والصرف الصحي",
      electrical: "التمديدات والكهرباء العامة",
      flooring: "تركيب الأرضيات والباركيه",
      kitchen: "المطابخ المجهزة والخزائن",
      bathroom: "تجديد الحمام الفاخر",
      exterior: "طلاء الواجهات الخارجية والبناء",
      waterproofing: "عزل الرطوبة والمياه للأسقف"
    },
    status: {
      planning: "في مرحلة التخطيط",
      in_progress: "قيد التنفيذ",
      paused: "متوقف مؤقتاً",
      completed: "مكتمل",
      cancelled: "ملغى"
    },
    categories: {
      materials: "المواد واللوازم",
      workers: "اليد العاملة والحرفيين",
      equipment: "الأدوات والآلات",
      transportation: "اللوجستيات والنقل",
      utilities: "المرافق والفواتير",
      cleaning: "التنظيف",
      maintenance: "الصيانة",
      miscellaneous: "مصاريف أخرى متنوعة"
    },
    projectTypes: {
      construction: 'مشروع بناء',
      service: 'خدمة / صيانة',
      rental: 'إدارة الإيجار'
    },
    rental: {
      ownerName: 'اسم المالك',
      buildingNumber: 'رقم المبنى / الشقة',
      pricePerNight: 'السعر لليلة',
      commissionRate: 'نسبة العمولة',
      bookings: 'الحجوزات',
      addBooking: 'إضافة حجز',
      clientName: 'اسم العميل',
      clientPhone: 'هاتف العميل',
      numberOfGuests: 'عدد النزلاء',
      checkIn: 'تاريخ الدخول',
      checkOut: 'تاريخ الخروج',
      totalNights: 'الليالي',
      totalAmount: 'المبلغ الإجمالي',
      commission: 'العمولة',
      ownerPayout: 'صافي المالك',
      paidAmount: 'المدفوع',
      balanceDue: 'المبلغ المتبقي',
      statuses: {
        upcoming: 'قادم',
        active: 'نشط',
        completed: 'مكتمل',
        cancelled: 'ملغي'
      },
      revenueSummary: 'ملخص الإيرادات',
      totalRevenue: 'إجمالي الإيرادات',
      totalCommission: 'إجمالي العمولة',
      totalPayout: 'إجمالي صافي المالك',
      ownerDetails: 'تفاصيل المالك',
      ownerReport: 'تقرير المالك',
      sendToOwner: 'إرسال إلى المالك',
      noBookings: 'لا توجد حجوزات بعد. أضف أول حجز!',
      editRental: 'تعديل إعدادات الإيجار',
      nights: 'ليالي',
      perNight: '/ليلة',
      generateReport: 'إنشاء تقرير'
    },
    langLabel: "اللغة / Language"
  }
};

// Seeding Initial Clean Datasets
const INITIAL_PROJECTS: Project[] = [
  {
    id: "proj_1",
    name: "Villa Oasis - Luxury Coastal Renovation",
    clientName: "Genevieve Montgomery",
    address: "402 Serenity Hills Drive, Malibu CA 90265",
    description: "Multi-stage high-end renovation of a beachside custom residential villa. Involves master kitchen rebuilding, structural plumbing, fresh premium painting, and advanced smart electrical arrays.",
    startDate: "2026-03-01",
    estimatedEndDate: "2026-11-20",
    budget: 185000,
    currency: "DH",
    status: "in_progress",
    projectType: 'construction',
    creatorEmail: "relhaskouri2@gmail.com",
    members: [
      { email: "relhaskouri2@gmail.com", name: "Project Owner", role: "owner" },
      { email: "alex.contractor@buildtrack.com", name: "Alex Mercer (General Contractor)", role: "manager" },
      { email: "jordan.designer@buildtrack.com", name: "Jordan Vance (Interior Architect)", role: "editor" },
      { email: "pierre.handyman@buildtrack.fr", name: "Pierre Dubois (Tech Contributor)", role: "contributor" },
      { email: "client.montgomery@gmail.com", name: "Genevieve Montgomery (Client)", role: "read_only" }
    ],
    sections: [
      { id: "sec_masonry", projectId: "proj_1", title: "Masonry & Structural Framing", progress: 100, status: "completed", notes: "Reinforced retaining wall columns completed successfully. Passed county inspection." },
      { id: "sec_kitchen", projectId: "proj_1", title: "Kitchen Remodeling", progress: 65, status: "in_progress", notes: "Marble island assembly scheduled for coming Thursday. Appliances arrived at holding dock." },
      { id: "sec_plumbing", projectId: "proj_1", title: "Plumbing & Bath Fixtures", progress: 40, status: "in_progress", notes: "Completed copper supply piping. Installing designer wall-mounted shower faucets." },
      { id: "sec_painting", projectId: "proj_1", title: "Painting & Plastering", progress: 15, status: "planning", notes: "Awaiting primer coat confirmation on freshly drywall-prepped sections." }
    ],
    expenses: [
      {
        id: "exp_101",
        sectionId: "sec_masonry",
        title: "Commercial Grade Portland Cement & Slag",
        description: "140 bags of high-density waterproof foundations plaster + delivery fee",
        amount: 4320,
        currency: "DH",
        category: "materials",
        date: "2026-03-15",
        paidBy: "alex.contractor@buildtrack.com",
        supplier: "Malibu Aggregates & Ready-Mix",
        receipts: ["/assets/receipt-cem.jpg"],
        notes: "Approved under core structural budget line item."
      },
      {
        id: "exp_102",
        sectionId: "sec_kitchen",
        title: "Carrara Calacatta Marble Countertop Slabs",
        description: "Custom cut double bullnose finishing for primary central chef breakfast island.",
        amount: 12500,
        currency: "DH",
        category: "materials",
        date: "2026-05-18",
        paidBy: "relhaskouri2@gmail.com",
        supplier: "Vinci Marble Imports & Design",
        receipts: ["/assets/receipt-marble.jpg"],
        notes: "Direct owner payment processed to secure selected high-vein premium stone."
      },
      {
        id: "exp_103",
        sectionId: "sec_plumbing",
        title: "Specialist Plumbing Sub-contractor",
        description: "Leak tests and copper pipe soldering run inside wet wet walls.",
        amount: 3200,
        currency: "DH",
        category: "workers",
        date: "2026-05-25",
        paidBy: "alex.contractor@buildtrack.com",
        supplier: "Apex Hydraulic Engineering LTD",
        receipts: [],
        notes: "Milestone payment for rough-in certification tests."
      },
      {
        id: "exp_104",
        sectionId: "sec_kitchen",
        title: "Heavy-duty Industrial Floor Sanders Rental",
        description: "4-day orbital floor sander rental for high-gloss hardwood pre-buffing.",
        amount: 850,
        currency: "DH",
        category: "equipment",
        date: "2026-06-02",
        paidBy: "jordan.designer@buildtrack.com",
        supplier: "HomeDepot Pro Rental Depot",
        receipts: ["/assets/homedepot-sander.jpg"],
        notes: "Secured a 15% discount code through regional designer membership."
      }
    ],
    tasks: [
      {
        id: "tsk_201",
        sectionId: "sec_masonry",
        title: "Poured-concrete structural core wall validation",
        description: "Architect must check the core wall and sign off for compliance before ceiling boards start framing.",
        assignedTo: "relhaskouri2@gmail.com",
        priority: "high",
        deadline: "2026-03-20",
        status: "completed",
        subtasks: [
          { id: "sub_1", title: "Inspect alignment lines", isCompleted: true },
          { id: "sub_2", title: "Moisture barrier seal verify", isCompleted: true },
          { id: "sub_3", title: "Sign certificate form 4B", isCompleted: true }
        ]
      },
      {
        id: "tsk_202",
        sectionId: "sec_kitchen",
        title: "Cabinet cabinetry final measurements & ordering",
        description: "Cross reference laser scan models with standard shop drawing widths to eliminate gaps prior to manufacturing import.",
        assignedTo: "jordan.designer@buildtrack.com",
        priority: "medium",
        deadline: "2026-06-18",
        status: "in_progress",
        subtasks: [
          { id: "sub_4", title: "Double-check spice drawer margins", isCompleted: true },
          { id: "sub_5", title: "Confirm brass handles offset dimensions", isCompleted: false },
          { id: "sub_6", title: "Email final DXF schematics to factory", isCompleted: false }
        ]
      },
      {
        id: "tsk_203",
        sectionId: "sec_plumbing",
        title: "Under-floor drainage line leak simulation test",
        description: "Pressurize sewage drainage system to 5 bars for 4 hours to verify absolute waterproof assembly.",
        assignedTo: "pierre.handyman@buildtrack.fr",
        priority: "high",
        deadline: "2026-06-14",
        status: "pending",
        subtasks: [
          { id: "sub_7", title: "Apply water-soluble testing dyes", isCompleted: false },
          { id: "sub_8", title: "Review pressure dial logs", isCompleted: false }
        ]
      }
    ],
    photos: [
      {
        id: "p_001",
        sectionId: "sec_kitchen",
        title: "Primary Kitchen Demolition & Rough Strut Framework",
        url: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=1000&auto=format&fit=crop&q=80",
        type: "before",
        comments: [
          { id: "c_1", user: "Alex", text: "Excited to watch this outdated 90s configuration get upgraded!", date: "2026-03-05 10:14" },
          { id: "c_2", user: "Jordan", text: "Be careful of backing wires behind this main chimney column.", date: "2026-03-05 12:45" }
        ],
        tags: ["Demolition", "Kitchen", "Skeletal Structure"],
        uploadDate: "2026-03-05"
      },
      {
        id: "p_002",
        sectionId: "sec_kitchen",
        title: "Premium Kitchen Progress - Drywall & Islands Set",
        url: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=1000&auto=format&fit=crop&q=80",
        type: "progress",
        comments: [
          { id: "c_3", user: "Alex Mercer", text: "Main range hood is mounted now. Plastering is exceptionally sharp.", date: "2026-06-03 16:30" }
        ],
        tags: ["In Progress", "Kitchen", "Plastering"],
        uploadDate: "2026-06-03"
      },
      {
        id: "p_003",
        sectionId: "sec_painting",
        title: "Finished Living Annex Prepped for Custom Primers",
        url: "https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=1000&auto=format&fit=crop&q=80",
        type: "after",
        comments: [],
        tags: ["Painting", "Living Area"],
        uploadDate: "2026-06-10"
      }
    ],
    documents: [
      { id: "doc_1", title: "Official Malibu Council Building Permit 2026.pdf", folder: "Permits", fileType: "pdf", size: "3.4 MB", uploadDate: "2026-02-28" },
      { id: "doc_2", title: "Full Architectural Floorplans Rev.C.pdf", folder: "Plans", fileType: "pdf", size: "18.2 MB", uploadDate: "2026-03-02" },
      { id: "doc_3", title: "Vinci Marble Import Invoice and Spec Sheets.xlsx", folder: "Quotations", fileType: "xlsx", size: "1.1 MB", uploadDate: "2026-05-18" },
      { id: "doc_4", title: "Malibu Aggregates Concrete Delivery Note.pdf", folder: "Receipts", fileType: "pdf", size: "480 KB", uploadDate: "2026-03-15" }
    ]
  },
  {
    id: "proj_2",
    name: "Commercial Office conversion & Loft Fit-Out",
    clientName: "Hyperion Digital Corp",
    address: "109 Broadway street, Floor 4, Manhattan NY 10003",
    description: "Industrial loft renovation transformation into active tech company headquarters. Incorporates custom glass walls, HVAC zoning, network duct arrays, and bespoke meeting rooms units.",
    startDate: "2026-06-01",
    estimatedEndDate: "2026-12-15",
    budget: 250000,
    currency: "DH",
    status: "planning",
    projectType: 'construction',
    creatorEmail: "relhaskouri2@gmail.com",
    members: [
      { email: "relhaskouri2@gmail.com", name: "Project Owner", role: "owner" },
      { email: "ny.builds@engineering.com", name: "NY Engineering Corp", role: "manager" }
    ],
    sections: [
      { id: "sec_hvac", projectId: "proj_2", title: "HVAC Zoning & Duct Installations", progress: 0, status: "planning", notes: "Awaiting final equipment drops scheduled for end of June." },
      { id: "sec_glass", projectId: "proj_2", title: "Glazing & Double Glass Partitions", progress: 5, status: "planning", notes: "Laser mapping has verified accurate lengths." }
    ],
    expenses: [
      {
        id: "exp_201",
        sectionId: "sec_glass",
        title: "Acoustic Glass Slabs Deposit Payment",
        description: "50% commitment invoice deposit to secure custom heavy framing imports.",
        amount: 8000,
        currency: "DH",
        category: "materials",
        date: "2026-06-05",
        paidBy: "relhaskouri2@gmail.com",
        supplier: "Metro Glass Solutions",
        receipts: [],
        notes: "Paid directly via secure commercial wire."
      }
    ],
    tasks: [],
    photos: [],
    documents: [
      { id: "doc_5", title: "Loft Layout Specifications.pdf", folder: "Plans", fileType: "pdf", size: "8.1 MB", uploadDate: "2026-05-25" }
    ]
  }
];

const INITIAL_TIMELINE: TimelineActivity[] = [
  {
    id: "act_1",
    projectId: "proj_1",
    userEmail: "relhaskouri2@gmail.com",
    userName: "Project Owner",
    actionType: "project_created",
    actionDetails: "Activated 'Villa Oasis - Luxury Coastal Renovation' project workspace with customized budget parameters.",
    timestamp: "2026-03-01 09:00"
  },
  {
    id: "act_2",
    projectId: "proj_1",
    userEmail: "alex.contractor@buildtrack.com",
    userName: "Alex Mercer",
    actionType: "expense_added",
    actionDetails: "Logged materials purchase of $4,320 under Masonry, paid to Malibu Aggregates.",
    timestamp: "2026-03-15 15:30"
  },
  {
    id: "act_3",
    projectId: "proj_1",
    userEmail: "relhaskouri2@gmail.com",
    userName: "Project Owner",
    actionType: "task_updated",
    actionDetails: "Certified task 'Poured-concrete structural core wall validation' as fully Completed.",
    timestamp: "2026-03-20 11:15"
  },
  {
    id: "act_4",
    projectId: "proj_1",
    userEmail: "relhaskouri2@gmail.com",
    userName: "Project Owner",
    actionType: "expense_added",
    actionDetails: "Added expense of $12,500 for Carrara Calacatta Marble Countertop Slabs.",
    timestamp: "2026-05-18 14:02"
  },
  {
    id: "act_5",
    projectId: "proj_1",
    userEmail: "alex.contractor@buildtrack.com",
    userName: "Alex Mercer",
    actionType: "status_changed",
    actionDetails: "Updated section 'Plumbing & Bath Fixtures' from Planning to In Progress.",
    timestamp: "2026-05-25 10:00"
  },
  {
    id: "act_6",
    projectId: "proj_1",
    userEmail: "jordan.designer@buildtrack.com",
    userName: "Jordan Vance",
    actionType: "photo_uploaded",
    actionDetails: "Uploaded Kitchen progress photograph showcasing primer Drywall installations.",
    timestamp: "2026-06-03 16:35"
  }
];

const INITIAL_NOTIFICATIONS: AppNotification[] = [
  { id: "not_1", projectId: "proj_1", projectName: "Villa Oasis", text: "New task 'Under-floor drainage line leak simulation test' assigned to you by Alex Mercer.", read: false, timestamp: "2026-06-11 08:30", type: "info" },
  { id: "not_2", projectId: "proj_1", projectName: "Villa Oasis", text: "System Alert: Project is at 62% spend-out rate of overall $185,000 budget.", read: false, timestamp: "2026-06-11 12:00", type: "alert" },
  { id: "not_3", projectId: "proj_1", projectName: "Villa Oasis", text: "Expense of $850 approved for Industrial Floor Sanders by Jordan Vance.", read: true, timestamp: "2026-06-02 09:12", type: "success" }
];

// LocalStorage Synchronization Hooks & Functions
export function initializeDB() {
  if (!localStorage.getItem("buildtrack_projects")) {
    localStorage.setItem("buildtrack_projects", JSON.stringify(INITIAL_PROJECTS));
  }
  if (!localStorage.getItem("buildtrack_activities")) {
    localStorage.setItem("buildtrack_activities", JSON.stringify(INITIAL_TIMELINE));
  }
  if (!localStorage.getItem("buildtrack_notifications")) {
    localStorage.setItem("buildtrack_notifications", JSON.stringify(INITIAL_NOTIFICATIONS));
  }
  if (!localStorage.getItem("buildtrack_lang")) {
    localStorage.setItem("buildtrack_lang", "en");
  }
  if (!localStorage.getItem("buildtrack_theme")) {
    localStorage.setItem("buildtrack_theme", "light");
  }
}

// Fetch APIs
export function getProjects(): Project[] {
  initializeDB();
  const rawList = JSON.parse(localStorage.getItem("buildtrack_projects") || "[]");
  let updated = false;
  const cleanedList = rawList.map((p: any) => {
    let projectUpdated = false;
    let currencyVal = p.currency;
    if (currencyVal === "Moroccan DH" || currencyVal === "MOROCCAN DH" || !currencyVal) {
      currencyVal = "DH";
      projectUpdated = true;
    }
    const expenses = (p.expenses || []).map((e: any) => {
      if (e.currency === "Moroccan DH" || e.currency === "MOROCCAN DH" || !e.currency) {
        projectUpdated = true;
        return { ...e, currency: "DH" };
      }
      return e;
    });

    if (projectUpdated) {
      updated = true;
      return { ...p, currency: currencyVal, expenses };
    }
    return p;
  });

  if (updated) {
    localStorage.setItem("buildtrack_projects", JSON.stringify(cleanedList));
  }
  return cleanedList;
}

export function saveProjects(projects: Project[]) {
  localStorage.setItem("buildtrack_projects", JSON.stringify(projects));
  window.dispatchEvent(new Event('buildtrack_db_update'));
}

export function getActivities(): TimelineActivity[] {
  initializeDB();
  return JSON.parse(localStorage.getItem("buildtrack_activities") || "[]");
}

export function saveActivities(activities: TimelineActivity[]) {
  localStorage.setItem("buildtrack_activities", JSON.stringify(activities));
}

export function getNotifications(): AppNotification[] {
  initializeDB();
  return JSON.parse(localStorage.getItem("buildtrack_notifications") || "[]");
}

export function saveNotifications(notifications: AppNotification[]) {
  localStorage.setItem("buildtrack_notifications", JSON.stringify(notifications));
}

export function getCurrentUser() {
  initializeDB();
  return JSON.parse(localStorage.getItem("buildtrack_user") || "{}");
}

export function getLanguage(): Language {
  initializeDB();
  return (localStorage.getItem("buildtrack_lang") as Language) || 'en';
}

export function saveLanguage(lang: Language) {
  localStorage.setItem("buildtrack_lang", lang);
}

// Dynamic calculations of cost split and dues details
export interface Settlement {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
}

export function calculateSettlements(project: Project): {
  totalSpent: number;
  paidMap: Record<string, number>;
  expectedShares: Record<string, number>;
  settlements: Settlement[];
} {
  const totalSpent = projectSpent(project);
  // Only accepted members share costs — pending/declined invites must not
  // silently shrink everyone's equal share.
  const members = acceptedMembers(project);
  const numMembers = members.length;

  // Track actual amount paid by each member (commission-inclusive invoice price)
  const paidMap: Record<string, number> = {};
  members.forEach(m => { paidMap[m.email] = 0; });
  project.expenses.forEach(exp => {
    const price = expenseInvoicePrice(exp);
    if (paidMap[exp.paidBy] !== undefined) {
      paidMap[exp.paidBy] += price;
    } else {
      // If someone paid who is not in current active members list
      paidMap[exp.paidBy] = price;
    }
  });

  // Adjust paidMap with reimbursements
  if (project.reimbursements) {
    project.reimbursements.forEach(r => {
      if (paidMap[r.from] !== undefined) {
        paidMap[r.from] += r.amount;
      } else {
        paidMap[r.from] = r.amount;
      }
      
      if (paidMap[r.to] !== undefined) {
        paidMap[r.to] -= r.amount;
      } else {
        paidMap[r.to] = -r.amount;
      }
    });
  }

  // Calculate expected shares, split equally among accepted members only.
  const expectedShare = numMembers > 0 ? (totalSpent / numMembers) : 0;
  const expectedShares: Record<string, number> = {};
  members.forEach(m => {
    expectedShares[m.email] = expectedShare;
  });

  // Calculate net balances: Paid - ExpectedShare
  // e.g. Positive balance means member paid MORE than their aggregate share, they need to receive money.
  // Negative balance means member paid LESS than their aggregate share, they need to pay out.
  const balances = members.map(m => ({
    email: m.email,
    name: m.name,
    net: (paidMap[m.email] || 0) - expectedShare
  }));

  const creditors = balances.filter(b => b.net > 0).sort((a, b) => b.net - a.net);
  const debtors = balances.filter(b => b.net < 0).sort((a, b) => a.net - b.net);

  const settlements: Settlement[] = [];
  let credIdx = 0;
  let debIdx = 0;

  // Simple greedy algorithm to match debtors with creditors
  while (credIdx < creditors.length && debIdx < debtors.length) {
    const creditor = creditors[credIdx];
    const debtor = debtors[debIdx];

    const payAmount = Math.min(creditor.net, Math.abs(debtor.net));
    if (payAmount > 0.01) {
      settlements.push({
        from: debtor.email,
        fromName: debtor.name,
        to: creditor.email,
        toName: creditor.name,
        amount: Math.round(payAmount * 100) / 100
      });
    }

    creditor.net -= payAmount;
    debtor.net += payAmount;

    if (creditor.net < 0.01) credIdx++;
    if (Math.abs(debtor.net) < 0.01) debIdx++;
  }

  return {
    totalSpent,
    paidMap,
    expectedShares,
    settlements
  };
}

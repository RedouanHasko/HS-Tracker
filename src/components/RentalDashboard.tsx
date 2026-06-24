import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Building, KeyRound, DollarSign, Calendar, TrendingUp, Plus, Users, ChevronRight, ArrowLeft, Phone, User as UserIcon, CheckCircle2, X, Trash2, Clock, Percent } from 'lucide-react';
import { Project, Language, RentalBooking, RentalBookingStatus } from '../types';
import { TRANSLATIONS } from '../utils/mockData';
import { useAuth } from '../lib/AuthContext';
import { saveProjectToDB, subscribeToProjects } from '../lib/db';
import { useMotionConfig } from '../utils/motionPresets';

interface RentalDashboardProps {
  onSelectProject: (projectId: string) => void;
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
}

export default function RentalDashboard({
  onSelectProject,
  language,
  onBack,
}: RentalDashboardProps) {
  const { user } = useAuth();
  const [rentalProjects, setRentalProjects] = useState<Project[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const t = TRANSLATIONS[language];

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeToProjects(user.uid, (all) => {
      setRentalProjects(all.filter(p => p.projectType === 'rental'));
    });
    return unsub;
  }, [user]);

  const stats = {
    total: rentalProjects.length,
    totalRevenue: rentalProjects.reduce((s, p) => s + (p.rentalBookings || []).reduce((bs, b) => bs + b.totalAmount, 0), 0),
    totalCommission: rentalProjects.reduce((s, p) => s + (p.rentalBookings || []).reduce((bs, b) => bs + b.commission, 0), 0),
    totalBookings: rentalProjects.reduce((s, p) => s + (p.rentalBookings || []).length, 0),
  };

  return (
    <div className="flex min-h-full w-full flex-col">
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 pb-8 pt-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                {language === 'en' ? 'Rental Management' : language === 'fr' ? 'Gestion des Locations' : 'إدارة الإيجارات'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {rentalProjects.length} {language === 'en' ? 'properties' : language === 'fr' ? 'propriétés' : 'عقارات'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {language === 'en' ? 'New Rental' : language === 'fr' ? 'Nouvelle Location' : 'إيجار جديد'}
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-6">
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

        {/* Property List */}
        {rentalProjects.length === 0 ? (
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
          <div className="space-y-3">
            {rentalProjects.map(project => {
              const bookings = project.rentalBookings || [];
              const activeBookings = bookings.filter(b => b.status === 'upcoming' || b.status === 'active');
              const revenue = bookings.reduce((s, b) => s + b.totalAmount, 0);
              const commission = bookings.reduce((s, b) => s + b.commission, 0);
              return (
                <div
                  key={project.id}
                  onClick={() => onSelectProject(project.id)}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-purple-300 dark:hover:border-purple-700 hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Building className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                          {project.rentalProperty?.buildingNumber || project.name}
                        </h3>
                        <span className="text-[10px] text-slate-400 font-mono">#{project.id.slice(-6)}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1"><UserIcon className="w-3 h-3" />{project.rentalProperty?.ownerName}</span>
                        <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{project.rentalProperty?.pricePerNight} DH/{t.rental.nights}</span>
                        <span className="flex items-center gap-1"><Percent className="w-3 h-3" />{project.rentalProperty?.commissionRate}%</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{activeBookings.length} {language === 'en' ? 'active' : language === 'fr' ? 'actives' : 'نشطة'}</span>
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      <p className="font-bold text-slate-900 dark:text-white">{revenue.toLocaleString()} DH</p>
                      <p className="text-emerald-600 dark:text-emerald-400 text-[10px]">{language === 'en' ? 'Commission' : language === 'fr' ? 'Commission' : 'عمولة'}: +{commission.toLocaleString()} DH</p>
                      <p className="text-slate-400 text-[10px]">{bookings.length} {t.rental.bookings}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

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
      </div>
    </div>
  );
}

/* ─── Inline Create Rental Form Modal ─── */
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
  const [commissionRate, setCommissionRate] = useState<10 | 20>(10);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !ownerName.trim() || !buildingNumber.trim() || !pricePerNight || !user?.uid || !user.email) return;
    setSaving(true);

    const projectId = `proj_${Date.now()}`;
    const newProject: Project = {
      id: projectId,
      name: name.trim(),
      clientName: ownerName.trim(),
      address: buildingNumber.trim(),
      description: `${buildingNumber.trim()} — ${ownerName.trim()}`,
      startDate: new Date().toISOString().split('T')[0],
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
      rentalProperty: { ownerName: ownerName.trim(), buildingNumber: buildingNumber.trim(), pricePerNight, commissionRate },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-[2px]" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            {language === 'en' ? 'New Rental Property' : language === 'fr' ? 'Nouvelle Location' : 'عقار إيجار جديد'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3.5 mt-3.5">
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
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{t.rental.pricePerNight}</label>
              <input required type="number" min={0} value={pricePerNight || ''} onChange={e => setPricePerNight(Number(e.target.value))} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400 font-mono" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{t.rental.commissionRate}</label>
              <select value={commissionRate} onChange={e => setCommissionRate(Number(e.target.value) as 10 | 20)} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400 font-semibold">
                <option value={10}>10%</option>
                <option value={20}>20%</option>
              </select>
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

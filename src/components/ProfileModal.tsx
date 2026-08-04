import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  User, 
  Briefcase, 
  Building2, 
  Phone, 
  MapPin, 
  Coins, 
  LogOut, 
  Save, 
  CheckCircle2, 
  AlertCircle,
  Download,
  ShieldCheck,
  Database
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import {
  getUserProfileFromDB,
  migrateProjectToVersionedStorage,
  saveUserProfileToDB,
} from '../lib/db';
import { updateProfile } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Language, Project, UserProfile } from '../types';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useMotionConfig } from '../utils/motionPresets';
import { downloadSystemBackup } from '../utils/systemBackup';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  projects: Project[];
}

const PROFILE_TRANSLATIONS = {
  en: {
    title: "Profile & Account Settings",
    subtitle: "Manage your professional trade identity, company details, and track configurations.",
    fullName: "Full Name (Architect / Engineer)",
    fullNamePlaceholder: "e.g. Jane Doe",
    role: "Professional Role / Specialty",
    rolePlaceholder: "e.g. Senior Civil Engineer",
    company: "Company or Trade Name",
    companyPlaceholder: "e.g. Acme Construction",
    phone: "Contact Mobile No.",
    phonePlaceholder: "e.g. +212 600-000000",
    city: "Location / Station City",
    cityPlaceholder: "e.g. Tanger, Morocco",
    currency: "Preferred Currency Bounds",
    currencyDH: "MAD (Moroccan Dirham)",
    currencyEUR: "EUR (€ Euro)",
    currencyUSD: "USD ($ US Dollar)",
    saveBtn: "Save Profile Settings",
    saving: "Updating account...",
    savedSuccess: "Profile synchronized with cloud database!",
    logoutBtn: "Log Out of Session",
    logoutDesc: "Sign out securely from this device. All workspace changes will remain stored in public or private Firestore cloud storage."
  },
  fr: {
    title: "Paramètres du Profil & Compte",
    subtitle: "Gérez votre identité professionnelle, les détails de votre entreprise et vos configurations.",
    fullName: "Nom Complet (Architecte / Ingénieur)",
    fullNamePlaceholder: "Ex. Jane Doe",
    role: "Rôle Professionnel / Spécialité",
    rolePlaceholder: "Ex. Ingénieur Civil Principal",
    company: "Nom de l'Entreprise o de Trade",
    companyPlaceholder: "Ex. Acme Construction",
    phone: "Téléphone Mobile Contacts",
    phonePlaceholder: "Ex. +212 600-000000",
    city: "Ville / Localisation",
    cityPlaceholder: "Ex. Tanger, Maroc",
    currency: "Devise de Prédilection",
    currencyDH: "MAD (Dirham Marocain)",
    currencyEUR: "EUR (€ Euro)",
    currencyUSD: "USD ($ Dollar US)",
    saveBtn: "Enregistrer le Profil",
    saving: "Mise à jour du compte...",
    savedSuccess: "Profil enregistré avec succès dans le cloud !",
    logoutBtn: "Se déconnecter",
    logoutDesc: "Se déconnecter en toute sécurité de cet appareil. Toutes les modifications resteront stockées sur le cloud Firestore."
  },
  ar: {
    title: "إعدادات الملف الشخصي والحساب",
    subtitle: "إدارة هويتك المهنية، تفاصيل الشركة، وإعدادات التتبع الخاصة بك.",
    fullName: "الاسم الكامل (مهندس / معمار)",
    fullNamePlaceholder: "مثال: أحمد العمراني",
    role: "الدور المهني / التخصص",
    rolePlaceholder: "مثال: مهندس مدني رئيسي",
    company: "اسم الشركة أو العمل المهني",
    companyPlaceholder: "مثال: شركة البناء الحديث",
    phone: "رقم الهاتف المحمول",
    phonePlaceholder: "مثال: +212 600-000000",
    city: "المدينة / الموقع الجغرافي",
    cityPlaceholder: "مثال: طنجة، المغرب",
    currency: "العملة المفضلة للمحاسبة",
    currencyDH: "درهم (الدرهم المغربي)",
    currencyEUR: "يورو (€)",
    currencyUSD: "دولار أمريكي ($)",
    saveBtn: "حفظ إعدادات الملف الشخصي",
    saving: "تحديث الحساب...",
    savedSuccess: "تمت مزامنة الملف الشخصي بنجاح مع قاعدة البيانات!",
    logoutBtn: "تسجيل الخروج من الحساب",
    logoutDesc: "تسجيل الخروج بأمان من هذا الجهاز. ستبقى جميع التعديلات محفوظة بشكل آمن على السحابة."
  }
};

export default function ProfileModal({ isOpen, onClose, language, projects }: ProfileModalProps) {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<UserProfile>({
    fullName: '',
    role: '',
    company: '',
    phone: '',
    city: '',
    currency: 'DH'
  });
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [migrationArmed, setMigrationArmed] = useState(false);
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState('');

  const t = PROFILE_TRANSLATIONS[language] || PROFILE_TRANSLATIONS.en;
  const ownedLegacyProjects = useMemo(() => {
    const email = user?.email?.toLowerCase();
    if (!email) return [];
    return projects.filter(
      (project) =>
        project.storageVersion !== 2 &&
        project.creatorEmail.toLowerCase() === email &&
        project.projectType !== 'service'
    );
  }, [projects, user?.email]);

  useEscapeToClose(isOpen, onClose);

  useEffect(() => {
    async function loadProfile() {
      if (!user?.uid) return;
      try {
        setLoadingProfile(true);
        const data = await getUserProfileFromDB(user.uid);
        if (data) {
          setProfile(data);
        } else {
          // Pre-populate with auth profile details
          setProfile({
            fullName: user.displayName || '',
            role: '',
            company: '',
            phone: '',
            city: '',
            currency: 'DH'
          });
        }
      } catch (err) {
        console.error("Error loading profile:", err);
      } finally {
        setLoadingProfile(false);
      }
    }
    if (isOpen && user) {
      loadProfile();
    }
  }, [isOpen, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;

    try {
      setSubmitting(true);
      setErrorMsg('');
      setSuccessMsg('');

      // Create synthetic avatar based on their name for gorgeous high quality UI
      const nameSeed = encodeURIComponent(profile.fullName || user.email || 'user');
      const generatedAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${nameSeed}&backgroundColor=0284c7`;

      const updatedProfile: UserProfile = {
        ...profile,
        avatarUrl: generatedAvatar
      };

      // 1. Save to firestore
      await saveUserProfileToDB(user.uid, updatedProfile);

      // 2. Update actual firebase user credentials so displayName matches
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: profile.fullName,
          photoURL: generatedAvatar
        });
      }

      setSuccessMsg(t.savedSuccess);
      
      // Dispatch custom update event for global header state updates
      window.dispatchEvent(new CustomEvent('buildtrack_db_update'));
      
      setTimeout(() => {
        setSuccessMsg('');
        onClose();
      }, 1500);

    } catch (err: any) {
      console.error("Error updating profile:", err);
      setErrorMsg("Failed to synchronize changes. Please check internet connection.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    if (window.confirm(language === 'ar' ? 'هل أنت متأكد من رغبتك في تسجيل الخروج؟' : language === 'fr' ? 'Êtes-vous sûr de vouloir vous déconnecter ?' : 'Are you sure you want to sign out?')) {
      onClose();
      await signOut();
    }
  };

  const prepareMigration = () => {
    downloadSystemBackup(projects, user?.email || undefined);
    setMigrationStatus('');
    setMigrationArmed(true);
  };

  const runMigration = async () => {
    if (!migrationArmed || ownedLegacyProjects.length === 0) return;
    setMigrationBusy(true);
    setMigrationStatus('');
    try {
      for (const project of ownedLegacyProjects) {
        await migrateProjectToVersionedStorage(project);
      }
      setMigrationStatus(
        language === 'fr'
          ? `${ownedLegacyProjects.length} espace(s) optimise(s) sans perte de donnees.`
          : language === 'ar'
            ? `تم تحسين ${ownedLegacyProjects.length} مساحة عمل بدون فقدان البيانات.`
            : `${ownedLegacyProjects.length} workspace(s) optimized without data loss.`
      );
      setMigrationArmed(false);
      window.dispatchEvent(new CustomEvent('buildtrack_db_update'));
    } catch (error) {
      setMigrationStatus(error instanceof Error ? error.message : 'Migration failed.');
    } finally {
      setMigrationBusy(false);
    }
  };

  const backupCopy = language === 'fr'
    ? {
        title: 'Sauvegarde des donnees',
        description: `Telecharger une copie versionnee de ${projects.length} espace(s) de travail sans modifier Firestore.`,
        button: 'Telecharger la sauvegarde',
      }
    : language === 'ar'
      ? {
          title: 'نسخة احتياطية للبيانات',
          description: `تنزيل نسخة مؤرخة من ${projects.length} مساحة عمل دون تغيير بيانات Firestore.`,
          button: 'تنزيل النسخة الاحتياطية',
        }
      : {
          title: 'Data backup',
          description: `Download a versioned copy of ${projects.length} workspace(s) without changing Firestore.`,
          button: 'Download backup',
        };

  const { modal, modalVariants, overlayVariants, overlay } = useMotionConfig();

  return (
    <AnimatePresence>
      {isOpen && (
      <motion.div
        className="fixed inset-0 z-[150] flex max-h-[100dvh] items-start justify-center overflow-y-auto p-3 font-sans sm:items-center sm:p-4"
        role="presentation"
        variants={overlayVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={overlay}
      >
        <motion.button
          type="button"
          className="absolute inset-0 bg-black/60 backdrop-blur-sm max-sm:backdrop-blur-none transform-gpu"
          onClick={onClose}
          aria-label="Close"
          tabIndex={-1}
        />
        <motion.div
          variants={modalVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={modal}
          className="panel-motion-gpu relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:max-h-[calc(100dvh-2rem)]"
          id="user-profile-settings-modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          {/* Header block with elegant design */}
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-850 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/20">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t.title}
              </h2>
              <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                {t.subtitle}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1 px-1.5 rounded-lg text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 max-h-[75vh]">
            {loadingProfile ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin"/>
                <span className="text-xs text-slate-400 font-medium">Loading profile data...</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                
                {/* Visual Avatar preview banner */}
                <div className="flex items-center gap-4 bg-sky-500/10 dark:bg-sky-500/5 p-4 rounded-xl border border-sky-500/20">
                  <div className="h-14 w-14 rounded-full bg-sky-500 text-white flex items-center justify-center font-bold text-xl uppercase shadow-md ring-4 ring-white dark:ring-slate-900 shrink-0 select-none">
                    {profile.fullName?.charAt(0) || user?.email?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-none">
                      {profile.fullName || user?.displayName || "HS Tracker User"}
                    </h3>
                    <p className="text-[10.5px] text-slate-450 dark:text-slate-400 font-mono mt-1">
                      {user?.email}
                    </p>
                    <span className="inline-block px-2 py-0.5 mt-1.5 text-[9px] bg-sky-100 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 rounded-full font-bold">
                      {profile.role || (language === 'en' ? 'Member' : language === 'fr' ? 'Membre' : 'عضو')}
                    </span>
                  </div>
                </div>

                {successMsg && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs flex items-center gap-2.5 font-medium"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>{successMsg}</span>
                  </motion.div>
                )}

                {errorMsg && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl text-xs flex items-center gap-2.5 font-medium"
                  >
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>{errorMsg}</span>
                  </motion.div>
                )}

                <div className="space-y-4">
                  {/* Full Name field */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5 flex items-center gap-1.5">
                      <User className="w-3 h-3 text-sky-500" />
                      <span>{t.fullName}</span>
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500 font-semibold"
                      value={profile.fullName}
                      onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                      placeholder={t.fullNamePlaceholder}
                      required
                    />
                  </div>

                  {/* Professional Role & Company Name side-by-side */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5 flex items-center gap-1.5">
                        <Briefcase className="w-3 h-3 text-sky-500" />
                        <span>{t.role}</span>
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                        value={profile.role}
                        onChange={(e) => setProfile({ ...profile, role: e.target.value })}
                        placeholder={t.rolePlaceholder}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5 flex items-center gap-1.5">
                        <Building2 className="w-3 h-3 text-sky-500" />
                        <span>{t.company}</span>
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500 font-medium"
                        value={profile.company}
                        onChange={(e) => setProfile({ ...profile, company: e.target.value })}
                        placeholder={t.companyPlaceholder}
                      />
                    </div>
                  </div>

                  {/* Phone & City Location */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5 flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-sky-500" />
                        <span>{t.phone}</span>
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
                        value={profile.phone}
                        onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                        placeholder={t.phonePlaceholder}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5 flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-sky-500" />
                        <span>{t.city}</span>
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                        value={profile.city}
                        onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                        placeholder={t.cityPlaceholder}
                      />
                    </div>
                  </div>

                  {/* Currency settings option */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5 flex items-center gap-1.5">
                      <Coins className="w-3 h-3 text-sky-500" />
                      <span>{t.currency}</span>
                    </label>
                    <select
                      value={profile.currency}
                      onChange={(e) => setProfile({ ...profile, currency: e.target.value })}
                      className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500 font-semibold"
                    >
                      <option value="DH">{t.currencyDH}</option>
                      <option value="EUR">{t.currencyEUR}</option>
                      <option value="USD">{t.currencyUSD}</option>
                    </select>
                  </div>
                </div>

                {/* Form Save Button */}
                <div className="pt-3">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-white transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{submitting ? t.saving : t.saveBtn}</span>
                  </button>
                </div>
              </form>
            )}

            <section className="border-t border-slate-100 pt-6 dark:border-slate-850">
              <div className="flex flex-col gap-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
                      {backupCopy.title}
                    </h3>
                    <p className="mt-1 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                      {backupCopy.description}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => downloadSystemBackup(projects, user?.email || undefined)}
                  disabled={projects.length === 0}
                  className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-emerald-600 bg-emerald-600 px-3 text-xs font-bold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  {backupCopy.button}
                </button>
              </div>
              {ownedLegacyProjects.length > 0 && (
                <div className="mt-3 rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
                  <div className="flex items-start gap-3">
                    <Database className="mt-0.5 h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" />
                    <div className="min-w-0">
                      <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
                        {language === 'fr'
                          ? 'Optimiser le stockage des espaces'
                          : language === 'ar'
                            ? 'تحسين تخزين مساحات العمل'
                            : 'Optimize workspace storage'}
                      </h3>
                      <p className="mt-1 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                        {language === 'fr'
                          ? `${ownedLegacyProjects.length} espace(s) vous appartenant utilisent encore l'ancien format. Une sauvegarde est requise avant la migration.`
                          : language === 'ar'
                            ? `${ownedLegacyProjects.length} مساحة عمل مملوكة لك ما زالت تستخدم التخزين القديم. يجب تنزيل نسخة احتياطية قبل الترحيل.`
                            : `${ownedLegacyProjects.length} workspace(s) you own still use legacy storage. Download a backup before migration.`}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={prepareMigration}
                      disabled={migrationBusy}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {language === 'fr' ? 'Sauvegarder d’abord' : language === 'ar' ? 'نسخة احتياطية أولا' : 'Back up first'}
                    </button>
                    <button
                      type="button"
                      onClick={runMigration}
                      disabled={!migrationArmed || migrationBusy}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-sky-600 px-3 text-xs font-bold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Database className="h-3.5 w-3.5" />
                      {migrationBusy
                        ? (language === 'fr' ? 'Migration...' : language === 'ar' ? 'جار الترحيل...' : 'Migrating...')
                        : (language === 'fr' ? 'Confirmer la migration' : language === 'ar' ? 'تأكيد الترحيل' : 'Confirm migration')}
                    </button>
                  </div>
                  {migrationStatus && (
                    <p className="mt-3 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                      {migrationStatus}
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* Structured Logout Center block */}
            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-850">
              <div className="bg-red-500/5 hover:bg-red-500/10 transition-colors p-4 rounded-xl border border-red-500/15 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1 max-w-[80%]">
                  <span className="text-xs font-extrabold text-red-650 dark:text-red-400 block tracking-tight">
                    {t.logoutBtn}
                  </span>
                  <p className="text-[10px] text-slate-400 dark:text-slate-450 leading-relaxed">
                    {t.logoutDesc}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-4 py-2 shrink-0 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white shadow-sm hover:shadow transition-all cursor-pointer flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? 'تسجيل الخروج' : language === 'fr' ? 'Déconnexion' : 'Log Out'}</span>
                </button>
              </div>
            </div>

          </div>
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  );
}

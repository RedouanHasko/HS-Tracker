import React, { useRef } from 'react';
import { Search, Bell, Globe, Sun, Moon, Plus, X, ChevronDown, User } from 'lucide-react';
import { Language } from '../types';
import { AnimatePresence, motion } from 'motion/react';
import ClickOutsideScrim from './ui/ClickOutsideScrim';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useMotionConfig } from '../utils/motionPresets';

interface MobileDropdownMenuProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onOpenNotifications: () => void;
  onCreateProject: () => void;
  onOpenProfile: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export default function MobileDropdownMenu({
  isOpen,
  onClose,
  language,
  onLanguageChange,
  theme,
  onThemeToggle,
  onOpenNotifications,
  onCreateProject,
  onOpenProfile,
  searchQuery,
  setSearchQuery
}: MobileDropdownMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { dropdown, dropdownVariants } = useMotionConfig();
  useEscapeToClose(isOpen, onClose);

  return (
    <AnimatePresence>
      {isOpen && (
    <>
      <ClickOutsideScrim onClose={onClose} zClassName="z-[119]" className="bg-black/10" />
      <motion.div
      key="mobile-dropdown"
      variants={dropdownVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={dropdown}
      className="panel-motion-gpu fixed top-[calc(var(--navbar-height)+0.5rem)] right-4 left-4 z-[120] sm:left-auto sm:w-[280px] overflow-hidden rounded-2xl border border-slate-200 bg-white/95 p-2.5 shadow-2xl backdrop-blur-md max-sm:backdrop-blur-none dark:border-slate-800 dark:bg-slate-900/95"
      ref={menuRef}
    >
      <div className="flex flex-col p-1 gap-1">
        <div className="relative p-1.5">
          <Search className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200/60 dark:border-slate-800 focus:ring-1 focus:ring-sky-500 text-sm focus:outline-none transition-all placeholder:text-slate-400"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={language === 'en' ? 'Search projects...' : language === 'fr' ? 'Rechercher des projets...' : 'ابحث في المشاريع...'}
          />
        </div>
        <div className="h-px bg-slate-100 dark:bg-slate-800/60 my-1 mx-2"/>
        <button onClick={() => { onOpenNotifications(); onClose(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <div className="p-1.5 bg-sky-100 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400 rounded-lg">
            <Bell className="w-4 h-4" />
          </div>
          {language === 'en' ? 'Notifications' : language === 'fr' ? 'Notifications' : 'الإشعارات'}
        </button>
        <button onClick={() => { onOpenProfile(); onClose(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <div className="p-1.5 bg-sky-100 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400 rounded-lg">
            <User className="w-4 h-4" />
          </div>
          {language === 'en' ? 'Profile Settings' : language === 'fr' ? 'Configuration de Profil' : 'إعدادات الحساب'}
        </button>
        <button onClick={() => { onThemeToggle(); onClose(); }} className="flex items-center justify-between px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-amber-100 text-amber-600 dark:bg-slate-800 dark:text-slate-400 rounded-lg">
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-400" />}
            </div>
            <span>{language === 'en' ? 'Theme' : language === 'fr' ? 'Thème' : 'المظهر'}</span>
          </div>
          <span className="text-[10px] text-slate-400 uppercase tracking-widest">{theme === 'light' ? (language === 'en' ? 'light' : language === 'fr' ? 'clair' : 'فاتح') : (language === 'en' ? 'dark' : language === 'fr' ? 'sombre' : 'داكن')}</span>
        </button>
        <button onClick={() => { onCreateProject(); onClose(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <div className="p-1.5 bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 rounded-lg">
            <Plus className="w-4 h-4" />
          </div>
          {language === 'en' ? 'Create Project' : language === 'fr' ? 'Créer un projet' : 'إنشاء مشروع'}
        </button>
        <div className="h-px bg-slate-100 dark:bg-slate-800/60 my-1 mx-2"/>
        <div className="flex items-center justify-between px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 rounded-lg">
                <Globe className="w-4 h-4" />
              </div>
              {language === 'en' ? 'Language' : language === 'fr' ? 'Langue' : 'اللغة'}
            </div>
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                {(['en', 'fr', 'ar'] as const).map(lang => (
                    <button key={lang} onClick={() => onLanguageChange(lang)} className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${language === lang ? 'bg-white dark:bg-slate-700 shadow-sm text-sky-600 dark:text-sky-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                    {lang}
                    </button>
                ))}
            </div>
        </div>
      </div>
    </motion.div>
    </>
      )}
    </AnimatePresence>
  );
}

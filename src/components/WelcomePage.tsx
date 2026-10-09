import React from 'react';
import { Building, Globe, KeyRound, Moon, PlusCircle, Sun } from 'lucide-react';
import { Language } from '../types';
import { TRANSLATIONS } from '../utils/mockData';
import { HSLogo } from './HSLogo';

interface WelcomePageProps {
  language: Language;
  onSelectType: (type: 'construction' | 'rental') => void;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onLanguageChange: (language: Language) => void;
}

export default function WelcomePage({ language, onSelectType, theme, onThemeToggle, onLanguageChange }: WelcomePageProps) {
  const t = TRANSLATIONS[language];

  return (
    <div className="relative flex min-h-[100dvh] w-full items-center justify-center bg-gradient-to-b from-white via-slate-50/80 to-slate-50/40 dark:from-[#121212] dark:via-[#1a1a2e] dark:to-[#121212]">
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:right-4 sm:top-4">
        <button
          type="button"
          onClick={() => onLanguageChange(language === 'en' ? 'fr' : language === 'fr' ? 'ar' : 'en')}
          className="flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-2 text-[10px] font-bold text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          title={language === 'en' ? 'Change language' : language === 'fr' ? 'Changer de langue' : 'تغيير اللغة'}
          aria-label={language === 'en' ? 'Change language' : language === 'fr' ? 'Changer de langue' : 'تغيير اللغة'}
        >
          <Globe className="h-3.5 w-3.5" />
          <span className="font-mono">{language.toUpperCase()}</span>
        </button>
        <button
          type="button"
          onClick={onThemeToggle}
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          title={theme === 'light' ? (language === 'fr' ? 'Mode sombre' : language === 'ar' ? 'الوضع الداكن' : 'Dark mode') : (language === 'fr' ? 'Mode clair' : language === 'ar' ? 'الوضع الفاتح' : 'Light mode')}
          aria-label={theme === 'light' ? 'Dark mode' : 'Light mode'}
        >
          {theme === 'light' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5 text-amber-500" />}
        </button>
      </div>
      <div className="mx-auto flex max-w-4xl flex-col items-center px-3 pb-8 pt-20 text-center sm:px-4 sm:py-16">
        <div className="mb-8">
          <div className="mb-5 flex justify-center">
            <HSLogo
              compact
              className="mx-auto block h-20 w-auto max-w-[80vw]"
            />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-3">
            {language === 'en' ? 'Welcome to HS Tracker' : language === 'fr' ? 'Bienvenue sur HS Tracker' : 'مرحباً بك في HS Tracker'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
            {language === 'en'
              ? 'Choose a workspace to get started.'
              : language === 'fr'
                ? 'Choisissez un espace de travail pour commencer.'
                : 'اختر مساحة عمل للبدء.'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
          {/* Construction */}
          <button
            onClick={() => onSelectType('construction')}
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
                ? 'Renovations, building projects, budgets, expenses, and team collaboration.'
                : language === 'fr'
                  ? 'Rénovations, chantiers, budgets, dépenses et collaboration.'
                  : 'التجديدات ومشاريع البناء والميزانيات والمصروفات والتعاون الجماعي.'}
            </p>
            <span className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-sky-600 dark:text-sky-400 group-hover:gap-1.5 transition-all">
              <PlusCircle className="w-3.5 h-3.5" />
              {language === 'en' ? 'Open Workspace' : language === 'fr' ? 'Ouvrir' : 'فتح مساحة العمل'}
            </span>
          </button>

          {/* Rental */}
          <button
            onClick={() => onSelectType('rental')}
            className="group p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-purple-400 dark:hover:border-purple-500 transition-all cursor-pointer text-left hover:shadow-lg hover:-translate-y-0.5"
          >
            <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
              <KeyRound className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-1">
              {language === 'en' ? 'Rentals' : language === 'fr' ? 'Locations' : 'إيجارات'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {language === 'en'
                ? 'Apartments, villas bookings, owner payouts, commissions, and guest management.'
                : language === 'fr'
                  ? 'Appartements, réservations, commissions, paiements propriétaires.'
                  : 'إدارة حجوزات الشقق والفيلات والعمولات ومعلومات النزلاء.'}
            </p>
            <span className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-purple-600 dark:text-purple-400 group-hover:gap-1.5 transition-all">
              <PlusCircle className="w-3.5 h-3.5" />
              {language === 'en' ? 'Open Workspace' : language === 'fr' ? 'Ouvrir' : 'فتح مساحة العمل'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

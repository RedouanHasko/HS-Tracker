import React from 'react';
import { Building, Briefcase, KeyRound, PlusCircle } from 'lucide-react';
import { Language } from '../types';
import { TRANSLATIONS } from '../utils/mockData';

interface WelcomePageProps {
  language: Language;
  onSelectType: (type: 'construction' | 'service' | 'rental') => void;
}

export default function WelcomePage({ language, onSelectType }: WelcomePageProps) {
  const t = TRANSLATIONS[language];

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-b from-white via-slate-50/80 to-slate-50/40 dark:from-[#121212] dark:via-[#1a1a2e] dark:to-[#121212]">
      <div className="flex flex-col items-center text-center px-4 py-16 max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 shadow-lg shadow-sky-200 dark:shadow-sky-950 mb-5">
            <span className="text-3xl font-bold text-white">HS</span>
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-3xl">
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

          {/* Service */}
          <button
            onClick={() => onSelectType('service')}
            className="group p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-teal-400 dark:hover:border-teal-500 transition-all cursor-pointer text-left hover:shadow-lg hover:-translate-y-0.5"
          >
            <div className="w-12 h-12 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
              <Briefcase className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-1">
              {language === 'en' ? 'Services' : language === 'fr' ? 'Services' : 'خدمات'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {language === 'en'
                ? 'Maintenance tasks, service orders, and expense tracking without budgets.'
                : language === 'fr'
                  ? 'Tâches de maintenance, ordres de service et suivi des dépenses.'
                  : 'مهام الصيانة وأوامر الخدمة وتتبع المصروفات بدون ميزانيات.'}
            </p>
            <span className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-teal-600 dark:text-teal-400 group-hover:gap-1.5 transition-all">
              <PlusCircle className="w-3.5 h-3.5" />
              {language === 'en' ? 'Coming Soon' : language === 'fr' ? 'Bientôt' : 'قريباً'}
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

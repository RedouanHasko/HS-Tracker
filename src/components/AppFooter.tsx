import React from 'react';
import { HSLogo } from './HSLogo';
import { Language } from '../types';
import { getLanguage } from '../utils/mockData';

const FOOTER_COPY: Record<
  Language,
  { developedBy: string; rights: string; tagline: string }
> = {
  en: {
    developedBy: 'Developed by',
    rights: 'All rights reserved.',
    tagline: 'Construction workspace management',
  },
  fr: {
    developedBy: 'Développé par',
    rights: 'Tous droits réservés.',
    tagline: 'Gestion d\'espaces de chantier',
  },
  ar: {
    developedBy: 'طوّر بواسطة',
    rights: 'جميع الحقوق محفوظة.',
    tagline: 'إدارة مساحات عمل البناء',
  },
};

const DEVELOPER_NAME = 'Redouan EL HASKOURI';
const CURRENT_YEAR = new Date().getFullYear();

export interface AppFooterProps {
  language?: Language;
  /** Tighter padding on auth / minimal layouts */
  variant?: 'default' | 'compact';
}

/**
 * Site-wide footer — sticks to the bottom of the viewport when content is short.
 */
export function AppFooter({ language, variant = 'default' }: AppFooterProps) {
  const lang = language ?? getLanguage();
  const copy = FOOTER_COPY[lang];

  return (
    <footer
      className={`mt-auto shrink-0 border-t border-slate-200/80 bg-white/70 backdrop-blur-sm dark:border-slate-800/80 dark:bg-[#161616]/90 ${
        variant === 'compact' ? 'px-4 py-3' : 'px-4 py-4 sm:px-6 lg:px-8'
      }`}
      role="contentinfo"
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-center sm:flex-row sm:gap-4 sm:text-start">
        <div className="flex items-center gap-2.5">
          <HSLogo className="h-7 w-7 shrink-0" compact />
          <div className="min-w-0 text-start">
            <p className="text-xs font-bold tracking-tight text-slate-800 dark:text-slate-100">
              HS Tracker
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">{copy.tagline}</p>
          </div>
        </div>

        <div className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 sm:text-end">
          <p>
            <span>{copy.developedBy} </span>
            <span className="font-semibold text-slate-700 dark:text-slate-200">{DEVELOPER_NAME}</span>
          </p>
          <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
            © {CURRENT_YEAR} HS Tracker · {copy.rights}
          </p>
        </div>
      </div>
    </footer>
  );
}

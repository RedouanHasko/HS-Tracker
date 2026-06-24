import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, Share, X, Smartphone } from 'lucide-react';
import { Language } from '../types';
import { HSLogo } from './HSLogo';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const COPY: Record<
  Language,
  {
    title: string;
    subtitle: string;
    install: string;
    iosTitle: string;
    iosSteps: string;
    dismiss: string;
  }
> = {
  en: {
    title: 'Install HS Tracker',
    subtitle: 'Add to your home screen for quick access like a native app.',
    install: 'Install app',
    iosTitle: 'Add to Home Screen',
    iosSteps: 'Tap Share ↑ then “Add to Home Screen”.',
    dismiss: 'Not now',
  },
  fr: {
    title: 'Installer HS Tracker',
    subtitle: 'Ajoutez à l’écran d’accueil pour un accès rapide.',
    install: 'Installer',
    iosTitle: 'Sur l’écran d’accueil',
    iosSteps: 'Appuyez sur Partager ↑ puis « Sur l’écran d’accueil ».',
    dismiss: 'Plus tard',
  },
  ar: {
    title: 'تثبيت HS Tracker',
    subtitle: 'أضف التطبيق إلى الشاشة الرئيسية للوصول السريع.',
    install: 'تثبيت التطبيق',
    iosTitle: 'إضافة إلى الشاشة الرئيسية',
    iosSteps: 'اضغط مشاركة ↑ ثم «Add to Home Screen».',
    dismiss: 'ليس الآن',
  },
};

const DISMISS_KEY = 'hs_tracker_install_dismissed';

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  return isIOS && isSafari;
}

/**
 * Prompts mobile users to install the PWA (Android banner / iOS Add to Home Screen hint).
 */
export default function InstallAppPrompt({ language }: { language: Language }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<'android' | 'ios'>('android');

  const t = COPY[language];

  useEffect(() => {
    if (isStandalone() || !isMobileDevice()) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      /* ignore */
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setMode('android');
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', onBip);

    if (isIosSafari()) {
      window.setTimeout(() => {
        setMode('ios');
        setVisible(true);
      }, 2500);
    }

    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  };

  if (isStandalone()) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 48 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 48 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-0 left-0 right-0 z-[200] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <div className="mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-2xl backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/95">
            <div className="shrink-0 rounded-xl bg-slate-100 p-2 dark:bg-slate-800">
              <HSLogo className="h-10 w-10" compact />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {mode === 'ios' ? t.iosTitle : t.title}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {mode === 'ios' ? t.iosSteps : t.subtitle}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {mode === 'android' && deferredPrompt && (
                  <button
                    type="button"
                    onClick={handleInstall}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white dark:bg-white dark:text-slate-900"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t.install}
                  </button>
                )}
                {mode === 'ios' && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <Share className="h-3.5 w-3.5" />
                    Safari → Share
                  </span>
                )}
                <button
                  type="button"
                  onClick={dismiss}
                  className="rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400"
                >
                  {t.dismiss}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label={t.dismiss}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Small badge when already running as installed app */
export function InstalledAppBadge({ language }: { language: Language }) {
  if (!isStandalone()) return null;
  return (
    <span className="hidden items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400 sm:inline-flex">
      <Smartphone className="h-3 w-3" />
      {language === 'en' ? 'App mode' : language === 'fr' ? 'Mode app' : 'وضع التطبيق'}
    </span>
  );
}

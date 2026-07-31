import React from 'react';
import { motion } from 'motion/react';
import { HSLogo } from '../HSLogo';

interface AppLoaderProps {
  label?: string;
}

/** Full-screen loading state with smooth animation */
export function AppLoader({ label }: AppLoaderProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-gradient-to-b from-slate-50 to-cyan-50/30 dark:from-slate-950 dark:to-slate-900">
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative"
      >
        <motion.div
          className="absolute inset-0 rounded-2xl bg-cyan-400/20 blur-xl"
          animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-white/60 bg-white/80 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/80">
          <HSLogo className="h-10 w-10" compact />
        </div>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.35 }}
        className="flex flex-col items-center gap-3"
      >
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-cyan-500"
              animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.12 }}
            />
          ))}
        </div>
        {label && (
          <p className="text-xs font-medium tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
        )}
      </motion.div>
    </div>
  );
}

/** Inline loading spinner for panels and buttons */
export function InlineLoader({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <motion.span
      className={`inline-block rounded-full border-2 border-cyan-500/25 border-t-cyan-500 ${className}`}
      animate={{ rotate: 360 }}
      transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
    />
  );
}

/** Fade-in wrapper for tab panels and cards */
export function FadeIn({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  key?: React.Key;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.28, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

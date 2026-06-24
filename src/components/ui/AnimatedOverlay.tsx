import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useMotionConfig } from '../../utils/motionPresets';

interface AnimatedOverlayProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Tailwind z-index on the root container */
  zClassName?: string;
  /** Center children (modals) vs align end (drawers) */
  align?: 'center' | 'end';
  className?: string;
  scrimClassName?: string;
}

/**
 * Modal / drawer shell with animated scrim and GPU-friendly panel slot.
 */
export default function AnimatedOverlay({
  open,
  onClose,
  children,
  zClassName = 'z-[130]',
  align = 'center',
  className = '',
  scrimClassName = 'bg-black/50 max-sm:bg-black/40',
}: AnimatedOverlayProps) {
  const { overlay, overlayVariants } = useMotionConfig();

  return (
    <AnimatePresence>
      {open && (
        <div
          className={`fixed inset-0 ${zClassName} flex ${
            align === 'end' ? 'items-end justify-end' : 'items-center justify-center'
          } p-0 sm:p-4 ${className}`}
        >
          <motion.button
            type="button"
            variants={overlayVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={overlay}
            className={`absolute inset-0 ${scrimClassName} backdrop-blur-[2px] max-sm:backdrop-blur-none transform-gpu`}
            onClick={onClose}
            aria-label="Close"
            tabIndex={-1}
          />
          {children}
        </div>
      )}
    </AnimatePresence>
  );
}

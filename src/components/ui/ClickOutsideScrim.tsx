import React from 'react';
import { motion } from 'motion/react';
import { useMotionConfig } from '../../utils/motionPresets';

interface ClickOutsideScrimProps {
  onClose: () => void;
  /** Tailwind z-index class, e.g. z-[119] */
  zClassName?: string;
  /** Optional dimming, e.g. bg-black/20 */
  className?: string;
}

/**
 * Full-screen dimmed layer behind dropdowns — fades in/out, click to dismiss.
 */
export default function ClickOutsideScrim({
  onClose,
  zClassName = 'z-[110]',
  className = 'bg-transparent',
}: ClickOutsideScrimProps) {
  const { overlay, overlayVariants } = useMotionConfig();

  return (
    <motion.button
      type="button"
      variants={overlayVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={overlay}
      className={`fixed inset-0 ${zClassName} ${className} transform-gpu`}
      onClick={onClose}
      aria-label="Close"
      tabIndex={-1}
    />
  );
}

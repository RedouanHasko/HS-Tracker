import { useReducedMotion } from 'motion/react';
import type { Transition, Variants } from 'motion/react';

/** Smooth deceleration — matches AppLoader / premium UI feel */
export const EASE_OUT_SMOOTH = [0.22, 1, 0.36, 1] as const;

export const MOTION = {
  dropdown: { duration: 0.22, ease: EASE_OUT_SMOOTH } satisfies Transition,
  overlay: { duration: 0.26, ease: EASE_OUT_SMOOTH } satisfies Transition,
  modal: { duration: 0.3, ease: EASE_OUT_SMOOTH } satisfies Transition,
  page: { duration: 0.2, ease: EASE_OUT_SMOOTH } satisfies Transition,
  drawerSpring: {
    type: 'spring',
    damping: 34,
    stiffness: 420,
    mass: 0.88,
  } satisfies Transition,
  sidebarSpring: {
    type: 'spring',
    damping: 30,
    stiffness: 380,
    mass: 0.92,
  } satisfies Transition,
} as const;

const INSTANT: Transition = { duration: 0.01 };

/** Respects prefers-reduced-motion for all overlay / panel transitions */
export function useMotionConfig() {
  const reduce = useReducedMotion();

  const t = (preset: Transition): Transition => (reduce ? INSTANT : preset);

  return {
    reduce: !!reduce,
    overlay: t(MOTION.overlay),
    dropdown: t(MOTION.dropdown),
    modal: t(MOTION.modal),
    page: t(MOTION.page),
    drawer: t(MOTION.drawerSpring),
    sidebar: t(MOTION.sidebarSpring),
    dropdownVariants: {
      initial: { opacity: 0, y: -8, scale: 0.97 },
      animate: { opacity: 1, y: 0, scale: 1 },
      exit: { opacity: 0, y: -6, scale: 0.98 },
    } satisfies Variants,
    modalVariants: {
      initial: { opacity: 0, scale: 0.96, y: 12 },
      animate: { opacity: 1, scale: 1, y: 0 },
      exit: { opacity: 0, scale: 0.97, y: 8 },
    } satisfies Variants,
    drawerRightVariants: {
      initial: { x: '100%' },
      animate: { x: 0 },
      exit: { x: '100%' },
    } satisfies Variants,
    sheetBottomVariants: {
      initial: { opacity: 0, y: '100%' },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: '100%' },
    } satisfies Variants,
    sheetBottomDesktopVariants: {
      initial: { opacity: 0, scale: 0.96, y: 16 },
      animate: { opacity: 1, scale: 1, y: 0 },
      exit: { opacity: 0, scale: 0.97, y: 12 },
    } satisfies Variants,
    overlayVariants: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    } satisfies Variants,
  };
}

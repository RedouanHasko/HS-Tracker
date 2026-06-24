import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Language } from '../types';

const TITLES: Record<Language, string> = {
  en: 'AI Assistant',
  fr: 'Assistant IA',
  ar: 'المساعد',
};

/** Max pupil travel in px (flat eye shift inside the circle) */
const GAZE_MAX = 3.5;
const IDLE_MS = 1800;
const LERP = 0.14;

interface AIAssistantFabProps {
  onClick: () => void;
  language: Language;
}

/**
 * Floating AI launcher — flat eyes that follow the cursor, or wander when idle / on touch.
 */
export function AIAssistantFab({ onClick, language }: AIAssistantFabProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const lastPointerRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const aimAtScreenPoint = (clientX: number, clientY: number) => {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.hypot(dx, dy) || 1;
      targetRef.current = {
        x: (dx / dist) * GAZE_MAX,
        y: (dy / dist) * GAZE_MAX,
      };
    };

    const onPointerMove = (e: PointerEvent) => {
      lastPointerRef.current = Date.now();
      aimAtScreenPoint(e.clientX, e.clientY);
    };

    const tick = () => {
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      const idle = Date.now() - lastPointerRef.current > IDLE_MS;

      let tx = targetRef.current.x;
      let ty = targetRef.current.y;

      if (idle || coarse) {
        const t = Date.now();
        tx = Math.sin(t / 850) * GAZE_MAX * 0.9;
        ty = Math.cos(t / 1050) * GAZE_MAX * 0.75;
      }

      currentRef.current = {
        x: currentRef.current.x + (tx - currentRef.current.x) * LERP,
        y: currentRef.current.y + (ty - currentRef.current.y) * LERP,
      };
      setGaze({ x: currentRef.current.x, y: currentRef.current.y });
      rafRef.current = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const eyeStyle = {
    transform: `translate(${gaze.x}px, ${gaze.y}px)`,
  };

  const fab = (
    <div className="ai-bot-fab-wrap">
      <span className="ai-bot-glow" aria-hidden="true" />
      <button
        ref={btnRef}
        type="button"
        onClick={onClick}
        className="ai-bot-fab"
        title={TITLES[language]}
        aria-label={TITLES[language]}
      >
        <span className="ai-bot-eye" style={eyeStyle} aria-hidden="true" />
        <span className="ai-bot-eye" style={eyeStyle} aria-hidden="true" />
      </button>
    </div>
  );

  return createPortal(fab, document.body);
}

export default AIAssistantFab;

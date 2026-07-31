import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Language } from '../types';

const TITLES: Record<Language, string> = {
  en: 'AI Assistant',
  fr: 'Assistant IA',
  ar: 'المساعد',
};

/** Max pupil travel in px (flat eye shift inside the circle) */
const GAZE_MAX = 7;
const IDLE_MS = 1800;
const LERP = 0.11;

interface AIAssistantFabProps {
  onClick: () => void;
  language: Language;
}

/**
 * Floating AI launcher — flat eyes that follow the cursor, or wander when idle / on touch.
 */
export function AIAssistantFab({ onClick, language }: AIAssistantFabProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const eyeRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const [isBlinking, setIsBlinking] = useState(false);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const lastPointerRef = useRef(Date.now());
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
      const attention = Math.min(1, dist / 180);
      targetRef.current = {
        x: (dx / dist) * GAZE_MAX * attention,
        y: (dy / dist) * GAZE_MAX * attention,
      };
    };

    const onPointerMove = (e: PointerEvent) => {
      lastPointerRef.current = Date.now();
      aimAtScreenPoint(e.clientX, e.clientY);
    };

    let idleTimer = 0;
    const scheduleIdleGlance = () => {
      idleTimer = window.setTimeout(() => {
        const coarse = window.matchMedia('(pointer: coarse)').matches;
        if (coarse || Date.now() - lastPointerRef.current > IDLE_MS) {
          const settlesAtCenter = Math.random() < 0.28;
          const angle = Math.random() * Math.PI * 2;
          const distance = settlesAtCenter ? 0 : GAZE_MAX * (0.35 + Math.random() * 0.6);
          targetRef.current = {
            x: Math.cos(angle) * distance,
            y: Math.sin(angle) * distance * 0.9,
          };
        }
        scheduleIdleGlance();
      }, 650 + Math.random() * 1250);
    };

    const tick = () => {
      currentRef.current = {
        x: currentRef.current.x + (targetRef.current.x - currentRef.current.x) * LERP,
        y: currentRef.current.y + (targetRef.current.y - currentRef.current.y) * LERP,
      };
      const transform = `translate3d(${currentRef.current.x.toFixed(2)}px, ${currentRef.current.y.toFixed(2)}px, 0)`;
      eyeRefs.current.forEach((eye) => {
        if (eye) eye.style.transform = transform;
      });
      rafRef.current = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    scheduleIdleGlance();
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.clearTimeout(idleTimer);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let blinkTimer = 0;
    let reopenTimer = 0;
    let secondBlinkTimer = 0;

    const blink = () => {
      setIsBlinking(true);
      reopenTimer = window.setTimeout(() => setIsBlinking(false), 115);

      if (Math.random() < 0.22) {
        secondBlinkTimer = window.setTimeout(() => {
          setIsBlinking(true);
          reopenTimer = window.setTimeout(() => setIsBlinking(false), 105);
        }, 230);
      }

      blinkTimer = window.setTimeout(blink, 2400 + Math.random() * 3600);
    };

    blinkTimer = window.setTimeout(blink, 1200 + Math.random() * 2200);
    return () => {
      window.clearTimeout(blinkTimer);
      window.clearTimeout(reopenTimer);
      window.clearTimeout(secondBlinkTimer);
    };
  }, []);

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
        {[0, 1].map((eye) => (
          <span
            key={eye}
            className={`ai-bot-eye-socket${isBlinking ? ' is-blinking' : ''}`}
            aria-hidden="true"
          >
            <span
              ref={(node) => {
                eyeRefs.current[eye] = node;
              }}
              className="ai-bot-eye"
            />
          </span>
        ))}
      </button>
    </div>
  );

  return createPortal(fab, document.body);
}

export default AIAssistantFab;

import { useEffect, RefObject } from 'react';

/** Call onClose when the user clicks outside the referenced element */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onClose: () => void,
  active: boolean
) {
  useEffect(() => {
    if (!active) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [active, onClose, ref]);
}

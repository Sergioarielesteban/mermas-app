'use client';

import React from 'react';

type AutoCollapseOptions = {
  activeId: string | null;
  containerRef: React.RefObject<HTMLElement | null>;
  onCollapse: () => void;
  timeoutMs?: number;
  hasPendingChanges?: () => boolean;
};

function isEditableElement(el: Element | null) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export function useOperationalAutoCollapse({
  activeId,
  containerRef,
  onCollapse,
  timeoutMs = 120_000,
  hasPendingChanges,
}: AutoCollapseOptions) {
  const onCollapseRef = React.useRef(onCollapse);
  const hasPendingChangesRef = React.useRef(hasPendingChanges);

  React.useEffect(() => {
    onCollapseRef.current = onCollapse;
    hasPendingChangesRef.current = hasPendingChanges;
  }, [hasPendingChanges, onCollapse]);

  React.useEffect(() => {
    if (!activeId) return;
    const root = containerRef.current;
    if (!root) return;

    let timeout: number | null = null;

    const schedule = () => {
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        const activeElement = document.activeElement;
        const focusInside = activeElement instanceof Element && root.contains(activeElement);
        const editingInside = focusInside && isEditableElement(activeElement);
        if (editingInside || hasPendingChangesRef.current?.()) {
          schedule();
          return;
        }
        onCollapseRef.current();
      }, timeoutMs);
    };

    const events: Array<keyof HTMLElementEventMap> = ['pointerdown', 'keydown', 'input', 'focusin'];
    events.forEach((eventName) => root.addEventListener(eventName, schedule));
    schedule();

    return () => {
      if (timeout) window.clearTimeout(timeout);
      events.forEach((eventName) => root.removeEventListener(eventName, schedule));
    };
  }, [activeId, containerRef, timeoutMs]);
}

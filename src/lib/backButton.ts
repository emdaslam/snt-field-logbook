import { useEffect, useRef } from "react";

type Closer = { id: number; close: () => void };
const closers: Closer[] = [];
let nextId = 1;

/**
 * Registers an overlay with the native (Android) back-button handler. While
 * `active`, pressing back invokes `close` instead of navigating. The most
 * recently registered active closer runs first, so an overlay opened above
 * another one is dismissed before the lower one. The app shell consults this
 * registry before its own overlay list and the tab history.
 */
export function useBackClose(active: boolean, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!active) return;
    const entry: Closer = { id: nextId++, close: () => closeRef.current() };
    closers.push(entry);
    return () => {
      const i = closers.indexOf(entry);
      if (i >= 0) closers.splice(i, 1);
    };
  }, [active]);
}

/** Invoke the topmost registered closer. Returns true when something closed. */
export function tryCloseTop(): boolean {
  const top = closers[closers.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

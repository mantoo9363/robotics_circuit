'use client';

import { useEffect } from 'react';
import { initCircuitCrossTabSync } from '@cs/lib/circuit-cross-tab-sync';
import { ensureSimulationSocketSubscribed, initSimulationCrossTabSync } from '@cs/lib/store';
import { getSimulationSocket } from '@cs/lib/socket-client';

/** Keeps the simulation socket subscribed while the app is open. */
export function ClientSimulationBind() {
  useEffect(() => {
    initCircuitCrossTabSync();
    initSimulationCrossTabSync();
    ensureSimulationSocketSubscribed();
    const socket = getSimulationSocket();
    if (!socket.connected) {
      socket.connect();
    }

    const cleanInjectedAttributes = () => {
      document.querySelectorAll('[fdprocessedid]').forEach((element) => {
        element.removeAttribute('fdprocessedid');
      });

      const htmlStyle = document.documentElement.getAttribute('style') || '';
      if (/transition-(behavior|duration|timing-function|property)|interpolate-size/.test(htmlStyle)) {
        document.documentElement.removeAttribute('style');
      }
    };

    cleanInjectedAttributes();
    const observer = new MutationObserver(cleanInjectedAttributes);
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  return null;
}

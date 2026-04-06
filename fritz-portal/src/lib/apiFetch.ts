/**
 * apiFetch — zentraler fetch-Wrapper für HA Ingress-Kompatibilität
 *
 * Wenn das Add-on über HA Ingress geöffnet wird, setzt der Server
 * window.__INGRESS_PATH__ (z.B. "/api/hassio_ingress/TOKEN").
 * Alle API-Aufrufe müssen diesen Präfix voranstellen, damit der
 * Browser die Anfragen durch den Ingress-Proxy schickt.
 *
 * Außerhalb von HA (direkter Zugriff, Entwicklung) ist der Wert
 * leer → alle Pfade bleiben unverändert.
 */

declare global {
  interface Window {
    __INGRESS_PATH__?: string;
  }
}

const ingressBase: string = window.__INGRESS_PATH__ ?? '';

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  // path beginnt immer mit '/api/...'
  // ingressBase ist z.B. '/api/hassio_ingress/TOKEN' oder ''
  return fetch(ingressBase + path, init);
}

/**
 * apiFetch — zentraler fetch-Wrapper für HA Ingress-Kompatibilität
 *
 * Verwendet relative Pfade, damit die Anfragen automatisch
 * durch den HA Ingress-Proxy geleitet werden.
 */

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  // Absoluten Pfad in relativen umwandeln
  // Aus '/api/fritz/...' wird './api/fritz/...'
  const relativePath = path.startsWith('/') ? '.' + path : path;
  return fetch(relativePath, init);
}
}

function getIngressBase(): string {
  // 1. Vom Server injiziert
  if (window.__INGRESS_PATH__) return window.__INGRESS_PATH__;
  // 2. Aus der aktuellen URL extrahieren
  const match = window.location.pathname.match(/(\/api\/hassio_ingress\/[^/]+)/);
  if (match) return match[1];
  return '';
}

const ingressBase = getIngressBase();

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(ingressBase + path, init);
}

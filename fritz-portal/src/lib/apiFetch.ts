/**
 * apiFetch — zentraler fetch-Wrapper für HA Ingress-Kompatibilität
 */

function getIngressBase(): string {
  // URL-Format bei Ingress: /api/hassio_ingress/<TOKEN>/
  const match = window.location.pathname.match(/(\/api\/hassio_ingress\/[^/]+\/)/);
  if (match) return match[1];
  return '';
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  // Bei jedem Aufruf neu ermitteln (nicht cachen — Timing-Probleme beim Modul-Load)
  const ingressBase = getIngressBase();
  // Führenden Slash vom Pfad entfernen, da ingressBase bereits einen hat
  const cleanPath = ingressBase && path.startsWith('/') ? path.slice(1) : path;
  const url = ingressBase + cleanPath;
  return fetch(url, init);
}

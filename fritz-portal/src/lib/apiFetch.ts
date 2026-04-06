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
  const ingressBase = getIngressBase();
  const url = ingressBase + path;
  return fetch(url, init);
}

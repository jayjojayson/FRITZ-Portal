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
  let url: string;
  if (ingressBase) {
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    url = ingressBase + cleanPath;
  } else {
    url = path.startsWith('/') ? path : '/' + path;
  }
  return fetch(url, init);
}

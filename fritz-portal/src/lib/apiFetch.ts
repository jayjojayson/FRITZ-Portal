/**
 * apiFetch — zentraler fetch-Wrapper für HA Ingress-Kompatibilität
 */

function getIngressBase(): string {
  // URL-Format bei Ingress: /api/hassio_ingress/<TOKEN>/
  const match = window.location.pathname.match(/(\/api\/hassio_ingress\/[^/]+\/)/);
  if (match) return match[1];
  return '';
}

// Sofortstart: Die Oberfläche erscheint direkt mit der zwischengespeicherten Ansicht,
// während /api/fritz/auto-session im Hintergrund die Sitzung bestätigt. Bis dahin warten
// alle übrigen API-Aufrufe – sonst bekämen sie ein 401 der noch fehlenden Sitzung.
let markReady: () => void = () => {};
const sessionReady: Promise<void> = new Promise(r => { markReady = r; });
export function setSessionReady() { markReady(); }

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!path.includes('/api/fritz/auto-session')) await sessionReady;
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

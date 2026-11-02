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
// Bestätigte Sitzungs-ID. Der Server vergibt sie bei jedem Start neu (zufällig) – Aufrufe,
// die noch mit der im Browser gemerkten alten ID gebaut wurden, bekommen hier die aktuelle.
let currentSid = '';
export function setSessionReady(sid: string) { currentSid = sid; markReady(); }

function withCurrentSid(init?: RequestInit): RequestInit | undefined {
  if (!currentSid || !init?.headers) return init;
  const h = new Headers(init.headers);
  if (!h.has('X-Fritz-SID')) return init;
  h.set('X-Fritz-SID', currentSid);
  return { ...init, headers: h };
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!path.includes('/api/fritz/auto-session')) {
    await sessionReady;
    init = withCurrentSid(init);
  }
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

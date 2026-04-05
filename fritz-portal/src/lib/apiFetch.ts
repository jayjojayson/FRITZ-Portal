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

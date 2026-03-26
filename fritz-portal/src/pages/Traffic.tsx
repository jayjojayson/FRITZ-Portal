import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/apiFetch';

interface Counter {
  name: string;
  received: number;
  sent: number;
  onlineTime: string;
  connections: number;
}

interface TrafficProps {
  sid: string;
}

export default function Traffic({ sid }: TrafficProps) {
  const [counters, setCounters] = useState<Counter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bytesAvailable, setBytesAvailable] = useState(true);
  const [diagResult, setDiagResult] = useState<Record<string,string> | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const headers = { 'X-Fritz-SID': sid };

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const r = await apiFetch('/api/fritz/traffic-counters', { headers });
      const data = await r.json();
      const rows: Counter[] = data.rows || (Array.isArray(data) ? data : []);
      if (rows.length > 0) {
        setCounters(rows);
        const allZero = rows.every(c => c.received === 0 && c.sent === 0);
        setBytesAvailable(!allZero);
      } else {
        setError(data.debug ? `Server: ${data.debug}` : 'Keine Zählerdaten empfangen.');
      }
    } catch {
      setError('Fehler beim Laden der Trafficzähler.');
    } finally {
      setLoading(false);
    }
  };

  const runDiag = async () => {
    setDiagLoading(true);
    try {
      const r = await apiFetch('/api/fritz/traffic-raw', { headers });
      setDiagResult(await r.json());
    } catch { setDiagResult({ error: 'Fetch fehlgeschlagen' }); }
    finally { setDiagLoading(false); }
  };

  const fmtBytes = (bytes: number) => {
    if (bytes <= 0) return '—';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <h2>Traffic</h2>
        <p>Online-Z{'\u00e4'}hler &amp; Datenvolumen</p>
      </div>

      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid #ef4444',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 24,
          color: '#ef4444',
          fontSize: 14,
        }}>
          {error}
        </div>
      )}

      {!bytesAvailable && counters.length > 0 && (
        <div style={{
          background: 'rgba(59,130,246,0.08)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 24,
          color: 'var(--text-secondary)',
          fontSize: 14,
        }}>
          <strong style={{ color: 'var(--text-primary)' }}>Datenvolumen nicht verfügbar</strong> – Die Fritz!Box liefert keine Volumen-Statistik.
          Bitte prüfe in der Fritz!Box-Oberfläche unter <strong>Internet &nbsp;›&nbsp; Online-Zähler</strong>,
          ob die Zählung aktiviert ist. Online-Zeiten werden trotzdem angezeigt.
          <div style={{ marginTop: 10 }}>
            <button
              onClick={runDiag}
              disabled={diagLoading}
              style={{ padding: '4px 12px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' }}
            >
              {diagLoading ? 'Prüfe...' : 'Diagnose: Verfügbare Endpunkte prüfen'}
            </button>
          </div>
        </div>
      )}

      {diagResult && (
        <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 24, fontSize: 12 }}>
          <strong style={{ display: 'block', marginBottom: 8 }}>Diagnose-Ergebnis (welche Methode liefert Daten?)</strong>
          {Object.entries(diagResult).map(([k, v]) => {
            const str = typeof v === 'string' ? v : JSON.stringify(v);
            return (
              <div key={k} style={{ marginBottom: 8 }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{k}: </span>
                <span style={{ color: str.includes('GB') || str.includes('"grossbytes') ? '#22c55e' : 'var(--text-secondary)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {str.substring(0, 300)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {counters.length > 0 ? (
        <>
          {/* Summary cards for the first entry (Heute) */}
          {counters[0] && (
            <div className="stats-grid" style={{ marginBottom: 24 }}>
              <div className="stat-card">
                <div className="stat-icon blue">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="8 17 12 21 16 17" /><line x1="12" y1="3" x2="12" y2="21" />
                  </svg>
                </div>
                <h3>Heute Empfangen</h3>
                <div className="value" style={{ color: '#3b82f6' }}>{fmtBytes(counters[0].received)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon green">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 7 12 3 8 7" /><line x1="12" y1="21" x2="12" y2="3" />
                  </svg>
                </div>
                <h3>Heute Gesendet</h3>
                <div className="value" style={{ color: '#22c55e' }}>{fmtBytes(counters[0].sent)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon orange">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <h3>Heute Online-Zeit</h3>
                <div className="value" style={{ color: '#f59e0b' }}>{counters[0].onlineTime}</div>
              </div>
              {counters[3] && (
                <div className="stat-card">
                  <div className="stat-icon" style={{ background: 'rgba(139,92,246,0.12)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                  </div>
                  <h3>Monat Gesamt</h3>
                  <div className="value" style={{ color: '#8b5cf6' }}>{fmtBytes(counters[3].received + counters[3].sent)}</div>
                </div>
              )}
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <h3>Online-Z{'\u00e4'}hler</h3>
              <button
                onClick={load}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Aktualisieren
              </button>
            </div>
            <div className="card-body">
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Zeitraum</th>
                      <th>Online-Zeit</th>
                      <th>Gesamt</th>
                      <th style={{ color: '#3b82f6' }}>Empfangen</th>
                      <th style={{ color: '#22c55e' }}>Gesendet</th>
                      <th>Verbindungen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {counters.map((c, i) => (
                      <tr key={i} style={{ fontWeight: i === 0 ? 600 : 400 }}>
                        <td>{c.name}</td>
                        <td>{c.onlineTime}</td>
                        <td>{fmtBytes(c.received + c.sent)}</td>
                        <td style={{ color: '#3b82f6' }}>{fmtBytes(c.received)}</td>
                        <td style={{ color: '#22c55e' }}>{fmtBytes(c.sent)}</td>
                        <td>{c.connections}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="card">
          <div className="card-body" style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
            Keine Zählerdaten verf{'\u00fc'}gbar. Bitte Konsole / Log auf <code>traffic-counters raw</code> prüfen.
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/apiFetch';

interface SystemProps {
  sid: string;
}

export default function System({ sid }: SystemProps) {
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [rebooting, setRebooting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [version] = useState('1.1.9');
  const [fritzHost, setFritzHost] = useState('fritz.box');

  const headers = { 'X-Fritz-SID': sid };

  useEffect(() => {
    loadInfo();
  }, []);

  const loadInfo = async () => {
    try {
      const res = await apiFetch('/api/fritz/device-info', { headers });
      const data = await res.json();
      setDeviceInfo(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleReboot = async () => {
    if (!confirm('Möchten Sie die FritzBox wirklich neustarten?')) return;
    setRebooting(true);
    setMessage('');
    setError('');
    try {
      const res = await apiFetch('/api/fritz/reboot', { method: 'POST', headers });
      const data = await res.json();
      if (data.success) {
        setMessage('Neustart wurde ausgelöst. Die FritzBox startet jetzt neu...');
      } else {
        setError(data.error || 'Neustart fehlgeschlagen');
      }
    } catch (err) {
      setError('Verbindungsfehler');
    } finally {
      setRebooting(false);
    }
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const upTime = deviceInfo?.NewUpTime
    ? `${Math.floor(deviceInfo.NewUpTime / 86400)}d ${Math.floor((deviceInfo.NewUpTime % 86400) / 3600)}h ${Math.floor((deviceInfo.NewUpTime % 3600) / 60)}m`
    : '-';

  const fritzUrl = `http://${fritzHost}`;

  return (
    <div>
      <div className="page-header">
        <h2>System</h2>
        <p>FRITZ!Box Systeminformationen und Verwaltung</p>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <div className="card">
        <div className="card-header">
          <h3>Systeminformationen</h3>
        </div>
        <div className="card-body">
          <table>
            <tbody>
              <tr>
                <td style={{ fontWeight: 500, width: 200, color: 'var(--text-secondary)' }}>Modell</td>
                <td>{deviceInfo?.NewModelName || '-'}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Hardware</td>
                <td>{deviceInfo?.NewHardwareVersion || '-'}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>FRITZ!Portal</td>
                <td>v{version || '-'}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Seriennummer</td>
                <td style={{ fontFamily: 'monospace' }}>{deviceInfo?.NewSerialNumber || '-'}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Laufzeit</td>
                <td>{upTime}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="action-grid">
        <div className="action-card">
          <div className="action-icon" style={{ background: 'rgba(239,68,68,0.1)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
          </div>
          <h4>Neustart</h4>
          <p>Starten Sie Ihre FritzBox neu. Die Verbindung wird währenddessen kurzzeitig unterbrochen.</p>
          <button className="btn btn-danger" onClick={handleReboot} disabled={rebooting}>
            {rebooting ? 'Startet neu...' : 'Jetzt neustarten'}
          </button>
        </div>

        <div className="action-card">
          <div className="action-icon" style={{ background: 'rgba(59,130,246,0.1)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
          <h4>Firmware Update</h4>
          <p>Prüfen Sie auf verfügbare Firmware-Updates für Ihre FritzBox.</p>
          <button className="btn btn-primary" onClick={() => window.open(fritzUrl, '_blank')}>
            In FritzBox öffnen
          </button>
        </div>

        <div className="action-card">
          <div className="action-icon" style={{ background: 'rgba(34,197,94,0.1)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </div>
          <h4>FritzBox Webinterface</h4>
          <p>Öffnen Sie das originale FritzBox Webinterface für erweiterte Einstellungen.</p>
          <button className="btn btn-outline" onClick={() => window.open(fritzUrl, '_blank')}>
            Öffnen
          </button>
        </div>
      </div>
    </div>
  );
}

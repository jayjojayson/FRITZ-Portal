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
  const [version] = useState('1.3.0');
  const [fritzHost, setFritzHost] = useState('fritz.box');

  // HA-Sensor-Einstellungen
  const [haSettings, setHaSettings] = useState<{
    ha_sensors: boolean;
    ha_sensors_interval: number;
    ha_sensors_traffic_interval: number;
    ha_available: boolean;
    ha_mqtt: boolean;
    mqtt_available: boolean;
  } | null>(null);
  const [haSaving, setHaSaving] = useState(false);
  const [haMessage, setHaMessage] = useState('');
  const [haMessageOk, setHaMessageOk] = useState(true);

  const headers = { 'X-Fritz-SID': sid };

  useEffect(() => {
    loadInfo();
    // HA-Einstellungen laden
    apiFetch('/api/fritz/ha-settings', { headers })
      .then(r => r.json())
      .then(d => setHaSettings(d))
      .catch(() => {});
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

  const handleHaSave = async () => {
    if (!haSettings) return;
    setHaSaving(true);
    setHaMessage('');
    try {
      const res = await apiFetch('/api/fritz/ha-settings', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ha_sensors:                  haSettings.ha_sensors,
          ha_sensors_interval:         haSettings.ha_sensors_interval,
          ha_sensors_traffic_interval: haSettings.ha_sensors_traffic_interval,
          ha_mqtt:                     haSettings.ha_mqtt,
        }),
      });
      const data = await res.json();
      if (data.success) { setHaMessageOk(true);  setHaMessage('Einstellungen gespeichert.'); }
      else               { setHaMessageOk(false); setHaMessage('Fehler beim Speichern.'); }
    } catch {
      setHaMessageOk(false);
      setHaMessage('Verbindungsfehler.');
    } finally {
      setHaSaving(false);
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

      {haSettings && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              Home Assistant Sensoren
            </h3>
          </div>
          <div className="card-body">
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
              FRITZ!Portal überträgt Gerätewerte automatisch als Sensoren an Home Assistant.
              Die Entitäten erscheinen nach Aktivierung automatisch unter <code style={{ background: 'var(--bg-primary)', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>sensor.fritzportal_*</code> und können direkt auf dem HA-Dashboard verwendet werden.
            </p>

            {/* Status-Anzeige */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              marginBottom: 20, padding: '10px 14px',
              borderRadius: 8, border: '1px solid var(--border)',
              background: haSettings.ha_available ? 'rgba(34,197,94,0.06)' : 'rgba(107,114,128,0.06)',
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: haSettings.ha_available ? '#22c55e' : '#6b7280', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {haSettings.ha_available
                  ? 'Home Assistant Supervisor erreichbar – Sensor-Push aktiv'
                  : 'Kein SUPERVISOR_TOKEN – Sensor-Push nur im HA Add-on verfügbar'}
              </span>
            </div>

            {/* Sensor Push ein/aus */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>REST-API Sensor Push</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>Sensoren via REST-API an Home Assistant übermitteln (unter Entitäten sichtbar)</div>
              </div>
              <button
                onClick={() => setHaSettings(s => s ? { ...s, ha_sensors: !s.ha_sensors } : s)}
                style={{
                  width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                  background: haSettings.ha_sensors ? '#22c55e' : '#6b7280',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
                title={haSettings.ha_sensors ? 'Deaktivieren' : 'Aktivieren'}
              >
                <span style={{
                  position: 'absolute', top: 3,
                  left: haSettings.ha_sensors ? 23 : 3,
                  width: 20, height: 20, borderRadius: '50%', background: 'white',
                  transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                }} />
              </button>
            </div>

            {/* MQTT Discovery */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>MQTT Discovery</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, maxWidth: 480, lineHeight: 1.5 }}>
                  Erstellt ein FRITZ!Portal-Gerät in der HA-Geräteübersicht. Sensoren sind dort bearbeitbar. Erfordert MQTT-Broker (z.B. Mosquitto).
                </div>
              </div>
              <button
                onClick={() => setHaSettings(s => s ? { ...s, ha_mqtt: !s.ha_mqtt } : s)}
                style={{
                  width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                  background: haSettings.ha_mqtt ? '#22c55e' : '#6b7280',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
                title={haSettings.ha_mqtt ? 'Deaktivieren' : 'Aktivieren'}
              >
                <span style={{
                  position: 'absolute', top: 3,
                  left: haSettings.ha_mqtt ? 23 : 3,
                  width: 20, height: 20, borderRadius: '50%', background: 'white',
                  transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                }} />
              </button>
            </div>

            {haSettings.ha_mqtt && (
              <div style={{
                margin: '10px 0', padding: '10px 14px', borderRadius: 8,
                border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.06)',
                fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
              }}>
                💡 Bei aktiviertem MQTT werden alle Sensoren als <strong>FRITZ!Portal</strong>-Gerät in der HA-Geräteübersicht angezeigt und sind dort bearbeitbar.
                Die REST-API kann dann deaktiviert werden, um Duplikate zu vermeiden.
                {haSettings.ha_mqtt && haSettings.ha_sensors && (
                  <span style={{ display: 'block', marginTop: 6, color: '#f59e0b' }}>
                    ⚠️ REST-API und MQTT sind gleichzeitig aktiv – Sensoren könnten doppelt erscheinen.
                  </span>
                )}
              </div>
            )}

            {/* Systemsensoren-Intervall */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>Intervall: Systemsensoren</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>CPU, RAM, Temperatur, Geräte online, freie IPs, Download, Upload</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <input
                  type="number" min={10} max={3600}
                  value={haSettings.ha_sensors_interval}
                  onChange={e => setHaSettings(s => s ? { ...s, ha_sensors_interval: parseInt(e.target.value) || 60 } : s)}
                  style={{ width: 72, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, textAlign: 'right' }}
                />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Sek.</span>
              </div>
            </div>

            {/* Traffic-Intervall */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 0' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>Intervall: Traffic-Sensoren</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>Heute, Gestern, Aktuelle Woche, Aktueller Monat, Vormonat (Download & Upload)</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <input
                  type="number" min={30} max={3600}
                  value={haSettings.ha_sensors_traffic_interval}
                  onChange={e => setHaSettings(s => s ? { ...s, ha_sensors_traffic_interval: parseInt(e.target.value) || 300 } : s)}
                  style={{ width: 72, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, textAlign: 'right' }}
                />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Sek.</span>
              </div>
            </div>

            {/* Speichern */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-primary" onClick={handleHaSave} disabled={haSaving}>
                {haSaving ? 'Wird gespeichert…' : 'Einstellungen speichern'}
              </button>
              {haMessage && (
                <span style={{ fontSize: 13, color: haMessageOk ? '#22c55e' : '#ef4444' }}>{haMessage}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

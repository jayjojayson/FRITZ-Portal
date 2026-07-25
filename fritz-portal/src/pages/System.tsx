import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/apiFetch';
import { useT } from '../lib/i18n';

interface SystemProps {
  sid: string;
}

export default function System({ sid }: SystemProps) {
  const t = useT();
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [rebooting, setRebooting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [version] = useState('1.4.6');
  const [fritzHost, setFritzHost] = useState('fritz.box');

  // HA-Sensor-Einstellungen
  const [haSettings, setHaSettings] = useState<{
    ha_sensors: boolean;
    ha_sensors_interval: number;
    ha_sensors_traffic_interval: number;
    ha_phone_sensors: boolean;
    ha_available: boolean;
    mqtt_available: boolean;
    debug_logging: boolean;
    keep_session_alive: boolean;
    traffic_history_server: boolean;
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
          ha_phone_sensors:            haSettings.ha_phone_sensors,
          debug_logging:               haSettings.debug_logging,
          keep_session_alive:          haSettings.keep_session_alive,
          traffic_history_server:      haSettings.traffic_history_server,
        }),
      });
      const data = await res.json();
      if (data.success) { setHaMessageOk(true);  setHaMessage(t('Einstellungen gespeichert.')); }
      else               { setHaMessageOk(false); setHaMessage(t('Fehler beim Speichern.')); }
    } catch {
      setHaMessageOk(false);
      setHaMessage(t('Verbindungsfehler.'));
    } finally {
      setHaSaving(false);
    }
  };

  const handleReboot = async () => {
    if (!confirm(t('Wirklich neu starten?'))) return;
    setRebooting(true);
    setMessage('');
    setError('');
    try {
      const res = await apiFetch('/api/fritz/reboot', { method: 'POST', headers });
      const data = await res.json();
      if (data.success) {
        setMessage(t('Neustart wurde ausgelöst. Die FritzBox startet jetzt neu...'));
      } else {
        setError(data.error || t('Neustart fehlgeschlagen'));
      }
    } catch (err) {
      setError(t('Verbindungsfehler'));
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
        <h2>{t('System')}</h2>
        <p>{t('FRITZ!Box Systeminformationen und Verwaltung')}</p>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <div className="card">
        <div className="card-header">
          <h3>{t('Systeminformationen')}</h3>
        </div>
        <div className="card-body">
          <table>
            <tbody>
              <tr>
                <td style={{ fontWeight: 500, width: 200, color: 'var(--text-secondary)' }}>{t('Modell')}</td>
                <td>{deviceInfo?.NewModelName || '-'}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('Hardware')}</td>
                <td>{deviceInfo?.NewHardwareVersion || '-'}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>FRITZ!Portal</td>
                <td>v{version || '-'}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('Seriennummer')}</td>
                <td style={{ fontFamily: 'monospace' }}>{deviceInfo?.NewSerialNumber || '-'}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('Laufzeit')}</td>
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
          <h4>{t('Neustart')}</h4>
          <p>{t('Starten Sie Ihre FritzBox neu. Die Verbindung wird währenddessen kurzzeitig unterbrochen.')}</p>
          <button className="btn btn-danger" onClick={handleReboot} disabled={rebooting}>
            {rebooting ? t('Startet neu...') : t('Jetzt neustarten')}
          </button>
        </div>

        <div className="action-card">
          <div className="action-icon" style={{ background: 'rgba(59,130,246,0.1)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
          <h4>{t('Firmware Update')}</h4>
          <p>{t('Prüfen Sie auf verfügbare Firmware-Updates für Ihre FritzBox.')}</p>
          <button className="btn btn-primary" onClick={() => window.open(fritzUrl, '_blank')}>
            {t('In FritzBox öffnen')}
          </button>
        </div>

        <div className="action-card">
          <div className="action-icon" style={{ background: 'rgba(34,197,94,0.1)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </div>
          <h4>{t('FritzBox Webinterface')}</h4>
          <p>{t('Öffnen Sie das originale FritzBox Webinterface für erweiterte Einstellungen.')}</p>
          <button className="btn btn-outline" onClick={() => window.open(fritzUrl, '_blank')}>
            {t('Öffnen')}
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
              {t('Home Assistant Sensoren')}
            </h3>
          </div>
          <div className="card-body">
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
              {t('FRITZ!Portal sendet Gerätewerte automatisch via MQTT Discovery an Home Assistant. Die Entitäten erscheinen unter sensor.fritzportal_* und können direkt auf dem HA-Dashboard verwendet werden. Falls kein MQTT-Broker vorhanden ist, kann der REST-API Fallback aktiviert werden.')}
            </p>

            {/* Status-Anzeige */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              marginBottom: 20, padding: '10px 14px',
              borderRadius: 8, border: '1px solid var(--border)',
              background: !haSettings.ha_available ? 'rgba(107,114,128,0.06)' : (haSettings.ha_sensors || haSettings.mqtt_available) ? 'rgba(34,197,94,0.06)' : 'rgba(245,158,11,0.06)',
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: !haSettings.ha_available ? '#6b7280' : (haSettings.ha_sensors || haSettings.mqtt_available) ? '#22c55e' : '#f59e0b', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {!haSettings.ha_available
                  ? t('Kein SUPERVISOR_TOKEN – Sensor-Push nur im HA Add-on verfügbar')
                  : haSettings.ha_sensors
                  ? t('REST-API aktiv – Sensoren werden via HA REST-API an Home Assistant gesendet')
                  : haSettings.mqtt_available
                  ? t('MQTT Discovery aktiv – Sensoren werden via MQTT an Home Assistant gesendet')
                  : t('MQTT nicht erreichbar – REST-API Fallback aktivieren um Sensoren zu übertragen')}
              </span>
            </div>

            {/* REST-API Fallback ein/aus */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{t('REST-API Fallback')}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>{t('Sensoren über HA REST-API senden wenn kein MQTT-Broker verfügbar ist')}</div>
              </div>
              <button
                onClick={() => setHaSettings(s => s ? { ...s, ha_sensors: !s.ha_sensors } : s)}
                style={{
                  width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                  background: haSettings.ha_sensors ? '#22c55e' : '#6b7280',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
                title={haSettings.ha_sensors ? t('Deaktivieren') : t('Aktivieren')}
              >
                <span style={{
                  position: 'absolute', top: 3,
                  left: haSettings.ha_sensors ? 23 : 3,
                  width: 20, height: 20, borderRadius: '50%', background: 'white',
                  transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                }} />
              </button>
            </div>

            {/* Systemsensoren-Intervall */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{t('Intervall: Systemsensoren')}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>{t('CPU, RAM, Temperatur, Geräte online, freie IPs, Download, Upload')}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <input
                  type="number" min={10} max={3600}
                  value={haSettings.ha_sensors_interval}
                  onChange={e => setHaSettings(s => s ? { ...s, ha_sensors_interval: parseInt(e.target.value) || 60 } : s)}
                  style={{ width: 72, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, textAlign: 'right' }}
                />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('Sek.')}</span>
              </div>
            </div>

            {/* Traffic-Intervall */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 0' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{t('Intervall: Traffic-Sensoren')}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>{t('Heute, Gestern, Aktuelle Woche, Aktueller Monat, Vormonat (Download & Upload)')}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <input
                  type="number" min={30} max={3600}
                  value={haSettings.ha_sensors_traffic_interval}
                  onChange={e => setHaSettings(s => s ? { ...s, ha_sensors_traffic_interval: parseInt(e.target.value) || 300 } : s)}
                  style={{ width: 72, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, textAlign: 'right' }}
                />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('Sek.')}</span>
              </div>
            </div>

            {/* Telefonie-Sensoren */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderTop: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{t('Telefonie-Sensoren')}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>{t('Letzter Anruf, letzter verpasster und letzter eingehender Anruf (mit Nummer & Name) an Home Assistant übertragen – nur sinnvoll, wenn Telefonie über die FRITZ!Box genutzt wird.')}</div>
              </div>
              <button
                onClick={() => setHaSettings(s => s ? { ...s, ha_phone_sensors: !s.ha_phone_sensors } : s)}
                style={{
                  width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                  background: haSettings.ha_phone_sensors ? '#22c55e' : '#6b7280',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
                title={haSettings.ha_phone_sensors ? t('Deaktivieren') : t('Aktivieren')}
              >
                <span style={{
                  position: 'absolute', top: 3,
                  left: haSettings.ha_phone_sensors ? 23 : 3,
                  width: 20, height: 20, borderRadius: '50%', background: 'white',
                  transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                }} />
              </button>
            </div>

            {/* Sitzung dauerhaft halten */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderTop: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{t('Sitzung dauerhaft aktiv halten')}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>{t('Verbindung zur FRITZ!Box beim Add-on-Start automatisch aufbauen und permanent offen halten – nur dann werden HA-Sensoren auch dann aktualisiert, wenn das Portal nicht im Browser geöffnet ist.')}</div>
              </div>
              <button
                onClick={() => setHaSettings(s => s ? { ...s, keep_session_alive: !s.keep_session_alive } : s)}
                style={{
                  width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                  background: haSettings.keep_session_alive ? '#22c55e' : '#6b7280',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
                title={haSettings.keep_session_alive ? t('Deaktivieren') : t('Aktivieren')}
              >
                <span style={{
                  position: 'absolute', top: 3,
                  left: haSettings.keep_session_alive ? 23 : 3,
                  width: 20, height: 20, borderRadius: '50%', background: 'white',
                  transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                }} />
              </button>
            </div>

            {/* Traffic-Verlauf serverseitig durchgehend sammeln */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderTop: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{t('Traffic-Verlauf serverseitig sammeln')}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>{t('Der Server sammelt den Download-/Upload-Verlauf der letzten 30 min durchgehend – auch wenn das Portal nicht geöffnet ist. Das Dashboard-Chart ist beim Zurückkehren sofort lückenlos gefüllt. Kostet etwas mehr FRITZ!Box-Last. (Ohne diese Option wird der Verlauf nur im Browser gespeichert und kann nach längerer Abwesenheit kurz veraltet sein.)')}</div>
              </div>
              <button
                onClick={() => setHaSettings(s => s ? { ...s, traffic_history_server: !s.traffic_history_server } : s)}
                style={{
                  width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                  background: haSettings.traffic_history_server ? '#22c55e' : '#6b7280',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
                title={haSettings.traffic_history_server ? t('Deaktivieren') : t('Aktivieren')}
              >
                <span style={{
                  position: 'absolute', top: 3,
                  left: haSettings.traffic_history_server ? 23 : 3,
                  width: 20, height: 20, borderRadius: '50%', background: 'white',
                  transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                }} />
              </button>
            </div>

            {/* Debug-Logging */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderTop: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{t('Debug-Logging')}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>{t('Alle API-Anfragen (data.lua, SOAP) im Add-on-Protokoll ausgeben – hilfreich zur Fehlerdiagnose')}</div>
              </div>
              <button
                onClick={() => setHaSettings(s => s ? { ...s, debug_logging: !s.debug_logging } : s)}
                style={{
                  width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                  background: haSettings.debug_logging ? '#f59e0b' : '#6b7280',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
                title={haSettings.debug_logging ? t('Deaktivieren') : t('Aktivieren')}
              >
                <span style={{
                  position: 'absolute', top: 3,
                  left: haSettings.debug_logging ? 23 : 3,
                  width: 20, height: 20, borderRadius: '50%', background: 'white',
                  transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                }} />
              </button>
            </div>

            {/* Speichern */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-primary" onClick={handleHaSave} disabled={haSaving}>
                {haSaving ? t('Speichern...') : t('Einstellungen speichern')}
              </button>
              {haMessage && (
                <span style={{ fontSize: 13, color: haMessageOk ? '#22c55e' : '#ef4444' }}>{haMessage}</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 10, opacity: 0.7 }}>
              {t('Änderungen werden sofort wirksam (kein Neustart nötig).')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

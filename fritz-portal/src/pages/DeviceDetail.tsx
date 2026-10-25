import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/apiFetch';
import { getApiCache } from '../App';
import { useT } from '../lib/i18n';
import { ConnectionSettings, AccessProfileSettings, type TopologyHost } from '../components/DeviceSettings';

interface Host extends TopologyHost {
  interface: string;
  connDisplay?: string;
  guest?: boolean;
  vpn?: boolean;
  model?: string;
  updateAvailable?: boolean;
  deviceClass?: string;
  priority?: boolean;
  editHide?: boolean;
}

interface DeviceDetailProps {
  sid: string;
  mac: string;
  onBack: () => void;
}

export default function DeviceDetail({ sid, mac, onBack }: DeviceDetailProps) {
  const t = useT();
  // Hosts kommen aus dem Cache, der eben auf der Geräte-Seite gefüllt wurde –
  // dadurch hat DeviceDetail das Gerätedatum sofort und blockt nicht auf
  // /api/fritz/hosts. Block-Status und DHCP-Reservierung laden im Hintergrund.
  const cachedHosts: Host[] = getApiCache('hosts') || [];
  const [hosts, setHosts] = useState<Host[]>(cachedHosts);
  const [loading, setLoading] = useState(cachedHosts.length === 0);
  const [blocked, setBlocked] = useState(false);
  const [blocking, setBlocking] = useState(false);
  // Meldung + Art – vorher wurde die Farbe aus dem Text („Fehler") abgeleitet, was in
  // der englischen Oberfläche („Error") Fehler als Erfolg darstellte
  const [message, setMessageState] = useState<{ text: string; ok: boolean } | null>(null);
  const setMessage = (text: string, ok = true) => setMessageState(text ? { text, ok } : null);
  const fail = (detail?: string) => setMessage(`${t('Fehler')}: ${detail || t('Unbekannt')}`, false);
  const [deviceName, setDeviceName] = useState('');
  const [saving, setSaving] = useState(false);
  const [staticDhcp, setStaticDhcp] = useState<{ exists: boolean; ip: string } | null>(null);
  const [staticDhcpInput, setStaticDhcpInput] = useState('');
  const [settingDhcp, setSettingDhcp] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [waking, setWaking] = useState(false);
  const [priority, setPriority] = useState<boolean | null>(null);
  const [autoWol, setAutoWol] = useState<{ supported: boolean; enabled: boolean } | null>(null);
  const [toggling, setToggling] = useState<'priority' | 'autowol' | null>(null);

  const headers = { 'X-Fritz-SID': sid };

  const handleDeleteDevice = async (host: Host) => {
    if (host.active) return;
    if (!confirm(t('„{n}" dauerhaft aus der FRITZ!Box-Geräteliste entfernen?').replace('{n}', host.name || host.mac))) return;
    setDeleting(true);
    setMessage('');
    try {
      const res = await apiFetch('/api/fritz/device', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ mac: host.mac }),
      });
      const data = await res.json();
      if (data.success) {
        // Cache aufräumen, damit die Liste das Gerät nach onBack() nicht mehr zeigt
        const cur = (window as any).__apiCache?.['hosts']?.data;
        if (Array.isArray(cur)) {
          (window as any).__apiCache['hosts'].data = cur.filter((h: Host) => h.mac !== host.mac);
        }
        onBack();
      } else {
        fail(data.error || t('Löschen fehlgeschlagen'));
      }
    } catch {
      fail(t('Verbindungsfehler'));
    } finally {
      setDeleting(false);
    }
  };

  // Wake-on-LAN: die FRITZ!Box sendet das Magic Packet selbst ins Heimnetz
  const handleWake = async (host: Host) => {
    setWaking(true);
    setMessage('');
    try {
      const res = await apiFetch('/api/fritz/device/wol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ mac: host.mac }),
      });
      const data = await res.json();
      if (data.success) setMessage(t('Weckruf an „{n}" gesendet – das Gerät startet je nach Einstellung in einigen Sekunden.').replace('{n}', host.name || host.mac));
      else fail(data.error);
    } catch {
      fail(t('Verbindungsfehler'));
    } finally {
      setWaking(false);
    }
  };

  // Echtzeit-Priorität (FRITZ!Box „Priorisierung") bzw. automatisches Wake-on-LAN umschalten
  const handleToggle = async (kind: 'priority' | 'autowol', host: Host) => {
    setToggling(kind);
    setMessage('');
    const current = kind === 'priority' ? (priority ?? !!host.priority) : !!autoWol?.enabled;
    try {
      const res = await apiFetch(`/api/fritz/device/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(kind === 'priority' ? { ip: host.ip, enabled: !current } : { mac: host.mac, enabled: !current }),
      });
      const data = await res.json();
      if (!data.success) return fail(data.error);
      if (kind === 'priority') setPriority(!current);
      else setAutoWol(a => ({ supported: true, enabled: !(a?.enabled) }));
      setMessage(t('Einstellung gespeichert.'));
    } catch {
      fail(t('Verbindungsfehler'));
    } finally {
      setToggling(null);
    }
  };

  useEffect(() => { loadDevice(); }, []);

  const loadDevice = async () => {
    // Block-Status und DHCP-Reservierung parallel laden – beides braucht das
    // andere nicht. Hosts-Liste nur nachholen, falls der Cache leer war.
    const hostsP = hosts.length === 0
      ? apiFetch('/api/fritz/hosts', { headers }).then(r => r.json()).then(setHosts).catch(() => {})
      : Promise.resolve();

    // Bekannte IP aus dem Hosts-Cache als Query-Param mitschicken – spart dem
    // Server einen kompletten Hosts-Sweep, wenn der Server-Cache abgelaufen ist.
    const cachedIp = cachedHosts.find((h: Host) => h.mac === mac)?.ip || '';
    const blockUrl = `/api/fritz/device/blockstate?mac=${encodeURIComponent(mac)}${cachedIp ? `&ip=${encodeURIComponent(cachedIp)}` : ''}`;
    apiFetch(blockUrl, { headers })
      .then(r => r.json())
      .then(d => setBlocked(d.blocked === true))
      .catch(() => {});

    apiFetch(`/api/fritz/device/autowol?mac=${encodeURIComponent(mac)}`, { headers })
      .then(r => r.json())
      .then(setAutoWol)
      .catch(() => {});

    apiFetch(`/api/fritz/device/static-dhcp?mac=${encodeURIComponent(mac)}`, { headers })
      .then(r => r.json())
      .then(d => {
        setStaticDhcp(d);
        // Feld mit reservierter bzw. aktuell vergebener IP vorbefüllen – so muss nur noch
        // die letzte Stelle angepasst werden statt die komplette Adresse einzutippen
        setStaticDhcpInput(prev => d.ip || prev || cachedHosts.find((h: Host) => h.mac === mac)?.ip || '');
      })
      .catch(() => {});

    try { await hostsP; } finally { setLoading(false); }
  };

  const handleBlock = async () => {
    setBlocking(true);
    setMessage('');
    try {
      const res = await apiFetch('/api/fritz/device/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ mac, blocked: !blocked }),
      });
      const data = await res.json();
      if (data.success) {
        setBlocked(!blocked);
        setMessage(blocked ? t('Gerät freigegeben') : t('Gerät gesperrt'));
      } else {
        fail(data.error);
      }
    } finally {
      setBlocking(false);
    }
  };

  const handleSaveName = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await apiFetch('/api/fritz/device/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ mac, name: deviceName }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(t('Name gespeichert'));
        setHosts(prev => prev.map(h => h.mac === mac ? { ...h, name: deviceName || h.name } : h));
      } else {
        fail(data.error);
      }
    } catch {
      fail(t('Verbindungsfehler'));
    } finally {
      setSaving(false);
    }
  };

  const handleSetStaticDhcp = async () => {
    if (!staticDhcpInput) return;
    setSettingDhcp(true);
    setMessage('');
    const device = hosts.find(h => h.mac === mac);
    try {
      const res = await apiFetch('/api/fritz/device/static-dhcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ mac, ip: staticDhcpInput, hostname: device?.name || '' }),
      });
      const data = await res.json();
      if (data.success) {
        setStaticDhcp({ exists: true, ip: staticDhcpInput });
        setMessage(t('IP {ip} dauerhaft zugewiesen').replace('{ip}', staticDhcpInput));
      } else {
        fail(data.error);
      }
    } catch {
      fail(t('Verbindungsfehler'));
    } finally {
      setSettingDhcp(false);
    }
  };

  const handleRemoveStaticDhcp = async () => {
    setSettingDhcp(true);
    setMessage('');
    try {
      const res = await apiFetch('/api/fritz/device/static-dhcp', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ mac }),
      });
      const data = await res.json();
      if (data.success) {
        setStaticDhcp({ exists: false, ip: '' });
        setMessage(t('DHCP-Reservierung entfernt'));
      } else {
        fail(data.error);
      }
    } catch {
      fail(t('Verbindungsfehler'));
    } finally {
      setSettingDhcp(false);
    }
  };

  // Hosts erst nachgeladen (kein Cache)? Dann IP-Feld jetzt vorbefüllen
  useEffect(() => {
    const ip = hosts.find(h => h.mac === mac)?.ip;
    if (ip) setStaticDhcpInput(prev => prev || ip);
  }, [hosts]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const device = hosts.find(h => h.mac === mac);

  if (!device) {
    return (
      <div>
        <div className="page-header">
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 14, marginBottom: 8, padding: 0 }}>{'\u2190 '}{t('Zur\u00fcck')}</button>
          <h2>{t('Ger\u00e4t nicht gefunden')}</h2>
        </div>
      </div>
    );
  }

  const isWlan = device.connType
    ? device.connType === 'WLAN'
    : (() => { const s = String(device.interface || '').toLowerCase(); return s.includes('wlan') || s.includes('802'); })();

  return (
    <div>
      <div className="page-header">
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 14, marginBottom: 8, padding: 0 }}>{t('\u2190 Zur\u00fcck zur Liste')}</button>
        <h2>{device.name || t('Unbekannt')}</h2>
        <p>{t('Ger\u00e4tedetails f\u00fcr {mac}').replace('{mac}', device.mac)}</p>
      </div>

      {message && <div className={message.ok ? 'success-message' : 'error-message'}>{message.text}</div>}

      <div className="card">
        <div className="card-header">
          <h3>{t('Ger\u00e4teinformationen')}</h3>
          <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 14 }}>
            <span className={`status-dot ${device.active ? 'online' : 'offline'}`} />
            {device.active ? t('Online') : t('Offline')}
          </span>
        </div>
        <div className="card-body">
          <table>
            <tbody>
              <tr>
                <td style={{ fontWeight: 500, width: 200, color: 'var(--text-secondary)' }}>{t('Name')}</td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="text"
                        value={deviceName}
                        onChange={e => setDeviceName(e.target.value)}
                        placeholder={device.name || t('Ger\u00e4tename')}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          fontSize: 14,
                          width: 200,
                        }}
                      />
                      <button
                        className="btn btn-primary"
                        onClick={handleSaveName}
                        disabled={saving || !deviceName}
                        style={{ padding: '6px 12px', fontSize: 13 }}
                      >
                        {saving ? '...' : t('Speichern')}
                      </button>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {t('Leerzeichen werden zu Bindestrichen, Umlaute werden umgeschrieben')}
                    </span>
                  </div>
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('IP-Adresse')}</td>
                <td>
                  <span style={{ fontFamily: 'monospace' }}>{device.ip}</span>
                  {staticDhcp?.exists && (
                    <span style={{ marginLeft: 10, fontSize: 12, color: '#22c55e', fontWeight: 500 }}>&#x1f512; {t('fest zugewiesen')}</span>
                  )}
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('MAC-Adresse')}</td>
                <td style={{ fontFamily: 'monospace' }}>{device.mac}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('Status')}</td>
                <td>
                  <span className={`status-dot ${device.active ? 'online' : 'offline'}`} />
                  {device.active ? t('Online') : t('Offline')}
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('Verbindung')}</td>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {isWlan ? (
                      <>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                          <path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><circle cx="12" cy="20" r="1" fill="#10b981" />
                        </svg>
                        <span style={{ color: '#10b981', fontWeight: 500 }}>WLAN</span>
                      </>
                    ) : (
                      <>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                          <rect x="1" y="6" width="22" height="12" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
                        </svg>
                        <span style={{ color: '#3b82f6', fontWeight: 500 }}>LAN</span>
                      </>
                    )}
                    {device.viaName && <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>· {t('über {n}').replace('{n}', device.viaName)}</span>}
                  </span>
                </td>
              </tr>
              {device.connDisplay && (
                <tr>
                  <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('Verbindungsdetail')}</td>
                  <td style={{ fontFamily: 'monospace' }}>{device.connDisplay}</td>
                </tr>
              )}
              {device.interface && (
                <tr>
                  <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('Interface')}</td>
                  <td style={{ fontFamily: 'monospace' }}>{device.interface}</td>
                </tr>
              )}
              {(device.guest || device.vpn) && (
                <tr>
                  <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('Netz')}</td>
                  <td style={{ color: '#f59e0b' }}>{device.guest ? t('Gastnetz') : t('VPN')}</td>
                </tr>
              )}
              {device.deviceClass && (
                <tr>
                  <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('Geräteklasse')}</td>
                  <td>{device.deviceClass}</td>
                </tr>
              )}
              {device.model && (
                <tr>
                  <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('Modell')}</td>
                  <td>{device.model}{device.updateAvailable && <span style={{ marginLeft: 8, fontSize: 12, color: '#f59e0b' }}>{t('Update verfügbar')}</span>}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <h4 style={{ marginBottom: 12, fontSize: 14 }}>{t('Ger\u00e4tekontrolle')}</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <button
                className={`btn ${blocked ? 'btn-primary' : 'btn-danger'}`}
                onClick={handleBlock}
                disabled={blocking || !!device.editHide}
                title={device.editHide ? t('Die FRITZ!Box erlaubt für dieses Gerät keine Sperre') : undefined}
              >
                {blocking ? t('Wird ausgef\u00fchrt...') : blocked ? t('Internet freigeben') : t('Internet sperren')}
              </button>
              <button
                className="btn btn-outline"
                onClick={() => handleWake(device)}
                disabled={waking}
                title={t('Wake-on-LAN: Gerät über das Netzwerk einschalten (muss WoL unterstützen)')}
              >
                {waking ? t('Wird gesendet...') : t('Aufwecken (WoL)')}
              </button>
              <button
                className="btn btn-danger"
                onClick={() => handleDeleteDevice(device)}
                disabled={deleting || device.active}
                title={device.active ? t('Nur offline-Ger\u00e4te k\u00f6nnen entfernt werden') : t('Aus FRITZ!Box-Liste entfernen')}
              >
                {deleting ? t('Wird entfernt...') : t('Ger\u00e4t entfernen')}
              </button>
              {device.ip && !device.editHide && (
                <button
                  className={`btn ${(priority ?? device.priority) ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => handleToggle('priority', device)}
                  disabled={toggling !== null}
                  title={t('Echtzeitanwendungen: Gerät bekommt bei voller Leitung Vorrang (z. B. Videotelefonie, Gaming)')}
                >
                  {(priority ?? device.priority) ? `✓ ${t('Echtzeit-Priorität')}` : t('Echtzeit-Priorität')}
                </button>
              )}
              {autoWol?.supported && (
                <button
                  className={`btn ${autoWol.enabled ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => handleToggle('autowol', device)}
                  disabled={toggling !== null}
                  title={t('Die FRITZ!Box weckt das Gerät automatisch, wenn aus dem Internet darauf zugegriffen wird')}
                >
                  {autoWol.enabled ? `✓ ${t('Auto-WoL')}` : t('Auto-WoL')}
                </button>
              )}
              {blocked && (
                <span style={{ color: 'var(--danger)', fontSize: 13, fontWeight: 500 }}>
                  {'\u26d4'} {t('Ger\u00e4t ist gesperrt')}
                </span>
              )}
              {device.active && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {t('Nur offline-Ger\u00e4te k\u00f6nnen entfernt werden')}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConnectionSettings sid={sid} device={device} hosts={hosts} onChanged={h => setHosts(h as Host[])} />

      <AccessProfileSettings sid={sid} ip={device.ip} disabled={!!device.editHide} />

      <div className="card">
        <div className="card-header">
          <h3>{t('IPv4-Adresse dauerhaft zuweisen')}</h3>
          {staticDhcp?.exists && (
            <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 500 }}>&#x2713; {t('Reservierung aktiv: {ip}').replace('{ip}', staticDhcp.ip)}</span>
          )}
        </div>
        <div className="card-body">
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
            {t('Weist diesem Gerät immer die gleiche IPv4-Adresse zu (DHCP-Reservierung). Das Gerät erhält diese IP bei jeder Verbindung automatisch.')}
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={staticDhcpInput}
              onChange={e => setStaticDhcpInput(e.target.value)}
              placeholder={device.ip || '192.168.178.x'}
              onFocus={e => { const v = e.target.value; const dot = v.lastIndexOf('.'); if (dot > 0) e.target.setSelectionRange(dot + 1, v.length); }}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: 14,
                width: 180,
                fontFamily: 'monospace',
              }}
            />
            <button
              className="btn btn-primary"
              onClick={handleSetStaticDhcp}
              disabled={settingDhcp || !staticDhcpInput}
              style={{ padding: '6px 14px', fontSize: 13 }}
            >
              {settingDhcp ? '...' : staticDhcp?.exists ? t('Reservierung aktualisieren') : t('Dauerhaft zuweisen')}
            </button>
            {staticDhcp?.exists && (
              <button
                className="btn btn-danger"
                onClick={handleRemoveStaticDhcp}
                disabled={settingDhcp}
                style={{ padding: '6px 14px', fontSize: 13 }}
              >
                {t('Reservierung entfernen')}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>{t('Traffic')}</h3>
        </div>
        <div className="card-body">
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
            {t('Die FRITZ!Box stellt keinen gerätespezifischen Traffic-Verlauf über ihre offiziellen Schnittstellen bereit. Den gesamten Internet-Traffic findest du auf dem Dashboard, Verbrauchsstatistiken unter Traffic.')}
          </p>
        </div>
      </div>

    </div>
  );
}

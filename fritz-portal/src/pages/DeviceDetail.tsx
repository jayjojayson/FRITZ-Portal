import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/apiFetch';

interface Host {
  mac: string;
  ip: string;
  active: boolean;
  name: string;
  interface: string;
}

interface DeviceDetailProps {
  sid: string;
  mac: string;
  onBack: () => void;
}

export default function DeviceDetail({ sid, mac, onBack }: DeviceDetailProps) {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [message, setMessage] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [deviceIp, setDeviceIp] = useState('');
  const [saving, setSaving] = useState(false);
  const [staticDhcp, setStaticDhcp] = useState<{ exists: boolean; ip: string } | null>(null);
  const [staticDhcpInput, setStaticDhcpInput] = useState('');
  const [settingDhcp, setSettingDhcp] = useState(false);

  const headers = { 'X-Fritz-SID': sid };

  useEffect(() => { loadDevice(); }, []);

  const loadDevice = async () => {
    try {
      const hostsRes = await apiFetch('/api/fritz/hosts', { headers });
      const hostList = await hostsRes.json();
      setHosts(hostList);

      // Aktuellen Sperrstatus laden
      const blockRes = await apiFetch(`/api/fritz/device/blockstate?mac=${encodeURIComponent(mac)}`, { headers });
      const blockData = await blockRes.json();
      setBlocked(blockData.blocked === true);

      // DHCP-Reservierung laden
      const dhcpRes = await apiFetch(`/api/fritz/device/static-dhcp?mac=${encodeURIComponent(mac)}`, { headers });
      const dhcpData = await dhcpRes.json();
      setStaticDhcp(dhcpData);
      setStaticDhcpInput(dhcpData.ip || '');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
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
        setMessage(blocked ? 'Gerät freigegeben' : 'Gerät gesperrt');
      } else {
        setMessage(`Fehler: ${data.error || 'Unbekannt'}`);
      }
    } finally {
      setBlocking(false);
    }
  };

  const handleSaveName = async () => {
    setSaving(true);
    setMessage('');
    try {
      const body: any = { mac };
      if (deviceName) body.name = deviceName;
      if (deviceIp) body.ip = deviceIp;

      const res = await apiFetch('/api/fritz/device/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(deviceIp ? 'Name und IP gespeichert' : 'Name gespeichert');
        setHosts(prev => prev.map(h => h.mac === mac ? { ...h, name: deviceName || h.name, ip: deviceIp || h.ip } : h));
      } else {
        setMessage(`Fehler: ${data.error || 'Unbekannt'}`);
      }
    } catch (err) {
      setMessage('Verbindungsfehler');
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
        setMessage(`IP ${staticDhcpInput} dauerhaft zugewiesen`);
      } else {
        setMessage(`Fehler: ${data.error || 'Unbekannt'}`);
      }
    } catch {
      setMessage('Verbindungsfehler');
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
        setMessage('DHCP-Reservierung entfernt');
      } else {
        setMessage(`Fehler: ${data.error || 'Unbekannt'}`);
      }
    } catch {
      setMessage('Verbindungsfehler');
    } finally {
      setSettingDhcp(false);
    }
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const device = hosts.find(h => h.mac === mac);

  if (!device) {
    return (
      <div>
        <div className="page-header">
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 14, marginBottom: 8, padding: 0 }}>{'\u2190'} Zur{'\u00fc'}ck</button>
          <h2>Ger{'\u00e4'}t nicht gefunden</h2>
        </div>
      </div>
    );
  }

  const isWlan = (() => { const s = String(device.interface || '').toLowerCase(); return s.includes('wlan') || s.includes('802'); })();

  return (
    <div>
      <div className="page-header">
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 14, marginBottom: 8, padding: 0 }}>{'\u2190'} Zur{'\u00fc'}ck zur Liste</button>
        <h2>{device.name || 'Unbekannt'}</h2>
        <p>Ger{'\u00e4'}tedetails f{'\u00fc'}r {device.mac}</p>
      </div>

      {message && <div className={message.includes('Fehler') ? 'error-message' : 'success-message'}>{message}</div>}

      <div className="card">
        <div className="card-header">
          <h3>Ger{'\u00e4'}teinformationen</h3>
          <span className={`status-dot ${device.active ? 'online' : 'offline'}`} style={{ marginLeft: 8 }} />
          <span style={{ fontSize: 14 }}>{device.active ? 'Online' : 'Offline'}</span>
        </div>
        <div className="card-body">
          <table>
            <tbody>
              <tr>
                <td style={{ fontWeight: 500, width: 200, color: 'var(--text-secondary)' }}>Name</td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="text"
                        value={deviceName}
                        onChange={e => setDeviceName(e.target.value)}
                        placeholder={device.name || 'Ger\u00e4tename'}
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
                        {saving ? '...' : 'Speichern'}
                      </button>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      Leerzeichen werden zu Bindestrichen, Umlaute werden umgeschrieben
                    </span>
                  </div>
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>IP-Adresse</td>
                <td>
                  <span style={{ fontFamily: 'monospace' }}>{device.ip}</span>
                  {staticDhcp?.exists && (
                    <span style={{ marginLeft: 10, fontSize: 12, color: '#22c55e', fontWeight: 500 }}>&#x1f512; fest zugewiesen</span>
                  )}
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>MAC-Adresse</td>
                <td style={{ fontFamily: 'monospace' }}>{device.mac}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Status</td>
                <td>
                  <span className={`status-dot ${device.active ? 'online' : 'offline'}`} />
                  {device.active ? 'Online' : 'Offline'}
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Verbindung</td>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {isWlan ? (
                      <>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                          <path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><circle cx="12" cy="20" r="1" fill="#3b82f6" />
                        </svg>
                        <span style={{ color: '#3b82f6', fontWeight: 500 }}>WLAN</span>
                      </>
                    ) : (
                      <>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                          <rect x="1" y="6" width="22" height="12" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
                        </svg>
                        <span style={{ color: '#22c55e', fontWeight: 500 }}>LAN</span>
                      </>
                    )}
                  </span>
                </td>
              </tr>
              {device.interface && (
                <tr>
                  <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Interface</td>
                  <td style={{ fontFamily: 'monospace' }}>{device.interface}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <h4 style={{ marginBottom: 12, fontSize: 14 }}>Ger{'\u00e4'}tekontrolle</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button
                className={`btn ${blocked ? 'btn-primary' : 'btn-danger'}`}
                onClick={handleBlock}
                disabled={blocking}
              >
                {blocking ? 'Wird ausgef\u00fchrt...' : blocked ? 'Internet freigeben' : 'Internet sperren'}
              </button>
              {blocked && (
                <span style={{ color: 'var(--danger)', fontSize: 13, fontWeight: 500 }}>
                  {'\u26d4'} Ger\u00e4t ist gesperrt
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>IPv4-Adresse dauerhaft zuweisen</h3>
          {staticDhcp?.exists && (
            <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 500 }}>&#x2713; Reservierung aktiv: {staticDhcp.ip}</span>
          )}
        </div>
        <div className="card-body">
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
            Weist diesem Ger&auml;t immer die gleiche IPv4-Adresse zu (DHCP-Reservierung). Das Ger&auml;t erh&auml;lt diese IP bei jeder Verbindung automatisch.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={staticDhcpInput}
              onChange={e => setStaticDhcpInput(e.target.value)}
              placeholder={device.ip || '192.168.178.x'}
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
              {settingDhcp ? '...' : staticDhcp?.exists ? 'Reservierung aktualisieren' : 'Dauerhaft zuweisen'}
            </button>
            {staticDhcp?.exists && (
              <button
                className="btn btn-danger"
                onClick={handleRemoveStaticDhcp}
                disabled={settingDhcp}
                style={{ padding: '6px 14px', fontSize: 13 }}
              >
                Reservierung entfernen
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Traffic</h3>
        </div>
        <div className="card-body">
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
            Die Fritz!Box stellt keinen gerätespezifischen Traffic-Verlauf über die API zur Verfügung.
            Den gesamten Internet-WAN-Traffic (alle Geräte) findest du auf der{' '}
            <strong>Dashboard</strong>-Seite, historische Verbrauchsstatistiken unter{' '}
            <strong>Traffic</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}

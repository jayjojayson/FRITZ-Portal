import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/apiFetch';

interface NetworkProps {
  sid: string;
}

type NetworkTab = 'overview' | 'lan' | 'wan' | 'wlan' | 'dhcp';

export default function Network({ sid }: NetworkProps) {
  const [tab, setTab] = useState<NetworkTab>('overview');
  const [loading, setLoading] = useState(true);
  const [lanInfo, setLanInfo] = useState<any>(null);
  const [wanInfo, setWanInfo] = useState<any>(null);
  const [wlanInfo, setWlanInfo] = useState<any[]>([]);
  const [dhcpInfo, setDhcpInfo] = useState<any>(null);

  const headers = { 'X-Fritz-SID': sid };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [lanRes, wanRes, wlanRes, dhcpRes] = await Promise.all([
        apiFetch('/api/fritz/network/lan', { headers }),
        apiFetch('/api/fritz/network/wan', { headers }),
        apiFetch('/api/fritz/network/wlan', { headers }),
        apiFetch('/api/fritz/network/dhcp', { headers }),
      ]);

      setLanInfo(await lanRes.json());
      setWanInfo(await wanRes.json());
      setWlanInfo(await wlanRes.json());
      setDhcpInfo(await dhcpRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const tabs: { id: NetworkTab; label: string }[] = [
    { id: 'overview', label: '\u00dcbersicht' },
    { id: 'lan', label: 'LAN' },
    { id: 'wan', label: 'WAN' },
    { id: 'wlan', label: 'WLAN' },
    { id: 'dhcp', label: 'DHCP' },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>Netzwerk</h2>
        <p>Netzwerk-Konfiguration und Einstellungen</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: `1px solid ${tab === t.id ? 'var(--accent)' : 'var(--border)'}`,
              background: tab === t.id ? 'var(--accent)' : 'var(--bg-card)',
              color: tab === t.id ? '#fff' : 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <NetworkOverview lanInfo={lanInfo} wanInfo={wanInfo} wlanInfo={wlanInfo} />}
      {tab === 'lan' && <LANSettings lanInfo={lanInfo} />}
      {tab === 'wan' && <WANSettings wanInfo={wanInfo} />}
      {tab === 'wlan' && <WLANSettings wlanInfo={wlanInfo} sid={sid} />}
      {tab === 'dhcp' && <DHCPSettings dhcpInfo={dhcpInfo} sid={sid} />}
    </div>
  );
}

function NetworkOverview({ lanInfo, wanInfo, wlanInfo }: { lanInfo: any; wanInfo: any; wlanInfo: any[] }) {
  return (
    <div className="stats-grid">
      <div className="card">
        <div className="card-header">
          <h3>LAN</h3>
        </div>
        <div className="card-body">
          <table>
            <tbody>
              <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)', width: 180 }}>Router IP</td><td>{lanInfo?.NewIPRouters || '-'}</td></tr>
              <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Subnetzmaske</td><td>{lanInfo?.NewSubnetMask || '-'}</td></tr>
              <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>DNS-Server</td><td>{lanInfo?.NewDNSServers || '-'}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>WAN</h3>
        </div>
        <div className="card-body">
          <table>
            <tbody>
              <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)', width: 180 }}>Externe IP</td><td>{wanInfo?.NewExternalIPAddress || '-'}</td></tr>
              <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Verbindung</td><td>{wanInfo?.NewConnectionStatus || '-'}</td></tr>
              <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Typ</td><td>{wanInfo?.NewConnectionType || '-'}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>WLAN Netzwerke</h3>
        </div>
        <div className="card-body">
          {wlanInfo.map((w, i) => (
            <div key={i} style={{ marginBottom: i < wlanInfo.length - 1 ? 16 : 0, paddingBottom: i < wlanInfo.length - 1 ? 16 : 0, borderBottom: i < wlanInfo.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>{w.NewSSID || `WLAN ${i + 1}`}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Kanal: {w.NewChannel || '-'} | Status: {w.NewStatus || '-'}
              </div>
            </div>
          ))}
          {wlanInfo.length === 0 && <div style={{ color: 'var(--text-secondary)' }}>Keine WLAN-Daten verf\u00fcgbar</div>}
        </div>
      </div>
    </div>
  );
}

function LANSettings({ lanInfo }: { lanInfo: any }) {
  return (
    <div className="card">
      <div className="card-header"><h3>LAN Einstellungen</h3></div>
      <div className="card-body">
        <table>
          <tbody>
            <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)', width: 220 }}>IP-Adresse (Router)</td><td>{lanInfo?.NewIPRouters || '-'}</td></tr>
            <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Subnetzmaske</td><td>{lanInfo?.NewSubnetMask || '-'}</td></tr>
            <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>DNS-Server</td><td>{lanInfo?.NewDNSServers || '-'}</td></tr>
            <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Domainname</td><td>{lanInfo?.NewDomainName || '-'}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WANSettings({ wanInfo }: { wanInfo: any }) {
  return (
    <div className="card">
      <div className="card-header"><h3>WAN Einstellungen</h3></div>
      <div className="card-body">
        <table>
          <tbody>
            <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)', width: 220 }}>Externe IP-Adresse</td><td>{wanInfo?.NewExternalIPAddress || '-'}</td></tr>
            <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Verbindungsstatus</td><td>{wanInfo?.NewConnectionStatus || '-'}</td></tr>
            <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Verbindungstyp</td><td>{wanInfo?.NewConnectionType || '-'}</td></tr>
            <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Upstream</td><td>{wanInfo?.NewUpstreamMaxBitRate || '-'}</td></tr>
            <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Downstream</td><td>{wanInfo?.NewDownstreamMaxBitRate || '-'}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WLANSettings({ wlanInfo, sid }: { wlanInfo: any[]; sid: string }) {
  const bandLabels = ['2.4 GHz', '5 GHz', '6 GHz / Gast'];
  const bandColors = ['#3b82f6', '#22c55e', '#f59e0b'];
  const bandBg = ['rgba(59,130,246,0.1)', 'rgba(34,197,94,0.1)', 'rgba(245,158,11,0.1)'];
  const headers = { 'X-Fritz-SID': sid };

  const [showPass, setShowPass] = useState<Record<number, boolean>>({});
  const [editPass, setEditPass] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [messages, setMessages] = useState<Record<number, string>>({});

  const getSecurity = (standard: string) => {
    if (!standard) return 'Keine';
    if (standard.includes('WPA3')) return 'WPA3';
    if (standard.includes('WPA2')) return 'WPA2';
    if (standard.includes('WPA')) return 'WPA';
    if (standard === 'n') return '802.11n (WPA2)';
    if (standard === 'ac') return '802.11ac (WPA2)';
    if (standard === 'ax') return '802.11ax (WPA3)';
    return standard;
  };

  const getFrequency = (channel: string) => {
    const ch = parseInt(channel, 10);
    if (ch >= 1 && ch <= 14) return '2.4 GHz';
    if (ch >= 36) return '5 GHz';
    return '-';
  };

  const handleSavePass = async (wlanIndex: number) => {
    const newPass = editPass[wlanIndex];
    if (!newPass || newPass.length < 8) {
      setMessages(m => ({ ...m, [wlanIndex]: 'Fehler: Mindestens 8 Zeichen erforderlich' }));
      return;
    }
    setSaving(s => ({ ...s, [wlanIndex]: true }));
    setMessages(m => ({ ...m, [wlanIndex]: '' }));
    try {
      const res = await apiFetch('/api/fritz/network/wlan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ index: wlanIndex, passphrase: newPass }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages(m => ({ ...m, [wlanIndex]: 'Passwort gespeichert' }));
        setEditPass(e => ({ ...e, [wlanIndex]: '' }));
      } else {
        setMessages(m => ({ ...m, [wlanIndex]: `Fehler: ${data.error || 'Unbekannt'}` }));
      }
    } catch {
      setMessages(m => ({ ...m, [wlanIndex]: 'Verbindungsfehler' }));
    } finally {
      setSaving(s => ({ ...s, [wlanIndex]: false }));
    }
  };

  return (
    <div>
      {wlanInfo.map((w, i) => {
        const isEnabled = w.NewStatus === 'Up';
        const color = bandColors[i % bandColors.length];
        const bg = bandBg[i % bandBg.length];
        const freq = getFrequency(w.NewChannel || '');
        const wlanIdx: number = w._index || (i + 1);

        return (
          <div className="card" key={i} style={{ borderLeft: `4px solid ${color}` }}>
            <div className="card-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
                      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                      <circle cx="12" cy="20" r="1" fill={color} />
                    </svg>
                    <span style={{ fontSize: 20, fontWeight: 700 }}>{w.NewSSID || `WLAN ${i + 1}`}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {bandLabels[i % bandLabels.length]} {freq !== '-' ? `\u2013 ${freq}` : ''}
                  </div>
                </div>
                <div style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  background: isEnabled ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  color: isEnabled ? '#22c55e' : '#ef4444',
                  fontSize: 13,
                  fontWeight: 600,
                }}>
                  {isEnabled ? 'Aktiv' : 'Inaktiv'}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
                <div style={{ background: bg, borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Kanal</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color }}>{w.NewChannel || '-'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{freq}</div>
                </div>
                <div style={{ background: bg, borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Standard</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color }}>{w.NewStandard || '-'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{getSecurity(w.NewStandard || '')}</div>
                </div>
                <div style={{ background: bg, borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Verschl\u00fcsselung</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color }}>{getSecurity(w.NewStandard || '')}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{isEnabled ? 'Gesichert' : '-'}</div>
                </div>
                <div style={{ background: bg, borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Status</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: isEnabled ? '#22c55e' : '#ef4444' }}>
                    {isEnabled ? 'Verbunden' : 'Getrennt'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{w.NewStatus || '-'}</div>
                </div>
              </div>

              {/* WLAN-Passwort */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>WLAN-Passwort (WPA-Schl\u00fcssel)</div>

                {/* Aktuelles Passwort anzeigen */}
                {w.NewKeyPassphrase && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', width: 100 }}>Aktuell:</span>
                    <code style={{
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 14,
                      letterSpacing: showPass[wlanIdx] ? 'normal' : 3,
                      fontFamily: 'monospace',
                    }}>
                      {showPass[wlanIdx] ? w.NewKeyPassphrase : '\u2022'.repeat(Math.min(w.NewKeyPassphrase.length, 16))}
                    </code>
                    <button
                      onClick={() => setShowPass(s => ({ ...s, [wlanIdx]: !s[wlanIdx] }))}
                      style={{
                        background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                        padding: '4px 10px', cursor: 'pointer', fontSize: 12,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {showPass[wlanIdx] ? 'Verbergen' : 'Anzeigen'}
                    </button>
                  </div>
                )}
                {!w.NewKeyPassphrase && (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>Kein Passwort verf\u00fcgbar (Ger\u00e4t offline oder kein Zugriff)</div>
                )}

                {/* Neues Passwort setzen */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', width: 100 }}>Neu setzen:</span>
                  <input
                    type="text"
                    value={editPass[wlanIdx] || ''}
                    onChange={e => setEditPass(ep => ({ ...ep, [wlanIdx]: e.target.value }))}
                    placeholder="Neues Passwort (min. 8 Zeichen)"
                    style={{
                      padding: '6px 10px', borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--bg-primary)', color: 'var(--text-primary)',
                      fontSize: 14, width: 260,
                    }}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={() => handleSavePass(wlanIdx)}
                    disabled={saving[wlanIdx] || !editPass[wlanIdx] || (editPass[wlanIdx]?.length || 0) < 8}
                    style={{ padding: '6px 14px', fontSize: 13 }}
                  >
                    {saving[wlanIdx] ? '...' : 'Speichern'}
                  </button>
                </div>
                {messages[wlanIdx] && (
                  <div style={{
                    marginTop: 8, fontSize: 13, padding: '6px 10px', borderRadius: 6,
                    background: messages[wlanIdx].startsWith('Fehler') ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                    color: messages[wlanIdx].startsWith('Fehler') ? '#ef4444' : '#22c55e',
                  }}>
                    {messages[wlanIdx]}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {wlanInfo.length === 0 && (
        <div className="card">
          <div className="card-body">
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 32 }}>Keine WLAN-Daten verf\u00fcgbar</div>
          </div>
        </div>
      )}
    </div>
  );
}

function DHCPSettings({ dhcpInfo, sid }: { dhcpInfo: any; sid: string }) {
  const [minAddress, setMinAddress] = useState(dhcpInfo?.NewMinAddress || '');
  const [maxAddress, setMaxAddress] = useState(dhcpInfo?.NewMaxAddress || '');
  const [subnetMask, setSubnetMask] = useState(dhcpInfo?.NewSubnetMask || '');
  const [dnsServers, setDnsServers] = useState(dhcpInfo?.NewDNSServers || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setMinAddress(dhcpInfo?.NewMinAddress || '');
    setMaxAddress(dhcpInfo?.NewMaxAddress || '');
    setSubnetMask(dhcpInfo?.NewSubnetMask || '');
    setDnsServers(dhcpInfo?.NewDNSServers || '');
  }, [dhcpInfo]);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const res = await apiFetch('/api/fritz/network/dhcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Fritz-SID': sid,
        },
        body: JSON.stringify({ minAddress, maxAddress, subnetMask, dnsServers }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage('DHCP-Einstellungen gespeichert');
      } else {
        setError(data.error || 'Speichern fehlgeschlagen');
      }
    } catch (err) {
      setError('Verbindungsfehler');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, width: 200 };

  return (
    <div className="card">
      <div className="card-header"><h3>DHCP Einstellungen</h3></div>
      <div className="card-body">
        {message && <div className="success-message">{message}</div>}
        {error && <div className="error-message">{error}</div>}
        <table>
          <tbody>
            <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)', width: 220 }}>DHCP Server</td><td>{dhcpInfo?.NewDHCPServerConfigurable === '1' ? 'Aktiv' : 'Inaktiv'}</td></tr>
            <tr>
              <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>IP-Bereich Start</td>
              <td><input type="text" value={minAddress} onChange={e => setMinAddress(e.target.value)} style={inputStyle} /></td>
            </tr>
            <tr>
              <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>IP-Bereich Ende</td>
              <td><input type="text" value={maxAddress} onChange={e => setMaxAddress(e.target.value)} style={inputStyle} /></td>
            </tr>
            <tr>
              <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Subnetzmaske</td>
              <td><input type="text" value={subnetMask} onChange={e => setSubnetMask(e.target.value)} style={inputStyle} /></td>
            </tr>
            <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Router (Gateway)</td><td>{dhcpInfo?.NewIPRouters || '-'}</td></tr>
            <tr>
              <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>DNS-Server</td>
              <td><input type="text" value={dnsServers} onChange={e => setDnsServers(e.target.value)} style={inputStyle} placeholder="z.B. 192.168.178.1" /></td>
            </tr>
          </tbody>
        </table>
        <div style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Speichern...' : 'Einstellungen speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

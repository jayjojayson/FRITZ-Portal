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
  const [meshData, setMeshData] = useState<any>(null);
  const [meshLoading, setMeshLoading] = useState(false);

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
    // Mesh parallel nachladen (max 25s Timeout)
    setMeshLoading(true);
    const meshTimeout = setTimeout(() => setMeshLoading(false), 25000);
    try {
      const meshRes = await apiFetch('/api/fritz/mesh', { headers });
      setMeshData(await meshRes.json());
    } catch {}
    finally {
      clearTimeout(meshTimeout);
      setMeshLoading(false);
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

      {tab === 'overview' && <NetworkOverview lanInfo={lanInfo} wanInfo={wanInfo} wlanInfo={wlanInfo} meshData={meshData} meshLoading={meshLoading} />}
      {tab === 'lan' && <LANSettings lanInfo={lanInfo} />}
      {tab === 'wan' && <WANSettings wanInfo={wanInfo} />}
      {tab === 'wlan' && <WLANSettings wlanInfo={wlanInfo} sid={sid} />}
      {tab === 'dhcp' && <DHCPSettings dhcpInfo={dhcpInfo} sid={sid} />}
    </div>
  );
}

function NetworkOverview({ lanInfo, wanInfo, wlanInfo, meshData, meshLoading }: {
  lanInfo: any; wanInfo: any; wlanInfo: any[];
  meshData: any; meshLoading: boolean;
}) {
  return (
    <div>
      <div className="stats-grid">
        <div className="card">
          <div className="card-header"><h3>LAN</h3></div>
          <div className="card-body">
            <table><tbody>
              <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)', width: 180 }}>Router IP</td><td>{lanInfo?.NewIPRouters || '-'}</td></tr>
              <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Subnetzmaske</td><td>{lanInfo?.NewSubnetMask || '-'}</td></tr>
              <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>DNS-Server</td><td>{lanInfo?.NewDNSServers || '-'}</td></tr>
            </tbody></table>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>WAN</h3></div>
          <div className="card-body">
            <table><tbody>
              <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)', width: 180 }}>Externe IP</td><td>{wanInfo?.NewExternalIPAddress || '-'}</td></tr>
              <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Verbindung</td><td>{wanInfo?.NewConnectionStatus || '-'}</td></tr>
              <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Typ</td><td>{wanInfo?.NewConnectionType || '-'}</td></tr>
            </tbody></table>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>WLAN Netzwerke</h3></div>
          <div className="card-body">
            {wlanInfo.map((w, i) => (
              <div key={i} style={{ marginBottom: i < wlanInfo.length - 1 ? 16 : 0, paddingBottom: i < wlanInfo.length - 1 ? 16 : 0, borderBottom: i < wlanInfo.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>{w.NewSSID || `WLAN ${i + 1}`}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Kanal: {w.NewChannel || '-'} | Status: {w.NewStatus || '-'}</div>
              </div>
            ))}
            {wlanInfo.length === 0 && <div style={{ color: 'var(--text-secondary)' }}>Keine WLAN-Daten verfügbar</div>}
          </div>
        </div>
      </div>

      <MeshTopology meshData={meshData} loading={meshLoading} />
    </div>
  );
}

// ── Mesh-Topologie Visualisierung ────────────────────────────────────────────

interface MeshNode {
  uid: string;
  name: string;
  mac: string;
  ip: string;
  role: 'master' | 'satellite' | 'client';
  is_meshed: boolean;
  model: string;
  interfaces: { type: string; name: string }[];
}

interface MeshLink {
  from: string;
  to: string;
  type: string;
  speed: number;
}

function MeshTopology({ meshData, loading }: { meshData: any; loading: boolean }) {
  const [tooltip, setTooltip] = useState<{ node: MeshNode; x: number; y: number } | null>(null);

  if (loading) {
    return (
      <div className="card">
        <div className="card-header"><h3>Mesh-Topologie</h3></div>
        <div className="card-body" style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  const nodes: MeshNode[] = meshData?.nodes || [];
  const links: MeshLink[] = meshData?.links || [];

  if (nodes.length === 0) {
    return (
      <div className="card">
        <div className="card-header"><h3>Mesh-Topologie</h3></div>
        <div className="card-body" style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 12, opacity: 0.4 }}>
            <circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" />
            <line x1="12" y1="7" x2="5" y2="17" /><line x1="12" y1="7" x2="19" y2="17" />
          </svg>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>Keine Mesh-Daten verfügbar</div>
          <div style={{ fontSize: 13 }}>Dieses Fritz!Box-Modell unterstützt möglicherweise kein Mesh oder die Daten sind nicht abrufbar.</div>
        </div>
      </div>
    );
  }

  // Layout berechnen: Master oben mittig, Satellites darunter, Clients darunter
  const W = 760;
  const masterNodes    = nodes.filter(n => n.role === 'master');
  const satelliteNodes = nodes.filter(n => n.role === 'satellite');
  const clientNodes    = nodes.filter(n => n.role !== 'master' && n.role !== 'satellite');

  const displayNodes: (MeshNode & { x: number; y: number })[] = [];

  const placeRow = (arr: MeshNode[], y: number) => {
    if (arr.length === 0) return;
    const spacing = Math.min(180, (W - 80) / arr.length);
    const startX = W / 2 - ((arr.length - 1) * spacing) / 2;
    arr.forEach((n, i) => displayNodes.push({ ...n, x: startX + i * spacing, y }));
  };

  const rowHeight = 130;
  let currentY = 80;
  placeRow(masterNodes, currentY);
  if (masterNodes.length > 0 && satelliteNodes.length > 0) currentY += rowHeight;
  placeRow(satelliteNodes, currentY);
  if ((masterNodes.length > 0 || satelliteNodes.length > 0) && clientNodes.length > 0) currentY += rowHeight;
  placeRow(clientNodes.slice(0, 20), currentY);

  const svgH = currentY + 110;
  const nodeMap = new Map(displayNodes.map(n => [n.uid, n]));

  const roleStyle = {
    master:    { fill: '#1d4ed8', stroke: '#3b82f6', r: 34 },
    satellite: { fill: '#065f46', stroke: '#10b981', r: 28 },
    client:    { fill: '#374151', stroke: '#6b7280', r: 22 },
  };

  const linkColor = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('lan') || t.includes('eth')) return '#3b82f6';
    if (t.includes('wifi') || t.includes('wlan') || t.includes('wireless')) return '#10b981';
    return '#6b7280';
  };

  const linkDash = (type: string) => {
    const t = type.toLowerCase();
    return (t.includes('wifi') || t.includes('wlan') || t.includes('wireless')) ? '6 3' : '0';
  };

  return (
    <div className="card">
      <div className="card-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h3>Mesh-Topologie</h3>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} /> Master
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} /> Satellite
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#6b7280', display: 'inline-block' }} /> Client
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="#3b82f6" strokeWidth="2" /></svg> LAN
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="#10b981" strokeWidth="2" strokeDasharray="6 3" /></svg> WLAN
          </span>
        </div>
      </div>
      <div className="card-body" style={{ padding: 0, position: 'relative', overflowX: 'auto' }}
           onMouseLeave={() => setTooltip(null)}>
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${svgH}`}
          style={{ display: 'block', minHeight: svgH, cursor: 'default' }}
        >
          <defs>
            {Object.entries(roleStyle).map(([role, s]) => (
              <radialGradient key={role} id={`glow-${role}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={s.stroke} stopOpacity="0.3" />
                <stop offset="100%" stopColor={s.stroke} stopOpacity="0" />
              </radialGradient>
            ))}
          </defs>

          {/* Verbindungslinien */}
          {links.map((link, i) => {
            const a = nodeMap.get(link.from);
            const b = nodeMap.get(link.to);
            if (!a || !b) return null;
            const color = linkColor(link.type);
            const dash  = linkDash(link.type);
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            return (
              <g key={i}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={color} strokeWidth="2" strokeDasharray={dash} strokeOpacity="0.6" />
                {link.speed > 0 && (
                  <text x={mx} y={my - 6} textAnchor="middle" fontSize="10" fill={color} opacity="0.8">
                    {link.speed >= 1000 ? `${(link.speed / 1000).toFixed(0)} Gbit/s` : `${link.speed} Mbit/s`}
                  </text>
                )}
              </g>
            );
          })}

          {/* Knoten */}
          {displayNodes.map(node => {
            const s = roleStyle[node.role as keyof typeof roleStyle] || roleStyle.client;
            return (
              <g
                key={node.uid}
                transform={`translate(${node.x},${node.y})`}
                style={{ cursor: 'pointer' }}
                onMouseEnter={e => {
                  const svgEl = (e.currentTarget.closest('svg') as SVGSVGElement);
                  const rect = svgEl.getBoundingClientRect();
                  setTooltip({
                    node,
                    x: node.x * (rect.width / W) + rect.left,
                    y: node.y * (rect.height / svgH) + rect.top,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              >
                <circle cx={0} cy={0} r={s.r + 14} fill={`url(#glow-${node.role})`} />
                <circle cx={0} cy={0} r={s.r} fill={s.fill} stroke={s.stroke} strokeWidth="2.5" />
                {/* Icon */}
                {node.role === 'master' && (
                  <g fill="none" stroke="white" strokeWidth="1.5">
                    <rect x="-12" y="-8" width="24" height="16" rx="3" />
                    <circle cx="-6" cy="0" r="1.5" fill="white" stroke="none" />
                    <circle cx="0"  cy="0" r="1.5" fill="white" stroke="none" />
                    <circle cx="6"  cy="0" r="1.5" fill="white" stroke="none" />
                    <line x1="-8" y1="-8" x2="-10" y2="-14" />
                    <line x1="0"  y1="-8" x2="0"   y2="-14" />
                    <line x1="8"  y1="-8" x2="10"  y2="-14" />
                  </g>
                )}
                {node.role === 'satellite' && (
                  <g fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M-9 2 Q0 -10 9 2" />
                    <path d="M-5 5 Q0 -1 5 5" />
                    <circle cx="0" cy="8" r="1.5" fill="white" stroke="none" />
                  </g>
                )}
                {node.role === 'client' && (
                  <g fill="none" stroke="white" strokeWidth="1.5">
                    <rect x="-8" y="-9" width="16" height="12" rx="2" />
                    <line x1="-4" y1="3" x2="4" y2="3" />
                    <line x1="0"  y1="3" x2="0"  y2="7" />
                    <line x1="-4" y1="7" x2="4"  y2="7" />
                  </g>
                )}
                {/* Label */}
                <text y={s.r + 16} textAnchor="middle" fontSize="12" fill="var(--text-primary)" fontWeight="500">
                  {node.name.length > 16 ? node.name.slice(0, 14) + '…' : node.name}
                </text>
                {node.ip && (
                  <text y={s.r + 30} textAnchor="middle" fontSize="10" fill="var(--text-secondary)">
                    {node.ip}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div style={{
            position: 'fixed',
            left: tooltip.x + 20,
            top: tooltip.y - 10,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '12px 16px',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 9999,
            fontSize: 13,
            minWidth: 200,
            pointerEvents: 'none',
          }}>
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>{tooltip.node.name}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Rolle</span>
              <span style={{ textTransform: 'capitalize', color:
                tooltip.node.role === 'master' ? '#3b82f6' :
                tooltip.node.role === 'satellite' ? '#10b981' : 'var(--text-primary)'
              }}>{tooltip.node.role}</span>
              {tooltip.node.mac && <><span style={{ color: 'var(--text-secondary)' }}>MAC</span><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{tooltip.node.mac}</span></>}
              {tooltip.node.ip  && <><span style={{ color: 'var(--text-secondary)' }}>IP</span><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{tooltip.node.ip}</span></>}
              {tooltip.node.model && <><span style={{ color: 'var(--text-secondary)' }}>Modell</span><span>{tooltip.node.model}</span></>}
            </div>
          </div>
        )}
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

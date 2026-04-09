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
    // Mesh parallel nachladen (max 15s Timeout)
    setMeshLoading(true);
    const meshTimeout = setTimeout(() => setMeshLoading(false), 15000);
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

      {tab === 'overview' && <NetworkOverview lanInfo={lanInfo} wanInfo={wanInfo} wlanInfo={wlanInfo} meshData={meshData} meshLoading={meshLoading} sid={sid} />}
      {tab === 'lan' && <LANSettings lanInfo={lanInfo} />}
      {tab === 'wan' && <WANSettings wanInfo={wanInfo} />}
      {tab === 'wlan' && <WLANSettings wlanInfo={wlanInfo} sid={sid} />}
      {tab === 'dhcp' && <DHCPSettings dhcpInfo={dhcpInfo} sid={sid} />}
    </div>
  );
}

function NetworkOverview({ lanInfo, wanInfo, wlanInfo, meshData, meshLoading, sid }: {
  lanInfo: any; wanInfo: any; wlanInfo: any[];
  meshData: any; meshLoading: boolean; sid: string;
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

      <MeshTopology meshData={meshData} loading={meshLoading} sid={sid} />
    </div>
  );
}

// ── Mesh-Topologie / Netzwerk-Visualisierung ────────────────────────────────

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

const isWlanType = (type: string) => {
  const t = type.toLowerCase();
  return t.includes('wlan') || t.includes('802') || t.includes('wifi') || t.includes('wireless');
};

function MeshTopology({ meshData, loading, sid }: { meshData: any; loading: boolean; sid: string }) {
  const [tooltip, setTooltip] = useState<{ node: MeshNode; x: number; y: number } | null>(null);
  const [hoveredUid, setHoveredUid] = useState<string | null>(null);
  const isOriginallyHosts = meshData?._source === 'hosts-fallback';
  const [viewMode, setViewMode] = useState<'mesh' | 'hosts'>(isOriginallyHosts ? 'hosts' : 'mesh');
  const [hostsData, setHostsData] = useState<any>(null);
  const [hostsLoading, setHostsLoading] = useState(false);

  useEffect(() => {
    if (meshData) setViewMode(meshData._source === 'hosts-fallback' ? 'hosts' : 'mesh');
  }, [meshData?._source]);

  const fetchHosts = async () => {
    if (hostsData) return;
    setHostsLoading(true);
    try {
      const res = await apiFetch('/api/fritz/mesh?source=hosts', { headers: { 'X-Fritz-SID': sid } });
      setHostsData(await res.json());
    } catch {} finally { setHostsLoading(false); }
  };

  useEffect(() => {
    if (viewMode === 'hosts' && !hostsData && !isOriginallyHosts) fetchHosts();
  }, [viewMode]);

  if (loading) {
    return (
      <div className="card">
        <div className="card-header"><h3>Netzwerk-Topologie</h3></div>
        <div className="card-body" style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  const currentData = viewMode === 'hosts'
    ? (hostsData || (isOriginallyHosts ? meshData : null))
    : (!isOriginallyHosts ? meshData : null);

  const nodes: MeshNode[] = currentData?.nodes || [];
  const links: MeshLink[] = currentData?.links || [];
  const showHostsView = viewMode === 'hosts';

  const toggleBtn = (
    <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <button onClick={() => setViewMode('mesh')} style={{
        padding: '4px 14px', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer',
        background: viewMode === 'mesh' ? 'var(--accent)' : 'transparent',
        color: viewMode === 'mesh' ? '#fff' : 'var(--text-secondary)',
        transition: 'all 0.2s',
      }}>Mesh</button>
      <button onClick={() => { setViewMode('hosts'); if (!hostsData && !isOriginallyHosts) fetchHosts(); }} style={{
        padding: '4px 14px', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer',
        background: viewMode === 'hosts' ? 'var(--accent)' : 'transparent',
        color: viewMode === 'hosts' ? '#fff' : 'var(--text-secondary)',
        transition: 'all 0.2s',
      }}>Netzwerk</button>
    </div>
  );

  const legend = (
    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} /> {showHostsView ? 'Fritz!Box' : 'Master'}
      </span>
      {!showHostsView && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} /> Satellite
      </span>}
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
  );

  if (hostsLoading) {
    return (
      <div className="card">
        <div className="card-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><h3>Netzwerk-Topologie</h3>{toggleBtn}</div>
          {legend}
        </div>
        <div className="card-body" style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="card">
        <div className="card-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><h3>Netzwerk-Topologie</h3>{toggleBtn}</div>
          {legend}
        </div>
        <div className="card-body" style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 12, opacity: 0.4 }}>
            <circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" />
            <line x1="12" y1="7" x2="5" y2="17" /><line x1="12" y1="7" x2="19" y2="17" />
          </svg>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            {viewMode === 'mesh' ? 'Keine Mesh-Daten verfügbar' : 'Keine Netzwerk-Daten verfügbar'}
          </div>
          <div style={{ fontSize: 13 }}>
            {viewMode === 'mesh'
              ? 'Dieses Modell unterstützt möglicherweise kein Mesh. Wechsle zur Netzwerk-Ansicht.'
              : 'Die Geräteliste konnte nicht abgerufen werden.'}
          </div>
        </div>
      </div>
    );
  }

  const tooltipEl = tooltip && (
    <div style={{
      position: 'fixed', left: tooltip.x + 20, top: tooltip.y - 10,
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
      padding: '12px 16px', boxShadow: 'var(--shadow-lg)', zIndex: 9999, fontSize: 13,
      minWidth: 200, pointerEvents: 'none',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>{tooltip.node.name}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
        <span style={{ color: 'var(--text-secondary)' }}>Rolle</span>
        <span style={{ textTransform: 'capitalize', color:
          tooltip.node.role === 'master' ? '#3b82f6' :
          tooltip.node.role === 'satellite' ? '#10b981' : 'var(--text-primary)'
        }}>{tooltip.node.role === 'master' ? 'Fritz!Box' : tooltip.node.role}</span>
        {tooltip.node.mac && <><span style={{ color: 'var(--text-secondary)' }}>MAC</span><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{tooltip.node.mac}</span></>}
        {tooltip.node.ip && <><span style={{ color: 'var(--text-secondary)' }}>IP</span><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{tooltip.node.ip}</span></>}
        {tooltip.node.model && <><span style={{ color: 'var(--text-secondary)' }}>Modell</span><span>{tooltip.node.model}</span></>}
        {tooltip.node.interfaces?.[0]?.type && <><span style={{ color: 'var(--text-secondary)' }}>Verbindung</span><span>{isWlanType(tooltip.node.interfaces[0].type) ? 'WLAN' : 'LAN'}</span></>}
      </div>
    </div>
  );

  // ── Radiales Star-Layout (Netzwerk-Ansicht) ──
  if (showHostsView) {
    const masterNode = nodes.find(n => n.role === 'master') || nodes[0];
    const clientNodes = nodes.filter(n => n.uid !== masterNode.uid);
    const totalClients = clientNodes.length;

    // Knotengröße je nach Anzahl
    const nodeR = totalClients <= 15 ? 18 : totalClients <= 40 ? 14 : totalClients <= 80 ? 10 : 7;
    const showLabels = totalClients <= 35;
    const spacing = Math.max(nodeR * 4, showLabels ? 55 : 28);

    // LAN/WLAN Zuordnung für jeden Client
    const clientMeta = clientNodes.map(n => {
      const link = links.find(l => l.to === n.uid || l.from === n.uid);
      const wlan = link ? isWlanType(link.type) : isWlanType(n.interfaces?.[0]?.type || '');
      return { node: n, isWlan: wlan };
    });

    // LAN zuerst, dann WLAN
    const lanClients = clientMeta.filter(c => !c.isWlan);
    const wlanClients = clientMeta.filter(c => c.isWlan);
    const ordered = [...lanClients, ...wlanClients];

    // Ringe berechnen
    const baseRadius = Math.max(nodeR * 7, 70);
    const ringGap = Math.max(spacing, nodeR * 5);
    const rings: { radius: number; startIdx: number; count: number }[] = [];
    let placed = 0;
    let ringR = baseRadius;
    while (placed < totalClients) {
      const cap = Math.max(6, Math.floor(2 * Math.PI * ringR / spacing));
      const cnt = Math.min(cap, totalClients - placed);
      rings.push({ radius: ringR, startIdx: placed, count: cnt });
      placed += cnt;
      ringR += ringGap;
    }

    const maxR = rings.length > 0 ? rings[rings.length - 1].radius : baseRadius;
    const pad = showLabels ? 70 : 45;
    const W = 2 * (maxR + pad + nodeR);
    const H = W;
    const cx = W / 2;
    const cy = H / 2;
    const masterR = 34;

    // Summary
    const lanCount = lanClients.length;
    const wlanCount = wlanClients.length;

    return (
      <div className="card">
        <div className="card-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><h3>Netzwerk-Topologie</h3>{toggleBtn}</div>
          {legend}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, padding: '12px 16px 0', fontSize: 13, color: 'var(--text-secondary)' }}>
          <span>{totalClients} Geräte online</span>
          <span style={{ color: '#3b82f6' }}>● {lanCount} LAN</span>
          <span style={{ color: '#10b981' }}>● {wlanCount} WLAN</span>
        </div>
        <div className="card-body" style={{ padding: 0, position: 'relative', overflowX: 'auto' }}
             onMouseLeave={() => { setTooltip(null); setHoveredUid(null); }}>
          <svg
            width="100%"
            viewBox={`0 0 ${W} ${H}`}
            style={{ display: 'block', maxHeight: 700, cursor: 'default' }}
          >
            <defs>
              <radialGradient id="glow-master-r" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Verbindungslinien */}
            {ordered.map((c, i) => {
              let ring: { radius: number; startIdx: number; count: number } | undefined;
              let idxInRing = 0;
              for (const r of rings) {
                if (i >= r.startIdx && i < r.startIdx + r.count) {
                  ring = r;
                  idxInRing = i - r.startIdx;
                  break;
                }
              }
              if (!ring) return null;
              const angle = (2 * Math.PI * idxInRing / ring.count) - Math.PI / 2;
              const nx = cx + ring.radius * Math.cos(angle);
              const ny = cy + ring.radius * Math.sin(angle);
              const isHovered = hoveredUid === c.node.uid;
              const color = c.isWlan ? '#10b981' : '#3b82f6';
              const dash = c.isWlan ? '6 3' : '0';
              return (
                <line key={`l-${i}`} x1={cx} y1={cy} x2={nx} y2={ny}
                  stroke={color} strokeWidth={isHovered ? 2.5 : 1.5}
                  strokeDasharray={dash}
                  strokeOpacity={hoveredUid ? (isHovered ? 0.9 : 0.06) : 0.18}
                  style={{ transition: 'stroke-opacity 0.2s' }}
                />
              );
            })}

            {/* Master-Knoten */}
            <g transform={`translate(${cx},${cy})`}>
              <circle cx={0} cy={0} r={masterR + 14} fill="url(#glow-master-r)" />
              <circle cx={0} cy={0} r={masterR} fill="#1d4ed8" stroke="#3b82f6" strokeWidth="2.5" />
              <g fill="none" stroke="white" strokeWidth="1.5">
                <rect x="-12" y="-8" width="24" height="16" rx="3" />
                <circle cx="-6" cy="0" r="1.5" fill="white" stroke="none" />
                <circle cx="0"  cy="0" r="1.5" fill="white" stroke="none" />
                <circle cx="6"  cy="0" r="1.5" fill="white" stroke="none" />
                <line x1="-8" y1="-8" x2="-10" y2="-14" />
                <line x1="0"  y1="-8" x2="0"   y2="-14" />
                <line x1="8"  y1="-8" x2="10"  y2="-14" />
              </g>
              <text y={masterR + 16} textAnchor="middle" fontSize="13" fill="var(--text-primary)" fontWeight="600">{masterNode.name}</text>
              {masterNode.ip && <text y={masterR + 30} textAnchor="middle" fontSize="10" fill="var(--text-secondary)">{masterNode.ip}</text>}
            </g>

            {/* Client-Knoten */}
            {ordered.map((c, i) => {
              let ring: { radius: number; startIdx: number; count: number } | undefined;
              let idxInRing = 0;
              for (const r of rings) {
                if (i >= r.startIdx && i < r.startIdx + r.count) {
                  ring = r;
                  idxInRing = i - r.startIdx;
                  break;
                }
              }
              if (!ring) return null;
              const angle = (2 * Math.PI * idxInRing / ring.count) - Math.PI / 2;
              const nx = cx + ring.radius * Math.cos(angle);
              const ny = cy + ring.radius * Math.sin(angle);
              const isHovered = hoveredUid === c.node.uid;
              const color = c.isWlan ? '#10b981' : '#3b82f6';
              const fillColor = c.isWlan ? '#065f46' : '#1e3a5f';
              return (
                <g key={c.node.uid}
                  transform={`translate(${nx},${ny})`}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={e => {
                    setHoveredUid(c.node.uid);
                    const svgEl = (e.currentTarget.closest('svg') as SVGSVGElement);
                    const rect = svgEl.getBoundingClientRect();
                    setTooltip({ node: c.node, x: nx * (rect.width / W) + rect.left, y: ny * (rect.height / H) + rect.top });
                  }}
                  onMouseLeave={() => { setHoveredUid(null); setTooltip(null); }}
                >
                  <circle cx={0} cy={0} r={nodeR + 4} fill={color} fillOpacity={isHovered ? 0.25 : 0} style={{ transition: 'fill-opacity 0.2s' }} />
                  <circle cx={0} cy={0} r={nodeR} fill={fillColor} stroke={color} strokeWidth={isHovered ? 2.5 : 1.5}
                    style={{ transition: 'stroke-width 0.2s' }} />
                  {nodeR >= 10 && (
                    <g fill="none" stroke="white" strokeWidth="1" opacity={0.8}>
                      {c.isWlan ? (
                        <>
                          <path d={`M${-nodeR*0.45} ${nodeR*0.1} Q0 ${-nodeR*0.5} ${nodeR*0.45} ${nodeR*0.1}`} strokeLinecap="round" />
                          <circle cx="0" cy={nodeR*0.3} r={nodeR*0.12} fill="white" stroke="none" />
                        </>
                      ) : (
                        <>
                          <rect x={-nodeR*0.45} y={-nodeR*0.45} width={nodeR*0.9} height={nodeR*0.65} rx={nodeR*0.1} />
                          <line x1={-nodeR*0.2} y1={nodeR*0.2} x2={nodeR*0.2} y2={nodeR*0.2} />
                          <line x1={0} y1={nodeR*0.2} x2={0} y2={nodeR*0.45} />
                        </>
                      )}
                    </g>
                  )}
                  {showLabels && (
                    <text y={nodeR + 14} textAnchor="middle" fontSize="10" fill="var(--text-primary)" fontWeight="400">
                      {c.node.name.length > 12 ? c.node.name.slice(0, 10) + '…' : c.node.name}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {tooltipEl}
        </div>
      </div>
    );
  }

  // ── Hierarchisches Layout (Mesh-Ansicht) ──
  const masterNodes = nodes.filter(n => n.role === 'master');
  const satelliteNodes = nodes.filter(n => n.role === 'satellite');
  const meshClientNodes = nodes.filter(n => n.role !== 'master' && n.role !== 'satellite');

  const W = 760;
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
  if ((masterNodes.length > 0 || satelliteNodes.length > 0) && meshClientNodes.length > 0) currentY += rowHeight;
  placeRow(meshClientNodes.slice(0, 20), currentY);

  const svgH = currentY + 110;
  const nodeMap = new Map(displayNodes.map(n => [n.uid, n]));

  const roleStyle = {
    master:    { fill: '#1d4ed8', stroke: '#3b82f6', r: 34 },
    satellite: { fill: '#065f46', stroke: '#10b981', r: 28 },
    client:    { fill: '#374151', stroke: '#6b7280', r: 22 },
  };

  return (
    <div className="card">
      <div className="card-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><h3>Mesh-Topologie</h3>{toggleBtn}</div>
        {legend}
      </div>
      <div className="card-body" style={{ padding: 0, position: 'relative', overflowX: 'auto' }}
           onMouseLeave={() => setTooltip(null)}>
        <svg width="100%" viewBox={`0 0 ${W} ${svgH}`} style={{ display: 'block', minHeight: svgH, cursor: 'default' }}>
          <defs>
            {Object.entries(roleStyle).map(([role, s]) => (
              <radialGradient key={role} id={`glow-${role}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={s.stroke} stopOpacity="0.3" />
                <stop offset="100%" stopColor={s.stroke} stopOpacity="0" />
              </radialGradient>
            ))}
          </defs>

          {links.map((link, i) => {
            const a = nodeMap.get(link.from);
            const b = nodeMap.get(link.to);
            if (!a || !b) return null;
            const isWlan = isWlanType(link.type);
            const color = isWlan ? '#10b981' : '#3b82f6';
            const dash = isWlan ? '6 3' : '0';
            return (
              <g key={i}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={color} strokeWidth="2" strokeDasharray={dash} strokeOpacity="0.6" />
                {link.speed > 0 && (
                  <text x={(a.x+b.x)/2} y={(a.y+b.y)/2 - 6} textAnchor="middle" fontSize="10" fill={color} opacity="0.8">
                    {link.speed >= 1000 ? `${(link.speed/1000).toFixed(0)} Gbit/s` : `${link.speed} Mbit/s`}
                  </text>
                )}
              </g>
            );
          })}

          {displayNodes.map(node => {
            const s = roleStyle[node.role as keyof typeof roleStyle] || roleStyle.client;
            return (
              <g key={node.uid} transform={`translate(${node.x},${node.y})`} style={{ cursor: 'pointer' }}
                onMouseEnter={e => {
                  const svgEl = (e.currentTarget.closest('svg') as SVGSVGElement);
                  const rect = svgEl.getBoundingClientRect();
                  setTooltip({ node, x: node.x * (rect.width / W) + rect.left, y: node.y * (rect.height / svgH) + rect.top });
                }}
                onMouseLeave={() => setTooltip(null)}
              >
                <circle cx={0} cy={0} r={s.r + 14} fill={`url(#glow-${node.role})`} />
                <circle cx={0} cy={0} r={s.r} fill={s.fill} stroke={s.stroke} strokeWidth="2.5" />
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
                    <path d="M-9 2 Q0 -10 9 2" /><path d="M-5 5 Q0 -1 5 5" />
                    <circle cx="0" cy="8" r="1.5" fill="white" stroke="none" />
                  </g>
                )}
                {node.role === 'client' && (
                  <g fill="none" stroke="white" strokeWidth="1.5">
                    <rect x="-8" y="-9" width="16" height="12" rx="2" />
                    <line x1="-4" y1="3" x2="4" y2="3" /><line x1="0" y1="3" x2="0" y2="7" /><line x1="-4" y1="7" x2="4" y2="7" />
                  </g>
                )}
                <text y={s.r + 16} textAnchor="middle" fontSize="12" fill="var(--text-primary)" fontWeight="500">
                  {node.name.length > 16 ? node.name.slice(0, 14) + '…' : node.name}
                </text>
                {node.ip && <text y={s.r + 30} textAnchor="middle" fontSize="10" fill="var(--text-secondary)">{node.ip}</text>}
              </g>
            );
          })}
        </svg>
        {tooltipEl}
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

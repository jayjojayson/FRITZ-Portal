import { useState, useEffect, useRef, type ReactNode } from 'react';
import { apiFetch } from '../lib/apiFetch';
import { getApiCache, setApiCache } from '../App';
import { useT } from '../lib/i18n';

interface NetworkProps {
  sid: string;
  onSelectDevice?: (mac: string) => void;
}

type NetworkTab = 'overview' | 'lan' | 'wan' | 'wlan' | 'dhcp';

export default function Network({ sid, onSelectDevice }: NetworkProps) {
  const t = useT();
  const [tab, setTab] = useState<NetworkTab>('overview');
  const [lanInfo, setLanInfo] = useState<any>(getApiCache('network-lan'));
  const [wanInfo, setWanInfo] = useState<any>(getApiCache('network-wan'));
  const [wlanInfo, setWlanInfo] = useState<any[]>(getApiCache('network-wlan') || []);
  const [dhcpInfo, setDhcpInfo] = useState<any>(getApiCache('network-dhcp'));
  const [meshData, setMeshData] = useState<any>(getApiCache('network-mesh'));
  const hasCache = !!(getApiCache('network-lan') || getApiCache('network-wan'));
  const [loading, setLoading] = useState(!hasCache);
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

      const lan = await lanRes.json();
      const wan = await wanRes.json();
      const wlan = await wlanRes.json();
      const dhcp = await dhcpRes.json();

      setApiCache('network-lan', lan);
      setApiCache('network-wan', wan);
      setApiCache('network-wlan', wlan);
      setApiCache('network-dhcp', dhcp);

      setLanInfo(lan);
      setWanInfo(wan);
      setWlanInfo(wlan);
      setDhcpInfo(dhcp);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
    // Mesh parallel nachladen. Wenn schon ein gecachter Stand vorhanden ist,
    // bleibt die Topologie sofort sichtbar – der Refresh läuft transparent im
    // Hintergrund. Nur beim allerersten Aufruf (kein Cache) zeigen wir den
    // Spinner; dort spart der 15s-Timeout-Watchdog endlose Wartezeit, falls die
    // Box den Mesh-Aufbau dehnt (s. CHANGELOG 1.4.x).
    const cachedMesh = getApiCache('network-mesh');
    if (!cachedMesh) {
      setMeshLoading(true);
    }
    const meshTimeout = setTimeout(() => setMeshLoading(false), 15000);
    try {
      const meshRes = await apiFetch('/api/fritz/mesh', { headers });
      const mesh = await meshRes.json();
      setApiCache('network-mesh', mesh);
      setMeshData(mesh);
    } catch {}
    finally {
      clearTimeout(meshTimeout);
      setMeshLoading(false);
    }
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const tabs: { id: NetworkTab; label: string }[] = [
    { id: 'overview', label: t('\u00dcbersicht') },
    { id: 'lan', label: t('LAN') },
    { id: 'wan', label: t('WAN') },
    { id: 'wlan', label: t('WLAN') },
    { id: 'dhcp', label: t('DHCP') },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>{t('Netzwerk')}</h2>
        <p>{t('Netzwerk-Konfiguration und Einstellungen')}</p>
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

      {tab === 'overview' && <NetworkOverview lanInfo={lanInfo} wanInfo={wanInfo} wlanInfo={wlanInfo} meshData={meshData} meshLoading={meshLoading} sid={sid} onSelectDevice={onSelectDevice} />}
      {tab === 'lan' && <LANSettings lanInfo={lanInfo} />}
      {tab === 'wan' && <WANSettings wanInfo={wanInfo} />}
      {tab === 'wlan' && <WLANSettings wlanInfo={wlanInfo} sid={sid} />}
      {tab === 'dhcp' && <DHCPSettings dhcpInfo={dhcpInfo} sid={sid} />}
    </div>
  );
}

function NetworkOverview({ lanInfo, wanInfo, wlanInfo, meshData, meshLoading, sid, onSelectDevice }: {
  lanInfo: any; wanInfo: any; wlanInfo: any[];
  meshData: any; meshLoading: boolean; sid: string; onSelectDevice?: (mac: string) => void;
}) {
  const t = useT();
  return (
    <div>
      <div className="stats-grid">
        <div className="card">
          <div className="card-header"><h3>{t('LAN')}</h3></div>
          <div className="card-body">
            <table><tbody>
              <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)', width: 180 }}>{t('Router IP')}</td><td>{lanInfo?.NewIPRouters || '-'}</td></tr>
              <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('Subnetzmaske')}</td><td>{lanInfo?.NewSubnetMask || '-'}</td></tr>
              <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('DNS-Server')}</td><td>{lanInfo?.NewDNSServers || '-'}</td></tr>
            </tbody></table>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>{t('WAN')}</h3></div>
          <div className="card-body">
            <table><tbody>
              <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)', width: 180 }}>{t('Externe IP')}</td><td>{wanInfo?.NewExternalIPAddress || '-'}</td></tr>
              <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('Verbindung')}</td><td><WanStatus status={wanInfo?.NewConnectionStatus} /></td></tr>
              <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('Anschluss')}</td><td>{wanInfo?.accessTypeLabel ? t(wanInfo.accessTypeLabel) : (wanInfo?.NewConnectionType || '-')}</td></tr>
              {wanInfo?.dsl?.downCurr > 0 && (
                <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('DSL-Sync')}</td>
                  <td>↓ {fmtKbit(wanInfo.dsl.downCurr)} / ↑ {fmtKbit(wanInfo.dsl.upCurr)}</td></tr>
              )}
            </tbody></table>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>{t('WLAN Netzwerke')}</h3></div>
          <div className="card-body">
            {wlanInfo.map((w, i) => (
              <div key={i} style={{ marginBottom: i < wlanInfo.length - 1 ? 16 : 0, paddingBottom: i < wlanInfo.length - 1 ? 16 : 0, borderBottom: i < wlanInfo.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>{w.NewSSID || `WLAN ${i + 1}`}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('Kanal')}: {w.NewChannel || '-'} | {t('Status')}: {w.NewStatus || '-'}</div>
              </div>
            ))}
            {wlanInfo.length === 0 && <div style={{ color: 'var(--text-secondary)' }}>{t('Keine WLAN-Daten verfügbar')}</div>}
          </div>
        </div>
      </div>

      <MeshTopology meshData={meshData} loading={meshLoading} sid={sid} onSelectDevice={onSelectDevice} />
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
  connDetail?: string;
  connSpeed?: string;
  connDisplay?: string;
  // Nur bei offizieller Mesh-Liste (_source === 'meshlist')
  band?: string;
  linkRate?: number;
  signal?: number | null;
  firmware?: string;
  updateAvailable?: boolean;
  guest?: boolean;
  url?: string;
  infra?: boolean; // vom Server erkannter/vom Benutzer gesetzter Zugangspunkt (z. B. Fremd-Router)
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

// Namens-Heuristik für Infrastruktur – nur noch für die Host-Liste/Fallback-Daten.
// Bei der offiziellen Mesh-Liste entscheidet die Mesh-Rolle (Issue #37: eine
// Steckdose namens „Router Plug" wurde als Infrastruktur markiert).
const isInfraDevice = (name: string) => {
  const n = name.toLowerCase();
  if (/plug|steckdose|shelly|socket|lampe|bulb/.test(n)) return false;
  return /^fritz!|repeater|\bmesh\b|access ?point|powerline/.test(n);
};

function MeshTopology({ meshData, loading, sid, onSelectDevice }: { meshData: any; loading: boolean; sid: string; onSelectDevice?: (mac: string) => void }) {
  const t = useT();
  const [tooltip, setTooltip] = useState<{ node: MeshNode; x: number; y: number } | null>(null);
  const [hoveredUid, setHoveredUid] = useState<string | null>(null);
  const [showNames, setShowNames] = useState(false);
  // Zoom/Verschieben der Netzwerk-Ansicht (viewBox-Koordinaten): Mausrad zoomt um den
  // Mauszeiger, Ziehen auf freier Fläche verschiebt
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [zoomSvg, setZoomSvg] = useState<SVGSVGElement | null>(null);
  const viewBoxRef = useRef({ w: 1, h: 1 });
  const dragRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  // Maßstab Bildschirm ↔ viewBox inkl. Rand: die Grafik ist in der Höhe begrenzt, das
  // SVG skaliert daher mit min(Breite, Höhe) und zentriert den Inhalt (preserveAspectRatio)
  const svgScale = (el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const { w, h } = viewBoxRef.current;
    const k = Math.min(r.width / w, r.height / h) || 1;
    return { k, left: r.left + (r.width - w * k) / 2, top: r.top + (r.height - h * k) / 2 };
  };
  useEffect(() => {
    if (!zoomSvg) return;
    // Eigener Listener mit passive:false – nur so lässt sich das Scrollen der Seite unterbinden
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const sc = svgScale(zoomSvg);
      const px = (e.clientX - sc.left) / sc.k;
      const py = (e.clientY - sc.top) / sc.k;
      setView(v => {
        const k = Math.min(8, Math.max(0.4, v.k * Math.exp(-e.deltaY * 0.0015)));
        return { k, x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k) };
      });
    };
    zoomSvg.addEventListener('wheel', onWheel, { passive: false });
    return () => zoomSvg.removeEventListener('wheel', onWheel);
  }, [zoomSvg]);
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
        <div className="card-header"><h3>{t('Netzwerk-Topologie')}</h3></div>
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
      }}>{t('Mesh')}</button>
      <button onClick={() => { setViewMode('hosts'); if (!hostsData && !isOriginallyHosts) fetchHosts(); }} style={{
        padding: '4px 14px', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer',
        background: viewMode === 'hosts' ? 'var(--accent)' : 'transparent',
        color: viewMode === 'hosts' ? '#fff' : 'var(--text-secondary)',
        transition: 'all 0.2s',
      }}>{t('Netzwerk')}</button>
    </div>
  );

  const legendDot = (color: string) => ({ width: 12, height: 10, borderRadius: 3, background: color, display: 'inline-block' });
  const legend = showHostsView ? (
    <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--text-secondary)', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={legendDot('#06b6d4')} /> {t('Fritz!Box')}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={legendDot('#3b82f6')} /> {t('LAN')}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={legendDot('#10b981')} /> {t('WLAN')}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={legendDot('#f59e0b')} /> {t('Infrastruktur')}</span>
    </div>
  ) : (
    <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--text-secondary)', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={legendDot('#06b6d4')} /> {t('Master')}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={legendDot('#f59e0b')} /> {t('Infrastruktur')}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={legendDot('#3b82f6')} /> {t('LAN-Client')}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={legendDot('#10b981')} /> {t('WLAN-Client')}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#3b82f6" strokeWidth="2" /></svg> {t('LAN')}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#10b981" strokeWidth="2" strokeDasharray="6 3" /></svg> {t('WLAN')}
      </span>
    </div>
  );

  if (hostsLoading) {
    return (
      <div className="card">
        <div className="card-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><h3>{t('Netzwerk-Topologie')}</h3>{toggleBtn}</div>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><h3>{t('Netzwerk-Topologie')}</h3>{toggleBtn}</div>
          {legend}
        </div>
        <div className="card-body" style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 12, opacity: 0.4 }}>
            <circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" />
            <line x1="12" y1="7" x2="5" y2="17" /><line x1="12" y1="7" x2="19" y2="17" />
          </svg>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            {viewMode === 'mesh' ? t('Keine Mesh-Daten verfügbar') : t('Keine Netzwerk-Daten verfügbar')}
          </div>
          <div style={{ fontSize: 13 }}>
            {viewMode === 'mesh'
              ? t('Dieses Modell unterstützt möglicherweise kein Mesh. Wechsle zur Netzwerk-Ansicht.')
              : t('Die Geräteliste konnte nicht abgerufen werden.')}
          </div>
        </div>
      </div>
    );
  }

  // Offizielle Mesh-Liste (TR-064): Rollen sind verlässlich, keine Namens-Heuristik nötig
  const isOfficial = currentData?._source === 'meshlist';
  const roleMeta = (node: MeshNode) => {
    if (node.role === 'master') return { label: 'Fritz!Box', color: '#06b6d4' };
    if (node.role === 'satellite') return { label: 'Mesh-Repeater', color: '#f59e0b' };
    if (node.infra) return { label: 'Zugangspunkt', color: '#f59e0b' };
    if (!isOfficial && isInfraDevice(node.name)) return { label: 'Infrastruktur', color: '#f59e0b' };
    return { label: 'Client', color: 'var(--text-primary)' };
  };
  const kv = (label: string, value: ReactNode, mono = false) => (
    <><span style={{ color: 'var(--text-secondary)' }}>{t(label)}</span>
      <span style={mono ? { fontFamily: 'monospace', fontSize: 12 } : undefined}>{value}</span></>
  );
  const tooltipEl = tooltip && (
    <div style={{
      position: 'fixed', left: tooltip.x + 20, top: tooltip.y - 10,
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
      padding: '12px 16px', boxShadow: 'var(--shadow-lg)', zIndex: 9999, fontSize: 13,
      minWidth: 200, pointerEvents: 'none',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>{tooltip.node.name}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
        <span style={{ color: 'var(--text-secondary)' }}>{t('Rolle')}</span>
        <span style={{ color: roleMeta(tooltip.node).color }}>{t(roleMeta(tooltip.node).label)}</span>
        {tooltip.node.mac && <><span style={{ color: 'var(--text-secondary)' }}>{t('MAC')}</span><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{tooltip.node.mac}</span></>}
        {tooltip.node.ip && <><span style={{ color: 'var(--text-secondary)' }}>{t('IP')}</span><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{tooltip.node.ip}</span></>}
        {tooltip.node.model && <><span style={{ color: 'var(--text-secondary)' }}>{t('Modell')}</span><span>{tooltip.node.model}</span></>}
        {tooltip.node.interfaces?.[0]?.type && <><span style={{ color: 'var(--text-secondary)' }}>{t('Verbindung')}</span><span>{isWlanType(tooltip.node.interfaces[0].type) ? t('WLAN') : t('LAN')}</span></>}
        {tooltip.node.band && kv('Funkband', tooltip.node.band)}
        {!!tooltip.node.linkRate && kv('Linkrate', tooltip.node.connSpeed || `${Math.round(tooltip.node.linkRate)} Mbit/s`)}
        {typeof tooltip.node.signal === 'number' && kv('Signal', (
          <span style={{ color: tooltip.node.signal >= -65 ? '#22c55e' : tooltip.node.signal >= -75 ? '#f59e0b' : '#ef4444' }}>
            {tooltip.node.signal} dBm
          </span>
        ))}
        {tooltip.node.firmware && kv('Firmware', tooltip.node.firmware, true)}
        {tooltip.node.updateAvailable && kv('Update', <span style={{ color: '#f59e0b' }}>{t('verfügbar')}</span>)}
        {tooltip.node.guest && kv('Netz', <span style={{ color: '#f59e0b' }}>{t('Gastnetz')}</span>)}
      </div>
      {(tooltip.node.url || (tooltip.node.mac && tooltip.node.role !== 'master')) && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--accent)' }}>
          {tooltip.node.url ? t('Klicken: Weboberfläche öffnen') : t('Klicken: Gerätedetails & Zuordnung')}
        </div>
      )}
    </div>
  );

  // ── Cluster-Ansicht (Netzwerk): ein Kreis pro Zugangspunkt ──
  // FRITZ!Box in der Mitte; jeder Zugangspunkt (FRITZ!-Repeater, eigene Router/Access
  // Points) bildet einen eigenen Kreis mit den Geräten, die an ihm hängen.
  if (showHostsView) {
    const masterNode = nodes.find(n => n.role === 'master') || nodes[0];
    const byUid = new Map(nodes.map(n => [n.uid, n]));
    const parentOf = new Map<string, MeshLink>();
    for (const l of links) if (l.from && l.to && l.from !== l.to && !parentOf.has(l.to)) parentOf.set(l.to, l);
    const childCount = new Map<string, number>();
    for (const [child, l] of parentOf) if (byUid.has(child)) childCount.set(l.from, (childCount.get(l.from) || 0) + 1);
    const isHub = (n: MeshNode) => n.uid === masterNode.uid || n.role === 'satellite' || !!n.infra
      || (childCount.get(n.uid) || 0) > 0 || (!isOfficial && isInfraDevice(n.name));
    const hubs = nodes.filter(isHub);
    const hubSet = new Set(hubs.map(h => h.uid));
    // Geräte je Zugangspunkt (über den Eltern-Link; ohne gültigen Zugangspunkt → Box)
    const clientsOf = new Map<string, MeshNode[]>(hubs.map(h => [h.uid, []]));
    for (const n of nodes) {
      if (hubSet.has(n.uid)) continue;
      const p = parentOf.get(n.uid)?.from;
      clientsOf.get(p && hubSet.has(p) ? p : masterNode.uid)!.push(n);
    }
    const linkTypeOf = (n: MeshNode) => parentOf.get(n.uid)?.type || n.interfaces?.[0]?.type || 'LAN';
    const totalClients = nodes.length - hubs.length;
    const nodeR = totalClients <= 15 ? 16 : totalClients <= 40 ? 12 : totalClients <= 80 ? 9 : 7;
    const labelsVisible = showNames && nodeR >= 7;
    const spacing = Math.max(nodeR * 3.2, labelsVisible ? 56 : 24);
    const hubR = (h: MeshNode) => (h.uid === masterNode.uid ? 34 : 26);

    // Ringe eines Clusters: Positionen relativ zum Zugangspunkt + äußerer Radius
    const layoutCluster = (hub: MeshNode, members: MeshNode[]) => {
      // LAN und WLAN jeweils zusammenhängend, darin alphabetisch
      const sorted = [...members].sort((a, b) =>
        Number(isWlanType(linkTypeOf(a))) - Number(isWlanType(linkTypeOf(b))) || a.name.localeCompare(b.name, 'de'));
      const pos: { node: MeshNode; x: number; y: number }[] = [];
      let r = hubR(hub) + nodeR + 40; // Platz für den Namen unter dem Zugangspunkt
      let i = 0;
      while (i < sorted.length) {
        const cap = Math.max(6, Math.floor(2 * Math.PI * r / spacing));
        const cnt = Math.min(cap, sorted.length - i);
        for (let k = 0; k < cnt; k++) {
          const a = 2 * Math.PI * k / cnt - Math.PI / 2;
          pos.push({ node: sorted[i + k], x: r * Math.cos(a), y: r * Math.sin(a) });
        }
        i += cnt;
        if (i < sorted.length) r += Math.max(spacing, nodeR * 3);
      }
      return { pos, radius: (members.length ? r + nodeR : hubR(hub) + 22) + (labelsVisible ? 18 : 6) };
    };
    const clusters = hubs.map(h => ({ hub: h, ...layoutCluster(h, clientsOf.get(h.uid) || []) }));
    const center = clusters.find(c => c.hub.uid === masterNode.uid)!;
    const others = clusters.filter(c => c !== center).sort((a, b) => b.radius - a.radius);

    // Cluster um die Box verteilen: Winkelanteil nach Clustergröße, Abstand so groß, dass
    // sich weder benachbarte Cluster noch der Box-Cluster überschneiden
    const gap = labelsVisible ? 50 : 34;
    const hubXY = new Map<string, { x: number; y: number }>([[masterNode.uid, { x: 0, y: 0 }]]);
    if (others.length) {
      const widths = others.map(c => 2 * c.radius + gap);
      const total = widths.reduce((a, b) => a + b, 0);
      const maxR = Math.max(...others.map(c => c.radius));
      const D = Math.max(center.radius + maxR + gap, total / (2 * Math.PI));
      let acc = 0;
      others.forEach((c, idx) => {
        const a = (acc + widths[idx] / 2) / total * 2 * Math.PI - Math.PI / 2;
        acc += widths[idx];
        const dist = others.length === 1 ? center.radius + c.radius + gap : D;
        hubXY.set(c.hub.uid, { x: dist * Math.cos(a), y: dist * Math.sin(a) });
      });
    }
    const pad = labelsVisible ? 40 : 20;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of clusters) {
      const p = hubXY.get(c.hub.uid)!;
      minX = Math.min(minX, p.x - c.radius); maxX = Math.max(maxX, p.x + c.radius);
      minY = Math.min(minY, p.y - c.radius); maxY = Math.max(maxY, p.y + c.radius);
    }
    const W = maxX - minX + 2 * pad;
    const H = maxY - minY + 2 * pad;
    const ox = pad - minX;
    const oy = pad - minY;

    const typeColor = (type: string) => (isWlanType(type)
      ? { stroke: '#10b981', fill: '#065f46', dash: '6 3' }
      : { stroke: '#3b82f6', fill: '#1e3a5f', dash: '0' });
    viewBoxRef.current = { w: W, h: H };
    // Namen automatisch, sobald zwischen zwei Geräten auf dem Bildschirm genug Platz ist;
    // Schrift bleibt dabei unabhängig vom Zoom ~9,5 px groß
    const pxPerUnit = zoomSvg ? svgScale(zoomSvg).k : 1;
    const screenScale = view.k * pxPerUnit;
    const autoLabels = !labelsVisible && spacing * screenScale >= 78;
    const autoLabelSize = 9.5 / screenScale;
    const showTip = (e: React.MouseEvent<SVGGElement>, node: MeshNode) => {
      if (dragRef.current) return;
      setHoveredUid(node.uid);
      const r = e.currentTarget.getBoundingClientRect();
      setTooltip({ node, x: r.left + r.width / 2, y: r.top + r.height / 2 });
    };
    const startPan = (e: React.PointerEvent<SVGSVGElement>) => {
      if ((e.target as Element).closest('[data-node]')) return; // Klick auf Gerät/Zugangspunkt
      dragRef.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
      (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    };
    const movePan = (e: React.PointerEvent<SVGSVGElement>) => {
      const d = dragRef.current;
      if (!d) return;
      const k = svgScale(e.currentTarget).k;
      setView(v => ({ ...v, x: d.vx + (e.clientX - d.x) / k, y: d.vy + (e.clientY - d.y) / k }));
    };
    const endPan = () => { dragRef.current = null; };
    const zoomBy = (f: number) => setView(v => {
      const k = Math.min(8, Math.max(0.4, v.k * f));
      return { k, x: W / 2 - (W / 2 - v.x) * (k / v.k), y: H / 2 - (H / 2 - v.y) * (k / v.k) };
    });
    const zoomBtn = { padding: '2px 9px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--bg-card)', color: 'var(--text-secondary)' } as const;
    const openNode = (n: MeshNode) => {
      if (n.url && /^https?:\/\//.test(n.url)) window.open(n.url, '_blank', 'noopener,noreferrer');
      else if (n.mac && n.uid !== masterNode.uid && onSelectDevice) onSelectDevice(String(n.mac).toLowerCase());
    };
    const short = (name: string, max: number) => (name.length > max ? name.slice(0, max - 1) + '…' : name);
    const allClients = clusters.flatMap(c => c.pos.map(p => p.node));
    const wlanCount = allClients.filter(n => isWlanType(linkTypeOf(n))).length;
    const lanCount = allClients.length - wlanCount;
    const dim = (uid: string, alt?: string) => hoveredUid && hoveredUid !== uid && hoveredUid !== alt;

    return (
      <div className="card">
        <div className="card-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><h3>{t('Netzwerk-Topologie')}</h3>{toggleBtn}</div>
          {legend}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, padding: '12px 16px 0', fontSize: 13, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
          <span>{t('{n} Geräte online').replace('{n}', String(totalClients))}</span>
          <span style={{ color: '#3b82f6' }}>● {t('{n} LAN').replace('{n}', String(lanCount))}</span>
          <span style={{ color: '#10b981' }}>● {t('{n} WLAN').replace('{n}', String(wlanCount))}</span>
          {others.length > 0 && <span style={{ color: '#f59e0b' }}>● {t('{n} Zugangspunkte').replace('{n}', String(others.length))}</span>}
          <button onClick={() => setShowNames(v => !v)} style={{
            marginLeft: 8, padding: '2px 10px', fontSize: 12, borderRadius: 6,
            border: '1px solid var(--border)', cursor: 'pointer',
            background: showNames ? 'var(--accent)' : 'var(--bg-card)',
            color: showNames ? '#fff' : 'var(--text-secondary)',
            transition: 'all 0.2s',
          }}>{showNames ? t('Namen ✓') : t('Namen')}</button>
          <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }} title={t('Mausrad: zoomen · Ziehen: verschieben')}>
            <button style={zoomBtn} onClick={() => zoomBy(1 / 1.3)}>−</button>
            <button style={{ ...zoomBtn, minWidth: 52 }} onClick={() => setView({ k: 1, x: 0, y: 0 })} title={t('Ansicht zurücksetzen')}>{Math.round(view.k * 100)} %</button>
            <button style={zoomBtn} onClick={() => zoomBy(1.3)}>+</button>
          </span>
        </div>
        <div className="card-body" style={{ padding: 0, position: 'relative', overflow: 'hidden' }}
             onMouseLeave={() => { setTooltip(null); setHoveredUid(null); }}>
          <svg ref={setZoomSvg} width="100%" viewBox={`0 0 ${W} ${H}`}
            onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan}
            style={{ display: 'block', maxHeight: 820, cursor: dragRef.current ? 'grabbing' : 'grab', touchAction: 'none' }}>
            <defs>
              <radialGradient id="glow-master-r" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
              </radialGradient>
            </defs>
            <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>

            {/* Kreis-Hintergrund je Zugangspunkt */}
            {clusters.map(c => {
              const p = hubXY.get(c.hub.uid)!;
              const isMaster = c.hub.uid === masterNode.uid;
              return (
                <circle key={`bg-${c.hub.uid}`} cx={p.x + ox} cy={p.y + oy} r={c.radius}
                  fill={isMaster ? '#06b6d4' : '#f59e0b'} fillOpacity={0.035}
                  stroke={isMaster ? '#06b6d4' : '#f59e0b'} strokeOpacity={0.22} strokeDasharray="4 6" />
              );
            })}

            {/* Verbindungen Zugangspunkt → übergeordneter Zugangspunkt (meist die Box) */}
            {others.map(c => {
              const link = parentOf.get(c.hub.uid);
              const parentUid = link && hubXY.has(link.from) ? link.from : masterNode.uid;
              const a = hubXY.get(parentUid)!;
              const b = hubXY.get(c.hub.uid)!;
              const col = typeColor(link?.type || 'LAN');
              return (
                <line key={`up-${c.hub.uid}`} x1={a.x + ox} y1={a.y + oy} x2={b.x + ox} y2={b.y + oy}
                  stroke={col.stroke} strokeWidth={3} strokeDasharray={col.dash}
                  strokeOpacity={dim(c.hub.uid, parentUid) ? 0.15 : 0.7} style={{ transition: 'stroke-opacity 0.2s' }} />
              );
            })}

            {/* Verbindungen Gerät → Zugangspunkt */}
            {clusters.flatMap(c => {
              const hp = hubXY.get(c.hub.uid)!;
              return c.pos.map(({ node, x, y }) => {
                const col = typeColor(linkTypeOf(node));
                const hovered = hoveredUid === node.uid || hoveredUid === c.hub.uid;
                return (
                  <line key={`l-${node.uid}`} x1={hp.x + ox} y1={hp.y + oy} x2={hp.x + x + ox} y2={hp.y + y + oy}
                    stroke={col.stroke} strokeWidth={hovered ? 2.5 : 1.3} strokeDasharray={col.dash}
                    strokeOpacity={hoveredUid ? (hovered ? 0.9 : 0.06) : 0.2}
                    style={{ transition: 'stroke-opacity 0.2s' }} />
                );
              });
            })}

            {/* Geräte */}
            {clusters.flatMap(c => {
              const hp = hubXY.get(c.hub.uid)!;
              return c.pos.map(({ node, x, y }) => {
                const ax = hp.x + x + ox;
                const ay = hp.y + y + oy;
                const col = typeColor(linkTypeOf(node));
                const wlan = isWlanType(linkTypeOf(node));
                const isHovered = hoveredUid === node.uid;
                return (
                  <g key={node.uid} data-node transform={`translate(${ax},${ay})`} style={{ cursor: 'pointer' }}
                    onMouseEnter={e => showTip(e, node)}
                    onMouseLeave={() => { setHoveredUid(null); setTooltip(null); }}
                    onClick={() => openNode(node)}>
                    <circle r={nodeR + 4} fill={col.stroke} fillOpacity={isHovered ? 0.25 : 0} style={{ transition: 'fill-opacity 0.2s' }} />
                    <circle r={nodeR} fill={col.fill} stroke={col.stroke} strokeWidth={isHovered ? 2.5 : 1.5} />
                    {nodeR >= 10 && (
                      <g fill="none" stroke="white" strokeWidth="1" opacity={0.8}>
                        {wlan ? (
                          <>
                            <path d={`M${-nodeR * 0.45} ${nodeR * 0.1} Q0 ${-nodeR * 0.5} ${nodeR * 0.45} ${nodeR * 0.1}`} strokeLinecap="round" />
                            <circle cx="0" cy={nodeR * 0.3} r={nodeR * 0.12} fill="white" stroke="none" />
                          </>
                        ) : (
                          <rect x={-nodeR * 0.45} y={-nodeR * 0.4} width={nodeR * 0.9} height={nodeR * 0.65} rx={nodeR * 0.1} />
                        )}
                      </g>
                    )}
                    {/* Namen bei „Namen" oder automatisch beim Hineinzoomen (Layout bleibt gleich) */}
                    {(labelsVisible || autoLabels) && (
                      <text y={nodeR + (labelsVisible ? 12 : autoLabelSize * 1.2)} textAnchor="middle"
                        fontSize={labelsVisible ? 9.5 : autoLabelSize} fill="var(--text-primary)"
                        stroke="var(--bg-card)" strokeWidth={labelsVisible ? 2.5 : autoLabelSize / 3.5} paintOrder="stroke">{short(node.name, 12)}</text>
                    )}
                  </g>
                );
              });
            })}

            {/* Zugangspunkte (Box in der Mitte) */}
            {clusters.map(c => {
              const p = hubXY.get(c.hub.uid)!;
              const isMaster = c.hub.uid === masterNode.uid;
              const r = hubR(c.hub);
              const count = c.pos.length;
              return (
                <g key={`hub-${c.hub.uid}`} data-node transform={`translate(${p.x + ox},${p.y + oy})`}
                  style={{ cursor: isMaster ? 'default' : 'pointer' }}
                  onMouseEnter={e => showTip(e, c.hub)}
                  onMouseLeave={() => { setHoveredUid(null); setTooltip(null); }}
                  onClick={() => openNode(c.hub)}>
                  {isMaster && <circle r={r + 14} fill="url(#glow-master-r)" />}
                  <circle r={r} fill={isMaster ? '#0e7490' : '#78350f'} stroke={isMaster ? '#06b6d4' : '#f59e0b'}
                    strokeWidth={hoveredUid === c.hub.uid ? 3.5 : 2.5} />
                  {/* Im Kreis die Anzahl, darunter der volle Name – gekürzte Namen („mi-router…")
                      machten gleichartige Zugangspunkte ununterscheidbar */}
                  <text y={2} textAnchor="middle" fontSize={isMaster ? 15 : 13} fill="white" fontWeight="700">{count}</text>
                  <text y={13} textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.75)" letterSpacing="0.5">{t('GERÄTE')}</text>
                  <text y={r + 15} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text-primary)"
                    stroke="var(--bg-card)" strokeWidth={4} paintOrder="stroke">{short(c.hub.name, 24)}</text>
                </g>
              );
            })}
            </g>
          </svg>
          {tooltipEl}
        </div>
      </div>
    );
  }

  // ── Vertikaler Tree (indentierte Baumansicht) ──
  type TreeNode = MeshNode & {
    children: TreeNode[];
    linkType: string;
    depth: number;
    rowIdx: number;
  };

  const NODE_W = 360;
  const NODE_H = 52;
  const ROW_H = 64;
  const INDENT = 28;
  const PAD_X = 20;
  const PAD_Y = 20;
  const CONNECTOR_OFF = 16;  // x-Offset innerhalb des Eltern-Knotens für die Vertikallinie

  const masterNode = nodes.find(n => n.role === 'master') || nodes[0];
  const byUid = new Map<string, TreeNode>(
    nodes.map(n => [n.uid, { ...n, children: [], linkType: 'LAN', depth: 0, rowIdx: 0 }])
  );
  const parentByChild = new Map<string, { parent: string; type: string }>();
  for (const l of links) {
    if (l.from && l.to && l.from !== l.to && !parentByChild.has(l.to)) {
      parentByChild.set(l.to, { parent: l.from, type: l.type });
    }
  }
  const rootTree = byUid.get(masterNode.uid)!;
  for (const n of nodes) {
    if (n.uid === masterNode.uid) continue;
    const t = byUid.get(n.uid)!;
    const p = parentByChild.get(n.uid);
    const parentUid = p?.parent && byUid.has(p.parent) ? p.parent : masterNode.uid;
    t.linkType = p?.type || (isWlanType(n.interfaces?.[0]?.type || '') ? 'WLAN' : 'LAN');
    byUid.get(parentUid)!.children.push(t);
  }

  const isInfraNode = (n: TreeNode) =>
    n.role === 'satellite' || !!n.infra || (!isOfficial && isInfraDevice(n.name)) || n.children.length > 0;

  // Sortierung: Infrastruktur zuerst, dann Name – stabil und vorhersagbar
  const sortChildren = (n: TreeNode) => {
    n.children.sort((a, b) => {
      const ai = isInfraNode(a) ? 0 : 1;
      const bi = isInfraNode(b) ? 0 : 1;
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name, 'de');
    });
    n.children.forEach(sortChildren);
  };
  sortChildren(rootTree);

  // Depth-first flachen, rowIdx und depth zuweisen
  const flat: TreeNode[] = [];
  const flatten = (n: TreeNode, depth: number) => {
    n.depth = depth;
    n.rowIdx = flat.length;
    flat.push(n);
    for (const c of n.children) flatten(c, depth + 1);
  };
  flatten(rootTree, 0);

  const maxDepth = flat.reduce((m, n) => Math.max(m, n.depth), 0);
  const svgW = Math.max(600, PAD_X * 2 + maxDepth * INDENT + NODE_W);
  const svgH = flat.length * ROW_H + PAD_Y * 2;

  const xOf = (n: TreeNode) => PAD_X + n.depth * INDENT;
  const yOf = (n: TreeNode) => PAD_Y + n.rowIdx * ROW_H;

  const styleFor = (n: TreeNode) => {
    if (n === rootTree || n.role === 'master') return { fill: '#0e4d6b', stroke: '#06b6d4' };
    if (isInfraNode(n))                         return { fill: '#783d12', stroke: '#f59e0b' };
    return isWlanType(n.linkType)
      ? { fill: '#064e3b', stroke: '#10b981' }
      : { fill: '#1e3a5f', stroke: '#3b82f6' };
  };

  const infraCount = flat.filter(n => n !== rootTree && isInfraNode(n)).length;
  // Nur echte FRITZ!-Mesh-Geräte (Box + Mesh-Repeater) für „getrennt"-Vergleich mit meshTotal
  const meshConnected = flat.filter(n => n === rootTree || n.role === 'satellite').length;
  const clientCount = flat.length - 1 - infraCount;

  return (
    <div className="card">
      <div className="card-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><h3>{t('Mesh-Topologie')}</h3>{toggleBtn}</div>
        {legend}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, padding: '10px 16px 2px', fontSize: 13, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
        <span>{t('{n} Geräte').replace('{n}', String(flat.length))}</span>
        {infraCount > 0 && <span style={{ color: '#f59e0b' }}>● {t('{n} Infrastruktur').replace('{n}', String(infraCount))}</span>}
        <span style={{ color: 'var(--text-primary)' }}>● {t('{n} Clients').replace('{n}', String(clientCount))}</span>
        {isOfficial && typeof currentData?.meshTotal === 'number' && currentData.meshTotal > meshConnected && (
          <span style={{ color: '#ef4444' }} title={t('Mesh-Geräte, die aktuell keine Verbindung haben')}>
            ● {t('{n} Mesh-Gerät(e) getrennt').replace('{n}', String(currentData.meshTotal - meshConnected))}
          </span>
        )}
        <span style={{ fontSize: 11, opacity: 0.7 }} title={isOfficial ? t('Offizielle Mesh-Liste der FRITZ!Box (TR-064)') : t('Ersatzdaten aus der Weboberfläche')}>
          {isOfficial ? t('Quelle: Mesh-Liste') : t('Quelle: Weboberfläche')}
        </span>
      </div>
      <div className="card-body" style={{ padding: 0, position: 'relative', overflow: 'auto' }}
           onMouseLeave={() => { setTooltip(null); setHoveredUid(null); }}>
        <svg width={svgW} height={svgH} style={{ display: 'block' }}>
          {/* Vertikale "Pipes" pro Elternknoten (ein Strich von Eltern-Bottom zur Mitte des letzten Kindes) */}
          {flat.map(parent => {
            if (parent.children.length === 0) return null;
            const lastChild = parent.children[parent.children.length - 1];
            const px = xOf(parent) + CONNECTOR_OFF;
            const y1 = yOf(parent) + NODE_H;
            const y2 = yOf(lastChild) + NODE_H / 2;
            return (
              <line key={`v-${parent.uid}`}
                x1={px} y1={y1} x2={px} y2={y2}
                stroke="var(--text-secondary)" strokeOpacity="0.35"
                strokeWidth="1.5" />
            );
          })}
          {/* Horizontale L-Abzweige: pro Kind vom Eltern-Connector zur linken Kante der Kind-Box,
              eingefärbt nach Verbindungstyp (LAN blau / WLAN grün gestrichelt) */}
          {flat.flatMap(parent => parent.children.map(child => {
            const wlan = isWlanType(child.linkType);
            const color = wlan ? '#10b981' : '#3b82f6';
            const dash = wlan ? '5 3' : '0';
            const x1 = xOf(parent) + CONNECTOR_OFF;
            const x2 = xOf(child);
            const cy = yOf(child) + NODE_H / 2;
            const isOnHover = hoveredUid === child.uid || hoveredUid === parent.uid;
            const opacity = hoveredUid ? (isOnHover ? 0.95 : 0.12) : 0.75;
            return (
              <line key={`h-${child.uid}`}
                x1={x1} y1={cy} x2={x2} y2={cy}
                stroke={color} strokeWidth={isOnHover ? 2.5 : 1.8}
                strokeDasharray={dash} strokeLinecap="round"
                strokeOpacity={opacity}
                style={{ transition: 'stroke-opacity 0.15s' }}
              />
            );
          }))}

          {/* Knoten als abgerundete Rechtecke, links ausgerichtet */}
          {flat.map(n => {
            const s = styleFor(n);
            const isHovered = hoveredUid === n.uid;
            const isRoot = n === rootTree;
            const connLabel = isWlanType(n.linkType) ? 'WLAN' : 'LAN';
            const connColor = isWlanType(n.linkType) ? '#10b981' : '#3b82f6';
            return (
              <g key={n.uid}
                transform={`translate(${xOf(n)},${yOf(n)})`}
                style={{ cursor: 'pointer' }}
                onMouseEnter={e => {
                  setHoveredUid(n.uid);
                  const svgEl = (e.currentTarget.closest('svg') as SVGSVGElement);
                  const rect = svgEl.getBoundingClientRect();
                  setTooltip({ node: n, x: rect.left + xOf(n) + NODE_W, y: rect.top + yOf(n) });
                }}
                // FRITZ!-Repeater: Weboberfläche (X_AVM-DE_URL), alle anderen: Gerätedetails
                onClick={() => {
                  if (n.url && /^https?:\/\//.test(n.url)) window.open(n.url, '_blank', 'noopener,noreferrer');
                  else if (n.mac && n !== rootTree && onSelectDevice) onSelectDevice(String(n.mac).toLowerCase());
                }}
                onMouseLeave={() => { setHoveredUid(null); setTooltip(null); }}
              >
                <rect width={NODE_W} height={NODE_H} rx={10} ry={10}
                  fill={s.fill} stroke={s.stroke}
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  style={{ transition: 'stroke-width 0.15s, filter 0.15s' }}
                  filter={isHovered ? 'drop-shadow(0 0 6px rgba(255,255,255,0.3))' : undefined}
                />
                {(() => {
                  // Badge-Text vorberechnen (für Root ohne Badge)
                  let badgeTxt = '';
                  if (!isRoot) {
                    badgeTxt = n.connDisplay || '';
                    if (!badgeTxt) {
                      const parts = [n.connDetail ? `${connLabel} ${n.connDetail}` : connLabel];
                      if (n.connSpeed) parts.push(n.connSpeed);
                      badgeTxt = parts.join(' → ');
                    }
                  }
                  const badgeW = isRoot ? 0 : Math.max(44, Math.min(180, badgeTxt.length * 6.5 + 14));
                  const badgeX = NODE_W - badgeW - 12;
                  // Max Breite für Namens- und IP-Text → Platzbedarf des Badges abziehen
                  const nameMaxChars = Math.max(10, Math.floor((badgeX - 24) / 7));
                  const displayName = n.name.length > nameMaxChars ? n.name.slice(0, nameMaxChars - 1) + '…' : n.name;
                  return (
                    <>
                      <text x={16} y={22} fontSize={isRoot ? 14 : 13} fontWeight="600" fill="#fff">
                        {displayName}
                      </text>
                      <text x={16} y={40} fontSize="11" fill="rgba(255,255,255,0.72)" fontFamily="monospace">
                        {n.ip || (isRoot ? 'FRITZ!Box' : '—')}
                      </text>
                      {!isRoot && (
                        <g>
                          <rect x={badgeX} y={NODE_H/2 - 10} width={badgeW} height={20} rx={10}
                            fill="rgba(0,0,0,0.3)" stroke={connColor} strokeOpacity="0.8" strokeWidth="1" />
                          <text x={badgeX + badgeW/2} y={NODE_H/2 + 4} textAnchor="middle" fontSize="10"
                            fontWeight="600" fill={connColor}>{badgeTxt}</text>
                        </g>
                      )}
                    </>
                  );
                })()}
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
  const t = useT();
  return (
    <div className="card">
      <div className="card-header"><h3>{t('LAN Einstellungen')}</h3></div>
      <div className="card-body">
        <table>
          <tbody>
            <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)', width: 220 }}>{t('IP-Adresse (Router)')}</td><td>{lanInfo?.NewIPRouters || '-'}</td></tr>
            <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('Subnetzmaske')}</td><td>{lanInfo?.NewSubnetMask || '-'}</td></tr>
            <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('DNS-Server')}</td><td>{lanInfo?.NewDNSServers || '-'}</td></tr>
            <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('Domainname')}</td><td>{lanInfo?.NewDomainName || '-'}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// kbit/s → „250 Mbit/s" bzw. „1,2 Gbit/s"
function fmtKbit(kbit: number) {
  if (!kbit) return '-';
  const mbit = kbit / 1000;
  return mbit >= 1000 ? `${(mbit / 1000).toFixed(1)} Gbit/s` : `${mbit >= 100 ? Math.round(mbit) : mbit.toFixed(1)} Mbit/s`;
}

function fmtUptime(sec: number) {
  if (!sec) return '-';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m`;
}

function WanStatus({ status }: { status?: string }) {
  const t = useT();
  if (!status) return <>-</>;
  const color = status === 'Connected' ? '#22c55e' : status === 'Connecting' ? '#f59e0b' : '#ef4444';
  const label = status === 'Connected' ? t('Verbunden') : status === 'Connecting' ? t('Verbindet…') : status;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />{label}
    </span>
  );
}

function WANSettings({ wanInfo }: { wanInfo: any }) {
  const t = useT();
  const dsl = wanInfo?.dsl;
  const row = (label: string, value: ReactNode, first = false) => (
    <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)', width: first ? 220 : undefined }}>{t(label)}</td><td>{value}</td></tr>
  );
  // Störabstand: > 10 dB gut, 6–10 dB ok, darunter kritisch
  const snrColor = (v: number | null) => v === null ? undefined : v >= 10 ? '#22c55e' : v >= 6 ? '#f59e0b' : '#ef4444';
  return (
    <>
      <div className="card">
        <div className="card-header"><h3>{t('WAN Einstellungen')}</h3></div>
        <div className="card-body">
          <table>
            <tbody>
              {row('Verbindungsstatus', <WanStatus status={wanInfo?.NewConnectionStatus} />, true)}
              {row('Anschlussart', wanInfo?.accessTypeLabel ? t(wanInfo.accessTypeLabel) : '-')}
              {wanInfo?.provider && row('Anbieter', wanInfo.provider)}
              {row('Verbindungstyp', wanInfo?.NewConnectionType || '-')}
              {row('Externe IP-Adresse', wanInfo?.NewExternalIPAddress || '-')}
              {row('Externe IPv6-Adresse', <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{wanInfo?.ipv6 || '-'}</span>)}
              {row('Online seit', fmtUptime(parseInt(wanInfo?.NewUptime || '0', 10)))}
              {row('Leitung (Downstream)', fmtKbit((wanInfo?.rates?.syncDown || wanInfo?.downstreamMax || 0) / 1000))}
              {row('Leitung (Upstream)', fmtKbit((wanInfo?.rates?.syncUp || wanInfo?.upstreamMax || 0) / 1000))}
              {!!wanInfo?.rates?.tariffDown && row('Gebuchter Tarif', `↓ ${fmtKbit(wanInfo.rates.tariffDown / 1000)} / ↑ ${fmtKbit(wanInfo.rates.tariffUp / 1000)}`)}
            </tbody>
          </table>
        </div>
      </div>
      {dsl && (
        <div className="card">
          <div className="card-header"><h3>{t('DSL-Leitung')}</h3></div>
          <div className="card-body">
            <table>
              <thead>
                <tr><th></th><th>{t('Downstream')}</th><th>{t('Upstream')}</th></tr>
              </thead>
              <tbody>
                <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)', width: 220 }}>{t('Aktuelle Datenrate')}</td><td>{fmtKbit(dsl.downCurr)}</td><td>{fmtKbit(dsl.upCurr)}</td></tr>
                <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('Max. erreichbar')}</td><td>{fmtKbit(dsl.downMax)}</td><td>{fmtKbit(dsl.upMax)}</td></tr>
                <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('Störabstand')}</td>
                  <td style={{ color: snrColor(dsl.snrDown) }}>{dsl.snrDown ?? '-'} dB</td>
                  <td style={{ color: snrColor(dsl.snrUp) }}>{dsl.snrUp ?? '-'} dB</td></tr>
                <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('Leitungsdämpfung')}</td><td>{dsl.attDown ?? '-'} dB</td><td>{dsl.attUp ?? '-'} dB</td></tr>
              </tbody>
            </table>
            {dsl.crcErrors !== null && dsl.crcErrors !== undefined && (
              <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
                {t('Fehler seit Synchronisation')}: CRC {dsl.crcErrors} · FEC {dsl.fecErrors ?? '-'}
                {dsl.erroredSecs !== null && dsl.erroredSecs !== undefined && ` · ${t('fehlerhafte Sekunden')} ${dsl.erroredSecs}`}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function WLANSettings({ wlanInfo, sid }: { wlanInfo: any[]; sid: string }) {
  const t = useT();
  const bandLabels = ['2.4 GHz', '5 GHz', '6 GHz / Gast'];
  const bandColors = ['#3b82f6', '#22c55e', '#f59e0b'];
  const bandBg = ['rgba(59,130,246,0.1)', 'rgba(34,197,94,0.1)', 'rgba(245,158,11,0.1)'];

  // Band-Label: bevorzugt das von der Box gemeldete Frequenzband (_band, Issue #31 –
  // Tri-Band-Boxen wie die 5690 Pro), sonst Kanal-Heuristik, sonst Index-Annahme.
  const getBandLabel = (w: any, i: number) => {
    const band = String(w._band || '');
    if (band.startsWith('2400')) return '2.4 GHz';
    if (band.startsWith('5000')) return '5 GHz';
    if (band.startsWith('6000')) return '6 GHz';
    const ch = parseInt(w.NewChannel || '', 10);
    if (ch >= 1 && ch <= 14) return '2.4 GHz';
    if (ch >= 36) return '5 GHz';
    return bandLabels[i % bandLabels.length];
  };
  const headers = { 'X-Fritz-SID': sid };

  const [showPass, setShowPass] = useState<Record<number, boolean>>({});
  const [editPass, setEditPass] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [messages, setMessages] = useState<Record<number, string>>({});
  const [toggling, setToggling] = useState<Record<number, boolean>>({});
  // Lokale Override-Map für den Enable-Status: Wir können den WLAN-Status erst nach
  // einem Reload aus der Box bestätigen. Bis dahin zeigen wir den optimistisch neuen
  // Stand, damit das Toggle nicht zurückspringt während die Box noch arbeitet.
  const [enableOverride, setEnableOverride] = useState<Record<number, boolean>>({});

  const handleToggleEnable = async (wlanIndex: number, current: boolean) => {
    const next = !current;
    setToggling(s => ({ ...s, [wlanIndex]: true }));
    setMessages(m => ({ ...m, [wlanIndex]: '' }));
    // Optimistisches UI-Update
    setEnableOverride(o => ({ ...o, [wlanIndex]: next }));
    try {
      const res = await apiFetch('/api/fritz/network/wlan/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ index: wlanIndex, enable: next }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages(m => ({ ...m, [wlanIndex]: next ? t('WLAN aktiviert') : t('WLAN deaktiviert') }));
      } else {
        // Override zurückrollen, da die Box die Änderung abgelehnt hat
        setEnableOverride(o => { const n = { ...o }; delete n[wlanIndex]; return n; });
        setMessages(m => ({ ...m, [wlanIndex]: t('Fehler: {e}').replace('{e}', data.error || t('Unbekannt')) }));
      }
    } catch {
      setEnableOverride(o => { const n = { ...o }; delete n[wlanIndex]; return n; });
      setMessages(m => ({ ...m, [wlanIndex]: t('Verbindungsfehler') }));
    } finally {
      setToggling(s => ({ ...s, [wlanIndex]: false }));
    }
  };

  const getSecurity = (standard: string) => {
    if (!standard) return t('Keine');
    if (standard.includes('WPA3')) return 'WPA3';
    if (standard.includes('WPA2')) return 'WPA2';
    if (standard.includes('WPA')) return 'WPA';
    if (standard === 'n') return '802.11n (WPA2)';
    if (standard === 'ac') return '802.11ac (WPA2)';
    if (standard === 'ax') return '802.11ax (WPA3)';
    return standard;
  };

  const handleSavePass = async (wlanIndex: number) => {
    const newPass = editPass[wlanIndex];
    if (!newPass || newPass.length < 8) {
      setMessages(m => ({ ...m, [wlanIndex]: t('Fehler: Mindestens 8 Zeichen erforderlich') }));
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
        setMessages(m => ({ ...m, [wlanIndex]: t('Passwort gespeichert') }));
        setEditPass(e => ({ ...e, [wlanIndex]: '' }));
      } else {
        setMessages(m => ({ ...m, [wlanIndex]: t('Fehler: {e}').replace('{e}', data.error || t('Unbekannt')) }));
      }
    } catch {
      setMessages(m => ({ ...m, [wlanIndex]: t('Verbindungsfehler') }));
    } finally {
      setSaving(s => ({ ...s, [wlanIndex]: false }));
    }
  };

  return (
    <div>
      {wlanInfo.map((w, i) => {
        const wlanIdx: number = w._index || (i + 1);
        // Robust: neuere Boxen liefern teils "true"/"UP" in anderer Schreibweise (Issue #31)
        const isEnabledFromBox = String(w.NewStatus || '').toLowerCase() === 'up'
          || String(w.NewEnable || '').toLowerCase() === '1'
          || String(w.NewEnable || '').toLowerCase() === 'true';
        // Optimistisches Override hat Vorrang, bis der nächste Box-Status eintrifft.
        const isEnabled = enableOverride[wlanIdx] !== undefined ? enableOverride[wlanIdx] : isEnabledFromBox;
        const color = bandColors[i % bandColors.length];
        const bg = bandBg[i % bandBg.length];

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
                    {getBandLabel(w, i)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    padding: '6px 14px',
                    borderRadius: 20,
                    background: isEnabled ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                    color: isEnabled ? '#22c55e' : '#ef4444',
                    fontSize: 13,
                    fontWeight: 600,
                  }}>
                    {isEnabled ? t('Aktiv') : t('Inaktiv')}
                  </span>
                  <button
                    onClick={() => handleToggleEnable(wlanIdx, isEnabled)}
                    disabled={!!toggling[wlanIdx]}
                    title={isEnabled ? t('Deaktivieren') : t('Aktivieren')}
                    style={{
                      width: 46, height: 26, borderRadius: 13, border: 'none',
                      cursor: toggling[wlanIdx] ? 'default' : 'pointer',
                      background: isEnabled ? '#22c55e' : '#6b7280',
                      position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                      opacity: toggling[wlanIdx] ? 0.6 : 1,
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 3,
                      left: isEnabled ? 23 : 3,
                      width: 20, height: 20, borderRadius: '50%', background: 'white',
                      transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                    }} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
                <div style={{ background: bg, borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('Kanal')}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color }}>{w.NewChannel || '-'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{getBandLabel(w, i)}</div>
                </div>
                <div style={{ background: bg, borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('Standard')}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color }}>{w.NewStandard || '-'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{getSecurity(w.NewStandard || '')}</div>
                </div>
                <div style={{ background: bg, borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('Verschl\u00fcsselung')}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color }}>{getSecurity(w.NewStandard || '')}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{isEnabled ? t('Gesichert') : '-'}</div>
                </div>
                <div style={{ background: bg, borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('Status')}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: isEnabled ? '#22c55e' : '#ef4444' }}>
                    {isEnabled ? t('Verbunden') : t('Getrennt')}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{w.NewStatus || '-'}</div>
                </div>
              </div>

              {/* WLAN-Passwort */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>{t('WLAN-Passwort (WPA-Schl\u00fcssel)')}</div>

                {/* Aktuelles Passwort anzeigen */}
                {w.NewKeyPassphrase && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', width: 100 }}>{t('Aktuell:')}</span>
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
                      {showPass[wlanIdx] ? t('Verbergen') : t('Anzeigen')}
                    </button>
                  </div>
                )}
                {!w.NewKeyPassphrase && (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>{t('Kein Passwort verf\u00fcgbar (Ger\u00e4t offline oder kein Zugriff)')}</div>
                )}

                {/* Neues Passwort setzen */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', width: 100 }}>{t('Neu setzen:')}</span>
                  <input
                    type="text"
                    value={editPass[wlanIdx] || ''}
                    onChange={e => setEditPass(ep => ({ ...ep, [wlanIdx]: e.target.value }))}
                    placeholder={t('Neues Passwort (min. 8 Zeichen)')}
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
                    {saving[wlanIdx] ? '...' : t('Speichern')}
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
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 32 }}>{t('Keine WLAN-Daten verf\u00fcgbar')}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function DHCPSettings({ dhcpInfo, sid }: { dhcpInfo: any; sid: string }) {
  const t = useT();
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
        setMessage(t('DHCP-Einstellungen gespeichert'));
      } else {
        setError(data.error || t('Speichern fehlgeschlagen'));
      }
    } catch (err) {
      setError(t('Verbindungsfehler'));
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, width: 200 };

  return (
    <div className="card">
      <div className="card-header"><h3>{t('DHCP Einstellungen')}</h3></div>
      <div className="card-body">
        {message && <div className="success-message">{message}</div>}
        {error && <div className="error-message">{error}</div>}
        <table>
          <tbody>
            <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)', width: 220 }}>{t('DHCP Server')}</td><td>{dhcpInfo?.NewDHCPServerConfigurable === '1' ? t('Aktiv') : t('Inaktiv')}</td></tr>
            <tr>
              <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('IP-Bereich Start')}</td>
              <td><input type="text" value={minAddress} onChange={e => setMinAddress(e.target.value)} style={inputStyle} /></td>
            </tr>
            <tr>
              <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('IP-Bereich Ende')}</td>
              <td><input type="text" value={maxAddress} onChange={e => setMaxAddress(e.target.value)} style={inputStyle} /></td>
            </tr>
            <tr>
              <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('Subnetzmaske')}</td>
              <td><input type="text" value={subnetMask} onChange={e => setSubnetMask(e.target.value)} style={inputStyle} /></td>
            </tr>
            <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('Router (Gateway)')}</td><td>{dhcpInfo?.NewIPRouters || '-'}</td></tr>
            <tr>
              <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('DNS-Server')}</td>
              <td><input type="text" value={dnsServers} onChange={e => setDnsServers(e.target.value)} style={inputStyle} placeholder="z.B. 192.168.178.1" /></td>
            </tr>
          </tbody>
        </table>
        <div style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? t('Speichern...') : t('Einstellungen speichern')}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { apiFetch } from '../lib/apiFetch';
import { getApiCache, setApiCache } from '../App';

interface Host {
  mac: string;
  ip: string;
  active: boolean;
  name: string;
}

interface NetworkData {
  time: string;
  download: number;
  upload: number;
}

interface DashboardProps {
  sid: string;
}

type EcoModal = 'cpu' | 'ram' | 'temp' | null;

// ── Eco-History Modal ──────────────────────────────────────────────────────────
function EcoHistoryModal({ type, sid, onClose }: { type: EcoModal; sid: string; onClose: () => void }) {
  const [data, setData] = useState<{ time: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const headers = { 'X-Fritz-SID': sid };

  const labels: Record<NonNullable<EcoModal>, { title: string; unit: string; color: string }> = {
    cpu:  { title: 'CPU-Auslastung',  unit: '%',  color: '#f59e0b' },
    ram:  { title: 'RAM-Auslastung',  unit: '%',  color: '#8b5cf6' },
    temp: { title: 'CPU-Temperatur',  unit: '°C', color: '#ef4444' },
  };

  useEffect(() => {
    apiFetch('/api/fritz/eco-history', { headers })
      .then(r => r.json())
      .then(d => { if (type) setData(d[type] || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [type]);

  if (!type) return null;
  const { title, unit, color } = labels[type];
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? '#2d3139' : '#e5e7eb';
  const textColor = isDark ? '#9ca3af' : '#6b7280';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 24,
          width: '90%',
          maxWidth: 620,
          boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title} — letzte 3h</h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 20, lineHeight: 1 }}
          >✕</button>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Lade Verlauf…</div>
        ) : data.length < 2 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
            Noch nicht genug Datenpunkte.<br />Daten werden alle 10 Sekunden gesammelt.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="time" stroke={textColor} fontSize={11} tickLine={false} interval={Math.max(1, Math.floor(data.length / 8))} />
              <YAxis stroke={textColor} fontSize={12} tickLine={false} axisLine={false}
                label={{ value: unit, angle: -90, position: 'insideLeft', style: { fill: textColor, fontSize: 12 } }} />
              <Tooltip
                contentStyle={{ background: isDark ? '#1a1d23' : '#fff', border: `1px solid ${gridColor}`, borderRadius: 8, fontSize: 13 }}
                formatter={(v: number) => [`${v}${unit}`, title]}
              />
              <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default function Dashboard({ sid }: DashboardProps) {
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [networkData, setNetworkData] = useState<NetworkData[]>([]);
  const [ecoStats, setEcoStats] = useState<any>(null);
  const [traffic, setTraffic] = useState({ currentDown: 0, currentUp: 0, totalDown: 0, totalUp: 0 });
  const [monthlyDown, setMonthlyDown] = useState(0);
  const [monthlyUp, setMonthlyUp] = useState(0);
  const [ipStats, setIpStats] = useState({ total: 0, used: 0, free: 0, minAddress: '', maxAddress: '' });
  const [loading, setLoading] = useState(true);
  const [ecoModal, setEcoModal] = useState<EcoModal>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const headers = { 'X-Fritz-SID': sid };
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? '#2d3139' : '#e5e7eb';
  const textColor = isDark ? '#9ca3af' : '#6b7280';

  useEffect(() => {
    loadData();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    try {
      // ── 1. Cache sofort anzeigen (kein Warten) ──────────────────────────────
      const cachedDeviceInfo = getApiCache('device-info');
      const cachedHosts = getApiCache('hosts');
      const cachedEcoStats = getApiCache('eco-stats');
      const cachedNetworkStats = getApiCache('network-stats');
      const cachedIpStats = getApiCache('ip-stats');

      if (cachedDeviceInfo) setDeviceInfo(cachedDeviceInfo);
      if (cachedHosts) setHosts(cachedHosts.filter((h: Host) => h.active));
      if (cachedEcoStats) setEcoStats(cachedEcoStats);
      if (cachedNetworkStats) setTraffic(cachedNetworkStats);
      if (cachedIpStats) setIpStats(cachedIpStats);

      // Wenn wir gecachte Daten haben, Spinner sofort ausblenden
      if (cachedDeviceInfo && cachedHosts) setLoading(false);

      // ── 2. Schnelle Requests zuerst – Seite wird sofort sichtbar ────────────
      const [infoRes, hostsRes, ipStatsRes] = await Promise.all([
        apiFetch('/api/fritz/device-info', { headers }),
        apiFetch('/api/fritz/hosts', { headers }),
        apiFetch('/api/fritz/ip-stats', { headers }),
      ]);

      const info = await infoRes.json();
      const hostList = await hostsRes.json();
      const ipStatsData = await ipStatsRes.json();

      setApiCache('device-info', info);
      setApiCache('hosts', hostList);
      setApiCache('ip-stats', ipStatsData);

      setDeviceInfo(info);
      setHosts(hostList.filter((h: Host) => h.active));
      setIpStats(ipStatsData);

      // Spinner spätestens jetzt weg – schnelle Daten sind da
      setLoading(false);

      // ── 3. Langsame Requests (WebSID-Login nötig) im Hintergrund ────────────
      apiFetch('/api/fritz/eco-stats', { headers })
        .then(r => r.json())
        .then(stats => { setApiCache('eco-stats', stats); setEcoStats(stats); })
        .catch(() => {});

      apiFetch('/api/fritz/network-stats', { headers })
        .then(r => r.json())
        .then(trafficData => {
          setApiCache('network-stats', trafficData);
          setTraffic(trafficData);

          const toMbps = (b: number) => parseFloat(((b * 8) / (1024 * 1024)).toFixed(2));
          const dsHist: number[] = trafficData.dsHistory || [];
          const usHist: number[] = trafficData.usHistory || [];
          const POINTS = 60;
          const now = Date.now();
          const initial: NetworkData[] = Array.from({ length: POINTS }, (_, i) => {
            const offset = POINTS - i;
            const idx = dsHist.length - offset;
            return {
              time: new Date(now - offset * 5000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              download: idx >= 0 ? toMbps(dsHist[idx] || 0) : 0,
              upload: idx >= 0 ? toMbps(usHist[idx] || 0) : 0,
            };
          });
          setNetworkData(initial);

          // ── 4. Live-Interval erst starten wenn Basisdaten geladen ───────────
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = setInterval(async () => {
            try {
              const [s, t] = await Promise.all([
                apiFetch('/api/fritz/eco-stats', { headers }).then(r => r.json()),
                apiFetch('/api/fritz/network-stats', { headers }).then(r => r.json()),
              ]);
              setEcoStats(s);
              setTraffic(t);
              const toMbps2 = (b: number) => parseFloat(((b * 8) / (1024 * 1024)).toFixed(2));
              setNetworkData(prev => [...prev.slice(1), {
                time: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                download: toMbps2(t.currentDown || 0),
                upload: toMbps2(t.currentUp || 0),
              }]);
            } catch {}
          }, 10000);
        })
        .catch(() => {});

      // Traffic-Zähler (langsamster Request) ganz am Ende
      apiFetch('/api/fritz/traffic-counters', { headers })
        .then(r => r.json())
        .then(countersData => {
          const monthRow = (countersData.rows || []).find((r: any) =>
            r.name && r.name.toLowerCase().includes('monat') && !r.name.toLowerCase().includes('vor')
          );
          if (monthRow) {
            setMonthlyDown(monthRow.received || 0);
            setMonthlyUp(monthRow.sent || 0);
          }
        })
        .catch(() => {});

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatGB = (bytes: number) => (bytes / (1024 * 1024 * 1024)).toFixed(2);
  const formatMbps = (bytes: number) => ((bytes * 8) / (1024 * 1024)).toFixed(1);

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const getStat = (obj: any, key: string, fallback: number = 0): number => {
    if (!obj) return fallback;
    if (typeof obj[key] === 'number') return obj[key];
    if (obj.data && typeof obj.data[key] === 'number') return obj.data[key];
    if (typeof obj[key] === 'string') return parseInt(obj[key], 10) || fallback;
    return fallback;
  };

  const cpuVal = getStat(ecoStats, 'cpu');
  const ramVal = getStat(ecoStats, 'ram');
  const tempVal = getStat(ecoStats, 'cpu_temp') || getStat(ecoStats, 'temperature');

  const monthlyData = [
    { name: 'Download', value: parseFloat(formatGB(monthlyDown || traffic.totalDown)), color: '#3b82f6' },
    { name: 'Upload', value: parseFloat(formatGB(monthlyUp || traffic.totalUp)), color: '#22c55e' },
  ];

  return (
    <div>
      {ecoModal && <EcoHistoryModal type={ecoModal} sid={sid} onClose={() => setEcoModal(null)} />}
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>{'FRITZ!Portal'}</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <h3>Modell</h3>
          <div className="value">{deviceInfo?.NewModelName || '-'}</div>
        </div>
        <div className="stat-card" onClick={() => setEcoModal('cpu')} style={{ cursor: 'pointer' }} title="Verlauf anzeigen">
          <div className="stat-icon orange">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" />
            </svg>
          </div>
          <h3>CPU</h3>
          <div className="value">{cpuVal}%</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Verlauf anzeigen →</div>
        </div>
        <div className="stat-card" onClick={() => setEcoModal('ram')} style={{ cursor: 'pointer' }} title="Verlauf anzeigen">
          <div className="stat-icon purple">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 20h20" /><path d="M5 20V8h4v12" /><path d="M11 20V4h4v16" /><path d="M17 20v-8h4v8" />
            </svg>
          </div>
          <h3>RAM</h3>
          <div className="value">{ramVal}%</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Verlauf anzeigen →</div>
        </div>
        <div className="stat-card" onClick={() => setEcoModal('temp')} style={{ cursor: 'pointer' }} title="Verlauf anzeigen">
          <div className="stat-icon red">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
            </svg>
          </div>
          <h3>Temperatur</h3>
          <div className="value">{tempVal}{'\u00b0'}C</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Verlauf anzeigen →</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <h3>{'Ger\u00e4te online'}</h3>
          <div className="value">{hosts.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(20,184,166,0.12)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" />
              <line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
          </div>
          <h3>IP-Adressen frei</h3>
          <div className="value" style={{ color: '#14b8a6' }}>{ipStats.free}</div>
          <div style={{ marginTop: 6 }}>
            {ipStats.total > 0 && (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  {ipStats.used} vergeben / {ipStats.total} gesamt
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    borderRadius: 3,
                    width: `${Math.round((ipStats.used / ipStats.total) * 100)}%`,
                    background: ipStats.free < ipStats.total * 0.1 ? '#ef4444' : ipStats.free < ipStats.total * 0.25 ? '#f59e0b' : '#14b8a6',
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 18,
        }}>
          <div style={{ display: 'flex', gap: 18, flex: 1 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Download</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#3b82f6' }}>{formatGB(monthlyDown || traffic.totalDown)} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>GB</span></div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Upload</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#22c55e' }}>{formatGB(monthlyUp || traffic.totalUp)} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>GB</span></div>
            </div>
          </div>
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Monatsverbrauch</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{formatGB((monthlyDown || traffic.totalDown) + (monthlyUp || traffic.totalUp))} GB gesamt</div>
          </div>
        </div>

        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 18,
        }}>
          <div style={{ display: 'flex', gap: 18, flex: 1 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Download</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#3b82f6' }}>{formatMbps(traffic.currentDown)} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>Mbit/s</span></div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Upload</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#22c55e' }}>{formatMbps(traffic.currentUp)} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>Mbit/s</span></div>
            </div>
          </div>
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Geschwindigkeit</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Live</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Internet Upstream / Downstream (Live)</h3>
          <span style={{ color: textColor, fontSize: 13 }}>alle 10 Sek.</span>
        </div>
        <div className="card-body">
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={networkData}>
                <defs>
                  <linearGradient id="colorDown" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorUp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="time" stroke={textColor} fontSize={11} tickLine={false} interval={11} />
                <YAxis stroke={textColor} fontSize={12} tickLine={false} axisLine={false} label={{ value: 'Mbit/s', angle: -90, position: 'insideLeft', style: { fill: textColor, fontSize: 12 } }} />
                <Tooltip
                  contentStyle={{
                    background: isDark ? '#1a1d23' : '#fff',
                    border: `1px solid ${gridColor}`,
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                  formatter={(value: number, name: string) => [`${value} Mbit/s`, name]}
                />
                <Area type="monotone" dataKey="download" stroke="#3b82f6" fill="url(#colorDown)" strokeWidth={2} name="Download" isAnimationActive={false} />
                <Area type="monotone" dataKey="upload" stroke="#22c55e" fill="url(#colorUp)" strokeWidth={2} name="Upload" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

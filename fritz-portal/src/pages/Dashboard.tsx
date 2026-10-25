import { useState, useEffect, useRef, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { apiFetch } from '../lib/apiFetch';
import { getApiCache, setApiCache } from '../App';
import { useT } from '../lib/i18n';
import StatTile from '../components/StatTile';
import TerminalPanel from '../components/TerminalPanel';

interface Host {
  mac: string;
  ip: string;
  active: boolean;
  name: string;
  interface?: string;
  connType?: 'LAN' | 'WLAN';
  connDisplay?: string;
  connSpeed?: string;
  lastActivity?: string;
}

type HostsSort = 'activity' | 'name' | 'ip';

interface NetworkData {
  time: string;
  download: number;
  upload: number;
}

type DashboardTarget = 'devices' | 'network' | 'telefonie' | 'smarthome' | 'system';

interface DashboardProps {
  sid: string;
  onSelectDevice: (mac: string) => void;
  onNavigate: (page: DashboardTarget) => void;
}

// Anruftyp (AVM-Call-XML) → Symbol und Farbe
const CALL_ICON: Record<string, { icon: string; color: string }> = {
  '1': { icon: '↙', color: 'var(--success)' }, '9': { icon: '↙', color: 'var(--success)' },
  '2': { icon: '✕', color: 'var(--danger)' },  '10': { icon: '⊘', color: 'var(--warning)' },
  '3': { icon: '↗', color: 'var(--accent)' },  '11': { icon: '↗', color: 'var(--accent)' },
};

// Kurzbeschreibung des Zustands eines Smart-Home-Geräts für die Dashboard-Liste
function smartHomeSummary(d: any, t: (s: string) => string): string {
  const v: string[] = [];
  if (d.switch_state === '1' || d.switch_state === '0') v.push(d.switch_state === '1' ? t('an') : t('aus'));
  if (Number.isFinite(d.power) && d.switch_state === '1') v.push(`${(d.power / 1000).toFixed(1)} W`);
  if (Number.isFinite(d.temperature)) v.push(`${(d.temperature / 10).toFixed(1)} °C`);
  if (Number.isFinite(d.tsoll_celsius)) v.push(`→ ${d.tsoll_celsius} °C`);
  if (Number.isFinite(d.humidity)) v.push(`${d.humidity} %`);
  return v.join(' · ') || '—';
}

function ago(unixSec: number, t: (s: string) => string): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - unixSec));
  if (diff < 60) return t('gerade eben');
  if (diff < 3600) return t('vor {n} Min').replace('{n}', String(Math.floor(diff / 60)));
  if (diff < 86400) return t('vor {n} Std').replace('{n}', String(Math.floor(diff / 3600)));
  return t('vor {n} Tagen').replace('{n}', String(Math.floor(diff / 86400)));
}

type EcoModal = 'cpu' | 'ram' | 'temp' | null;

const MAX_POINTS = 60;
// Spalten der HOSTS.ACTIVE-Liste: Name | .Endziffer der IP | Verbindung
const HOST_COLS = 'minmax(0, 1fr) 40px 156px';

// ── Sparkline helper ───────────────────────────────────────────────────────
function buildSpark(values: number[]): { path: string; fill: string } | null {
  if (!values || values.length < 2) return null;
  const W = 120;
  const H = 24;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const step = W / Math.max(values.length - 1, 1);
  const pts = values.map((v, i) => {
    const x = i * step;
    const y = H - ((v - min) / range) * H;
    return { x, y };
  });
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const fill = `${path} L${W},${H} L0,${H} Z`;
  return { path, fill };
}

// ── Eco-History Modal ──────────────────────────────────────────────────────
function EcoHistoryModal({ type, sid, onClose }: { type: EcoModal; sid: string; onClose: () => void }) {
  const t = useT();
  const [data, setData] = useState<{ time: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const headers = { 'X-Fritz-SID': sid };

  const labels: Record<NonNullable<EcoModal>, { title: string; unit: string; color: string }> = {
    cpu:  { title: t('CPU-Auslastung'),  unit: '%',  color: 'var(--warning)' },
    ram:  { title: t('RAM-Auslastung'),  unit: '%',  color: 'var(--info-cyan)' },
    temp: { title: t('CPU-Temperatur'),  unit: '°C', color: 'var(--info-pink)' },
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
  const gridColor = isDark ? '#2a323e' : '#d8dde5';
  const textColor = isDark ? '#8390a3' : '#5a6678';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <div className="modal-head">
          <span className="title">{t('{title} — letzte 3h').replace('{title}', title)}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 18 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>{t('Lade Verlauf…')}</div>
          ) : data.length < 2 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
              {t('Noch nicht genug Datenpunkte.')}<br />{t('Daten werden alle 10 Sekunden gesammelt.')}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="time" stroke={textColor} fontSize={11} tickLine={false} interval={Math.max(1, Math.floor(data.length / 8))} />
                <YAxis stroke={textColor} fontSize={12} tickLine={false} axisLine={false}
                  label={{ value: unit, angle: -90, position: 'insideLeft', style: { fill: textColor, fontSize: 12 } }} />
                <Tooltip
                  contentStyle={{ background: isDark ? '#1a1f28' : '#fff', border: `1px solid ${gridColor}`, borderRadius: 3, fontSize: 13 }}
                  formatter={(v: number) => [`${v}${unit}`, title]}
                />
                <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ sid, onSelectDevice, onNavigate }: DashboardProps) {
  const t = useT();
  const [deviceInfo, setDeviceInfo] = useState<any>(getApiCache('device-info'));
  const [hosts, setHosts] = useState<Host[]>(getApiCache('hosts') || []);
  // Chart-Verlauf aus dem persistierten Cache initialisieren (überlebt iframe-Reload) –
  // sofort gefüllt, kein Loading-Screen beim Zurückkehren zum Panel.
  const [networkData, setNetworkData] = useState<NetworkData[]>(
    getApiCache('network-history') || (window as any).__networkHistory || []
  );
  const [ecoStats, setEcoStats] = useState<any>(getApiCache('eco-stats'));
  const [ecoSeries, setEcoSeries] = useState<{ cpu: number[]; ram: number[]; temp: number[] }>(
    getApiCache('eco-series') || { cpu: [], ram: [], temp: [] }
  );
  const [traffic, setTraffic] = useState(getApiCache('network-stats') || { currentDown: 0, currentUp: 0, totalDown: 0, totalUp: 0 });
  const [monthlyDown, setMonthlyDown] = useState(getApiCache('monthly-down') || 0);
  const [monthlyUp, setMonthlyUp] = useState(getApiCache('monthly-up') || 0);
  const [ipStats, setIpStats] = useState(getApiCache('ip-stats') || { total: 0, used: 0, free: 0, minAddress: '', maxAddress: '' });
  const hasAnyCache = !!(getApiCache('device-info') || getApiCache('hosts') || getApiCache('ip-stats'));
  const [loading, setLoading] = useState(!hasAnyCache);
  const [ecoModal, setEcoModal] = useState<EcoModal>(null);
  const [hostsSort, setHostsSort] = useState<HostsSort>('activity');
  // Optionale Boxen „Letzte Anrufe" / „SmartHome" (ein-/ausschaltbar unter System)
  const [panels, setPanels] = useState<{ calls: boolean; smarthome: boolean }>(getApiCache('dashboard-panels') || { calls: true, smarthome: true });
  const [calls, setCalls] = useState<any[]>(getApiCache('calls') || []);
  const [smartDevices, setSmartDevices] = useState<any[]>(getApiCache('smartHome') || []);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const headers = { 'X-Fritz-SID': sid };
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? '#2a323e' : '#d8dde5';
  const textColor = isDark ? '#8390a3' : '#5a6678';

  // Zusatz-Boxen nachladen (nur wenn eingeschaltet)
  useEffect(() => {
    apiFetch('/api/fritz/ha-settings', { headers })
      .then(r => r.json())
      .then(d => {
        const p = { calls: d?.dashboard_calls !== false, smarthome: d?.dashboard_smarthome !== false };
        setPanels(p);
        setApiCache('dashboard-panels', p);
        if (p.calls) apiFetch('/api/fritz/calls', { headers }).then(r => r.json()).then(c => { if (Array.isArray(c)) { setCalls(c); setApiCache('calls', c); } }).catch(() => {});
        if (p.smarthome) apiFetch('/api/fritz/smartHome', { headers }).then(r => r.json()).then(sh => { if (Array.isArray(sh)) { setSmartDevices(sh); setApiCache('smartHome', sh); } }).catch(() => {});
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadData();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pushEcoSample = (eco: any) => {
    const cpu = getStat(eco, 'cpu');
    const ram = getStat(eco, 'ram');
    const temp = getStat(eco, 'cpu_temp') || getStat(eco, 'temperature');
    setEcoSeries(prev => {
      const next = {
        cpu:  [...prev.cpu,  cpu ].slice(-MAX_POINTS),
        ram:  [...prev.ram,  ram ].slice(-MAX_POINTS),
        temp: [...prev.temp, temp].slice(-MAX_POINTS),
      };
      setApiCache('eco-series', next);
      return next;
    });
  };

  const loadData = async () => {
    try {
      // Bei leerem Cache: Eco-History laden, um Sparklines beim ersten Render zu füllen
      if ((!ecoSeries.cpu || ecoSeries.cpu.length < 3)) {
        apiFetch('/api/fritz/eco-history', { headers })
          .then(r => r.json())
          .then(h => {
            const initial = {
              cpu:  (h.cpu  || []).slice(-MAX_POINTS).map((p: any) => p.value),
              ram:  (h.ram  || []).slice(-MAX_POINTS).map((p: any) => p.value),
              temp: (h.temp || []).slice(-MAX_POINTS).map((p: any) => p.value),
            };
            if (initial.cpu.length || initial.ram.length || initial.temp.length) {
              setApiCache('eco-series', initial);
              setEcoSeries(initial);
            }
          })
          .catch(() => {});
      }

      // Schnelle Requests zuerst – Seite wird sofort sichtbar
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
      setHosts(hostList);
      setIpStats(ipStatsData);
      setLoading(false);

      // Langsame Requests im Hintergrund
      apiFetch('/api/fritz/eco-stats', { headers })
        .then(r => r.json())
        .then(stats => {
          setApiCache('eco-stats', stats);
          setEcoStats(stats);
          pushEcoSample(stats);
        })
        .catch(() => {});

      apiFetch('/api/fritz/network-stats', { headers })
        .then(r => r.json())
        .then(trafficData => {
          setApiCache('network-stats', trafficData);
          setTraffic(trafficData);

          const toMbps = (b: number) => parseFloat(((b * 8) / 1_000_000).toFixed(2));

          // 1. Bevorzugt: serverseitiger Verlauf mit echten Timestamps (lückenlos, wenn
          //    `traffic_history_server` aktiv ist) – sofort vollständig gefüllt.
          const serverHist = (trafficData.serverHistory || []) as { t: number; down: number; up: number }[];
          const persisted  = (getApiCache('network-history') || (window as any).__networkHistory) as NetworkData[] | undefined;
          if (serverHist.length >= 2) {
            const initial: NetworkData[] = serverHist.slice(-MAX_POINTS).map(p => ({
              time: new Date(p.t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
              download: toMbps(p.down || 0),
              upload: toMbps(p.up || 0),
            }));
            (window as any).__networkHistory = initial;
            setApiCache('network-history', initial);
            setNetworkData(initial);
          } else if (persisted && persisted.length > 0) {
            // 2. Persistierter Verlauf aus localStorage/RAM (überlebt iframe-Reload)
            setNetworkData(persisted);
          } else {
            // 3. Fallback: aus der kurzen Fritz!Box-eigenen ds/us-Historie aufbauen
            const dsHist: number[] = trafficData.dsHistory || [];
            const usHist: number[] = trafficData.usHistory || [];
            const now = Date.now();
            // 30s-Tick je Punkt; Fritz!Box-`dsHistory` liefert ~5s-Schritte → 6er-Step für 30s
            const initial: NetworkData[] = Array.from({ length: MAX_POINTS }, (_, i) => {
              const offset = MAX_POINTS - i;
              const idx = Math.round(dsHist.length - offset * 6);
              return {
                time: new Date(now - offset * 30000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
                download: idx >= 0 ? toMbps(dsHist[idx] || 0) : 0,
                upload: idx >= 0 ? toMbps(usHist[idx] || 0) : 0,
              };
            });
            (window as any).__networkHistory = initial;
            setApiCache('network-history', initial);
            setNetworkData(initial);
          }

          // Live-Interval erst starten wenn Basisdaten geladen
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = setInterval(async () => {
            try {
              const [s, n] = await Promise.all([
                apiFetch('/api/fritz/eco-stats', { headers }).then(r => r.json()),
                apiFetch('/api/fritz/network-stats', { headers }).then(r => r.json()),
              ]);
              setEcoStats(s);
              pushEcoSample(s);
              setApiCache('eco-stats', s);
              setTraffic(n);
              setApiCache('network-stats', n);
              const toMbps2 = (b: number) => parseFloat(((b * 8) / 1_000_000).toFixed(2));
              const newPoint: NetworkData = {
                time: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
                download: toMbps2(n.currentDown || 0),
                upload: toMbps2(n.currentUp || 0),
              };
              setNetworkData(prev => {
                const next = [...prev.slice(-(MAX_POINTS - 1)), newPoint];
                (window as any).__networkHistory = next;
                setApiCache('network-history', next);
                return next;
              });
            } catch {}
          }, 30000);
        })
        .catch(() => {});

      apiFetch('/api/fritz/traffic-counters', { headers })
        .then(r => r.json())
        .then(countersData => {
          const monthRow = (countersData.rows || []).find((r: any) =>
            r.name && r.name.toLowerCase().includes('monat') && !r.name.toLowerCase().includes('vor')
          );
          if (monthRow) {
            setMonthlyDown(monthRow.received || 0);
            setMonthlyUp(monthRow.sent || 0);
            setApiCache('monthly-down', monthRow.received || 0);
            setApiCache('monthly-up', monthRow.sent || 0);
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

  const cpuSpark  = useMemo(() => buildSpark(ecoSeries.cpu),  [ecoSeries.cpu]);
  const ramSpark  = useMemo(() => buildSpark(ecoSeries.ram),  [ecoSeries.ram]);
  const tempSpark = useMemo(() => buildSpark(ecoSeries.temp), [ecoSeries.temp]);

  if (loading) {
    return (
      <div className="loading">
        <span className="terminal-cursor">$ {t('loading')}<span className="blink">▮</span></span>
      </div>
    );
  }

  const cpuVal = getStat(ecoStats, 'cpu');
  const ramVal = getStat(ecoStats, 'ram');
  const tempVal = getStat(ecoStats, 'cpu_temp') || getStat(ecoStats, 'temperature');

  // HOSTS.ACTIVE: aktive Geräte nach gewähltem Modus sortieren.
  // - activity: zuletzt gesehen zuerst (lastActivity ist Unix-Timestamp in s)
  // - ip:       numerisch nach IPv4
  // - name:     alphabetisch
  const ipToNum = (ip: string) => ip.split('.').reduce((acc, p) => acc * 256 + (parseInt(p, 10) || 0), 0);
  const activeHosts = hosts
    .filter(h => h.active)
    .slice()
    .sort((a, b) => {
      if (hostsSort === 'ip')   return ipToNum(a.ip || '0.0.0.0') - ipToNum(b.ip || '0.0.0.0');
      if (hostsSort === 'name') return (a.name || '').localeCompare(b.name || '', 'de');
      // activity (default)
      const ta = parseInt(a.lastActivity || '0', 10) || 0;
      const tb = parseInt(b.lastActivity || '0', 10) || 0;
      return tb - ta;
    });
  const totalKnown  = hosts.length;
  const cycleHostsSort = () => setHostsSort(s => s === 'activity' ? 'ip' : s === 'ip' ? 'name' : 'activity');
  const sortLabel = hostsSort === 'activity' ? 'BY ACTIVITY' : hostsSort === 'ip' ? 'BY IP' : 'BY NAME';
  const usedPct = ipStats.total > 0 ? Math.round((ipStats.used / ipStats.total) * 100) : 0;
  const ipBarClass = ipStats.total > 0 && ipStats.free < ipStats.total * 0.1
    ? 'danger'
    : ipStats.total > 0 && ipStats.free < ipStats.total * 0.25
    ? 'warn'
    : '';

  // Modell-Kürzel: "FRITZ!Box 7590 AX" → "7590" + Unit "AX"
  const modelStr = String(deviceInfo?.NewModelName || '');
  const modelMatch = modelStr.match(/(\d{3,4})\s*([A-Z]{1,3})?/);
  const modelValue: string = modelMatch?.[1] || (modelStr || '—');
  const modelUnit: string  = modelMatch?.[2] || '';

  const monthDownGB = formatGB(monthlyDown || traffic.totalDown);
  const monthUpGB   = formatGB(monthlyUp   || traffic.totalUp);
  const liveDownMb  = ((traffic.currentDown || 0) * 8 / 1_000_000).toFixed(1);
  const liveUpMb    = ((traffic.currentUp   || 0) * 8 / 1_000_000).toFixed(1);

  return (
    <div>
      {ecoModal && <EcoHistoryModal type={ecoModal} sid={sid} onClose={() => setEcoModal(null)} />}

      <div className="stats-grid">
        <StatTile
          label="MODEL"
          value={modelValue}
          unit={modelUnit}
          hint={<>── {String(deviceInfo?.NewFriendlyName || 'fritz.box').toLowerCase()}</>}
          onClick={() => onNavigate('system')}
          title={t('Systeminformationen öffnen')}
        />
        <StatTile
          label="CPU"
          value={cpuVal}
          unit="%"
          accent="var(--warning)"
          sparkPath={cpuSpark?.path}
          sparkFill={cpuSpark?.fill}
          onClick={() => setEcoModal('cpu')}
          title={t('Verlauf anzeigen')}
        />
        <StatTile
          label="RAM"
          value={ramVal}
          unit="%"
          accent="var(--info-cyan)"
          sparkPath={ramSpark?.path}
          sparkFill={ramSpark?.fill}
          onClick={() => setEcoModal('ram')}
          title={t('Verlauf anzeigen')}
        />
        <StatTile
          label="TEMP"
          value={tempVal}
          unit="°C"
          accent="var(--info-pink)"
          sparkPath={tempSpark?.path}
          sparkFill={tempSpark?.fill}
          onClick={() => setEcoModal('temp')}
          title={t('Verlauf anzeigen')}
        />
        <StatTile
          label="HOSTS"
          value={activeHosts.length}
          unit={t('online')}
          hint={<>── {totalKnown} {t('known')}</>}
          onClick={() => onNavigate('devices')}
          title={t('Geräteliste öffnen')}
        />
        <StatTile
          label="IP POOL"
          value={ipStats.free || 0}
          unit={t('free')}
          onClick={() => onNavigate('network')}
          title={t('Netzwerk & DHCP öffnen')}
          hint={
            ipStats.total > 0 ? (
              <div className="tile-progress">
                <div className="bar"><span className={ipBarClass} style={{ width: `${usedPct}%` }} /></div>
                <div className="caption">{ipStats.used} / {ipStats.total} USED</div>
              </div>
            ) : null
          }
        />
      </div>

      <div className="dashboard-main-grid" style={{
        display: 'grid',
        gridTemplateColumns: '1.6fr 1fr',
        gap: 18,
        alignItems: 'stretch',
      }}>
        {/* TRAFFIC.LIVE */}
        <TerminalPanel
          title="TRAFFIC.LIVE"
          subtitle={<>tail -f wan0</>}
          right={
            <span style={{ display: 'flex', gap: 18, fontSize: 12, color: 'var(--text-secondary)' }}>
              <span><span style={{ color: 'var(--accent)' }}>▰</span> DOWN <span style={{ color: 'var(--text-primary)' }}>{liveDownMb} Mbit/s</span></span>
              <span><span style={{ color: 'var(--success)' }}>▰</span> UP <span style={{ color: 'var(--text-primary)' }}>{liveUpMb} Mbit/s</span></span>
            </span>
          }
          footer={
            <>
              <span>MONTH ↓ <strong>{monthDownGB} GB</strong> ── ↑ <strong>{monthUpGB} GB</strong></span>
              <span>SAMPLE 30s ── {networkData.length} PTS</span>
            </>
          }
          bodyPadding={8}
        >
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={networkData}>
                <defs>
                  <linearGradient id="colorDown" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorUp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--success)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 5" stroke={gridColor} />
                <XAxis dataKey="time" stroke={textColor} fontSize={10} tickLine={false} interval={11} />
                <YAxis stroke={textColor} fontSize={11} tickLine={false} axisLine={false} label={{ value: 'Mbit/s', angle: -90, position: 'insideLeft', style: { fill: textColor, fontSize: 11 } }} />
                <Tooltip
                  contentStyle={{ background: isDark ? '#1a1f28' : '#fff', border: `1px solid ${gridColor}`, borderRadius: 3, fontSize: 12, fontFamily: 'var(--font-mono)' }}
                  formatter={(value: number, name: string) => [`${value} Mbit/s`, name]}
                />
                <Area type="monotone" dataKey="download" stroke="var(--accent)" fill="url(#colorDown)" strokeWidth={1.6} name="DOWN" isAnimationActive={false} />
                <Area type="monotone" dataKey="upload" stroke="var(--success)" fill="url(#colorUp)" strokeWidth={1.6} name="UP" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </TerminalPanel>

        {/* HOSTS.ACTIVE */}
        <TerminalPanel
          title="HOSTS.ACTIVE"
          subtitle={`${Math.min(activeHosts.length, 10)} of ${activeHosts.length}`}
          right={
            <button
              onClick={cycleHostsSort}
              title={t('Sortierung umschalten')}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: 0.6,
                padding: '3px 8px',
                borderRadius: 3,
                cursor: 'pointer',
              }}
            >
              ↑↓ {sortLabel}
            </button>
          }
          bodyPadding={0}
        >
          <div style={{
            padding: '10px 16px 6px',
            display: 'grid', gridTemplateColumns: HOST_COLS,
            gap: 10,
            fontSize: 11,
            color: 'var(--text-muted)',
            letterSpacing: 1.2,
            borderBottom: '1px dashed var(--border)',
            fontWeight: 500,
          }}>
            <span>HOST</span><span>IP</span><span>LINK</span>
          </div>
          <div>
            {activeHosts.slice(0, 10).map((h, i) => {
              const lastOctet = h.ip ? h.ip.split('.').pop() : '—';
              const link = h.connDisplay || h.connSpeed
                || (h.connType === 'WLAN' ? 'Wi-Fi' : h.connType === 'LAN' ? 'LAN' : '—');
              return (
                <div key={h.mac || i}
                  className="dash-row"
                  role="button"
                  tabIndex={0}
                  title={t('Gerätedetails öffnen')}
                  onClick={() => h.mac && onSelectDevice(h.mac)}
                  onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && h.mac) { e.preventDefault(); onSelectDevice(h.mac); } }}
                  style={{
                  display: 'grid', gridTemplateColumns: HOST_COLS, gap: 10,
                  padding: '7px 16px',
                  fontSize: 12.5,
                  borderBottom: i === Math.min(activeHosts.length, 10) - 1 ? 'none' : '1px solid var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  cursor: h.mac ? 'pointer' : 'default',
                }}>
                  <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    <span style={{ color: 'var(--success)', marginRight: 9 }}>●</span>
                    {h.name || t('Unbekannt')}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 11.5 }}>.{lastOctet}</span>
                  {/* Einzeilig: lange Texte („WLAN · mi-routermutti") brachen vorher in der
                      schmalen Spalte auf 2–3 Zeilen um und machten die Liste höher als das Diagramm */}
                  <span title={link} style={{ color: 'var(--text-secondary)', fontSize: 11.5, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{link}</span>
                </div>
              );
            })}
            {activeHosts.length === 0 && (
              <div style={{ padding: 16, color: 'var(--text-muted)', textAlign: 'center', fontSize: 12 }}>
                {t('Keine aktiven Geräte')}
              </div>
            )}
          </div>
        </TerminalPanel>
      </div>

      {(panels.calls || panels.smarthome) && (
        <div className="dashboard-extra-grid" style={{
          display: 'grid', gap: 18, marginTop: 18,
          gridTemplateColumns: panels.calls && panels.smarthome ? '1fr 1fr' : '1fr',
        }}>
          {panels.calls && (
            <TerminalPanel
              title="CALLS.RECENT"
              subtitle={`${Math.min(calls.length, 6)} of ${calls.length}`}
              right={<button className="dash-link" onClick={() => onNavigate('telefonie')}>{t('alle')} →</button>}
              bodyPadding={0}
            >
              {calls.slice(0, 6).map((c, i) => {
                const meta = CALL_ICON[c.type] || { icon: '•', color: 'var(--text-secondary)' };
                const dur = typeof c.durationMin === 'number' && c.durationMin > 0 ? `${c.durationMin} min` : '';
                return (
                  <div key={i} className="dash-row" role="button" tabIndex={0}
                    onClick={() => onNavigate('telefonie')}
                    onKeyDown={e => { if (e.key === 'Enter') onNavigate('telefonie'); }}
                    style={{ display: 'grid', gridTemplateColumns: '18px 1fr auto', gap: 10, padding: '8px 16px', fontSize: 12.5, cursor: 'pointer', borderBottom: '1px solid var(--bg-elevated)' }}>
                    <span style={{ color: meta.color }}>{meta.icon}</span>
                    <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {c.name || c.number || t('Unbekannt')}
                      {c.name && c.number && <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontSize: 11 }}>{c.number}</span>}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 11.5, whiteSpace: 'nowrap' }}>{c.date}{dur && ` · ${dur}`}</span>
                  </div>
                );
              })}
              {calls.length === 0 && <div style={{ padding: 16, color: 'var(--text-muted)', textAlign: 'center', fontSize: 12 }}>{t('Keine Anrufe gefunden')}</div>}
            </TerminalPanel>
          )}
          {panels.smarthome && (() => {
            // Zuletzt aktive zuerst (Zeitstempel nur über die Smart-Home-REST-API), sonst eingeschaltete
            const list = [...smartDevices].sort((a, b) =>
              (b.lastChange || 0) - (a.lastChange || 0) || (b.switch_state === '1' ? 1 : 0) - (a.switch_state === '1' ? 1 : 0));
            return (
              <TerminalPanel
                title="SMARTHOME.STATUS"
                subtitle={`${smartDevices.filter(d => d.present === '1').length} online`}
                right={<button className="dash-link" onClick={() => onNavigate('smarthome')}>{t('alle')} →</button>}
                bodyPadding={0}
              >
                {list.slice(0, 6).map((d, i) => (
                  <div key={d.identifier || i} className="dash-row" role="button" tabIndex={0}
                    onClick={() => onNavigate('smarthome')}
                    onKeyDown={e => { if (e.key === 'Enter') onNavigate('smarthome'); }}
                    style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '8px 16px', fontSize: 12.5, cursor: 'pointer', borderBottom: '1px solid var(--bg-elevated)' }}>
                    <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      <span style={{ color: d.present === '1' ? 'var(--success)' : 'var(--text-muted)', marginRight: 9 }}>●</span>
                      {d.name || t('Unbekannt')}
                      {d.lastChange && <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontSize: 11 }}>{ago(d.lastChange, t)}</span>}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 11.5, whiteSpace: 'nowrap' }}>{smartHomeSummary(d, t)}</span>
                  </div>
                ))}
                {smartDevices.length === 0 && <div style={{ padding: 16, color: 'var(--text-muted)', textAlign: 'center', fontSize: 12 }}>{t('Keine SmartHome-Geräte gefunden')}</div>}
              </TerminalPanel>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function getStat(obj: any, key: string, fallback: number = 0): number {
  if (!obj) return fallback;
  if (typeof obj[key] === 'number') return obj[key];
  if (obj.data && typeof obj.data[key] === 'number') return obj.data[key];
  if (typeof obj[key] === 'string') return parseInt(obj[key], 10) || fallback;
  return fallback;
}

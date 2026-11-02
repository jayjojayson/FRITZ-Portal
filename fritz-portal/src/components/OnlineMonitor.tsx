import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { apiFetch } from '../lib/apiFetch';
import { useT } from '../lib/i18n';

// Online-Monitor wie in der FRITZ!Box (Internet › Online-Monitor › Insgesamt):
// Downstream nach Heimnetz/IPTV/Gastnetz, Upstream nach Priorisierungsklassen, gestapelt.

type SeriesKey = 'home' | 'iptv' | 'guest' | 'realtime' | 'high' | 'normal' | 'low';
type Point = { t: number } & Record<SeriesKey, number>;

// Reihenfolge = Stapelreihenfolge (unten → oben); die Farbpaare benachbarter Segmente sind geprüft
const DOWN: [SeriesKey, string][] = [['home', 'Heimnetz'], ['iptv', 'IPTV'], ['guest', 'Gastnetz']];
const UP: [SeriesKey, string][] = [
  ['realtime', 'Echtzeitanwendungen'], ['high', 'Priorisierte Anwendungen'],
  ['normal', 'Normale Anwendungen'], ['low', 'Hintergrundanwendungen'],
];
const RANGES = [10, 30, 60];
const RANGE_KEY = 'fritzportal_om_range';
const HIDDEN_KEY = 'fritzportal_om_hidden';

function loadPref<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function savePref(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const fmtTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function MonitorChart({ title, series, points, hidden, onToggle }: {
  title: string; series: [SeriesKey, string][]; points: Point[];
  hidden: SeriesKey[]; onToggle: (k: SeriesKey) => void;
}) {
  const t = useT();
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? '#2a323e' : '#d8dde5';
  const textColor = isDark ? '#8390a3' : '#5a6678';
  const visible = series.filter(([k]) => !hidden.includes(k));

  // Einheit je Diagramm wie in der Box: unter 1 Mbit/s in kbit/s
  const peakBits = Math.max(0, ...points.map(p => visible.reduce((s, [k]) => s + p[k], 0) * 8));
  const mbit = peakBits >= 1_000_000;
  const unit = mbit ? 'Mbit/s' : 'kbit/s';
  const div = mbit ? 1_000_000 : 1_000;
  const data = points.map(p => {
    const row: Record<string, number> = { t: p.t };
    for (const [k] of series) row[k] = +((p[k] * 8) / div).toFixed(mbit ? 2 : 1);
    return row;
  });
  const fmtVal = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: mbit ? 2 : 1 });

  return (
    <div className="card">
      <div className="card-header">
        <h3>{t(title)}</h3>
      </div>
      <div className="card-body">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {series.map(([k, label]) => {
            const off = hidden.includes(k);
            return (
              <button key={k} onClick={() => onToggle(k)} aria-pressed={!off}
                title={off ? t('Einblenden') : t('Ausblenden')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', fontSize: 13,
                  borderRadius: 999, cursor: 'pointer', border: '1px solid var(--border)',
                  background: off ? 'transparent' : 'var(--bg-elevated)',
                  color: off ? 'var(--text-muted)' : 'var(--text-primary)',
                  textDecoration: off ? 'line-through' : 'none',
                }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: `var(--om-${k})`, opacity: off ? 0.35 : 1 }} />
                {t(label)}
              </button>
            );
          })}
        </div>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barCategoryGap="15%">
              <CartesianGrid strokeDasharray="2 5" stroke={gridColor} vertical={false} />
              <XAxis dataKey="t" tickFormatter={fmtTime} stroke={textColor} fontSize={10} tickLine={false} minTickGap={40} />
              <YAxis stroke={textColor} fontSize={11} tickLine={false} axisLine={false} width={48}
                label={{ value: unit, angle: -90, position: 'insideLeft', style: { fill: textColor, fontSize: 11 } }} />
              <Tooltip
                cursor={{ fill: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }}
                contentStyle={{ background: isDark ? '#1a1f28' : '#fff', border: `1px solid ${gridColor}`, borderRadius: 3, fontSize: 12 }}
                labelStyle={{ color: isDark ? '#dde3ec' : '#1a1f28' }}
                itemStyle={{ color: isDark ? '#dde3ec' : '#1a1f28' }}
                labelFormatter={(v) => fmtTime(Number(v))}
                formatter={(v: number, name: string) => [`${fmtVal(v)} ${unit}`, name]}
              />
              {visible.map(([k, label]) => (
                <Bar key={k} dataKey={k} name={t(label)} stackId="s" fill={`var(--om-${k})`} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default function OnlineMonitor({ sid }: { sid: string }) {
  const t = useT();
  const [range, setRange] = useState<number>(() => {
    const r = loadPref<number>(RANGE_KEY, 10);
    return RANGES.includes(r) ? r : 10;
  });
  const [hidden, setHidden] = useState<SeriesKey[]>(() => loadPref<SeriesKey[]>(HIDDEN_KEY, []));
  const [points, setPoints] = useState<Point[]>([]);
  const [source, setSource] = useState('');
  const [state, setState] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.hidden) return;
      try {
        const r = await apiFetch(`/api/fritz/online-monitor?range=${range}`, { headers: { 'X-Fritz-SID': sid } });
        const d = await r.json();
        if (!alive) return;
        const pts: Point[] = Array.isArray(d.points) ? d.points : [];
        setPoints(pts);
        setSource(d.source || '');
        setState(pts.length ? 'ok' : 'empty');
      } catch {
        if (alive) setState(s => (s === 'ok' ? s : 'error'));
      }
    };
    load();
    const id = setInterval(load, 10000);
    return () => { alive = false; clearInterval(id); };
  }, [sid, range]);

  const pickRange = (r: number) => { setRange(r); savePref(RANGE_KEY, r); };
  const toggle = (k: SeriesKey) => {
    const next = hidden.includes(k) ? hidden.filter(x => x !== k) : [...hidden, k];
    setHidden(next);
    savePref(HIDDEN_KEY, next);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0, flex: '1 1 320px' }}>
          {t('Aktuelle Auslastung der Internetverbindung, aufgeteilt wie im Online-Monitor der FRITZ!Box. Die Box liefert nur die letzten 100 Sekunden – längere Zeiträume zeichnet FRITZ!Portal selbst auf, solange es aktiv ist.')}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('Zeitraum')}:</span>
          <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            {RANGES.map(r => (
              <button key={r} onClick={() => pickRange(r)} style={{
                padding: '5px 12px', fontSize: 12, border: 'none', cursor: 'pointer',
                background: range === r ? 'var(--accent)' : 'transparent',
                color: range === r ? '#fff' : 'var(--text-secondary)',
              }}>{r} min</button>
            ))}
          </div>
        </div>
      </div>

      {state === 'loading' && <div className="loading"><div className="spinner" /></div>}
      {(state === 'empty' || state === 'error') && (
        <div className="card">
          <div className="card-body" style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
            {state === 'error'
              ? t('Online-Monitor konnte nicht geladen werden.')
              : t('Die FRITZ!Box liefert keine Online-Monitor-Daten (Web-Login oder TR-064 nicht verfügbar).')}
          </div>
        </div>
      )}
      {state === 'ok' && (
        <>
          <MonitorChart title="Downstream" series={DOWN} points={points} hidden={hidden} onToggle={toggle} />
          <MonitorChart title="Upstream" series={UP} points={points} hidden={hidden} onToggle={toggle} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', marginTop: -8 }}>
            {t('Quelle')}: {source} · {t('Aktualisierung alle 10 s')}
          </div>
        </>
      )}
    </div>
  );
}

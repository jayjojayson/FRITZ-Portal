import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/apiFetch';
import { getApiCache, setApiCache } from '../App';
import { useT } from '../lib/i18n';

interface TelefonieProps {
  sid: string;
}

type TelefonieTab = 'dect' | 'calls';

export default function Telefonie({ sid }: TelefonieProps) {
  const t = useT();
  const [tab, setTab] = useState<TelefonieTab>('dect');
  const cachedCalls: any[] | null = getApiCache('calls');
  const cachedDect: any = getApiCache('dect');
  const [calls, setCalls] = useState<any[]>(cachedCalls || []);
  const [dectInfo, setDectInfo] = useState<any>(cachedDect);
  const [loading, setLoading] = useState(!cachedCalls && !cachedDect);

  const headers = { 'X-Fritz-SID': sid };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [callsRes, dectRes] = await Promise.all([
        apiFetch('/api/fritz/calls', { headers }),
        apiFetch('/api/fritz/dect', { headers }),
      ]);

      const callsData = await callsRes.json();
      const dectData = await dectRes.json();
      setApiCache('calls', callsData);
      setApiCache('dect', dectData);
      setCalls(callsData);
      setDectInfo(dectData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const tabs: { id: TelefonieTab; label: string }[] = [
    { id: 'dect', label: t('DECT') },
    { id: 'calls', label: t('Anrufliste') },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>{t('Telefonie')}</h2>
        <p>{t('DECT und Anrufliste')}</p>
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

      {tab === 'dect' && <DECTTab dectInfo={dectInfo} t={t} />}
      {tab === 'calls' && <CallsTab calls={calls} t={t} />}
    </div>
  );
}

function DECTTab({ dectInfo, t }: { dectInfo: any; t: (s: string) => string }) {
  const handsets: any[] = dectInfo?.handsets || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <div className="card-header"><h3>{t('DECT Basisstation')}</h3></div>
        <div className="card-body">
          <table>
            <tbody>
              <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)', width: 220 }}>{t('DECT aktiv')}</td><td>{dectInfo?.NewDECTActive === '1' ? t('Ja') : t('Nein')}</td></tr>
              <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('Basisname')}</td><td>{dectInfo?.NewDECTBaseName || '—'}</td></tr>
              <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('Eco Mode')}</td><td>{dectInfo?.NewDECTPowerActive === '1' ? t('Aktiv') : t('Inaktiv')}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>{t('Angemeldete Handsets')}</h3>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{handsets.length === 1 ? t('{n} Gerät').replace('{n}', '1') : t('{n} Geräte ').replace('{n}', String(handsets.length)).trim()}</span>
        </div>
        <div className="card-body">
          {handsets.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 32 }}>{t('Keine DECT-Geräte gefunden')}</div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>{t('Name')}</th>
                    <th>{t('Modell')}</th>
                    <th>{t('Status')}</th>
                    <th>{t('Akku')}</th>
                  </tr>
                </thead>
                <tbody>
                  {handsets.map((h: any, i: number) => {
                    // NewActive ist firmware-abhängig: manche Boxen melden 0 auch bei
                    // aktiven Handsets im Tiefschlaf, andere unterscheiden korrekt.
                    // Deshalb bewusst weiches Label "Standby / Aus" – wir können
                    // standby und off via TR-064 nicht zuverlässig unterscheiden.
                    const label = h.connected
                      ? t('Im Gespräch')
                      : h.active
                        ? t('Aktiv / Bereitschaft')
                        : h.registered
                          ? t('Standby / Aus')
                          : t('Abgemeldet');
                    // Status-Dot: Solange das Handset in der Box-Konfiguration steht
                    // (registered=true), gilt es als online – auch im Tiefschlaf, wo
                    // weder NewActive noch Akku zuverlässig sind. Nur abgemeldete
                    // Geräte zeigen den grauen Offline-Punkt.
                    const dotClass = h.registered ? 'online' : 'offline';
                    return (
                      <tr key={i}>
                        <td className="device-name">{h.name}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>
                          {h.model || '—'}
                          {h.updateAvailable && <span style={{ marginLeft: 6, fontSize: 10, color: '#f59e0b' }}>{t('Update verfügbar')}</span>}
                        </td>
                        <td>
                          <span className={`status-dot ${dotClass}`} />
                          {label}
                        </td>
                        <td>{h.battery ? `${h.battery}%` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CallsTab({ calls, t }: { calls: any[]; t: (s: string) => string }) {
  const [filter, setFilter] = useState<string>('all');

  // AVM-Call-XML: 1=eingehend, 2=verpasst, 3=ausgehend, 9=aktiv eingehend,
  // 10=abgewiesen, 11=aktiv ausgehend.
  function callLabel(type: string) {
    switch (type) {
      case '1':  return { label: t('Eingehend'),  color: '#22c55e' };
      case '2':  return { label: t('Verpasst'),   color: '#ef4444' };
      case '3':  return { label: t('Ausgehend'),  color: '#3b82f6' };
      case '9':  return { label: t('Aktiv ein.'), color: '#22c55e' };
      case '10': return { label: t('Abgewiesen'), color: '#f59e0b' };
      case '11': return { label: t('Aktiv aus.'), color: '#3b82f6' };
      default:   return { label: t('Typ {t}').replace('{t}', type), color: 'var(--text-secondary)' };
    }
  }

  // Issue #41: AVM liefert die Dauer als „h:mm" (Stunden:Minuten) – „0:05" sind
  // 5 Minuten, nicht 5 Sekunden. Der Server rechnet in durationMin um.
  function formatDuration(call: any) {
    const min: number | null = typeof call.durationMin === 'number' ? call.durationMin : null;
    if (min === null) return call.duration || '—';
    if (call.type === '2' || call.type === '10') return '—';
    if (min === 0) return t('< 1 Min');
    if (min < 60) return t('{n} Min').replace('{n}', String(min));
    return t('{h} Std {m} Min').replace('{h}', String(Math.floor(min / 60))).replace('{m}', String(min % 60));
  }

  const filterOptions = [
    { id: 'all',       label: t('Alle') },
    { id: 'incoming',  label: t('Eingehend') },
    { id: 'outgoing',  label: t('Ausgehend') },
    { id: 'missed',    label: t('Verpasst') },
  ];

  const filtered = calls.filter(c => {
    if (filter === 'incoming') return c.type === '1' || c.type === '9';
    if (filter === 'outgoing') return c.type === '3' || c.type === '11';
    if (filter === 'missed')   return c.type === '2';
    return true;
  });

  return (
    <div className="card">
      <div className="card-header">
        <h3>{t('Anrufliste')}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {filterOptions.map(opt => (
            <button
              key={opt.id}
              onClick={() => setFilter(opt.id)}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                border: `1px solid ${filter === opt.id ? 'var(--accent)' : 'var(--border)'}`,
                background: filter === opt.id ? 'var(--accent)' : 'var(--bg-primary)',
                color: filter === opt.id ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {opt.label}
            </button>
          ))}
          <span style={{ color: 'var(--text-secondary)', fontSize: 13, marginLeft: 8 }}>
            {t('{n} Einträge').replace('{n}', String(filtered.length))}
          </span>
        </div>
      </div>
      <div className="card-body">
        {filtered.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 32 }}>
            {t('Keine Anrufe gefunden')}
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>{t('Datum')}</th>
                  <th>{t('Name')}</th>
                  <th>{t('Von')}</th>
                  <th>{t('An')}</th>
                  <th>{t('Gerät')}</th>
                  <th>{t('Typ')}</th>
                  <th>{t('Dauer')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((call, i) => {
                  const { label, color } = callLabel(call.type);
                  return (
                    <tr key={i}>
                      <td style={{ whiteSpace: 'nowrap' }}>{call.date || '—'}</td>
                      <td className="device-name">{call.name || t('Unbekannt')}</td>
                      <td style={{ fontFamily: 'monospace' }}>{call.from || '—'}</td>
                      <td style={{ fontFamily: 'monospace' }}>{call.to || '—'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{call.device || '—'}</td>
                      <td><span style={{ color, fontWeight: 500 }}>{label}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDuration(call)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

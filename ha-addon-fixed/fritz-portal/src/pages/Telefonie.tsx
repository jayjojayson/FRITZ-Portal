import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/apiFetch';

interface TelefonieProps {
  sid: string;
}

type TelefonieTab = 'smartHome' | 'dect' | 'calls';

export default function Telefonie({ sid }: TelefonieProps) {
  const [tab, setTab] = useState<TelefonieTab>('smartHome');
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState<any[]>([]);
  const [calls, setCalls] = useState<any[]>([]);
  const [dectInfo, setDectInfo] = useState<any>(null);

  const headers = { 'X-Fritz-SID': sid };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [devicesRes, callsRes, dectRes] = await Promise.all([
        apiFetch('/api/fritz/smartHome', { headers }),
        apiFetch('/api/fritz/calls', { headers }),
        apiFetch('/api/fritz/dect', { headers }),
      ]);

      setDevices(await devicesRes.json());
      setCalls(await callsRes.json());
      setDectInfo(await dectRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const tabs: { id: TelefonieTab; label: string }[] = [
    { id: 'smartHome', label: 'SmartHome' },
    { id: 'dect', label: 'DECT' },
    { id: 'calls', label: 'Anrufliste' },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>Telefonie</h2>
        <p>SmartHome, DECT und Anrufliste</p>
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

      {tab === 'smartHome' && <SmartHomeTab devices={devices} />}
      {tab === 'dect' && <DECTTab dectInfo={dectInfo} />}
      {tab === 'calls' && <CallsTab calls={calls} />}
    </div>
  );
}

function SmartHomeTab({ devices }: { devices: any[] }) {
  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h3>SmartHome Ger\u00e4te</h3>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{devices.length} Ger\u00e4te</span>
        </div>
        <div className="card-body">
          {devices.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 32 }}>
              Keine SmartHome Ger\u00e4te gefunden
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Typ</th>
                    <th>Status</th>
                    <th>Temperatur</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((dev, i) => (
                    <tr key={i}>
                      <td className="device-name">{dev.name || 'Unbekannt'}</td>
                      <td>{dev.productname || '-'}</td>
                      <td>
                        <span className={`status-dot ${dev.present === '1' ? 'online' : 'offline'}`} />
                        {dev.present === '1' ? 'Online' : 'Offline'}
                      </td>
                      <td>{dev.temperature ? `${dev.temperature / 10} \u00b0C` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DECTTab({ dectInfo }: { dectInfo: any }) {
  const handsets: any[] = dectInfo?.handsets || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <div className="card-header"><h3>DECT Basisstation</h3></div>
        <div className="card-body">
          <table>
            <tbody>
              <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)', width: 220 }}>DECT aktiv</td><td>{dectInfo?.NewDECTActive === '1' ? 'Ja' : 'Nein'}</td></tr>
              <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Basisname</td><td>{dectInfo?.NewDECTBaseName || '—'}</td></tr>
              <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Eco Mode</td><td>{dectInfo?.NewDECTPowerActive === '1' ? 'Aktiv' : 'Inaktiv'}</td></tr>
              <tr><td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Pin</td><td>{dectInfo?.NewDECTPin ? '****' : 'Nicht gesetzt'}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Angemeldete Handsets</h3>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{handsets.length} Gerät{handsets.length !== 1 ? 'e' : ''}</span>
        </div>
        <div className="card-body">
          {handsets.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 32 }}>Keine DECT-Geräte gefunden</div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Akku</th>
                  </tr>
                </thead>
                <tbody>
                  {handsets.map((h: any, i: number) => (
                    <tr key={i}>
                      <td className="device-name">{h.name}</td>
                      <td>
                        <span className={`status-dot ${h.connected ? 'online' : 'offline'}`} />
                        {h.connected ? 'Verbunden' : 'Getrennt'}
                      </td>
                      <td>{h.battery ? `${h.battery}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CallsTab({ calls }: { calls: any[] }) {
  const [filter, setFilter] = useState<string>('all');

  function callLabel(type: string) {
    switch (type) {
      case '1':  return { label: 'Eingehend',  color: '#22c55e' };
      case '2':  return { label: 'Ausgehend',  color: '#3b82f6' };
      case '3':  return { label: 'Verpasst',   color: '#ef4444' };
      case '10': return { label: 'Aktiv ein.', color: '#22c55e' };
      case '11': return { label: 'Aktiv aus.', color: '#3b82f6' };
      default:   return { label: `Typ ${type}`, color: 'var(--text-secondary)' };
    }
  }

  const filterOptions = [
    { id: 'all',       label: 'Alle' },
    { id: 'incoming',  label: 'Eingehend' },
    { id: 'outgoing',  label: 'Ausgehend' },
    { id: 'missed',    label: 'Verpasst' },
  ];

  const filtered = calls.filter(c => {
    if (filter === 'incoming') return c.type === '1' || c.type === '10';
    if (filter === 'outgoing') return c.type === '2' || c.type === '11';
    if (filter === 'missed')   return c.type === '3';
    return true;
  });

  return (
    <div className="card">
      <div className="card-header">
        <h3>Anrufliste</h3>
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
            {filtered.length} Einträge
          </span>
        </div>
      </div>
      <div className="card-body">
        {filtered.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 32 }}>
            Keine Anrufe gefunden
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Name</th>
                  <th>Rufnummer</th>
                  <th>Typ</th>
                  <th>Dauer</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((call, i) => {
                  const { label, color } = callLabel(call.type);
                  return (
                    <tr key={i}>
                      <td style={{ whiteSpace: 'nowrap' }}>{call.date || '—'}</td>
                      <td className="device-name">{call.name || 'Unbekannt'}</td>
                      <td style={{ fontFamily: 'monospace' }}>{call.number || '—'}</td>
                      <td><span style={{ color, fontWeight: 500 }}>{label}</span></td>
                      <td>{call.duration || '—'}</td>
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

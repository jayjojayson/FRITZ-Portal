import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/apiFetch';
import { getApiCache, setApiCache } from '../App';
import { useT } from '../lib/i18n';

interface Host {
  mac: string;
  ip: string;
  active: boolean;
  name: string;
  interface: string;
  addressSource?: string;
  lastActivity?: string;
  connType?: 'LAN' | 'WLAN';
  connDetail?: string;
  connSpeed?: string;
  connDisplay?: string;
  guest?: boolean;
  vpn?: boolean;
  blocked?: boolean;
}

type QuickFilter = 'all' | 'online' | 'offline' | 'lan' | 'wlan' | 'guest' | 'static';

interface IpStats {
  total: number;
  used: number;
  free: number;
  minAddress: string;
  maxAddress: string;
}

interface DeviceListProps {
  sid: string;
  onSelectDevice: (mac: string) => void;
}

export default function DeviceList({ sid, onSelectDevice }: DeviceListProps) {
  const t = useT();
  const [hosts, setHosts] = useState<Host[]>([]);
  const [ipStats, setIpStats] = useState<IpStats>({ total: 0, used: 0, free: 0, minAddress: '', maxAddress: '' });
  const [freeIpNumbers, setFreeIpNumbers] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dataLoaded, setDataLoaded] = useState(false);
  const [sortField, setSortField] = useState<'name' | 'status' | 'ip' | 'connection'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [deletingMac, setDeletingMac] = useState<string | null>(null);
  const [deleteMsg, setDeleteMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');

  const headers = { 'X-Fritz-SID': sid };

  const handleDelete = async (e: React.MouseEvent, host: Host) => {
    e.stopPropagation();
    if (host.active) return;
    if (!confirm(t('„{n}" dauerhaft aus der FRITZ!Box-Geräteliste entfernen?').replace('{n}', host.name || host.mac))) return;
    setDeletingMac(host.mac);
    setDeleteMsg(null);
    try {
      const res = await apiFetch('/api/fritz/device', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ mac: host.mac }),
      });
      const data = await res.json();
      if (data.success) {
        setHosts(prev => prev.filter(h => h.mac !== host.mac));
        setApiCache('hosts', hosts.filter(h => h.mac !== host.mac));
        setDeleteMsg({ kind: 'ok', text: t('Gerät „{n}" entfernt.').replace('{n}', host.name || host.mac) });
      } else {
        setDeleteMsg({ kind: 'err', text: data.error || t('Löschen fehlgeschlagen') });
      }
    } catch {
      setDeleteMsg({ kind: 'err', text: t('Verbindungsfehler') });
    } finally {
      setDeletingMac(null);
      setTimeout(() => setDeleteMsg(null), 5000);
    }
  };

  const handleSort = (field: 'name' | 'status' | 'ip' | 'connection') => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const getSortIndicator = (field: string) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  useEffect(() => {
    if (!dataLoaded) {
      loadDevices();
    }
  }, [dataLoaded]);

  const loadDevices = async () => {
    try {
      const cachedHosts = getApiCache('hosts');
      const cachedIpStats = getApiCache('ip-stats');

      if (cachedHosts) {
        const usedNumbers = new Set(
          cachedHosts
            .filter((h: Host) => h.ip)
            .map((h: Host) => {
              const parts = h.ip.split('.');
              return parseInt(parts[parts.length - 1], 10);
            })
        );
        setHosts(cachedHosts);
        // Sofort rendern — frische Daten ersetzen den Cache, sobald sie da sind
        setLoading(false);

        if (cachedIpStats) {
          setIpStats(cachedIpStats);
          const minNum = parseInt(cachedIpStats.minAddress?.split('.')[3] || '0', 10);
          const maxNum = parseInt(cachedIpStats.maxAddress?.split('.')[3] || '255', 10);
          const freeIps: number[] = [];
          for (let i = minNum; i <= maxNum && freeIps.length < 5; i++) {
            if (!usedNumbers.has(i)) {
              freeIps.push(i);
            }
          }
          setFreeIpNumbers(freeIps);
        }
      }

      const [hostsRes, ipRes] = await Promise.all([
        apiFetch('/api/fritz/hosts', { headers }),
        apiFetch('/api/fritz/ip-stats', { headers }),
      ]);
      const [data, ipData] = await Promise.all([hostsRes.json(), ipRes.json()]);

      setApiCache('hosts', data);
      setApiCache('ip-stats', ipData);

      setHosts(data);
      setIpStats(ipData);
      setDataLoaded(true);
      const usedNumbers = new Set(
        data
          .filter((h: Host) => h.ip)
          .map((h: Host) => {
            const parts = h.ip.split('.');
            return parseInt(parts[parts.length - 1], 10);
          })
      );
      
      const getLastOctet = (ip: string) => {
        const parts = ip.split('.');
        return parseInt(parts[parts.length - 1], 10);
      };
      
      const minNum = getLastOctet(ipData.minAddress);
      const maxNum = getLastOctet(ipData.maxAddress);
      const freeIps: number[] = [];
      
      for (let i = minNum; i <= maxNum && freeIps.length < 5; i++) {
        if (!usedNumbers.has(i)) {
          freeIps.push(i);
        }
      }
      
      setFreeIpNumbers(freeIps);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const isWlan = (h: Host) => {
    if (h.connType === 'WLAN') return true;
    if (h.connType === 'LAN')  return false;
    const s = String(h.interface || '').toLowerCase();
    return s.includes('wlan') || s.includes('802');
  };

  const matchesQuick = (h: Host) => {
    switch (quickFilter) {
      case 'online':  return h.active;
      case 'offline': return !h.active;
      case 'lan':     return !isWlan(h);
      case 'wlan':    return isWlan(h);
      case 'guest':   return !!h.guest;
      case 'static':  return h.addressSource === 'Static';
      default:        return true;
    }
  };

  const filtered = hosts.filter(h => matchesQuick(h) && (
    (h.name || '').toLowerCase().includes(search.toLowerCase()) ||
    h.ip.includes(search) ||
    h.mac.toLowerCase().includes(search.toLowerCase())
  ));

  // Aktuelle (gefilterte, sortierte) Ansicht als CSV herunterladen – Semikolon
  // als Trenner, damit Excel mit deutscher Ländereinstellung die Spalten erkennt
  const exportCsv = () => {
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Name', 'IP', 'MAC', 'Status', 'Verbindung', 'Feste IP', 'Gast'];
    const lines = sorted.map(h => [
      h.name, h.ip, h.mac, h.active ? 'online' : 'offline',
      h.connDisplay || (isWlan(h) ? 'WLAN' : 'LAN'),
      h.addressSource === 'Static' ? 'ja' : 'nein', h.guest ? 'ja' : 'nein',
    ].map(cell).join(';'));
    const blob = new Blob(['\ufeff' + [header.map(cell).join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fritzbox-geraete-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatLastActivity = (ts: string | undefined) => {
    if (!ts) return '';
    const n = parseInt(ts, 10);
    if (!n) return '';
    const diff = Math.floor((Date.now() / 1000) - n);
    if (diff < 60) return t('gerade eben');
    if (diff < 3600) return t('vor {n} Min').replace('{n}', String(Math.floor(diff / 60)));
    if (diff < 86400) return t('vor {n} Std').replace('{n}', String(Math.floor(diff / 3600)));
    return t('vor {n} Tagen').replace('{n}', String(Math.floor(diff / 86400)));
  };

  const sorted = [...filtered].sort((a, b) => {
    // Offline-Geräte immer ans Ende: erst alle Online-Geräte (sortiert),
    // darunter die Offline-Geräte (ebenfalls sortiert)
    const grp = (b.active ? 1 : 0) - (a.active ? 1 : 0);
    if (grp !== 0) return grp;
    let cmp = 0;
    switch (sortField) {
      case 'name':
        cmp = (a.name || 'Unbekannt').localeCompare(b.name || 'Unbekannt');
        break;
      case 'status':
        // Innerhalb der Gruppe (online/offline) nach Name sortieren
        cmp = (a.name || 'Unbekannt').localeCompare(b.name || 'Unbekannt');
        break;
      case 'ip': {
        const ipNum = (ip: string) =>
          ip.split('.').reduce((acc, p) => acc * 256 + (parseInt(p, 10) || 0), 0);
        cmp = ipNum(a.ip || '0.0.0.0') - ipNum(b.ip || '0.0.0.0');
        break;
      }
      case 'connection':
        cmp = (isWlan(a) ? 'wlan' : 'lan').localeCompare(isWlan(b) ? 'wlan' : 'lan');
        break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const onlineCount = hosts.filter(h => h.active).length;
  const offlineCount = hosts.filter(h => !h.active).length;

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <h2>{t('Netzwerk Ger\u00e4te')}</h2>
        <p>
          {ipStats.total > 0
            ? t('{n} IP-Adressen \u2014 {u} vergeben \u2014 {f} verf\u00fcgbar').replace('{n}', String(ipStats.total)).replace('{u}', String(ipStats.used)).replace('{f}', String(ipStats.free))
            : t('{n} Ger\u00e4te insgesamt \u2014 {on} online \u2014 {off} offline').replace('{n}', String(hosts.length)).replace('{on}', String(onlineCount)).replace('{off}', String(offlineCount))
          }
        </p>
      </div>

      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-icon blue">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <h3>{t('Gesamt')}</h3>
          <div className="value">{hosts.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h3>{t('Online')}</h3>
          <div className="value">{onlineCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h3>{t('Offline')}</h3>
          <div className="value">{offlineCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
          </div>
          <h3>{t('Freie IPs')}</h3>
          <div className="value" style={{ fontSize: 16, fontWeight: 500 }}>
            {freeIpNumbers.length > 0 ? freeIpNumbers.join(', ') : '-'}
          </div>
        </div>
      </div>

      {deleteMsg && (
        <div className={deleteMsg.kind === 'ok' ? 'success-message' : 'error-message'}>{deleteMsg.text}</div>
      )}

      <div className="card">
        <div className="card-header">
          <h3>{t('Alle Ger\u00e4te')}</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginLeft: 'auto', marginRight: 10 }}>
            {([
              ['all', 'Alle'], ['online', 'Online'], ['offline', 'Offline'], ['lan', 'LAN'], ['wlan', 'WLAN'],
              ...(hosts.some(h => h.guest) ? [['guest', 'Gast']] : []),
              ['static', 'Feste IP'],
            ] as [QuickFilter, string][]).map(([id, label]) => (
              <button key={id} onClick={() => setQuickFilter(id)} style={{
                padding: '4px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${quickFilter === id ? 'var(--accent)' : 'var(--border)'}`,
                background: quickFilter === id ? 'var(--accent)' : 'var(--bg-primary)',
                color: quickFilter === id ? '#fff' : 'var(--text-secondary)',
              }}>{t(label)}</button>
            ))}
            <button onClick={exportCsv} title={t('Aktuelle Ansicht als CSV exportieren')} style={{
              padding: '4px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
              border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-secondary)',
            }}>{t('CSV')} ↓</button>
          </div>
          <input
            id="device-search"
            type="text"
            placeholder={t('Suchen...')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: 14,
              width: 240,
            }}
          />
        </div>
        <div className="card-body">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('status')}>{t('Status')}{getSortIndicator('status')}</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>{t('Name')}{getSortIndicator('name')}</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('ip')}>{t('IP-Adresse')}{getSortIndicator('ip')}</th>
                  <th>{t('MAC-Adresse')}</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('connection')}>{t('Verbindung')}{getSortIndicator('connection')}</th>
                  <th>{t('Zuletzt online')}</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((host, i) => (
                  <tr key={i} onClick={() => onSelectDevice(host.mac)} style={{ cursor: 'pointer' }}>
                    <td>
                      <span className={`status-dot ${host.active ? 'online' : 'offline'}`} />
                      {host.active ? t('Online') : t('Offline')}
                    </td>
                    <td className="device-name">{host.name || t('Unbekannt')}</td>
                    <td>
                      {host.ip ? (
                        <>
                          <a
                            href={`http://${host.ip}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
                            title={t('{ip} im Browser öffnen').replace('{ip}', host.ip)}
                          >
                            {host.ip}
                          </a>
                          {host.guest && (
                            <span title={t('Gerät im Gastnetz')} style={{
                              marginLeft: 6, fontSize: 10, fontWeight: 600, padding: '1px 5px',
                              borderRadius: 4, background: '#f59e0b20', color: '#f59e0b',
                              border: '1px solid #f59e0b40', verticalAlign: 'middle',
                            }}>{t('GAST')}</span>
                          )}
                          {host.addressSource === 'Static' && (
                            <span title={t('Feste IP-Adresse')} style={{
                              marginLeft: 6, fontSize: 10, fontWeight: 600, padding: '1px 5px',
                              borderRadius: 4, background: '#3b82f620', color: '#3b82f6',
                              border: '1px solid #3b82f640', verticalAlign: 'middle',
                            }}>{t('FEST')}</span>
                          )}
                        </>
                      ) : '—'}
                    </td>
                    <td className="device-mac">{host.mac}</td>
                    <td>
                      {(() => {
                        const wlan = isWlan(host);
                        const color = wlan ? '#10b981' : '#3b82f6';
                        const icon = wlan ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
                            <path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><circle cx="12" cy="20" r="1" fill={color} />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
                            <rect x="1" y="6" width="22" height="12" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
                          </svg>
                        );
                        // Anzeigetext: vorgeformatierter connDisplay aus netDev hat Vorrang
                        let label = host.connDisplay || '';
                        if (!label) {
                          const prefix = wlan ? 'WLAN' : 'LAN';
                          const parts = [host.connDetail ? `${prefix} ${host.connDetail}` : prefix];
                          if (host.connSpeed) parts.push(host.connSpeed);
                          label = parts.join(' → ');
                        }
                        return (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color }}>
                            {icon}
                            <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
                          </span>
                        );
                      })()}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {host.active
                        ? (formatLastActivity(host.lastActivity) || '—')
                        : (formatLastActivity(host.lastActivity) || 'Unbekannt')}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {!host.active ? (
                        <button
                          onClick={e => handleDelete(e, host)}
                          disabled={deletingMac === host.mac}
                          title={t('Aus FRITZ!Box-Liste entfernen')}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border)',
                            color: 'var(--text-secondary)',
                            width: 26, height: 26, borderRadius: 3,
                            fontFamily: 'var(--font-mono)', fontSize: 14, lineHeight: 1,
                            cursor: deletingMac === host.mac ? 'default' : 'pointer',
                            opacity: deletingMac === host.mac ? 0.4 : 1,
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--danger)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--danger)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
                        >
                          {deletingMac === host.mac ? '\u2026' : '\u00d7'}
                        </button>
                      ) : (
                        <span
                          title={t('Nur offline-Ger\u00e4te k\u00f6nnen entfernt werden')}
                          style={{
                            display: 'inline-block', width: 26, height: 26, borderRadius: 3,
                            border: '1px solid var(--border)', opacity: 0.25,
                            color: 'var(--text-muted)', fontSize: 14, lineHeight: '24px',
                            textAlign: 'center', fontFamily: 'var(--font-mono)',
                          }}
                        >\u00d7</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 32 }}>
                      {t('Keine Ger\u00e4te gefunden')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

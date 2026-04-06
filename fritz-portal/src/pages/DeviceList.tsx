import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/apiFetch';

interface Host {
  mac: string;
  ip: string;
  active: boolean;
  name: string;
  interface: string;
}

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
  const [hosts, setHosts] = useState<Host[]>([]);
  const [ipStats, setIpStats] = useState<IpStats>({ total: 0, used: 0, free: 0, minAddress: '', maxAddress: '' });
  const [freeIpNumbers, setFreeIpNumbers] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const headers = { 'X-Fritz-SID': sid };

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    try {
      const [hostsRes, ipRes] = await Promise.all([
        apiFetch('/api/fritz/hosts', { headers }),
        apiFetch('/api/fritz/ip-stats', { headers }),
      ]);
      const [data, ipData] = await Promise.all([hostsRes.json(), ipRes.json()]);
      setHosts(data);
      setIpStats(ipData);
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

  const filtered = hosts.filter(h =>
    (h.name || '').toLowerCase().includes(search.toLowerCase()) ||
    h.ip.includes(search) ||
    h.mac.toLowerCase().includes(search.toLowerCase())
  );

  const onlineCount = hosts.filter(h => h.active).length;
  const offlineCount = hosts.filter(h => !h.active).length;

  const isWlan = (iface: string) => {
    const s = String(iface || '').toLowerCase();
    return s.includes('wlan') || s.includes('802');
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <h2>Netzwerk Ger{"\u00e4"}te</h2>
        <p>
          {ipStats.total > 0
            ? <>{ipStats.total} IP-Adressen {'\u2014'} {ipStats.used} vergeben {'\u2014'} {ipStats.free} verf{"\u00fc"}gbar</>
            : <>{hosts.length} Ger{"\u00e4"}te insgesamt {'\u2014'} {onlineCount} online {'\u2014'} {offlineCount} offline</>
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
          <h3>Gesamt</h3>
          <div className="value">{hosts.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h3>Online</h3>
          <div className="value">{onlineCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h3>Offline</h3>
          <div className="value">{offlineCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
          </div>
          <h3>Freie IPs</h3>
          <div className="value" style={{ fontSize: 16, fontWeight: 500 }}>
            {freeIpNumbers.length > 0 ? freeIpNumbers.join(', ') : '-'}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Alle Ger{"\u00e4"}te</h3>
          <input
            type="text"
            placeholder="Suchen..."
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
                  <th>Status</th>
                  <th>Name</th>
                  <th>IP-Adresse</th>
                  <th>MAC-Adresse</th>
                  <th>Verbindung</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((host, i) => (
                  <tr key={i} onClick={() => onSelectDevice(host.mac)} style={{ cursor: 'pointer' }}>
                    <td>
                      <span className={`status-dot ${host.active ? 'online' : 'offline'}`} />
                      {host.active ? 'Online' : 'Offline'}
                    </td>
                    <td className="device-name">{host.name || 'Unbekannt'}</td>
                    <td>{host.ip}</td>
                    <td className="device-mac">{host.mac}</td>
                    <td>
                      {isWlan(host.interface) ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><circle cx="12" cy="20" r="1" fill="currentColor" />
                          </svg>
                          WLAN
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="1" y="6" width="22" height="12" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
                          </svg>
                          LAN
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 32 }}>
                      Keine Ger{"\u00e4"}te gefunden
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

import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/apiFetch';
import { getApiCache, setApiCache } from '../App';
import { useT } from '../lib/i18n';

interface SmartHomeProps {
  sid: string;
}

export default function SmartHome({ sid }: SmartHomeProps) {
  const t = useT();
  const cached: any[] | null = getApiCache('smartHome');
  const [devices, setDevices] = useState<any[]>(cached || []);
  const [loading, setLoading] = useState(!cached);
  const headers = { 'X-Fritz-SID': sid };

  useEffect(() => {
    apiFetch('/api/fritz/smartHome', { headers })
      .then(r => r.json())
      .then(d => { setApiCache('smartHome', d); setDevices(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <h2>{t('SmartHome')}</h2>
        <p>{t('Übersicht deiner FRITZ!SmartHome-Geräte')}</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>{t('SmartHome-Geräte')}</h3>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{t('{n} Geräte').replace('{n}', String(devices.length))}</span>
        </div>
        <div className="card-body">
          {devices.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 32 }}>
              {t('Keine SmartHome-Geräte gefunden')}
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>{t('Name')}</th>
                    <th>{t('Typ')}</th>
                    <th>{t('Status')}</th>
                    <th>{t('Messwerte')}</th>
                    <th>{t('Akku')}</th>
                    <th>{t('Firmware')}</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((dev, i) => {
                    const online = dev.present === '1';
                    // Messwerte je nach Gerät: Temperatur (0,1 °C), Luftfeuchte, Schaltzustand,
                    // Leistung (mW), Energie (Wh), Soll-Temperatur (Heizkörperregler)
                    const values: string[] = [];
                    if (Number.isFinite(dev.temperature)) values.push(`${(dev.temperature / 10).toFixed(1)} °C`);
                    if (Number.isFinite(dev.tsoll_celsius)) values.push(`${t('Soll')} ${dev.tsoll_celsius} °C`);
                    if (Number.isFinite(dev.humidity)) values.push(`${dev.humidity} %`);
                    if (dev.switch_state === '1' || dev.switch_state === '0') values.push(dev.switch_state === '1' ? t('an') : t('aus'));
                    if (Number.isFinite(dev.power) && (dev.power > 0 || dev.switch_state === '1')) values.push(`${(dev.power / 1000).toFixed(1)} W`);
                    if (Number.isFinite(dev.energy) && dev.energy > 0) values.push(`${(dev.energy / 1000).toFixed(2)} kWh`);
                    if (Number.isFinite(dev.level)) values.push(`${dev.level} %`);
                    return (
                      <tr key={i}>
                        <td className="device-name">
                          {dev.name || t('Unbekannt')}
                          {dev.zigbee && (
                            <span title="Zigbee" style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>ZIGBEE</span>
                          )}
                        </td>
                        <td>{dev.productname || '-'}</td>
                        <td>
                          <span className={`status-dot ${online ? 'online' : 'offline'}`} />
                          {online ? t('Online') : t('Offline')}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{values.length ? values.join(' · ') : '-'}</td>
                        <td style={{ color: dev.batteryLow ? 'var(--danger)' : undefined }}>
                          {Number.isFinite(dev.battery) ? `${dev.battery} %` : '-'}
                          {dev.batteryLow && ` ⚠ ${t('schwach')}`}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {dev.firmware || '-'}
                          {dev.updateAvailable && <span style={{ marginLeft: 6, color: 'var(--warning)' }}>{t('Update verfügbar')}</span>}
                        </td>
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

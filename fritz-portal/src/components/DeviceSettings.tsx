import { useState, useEffect, type ReactNode } from 'react';
import { apiFetch } from '../lib/apiFetch';
import { setApiCache } from '../App';
import { useT } from '../lib/i18n';

// Felder, die der Server über die Geräte-Zuordnung liefert (applyTopology)
export interface TopologyHost {
  mac: string;
  ip: string;
  name: string;
  active: boolean;
  connType?: 'LAN' | 'WLAN';
  connAuto?: 'LAN' | 'WLAN';
  viaMac?: string;
  viaName?: string;
  viaAuto?: boolean;
  isInfra?: boolean;
  isInfraAuto?: boolean;
}

interface Override { conn?: string; parent?: string; infra?: boolean; clientConn?: string }

// Segment-Schalter im Stil der Filter-Buttons
function Segmented<T extends string>({ value, options, onChange, disabled }: {
  value: T; options: [T, string][]; onChange: (v: T) => void; disabled?: boolean;
}) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', flexWrap: 'wrap' }}>
      {options.map(([id, label]) => (
        <button key={id} disabled={disabled} onClick={() => id !== value && onChange(id)} style={{
          padding: '5px 12px', fontSize: 12, border: 'none', cursor: disabled ? 'default' : 'pointer',
          background: value === id ? 'var(--accent)' : 'transparent',
          color: value === id ? '#fff' : 'var(--text-secondary)',
        }}>{label}</button>
      ))}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '12px 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
      <div style={{ minWidth: 220, flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: 14 }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

// Verbindungsart, Zugangspunkt und „ist Zugangspunkt" korrigieren. Die FRITZ!Box sieht
// Geräte hinter Fremd-Routern/Access Points nur als LAN am Router-Port – hier lässt
// sich das richtigstellen. Gespeichert wird serverseitig (übersteht Add-on-Updates).
export function ConnectionSettings({ sid, device, hosts, onChanged }: {
  sid: string; device: TopologyHost; hosts: TopologyHost[]; onChanged: (hosts: TopologyHost[]) => void;
}) {
  const t = useT();
  const headers = { 'X-Fritz-SID': sid };
  const [ov, setOv] = useState<Override>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/fritz/device/overrides', { headers })
      .then(r => r.json())
      .then(d => setOv(d?.devices?.[device.mac] || {}))
      .catch(() => {});
  }, [device.mac]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (changes: Record<string, string | boolean | null>) => {
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch('/api/fritz/device/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ mac: device.mac, ...changes }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || t('Fehler beim Speichern.')); return; }
      setOv(data.override || {});
      // Geräteliste neu laden – Zuordnung/Verbindungsart werden serverseitig berechnet
      const fresh = await (await apiFetch('/api/fritz/hosts', { headers })).json();
      if (Array.isArray(fresh)) { setApiCache('hosts', fresh); onChanged(fresh); }
    } catch {
      setError(t('Verbindungsfehler.'));
    } finally {
      setSaving(false);
    }
  };

  const auto = t('Automatisch');
  const connAutoLabel = `${auto} (${device.connAuto || '?'})`;
  const accessPoints = hosts.filter(h => h.isInfra && h.mac !== device.mac);
  const autoVia = ov.parent ? '' : (device.viaAuto && device.viaName ? device.viaName : 'FRITZ!Box');
  const clients = hosts.filter(h => h.viaMac === device.mac && h.active).length;

  return (
    <div className="card">
      <div className="card-header"><h3>{t('Verbindung & Zuordnung')}</h3></div>
      <div className="card-body">
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 4, lineHeight: 1.6 }}>
          {t('Die FRITZ!Box sieht Geräte hinter eigenen Routern oder Access Points (z. B. Xiaomi, TP-Link) nur als LAN-Geräte. Hier kannst du die Verbindungsart und den Zugangspunkt korrigieren – die Einstellungen bleiben auch nach Updates erhalten.')}
        </p>

        <Row label={t('Verbindungsart')}>
          <Segmented disabled={saving}
            value={(ov.conn || 'auto') as string}
            options={[['auto', connAutoLabel], ['LAN', 'LAN'], ['WLAN', 'WLAN']]}
            onChange={v => save({ conn: v })} />
        </Row>

        <Row label={t('Verbunden über')} hint={t('Zugangspunkt, an dem das Gerät hängt – bestimmt die Einordnung in der Netzwerk-Topologie')}>
          <select disabled={saving} value={ov.parent || 'auto'} onChange={e => save({ parent: e.target.value })} style={{
            padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)',
            color: 'var(--text-primary)', fontSize: 13, minWidth: 220,
          }}>
            <option value="auto">{auto} ({autoVia})</option>
            <option value="box">FRITZ!Box</option>
            {accessPoints.map(h => <option key={h.mac} value={h.mac}>{h.name || h.mac}</option>)}
          </select>
        </Row>

        <Row label={t('Ist ein Zugangspunkt')} hint={t('Router, Access Point oder Repeater, an dem weitere Geräte hängen')}>
          <Segmented disabled={saving}
            value={ov.infra === true ? 'yes' : ov.infra === false ? 'no' : 'auto'}
            options={[['auto', `${auto} (${device.isInfraAuto ? t('ja') : t('nein')})`], ['yes', t('ja')], ['no', t('nein')]]}
            onChange={v => save({ infra: v === 'auto' ? null : v === 'yes' })} />
        </Row>

        {device.isInfra && (
          <Row label={t('Geräte an diesem Zugangspunkt verbinden sich per')}
            hint={t('{n} Geräte zugeordnet – einzelne Ausnahmen stellst du am jeweiligen Gerät ein').replace('{n}', String(clients))}>
            <Segmented disabled={saving}
              value={(ov.clientConn || 'auto') as string}
              options={[['auto', `${auto} (LAN)`], ['LAN', 'LAN'], ['WLAN', 'WLAN']]}
              onChange={v => save({ clientConn: v })} />
          </Row>
        )}
        {error && <div className="error-message" style={{ marginTop: 12 }}>{error}</div>}
      </div>
    </div>
  );
}

interface FilterState {
  supported: boolean; profileId?: string; timeUsed?: number; timeMax?: number; ticketValid?: boolean;
}

const fmtMinutes = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`;

// Zugangsprofil (Kindersicherung) wechseln und Zusatz-Zeit („Ticket") gewähren
export function AccessProfileSettings({ sid, ip, disabled }: { sid: string; ip: string; disabled?: boolean }) {
  const t = useT();
  const headers = { 'X-Fritz-SID': sid };
  const [profiles, setProfiles] = useState<{ id: string; name: string; type: string }[] | null>(null);
  const [state, setState] = useState<FilterState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = () => {
    apiFetch(`/api/fritz/device/filter?ip=${encodeURIComponent(ip)}`, { headers }).then(r => r.json()).then(setState).catch(() => setState({ supported: false }));
  };
  useEffect(() => {
    if (!ip) return;
    apiFetch('/api/fritz/filter-profiles', { headers }).then(r => r.json())
      .then(d => setProfiles(d?.supported ? d.profiles : []))
      .catch(() => setProfiles([]));
    load();
  }, [ip]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ohne Berechtigung/Unterstützung (z. B. IP-Client-Modus) Bereich ausblenden
  if (!ip || !state?.supported || !profiles?.length) return null;

  const post = async (path: string, body: object, okText: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const data = await (await apiFetch(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
      })).json();
      setMsg(data.success ? { text: okText, ok: true } : { text: data.error || t('Fehler beim Speichern.'), ok: false });
      if (data.success) load();
    } catch {
      setMsg({ text: t('Verbindungsfehler.'), ok: false });
    } finally {
      setBusy(false);
    }
  };

  const hasBudget = (state.timeMax || 0) > 0;
  return (
    <div className="card">
      <div className="card-header"><h3>{t('Zugangsprofil (Kindersicherung)')}</h3></div>
      <div className="card-body">
        <Row label={t('Zugangsprofil')} hint={t('Legt fest, wann und wie lange das Gerät ins Internet darf – Profile verwaltest du in der FRITZ!Box unter Internet → Filter')}>
          <select disabled={busy || disabled} value={state.profileId || ''} onChange={e => post('/api/fritz/device/filter', { ip, profileId: e.target.value }, t('Zugangsprofil geändert'))} style={{
            padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)',
            color: 'var(--text-primary)', fontSize: 13, minWidth: 220,
          }}>
            {!profiles.some(p => p.id === state.profileId) && <option value={state.profileId || ''}>{state.profileId || '—'}</option>}
            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Row>
        {hasBudget && (
          <Row label={t('Online-Zeit heute')} hint={state.ticketValid ? t('Ein Ticket ist aktiv') : undefined}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{fmtMinutes(state.timeUsed || 0)} / {fmtMinutes(state.timeMax || 0)}</span>
              <button className="btn btn-outline" disabled={busy || disabled} onClick={() => post('/api/fritz/device/ticket', { ip }, t('Zusatz-Zeit gewährt'))}
                title={t('Wie ein Ticket der FRITZ!Box: gewährt zusätzliche Online-Zeit für heute')}>
                {t('+ Zusatz-Zeit')}
              </button>
            </div>
          </Row>
        )}
        {msg && <div className={msg.ok ? 'success-message' : 'error-message'} style={{ marginTop: 12 }}>{msg.text}</div>}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import Header from './components/Header';
import StatusLine from './components/StatusLine';
import Dashboard from './pages/Dashboard';
import DeviceList from './pages/DeviceList';
import DeviceDetail from './pages/DeviceDetail';
import Network from './pages/Network';
import Traffic from './pages/Traffic';
import Telefonie from './pages/Telefonie';
import SmartHome from './pages/SmartHome';
import System from './pages/System';
import { apiFetch } from './lib/apiFetch';
import { useT } from './lib/i18n';

type Page = 'dashboard' | 'devices' | 'device-detail' | 'network' | 'traffic' | 'telefonie' | 'smarthome' | 'system';

interface CacheData {
  data: any;
  timestamp: number;
}

interface AppCache {
  [key: string]: CacheData | undefined;
}

const CACHE_TTL = 600000; // 10 minutes
const LS_CACHE_KEY = 'fritzportal_apicache';

// Beim Start: in-memory-Cache aus localStorage hydratisieren, damit Dashboard-Daten
// (inkl. Traffic-Chart-Verlauf) einen iframe-Reload des Ingress-Panels überleben und
// sofort – ohne Loading-Screen – sichtbar sind.
function hydrateApiCache() {
  if ((window as any).__apiCache) return;
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY);
    (window as any).__apiCache = raw ? JSON.parse(raw) : {};
  } catch {
    (window as any).__apiCache = {};
  }
}
hydrateApiCache();

function getApiCache(key: string): any {
  const cached = (window as any).__apiCache?.[key];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setApiCache(key: string, data: any) {
  const cache: AppCache = (window as any).__apiCache || {};
  cache[key] = { data, timestamp: Date.now() };
  (window as any).__apiCache = cache;
  // Best-effort nach localStorage spiegeln (für Reload-Persistenz)
  try { localStorage.setItem(LS_CACHE_KEY, JSON.stringify(cache)); } catch {}
}

export { getApiCache, setApiCache };

interface StatusInfo {
  uptime: number | null;
  firmware: string | null;
  wanIp: string | null;
  load: string | null;
}

function formatLoad(s: { load1?: number; load5?: number; load15?: number } | null | undefined): string | null {
  if (!s) return null;
  const fmt = (v: number | undefined) => (typeof v === 'number' ? v.toFixed(2) : '—');
  if (s.load1 == null && s.load5 == null && s.load15 == null) return null;
  return `${fmt(s.load1)} / ${fmt(s.load5)} / ${fmt(s.load15)}`;
}

export default function App() {
  const t = useT();
  const [sid, setSid] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusInfo>({ uptime: null, firmware: null, wanIp: null, load: null });

  // HA Add-on: Auto-Session beim Start - KEINE Login-Seite
  useEffect(() => {
    console.log('App starting - attempting auto-login...');

    apiFetch('/api/fritz/auto-session')
      .then((r: Response) => r.json())
      .then((data: any) => {
        if (data.active && data.sid) {
          setSid(data.sid);
          setError(null);
        } else {
          console.log('Auto-login failed - no credentials configured in Add-On');
          setError(t('Add-On nicht konfiguriert. Bitte FRITZ!Box Zugangsdaten im Add-On eintragen.'));
        }
        setLoading(false);
      })
      .catch((err: any) => {
        console.error('Auto-login error:', err);
        setError(t('Verbindung zum Server fehlgeschlagen. Add-On läuft nicht korrekt.'));
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Status-Line Daten regelmäßig aktualisieren
  useEffect(() => {
    if (!sid) return;
    const headers = { 'X-Fritz-SID': sid };

    const loadInfo = async () => {
      try {
        const r = await apiFetch('/api/fritz/device-info', { headers });
        const info = await r.json();
        setStatus(s => ({
          ...s,
          uptime: typeof info?.NewUpTime === 'number' ? info.NewUpTime : (parseInt(info?.NewUpTime, 10) || null),
          firmware: info?.NewSoftwareVersion || info?.NewFirmwareVersion || null,
          // Manche Firmwares liefern NewExternalIPAddress hier mit, die meisten nicht –
          // die WAN-IP holen wir parallel über loadWan().
          wanIp: info?.NewExternalIPAddress || s.wanIp,
        }));
      } catch {}
    };

    const loadWan = async () => {
      try {
        const r = await apiFetch('/api/fritz/network/wan', { headers });
        const wan = await r.json();
        if (wan?.NewExternalIPAddress) {
          setStatus(s => ({ ...s, wanIp: wan.NewExternalIPAddress }));
        }
      } catch {}
    };

    const loadEco = async () => {
      try {
        const r = await apiFetch('/api/fritz/eco-stats', { headers });
        const eco = await r.json();
        setStatus(s => ({ ...s, load: formatLoad(eco) }));
      } catch {}
    };

    loadInfo();
    loadEco();
    loadWan();
    const tInfo = setInterval(loadInfo, 60000);
    const tEco  = setInterval(loadEco, 30000);
    const tWan  = setInterval(loadWan, 120000);
    return () => { clearInterval(tInfo); clearInterval(tEco); clearInterval(tWan); };
  }, [sid]);

  // Tastenkürzel (siehe Fußzeile): 1–7 Seiten, / Gerätesuche, Esc zurück zur Liste.
  // Inaktiv, solange in einem Eingabefeld getippt wird.
  useEffect(() => {
    const pages: Page[] = ['dashboard', 'devices', 'network', 'traffic', 'telefonie', 'smarthome', 'system'];
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      const idx = parseInt(e.key, 10);
      if (idx >= 1 && idx <= pages.length) {
        setSelectedDevice(null);
        setCurrentPage(pages[idx - 1]);
      } else if (e.key === '/') {
        e.preventDefault();
        setSelectedDevice(null);
        setCurrentPage('devices');
        // Suchfeld erst nach dem Rendern der Geräteseite verfügbar
        setTimeout(() => document.getElementById('device-search')?.focus(), 50);
      } else if (e.key === 'Escape') {
        setCurrentPage(p => {
          if (p === 'device-detail') { setSelectedDevice(null); return 'devices'; }
          return p;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleSelectDevice = (mac: string) => {
    setSelectedDevice(mac);
    setCurrentPage('device-detail');
  };

  const handleBackToList = () => {
    setSelectedDevice(null);
    setCurrentPage('devices');
  };

  if (loading) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-head">
            <span className="title">AUTH</span>
            <span>── fritz.box</span>
          </div>
          <div className="login-body">
            <div className="logo">
              <div className="icon" />
              <h1>fritz<span className="bang">!</span>portal</h1>
              <p>{t('Wird initialisiert...')}</p>
            </div>
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <span className="terminal-cursor">$ {t('loading')}<span className="blink">▮</span></span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !sid) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-head">
            <span className="title">AUTH</span>
            <span>── fritz.box</span>
          </div>
          <div className="login-body">
            <div className="logo">
              <div className="icon" />
              <h1>fritz<span className="bang">!</span>portal</h1>
              <p>FRITZ!Box Add-On</p>
            </div>
            <div className="error-message">
              {error || t('Fehler beim Autostart. Bitte Add-On-Konfiguration überprüfen.')}
            </div>
            <div style={{ padding: '6px 0', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.7 }}>
              <p><strong style={{ color: 'var(--text-primary)' }}>$ {t('Konfiguration erforderlich:')}</strong></p>
              <p>{t('Home Assistant → Einstellungen → Add-Ons → FRITZ!Portal → Konfiguration')}</p>
              <p>{t('Geben Sie FRITZ!Box-Adresse, Benutzername und Passwort ein.')}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header
        currentPage={currentPage === 'device-detail' ? 'devices' : currentPage}
        onNavigate={(page) => { setCurrentPage(page); setSelectedDevice(null); }}
      />
      <StatusLine
        authenticated={!!sid}
        uptime={status.uptime}
        firmware={status.firmware}
        wanIp={status.wanIp}
        recording={true}
      />
      <main className="main-content">
        {currentPage === 'dashboard' && <Dashboard sid={sid} onSelectDevice={handleSelectDevice} onNavigate={(p) => { setSelectedDevice(null); setCurrentPage(p); }} />}
        {currentPage === 'devices' && <DeviceList sid={sid} onSelectDevice={handleSelectDevice} />}
        {currentPage === 'device-detail' && selectedDevice && (
          <DeviceDetail sid={sid} mac={selectedDevice} onBack={handleBackToList} />
        )}
        {currentPage === 'network' && <Network sid={sid} onSelectDevice={handleSelectDevice} />}
        {currentPage === 'traffic' && <Traffic sid={sid} />}
        {currentPage === 'telefonie' && <Telefonie sid={sid} />}
        {currentPage === 'smarthome' && <SmartHome sid={sid} />}
        {currentPage === 'system' && <System sid={sid} />}
      </main>
      <div className="cmd-hint">
        <span><span className="accent">$</span> {t('bereit')}</span>
        <span>1–7 {t('Seiten')}</span>
        <span>/ {t('suchen')}</span>
        <span>esc {t('zurück')}</span>
        <span className="right" title={t('Durchschnittliche CPU-Auslastung der FRITZ!Box (1 / 5 / 15 Minuten)')}>
          {t('CPU AVG')} 1m·5m·15m: <span className="accent">{status.load || '— / — / —'}</span>
        </span>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import DeviceList from './pages/DeviceList';
import DeviceDetail from './pages/DeviceDetail';
import Network from './pages/Network';
import Traffic from './pages/Traffic';
import Telefonie from './pages/Telefonie';
import System from './pages/System';
import { apiFetch } from './lib/apiFetch';

type Page = 'dashboard' | 'devices' | 'device-detail' | 'network' | 'traffic' | 'telefonie' | 'system';

export default function App() {
  const [sid, setSid] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // HA Add-on: Auto-Session beim Start - KEINE Login-Seite
  useEffect(() => {
    console.log('App starting - attempting auto-login...');
    
    apiFetch('/api/fritz/auto-session')
      .then((r: Response) => {
        console.log('Auto-session response status:', r.status);
        return r.json();
      })
      .then((data: any) => {
        console.log('Auto-session data:', data);
        if (data.active && data.sid) {
          console.log('Auto-login successful, setting SID');
          setSid(data.sid);
          setError(null);
        } else {
          console.log('Auto-login failed - no credentials configured in Add-On');
          setError('Add-On nicht konfiguriert. Bitte FRITZ!Box Zugangsdaten im Add-On eintragen.');
        }
        setLoading(false);
      })
      .catch((err: any) => {
        console.error('Auto-login error:', err);
        setError('Verbindung zum Server fehlgeschlagen. Add-On läuft nicht korrekt.');
        setLoading(false);
      });
  }, []);

  const handleLogout = async () => {
    if (sid) {
      try {
        await apiFetch('/api/fritz/logout', {
          method: 'POST',
          headers: { 'X-Fritz-SID': sid },
        });
      } catch {}
    }
    // Auto-Session neu prüfen (bleibt aktiv wenn HA Add-on mit Env-Vars konfiguriert)
    try {
      const r = await apiFetch('/api/fritz/auto-session');
      const data = await r.json();
      if (data.active && data.sid) { setSid(data.sid); return; }
    } catch {}
    setSid(null);
    setError('Abgemeldet. Bitte Add-On neu starten.');
  };

  const handleSelectDevice = (mac: string) => {
    setSelectedDevice(mac);
    setCurrentPage('device-detail');
  };

  const handleBackToList = () => {
    setSelectedDevice(null);
    setCurrentPage('devices');
  };

  // Show loading while checking for auto-session
  if (loading) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="logo">
            <div className="icon"></div>
            <h1>FRITZ!Portal</h1>
            <p>Wird initialisiert...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show error if auto-login failed - NO LOGIN FORM
  if (error || !sid) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="logo">
            <div className="icon"></div>
            <h1>FRITZ!Portal</h1>
          </div>
          <div className="error-message">
            {error || 'Fehler beim Autostart. Bitte Add-On-Konfiguration überprüfen.'}
          </div>
          <div style={{ padding: '20px', fontSize: '14px', color: '#999', textAlign: 'center' }}>
            <p><strong>Konfiguration erforderlich:</strong></p>
            <p>Home Assistant → Einstellungen → Add-Ons → FRITZ!Portal → Konfiguration</p>
            <p>Geben Sie FRITZ!Box-Adresse, Benutzername und Passwort ein.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Sidebar
        currentPage={currentPage === 'device-detail' ? 'devices' : currentPage}
        onNavigate={(page) => { setCurrentPage(page); setSelectedDevice(null); }}
        onLogout={handleLogout}
      />
      <main className="main-content">
        {currentPage === 'dashboard' && <Dashboard sid={sid} />}
        {currentPage === 'devices' && <DeviceList sid={sid} onSelectDevice={handleSelectDevice} />}
        {currentPage === 'device-detail' && selectedDevice && (
          <DeviceDetail sid={sid} mac={selectedDevice} onBack={handleBackToList} />
        )}
        {currentPage === 'network' && <Network sid={sid} />}
        {currentPage === 'traffic' && <Traffic sid={sid} />}
        {currentPage === 'telefonie' && <Telefonie sid={sid} />}
        {currentPage === 'system' && <System sid={sid} />}
      </main>
    </div>
  );
}

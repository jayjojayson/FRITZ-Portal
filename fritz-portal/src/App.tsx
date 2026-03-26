import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DeviceList from './pages/DeviceList';
import DeviceDetail from './pages/DeviceDetail';
import Network from './pages/Network';
import Traffic from './pages/Traffic';
import Telefonie from './pages/Telefonie';
import System from './pages/System';
import { apiFetch } from '../lib/apiFetch';

type Page = 'dashboard' | 'devices' | 'device-detail' | 'network' | 'traffic' | 'telefonie' | 'system';

export default function App() {
  const [sid, setSid] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);

  // HA Add-on: Auto-Session prüfen beim Start (wenn Server mit Env-Vars konfiguriert)
  useEffect(() => {
    apiFetch('/api/fritz/auto-session')
      .then((r: Response) => r.json())
      .then((data: any) => { if (data.active && data.sid) setSid(data.sid); })
      .catch(() => {});
  }, []);

  const handleLogin = (newSid: string) => {
    setSid(newSid);
    setCurrentPage('dashboard');
  };

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
  };

  const handleSelectDevice = (mac: string) => {
    setSelectedDevice(mac);
    setCurrentPage('device-detail');
  };

  const handleBackToList = () => {
    setSelectedDevice(null);
    setCurrentPage('devices');
  };

  if (!sid) {
    return <Login onLogin={handleLogin} />;
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

import { useState } from 'react';
import { apiFetch } from '../lib/apiFetch';

interface LoginProps {
  onLogin: (sid: string) => void;
}

const STORAGE_KEY = 'fritz_portal_credentials';

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as { host: string; username: string; password: string; remember: boolean };
  } catch {}
  return null;
}

export default function Login({ onLogin }: LoginProps) {
  const saved = loadSaved();
  const [username, setUsername] = useState(saved?.username ?? '');
  const [password, setPassword] = useState(saved?.password ?? '');
  const [host, setHost] = useState(saved?.host ?? 'fritz.box');
  const [remember, setRemember] = useState(saved?.remember ?? true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await apiFetch('/api/fritz/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, username, password }),
      });
      const data = await res.json();

      if (data.success && data.sid) {
        if (remember) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ host, username, password, remember: true }));
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
        onLogin(data.sid);
      } else {
        setError(data.error || 'Anmeldung fehlgeschlagen. Bitte Zugangsdaten pr\u00fcfen.');
      }
    } catch (err) {
      setError('Verbindung fehlgeschlagen. Bitte FRITZ!Box Adresse pr\u00fcfen.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="logo">
          <div className="icon"></div>
          <h1>FRITZ!Portal</h1>
          <p>Melden Sie sich mit Ihren FRITZ!Box Zugangsdaten an</p>
        </div>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="host">FRITZ!Box Adresse</label>
            <input
              id="host"
              type="text"
              value={host}
              onChange={e => setHost(e.target.value)}
              placeholder="fritz.box"
            />
          </div>
          <div className="form-group">
            <label htmlFor="username">Benutzername</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Passwort</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
            <input
              id="remember"
              type="checkbox"
              checked={remember}
              onChange={e => setRemember(e.target.checked)}
              style={{ width: 'auto', margin: 0 }}
            />
            <label htmlFor="remember" style={{ margin: 0, cursor: 'pointer' }}>Zugangsdaten merken</label>
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Verbinden...' : 'Anmelden'}
          </button>
        </form>
      </div>
    </div>
  );
}

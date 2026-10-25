import express from 'express';
import DigestFetch from 'digest-fetch';
import mqtt from 'mqtt';
import WebSocket from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { createHash, pbkdf2Sync } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Dauerhafte Daten (Einstellungen, Geräte-Zuordnungen, „zuletzt online"): im HA-Add-on
// /data – bleibt bei Add-on-Updates erhalten. Lokal/Docker ohne /data: fritz-portal/.data
const DATA_DIR = existsSync('/data') ? '/data' : join(__dirname, '..', '.data');
try { if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true }); } catch {}

// ── Timestamps für alle Konsolenausgaben (HA-Protokoll) ──
const _log   = console.log.bind(console);
const _error = console.error.bind(console);
const _ts = () => new Date().toLocaleTimeString('de-DE', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
console.log   = (...args) => _log(`[${_ts()}]`, ...args);
console.error = (...args) => _error(`[${_ts()}]`, ...args);

// ── Debug-Logging ──
let debugLogging = process.env.DEBUG_LOGGING === 'true';
function debugLog(...args) {
  if (debugLogging) console.log('[DEBUG]', ...args);
}

// ── Rate-Limiter: data.lua max. 2 parallel + 400ms Mindestabstand, SOAP (:49000)
//    max. 6 parallel. Verhindert Session-Spam auf der Fritz!Box und stabilisiert die
//    parallele Nutzung mit der Fritz-SmartHome-Integration in HA (BUG-01/02).
// acquireDataLuaSlot() gibt einen Release-Callback zur\u00fcck \u2013 Endpunkte mit eigenem
// Timeout (z.B. Mesh) holen erst den Slot und starten *dann* ihren Timer, damit die
// Queue-Wartezeit nicht vom Timeout-Budget abgezogen wird.
const _origFetch = globalThis.fetch;
let _dataInflight = 0;
let _dataLastMs = 0;
let _soapInflight = 0;
async function acquireDataLuaSlot() {
  while (_dataInflight >= 2) await new Promise(r => setTimeout(r, 60));
  const gap = 400 - (Date.now() - _dataLastMs);
  if (gap > 0) await new Promise(r => setTimeout(r, gap));
  _dataLastMs = Date.now();
  _dataInflight++;
  debugLog(`data.lua \u2191 (${_dataInflight} aktiv)`);
  return () => { _dataInflight--; debugLog(`data.lua \u2193 (${_dataInflight} aktiv)`); };
}
async function acquireSoapSlot() {
  while (_soapInflight >= 6) await new Promise(r => setTimeout(r, 40));
  _soapInflight++;
  return () => { _soapInflight--; };
}
globalThis.fetch = async function patchedFetch(url, opts) {
  const urlStr = typeof url === 'string' ? url : (url?.href ?? String(url ?? ''));
  if (urlStr.includes('/data.lua')) {
    const release = await acquireDataLuaSlot();
    try { return await _origFetch(url, opts); } finally { release(); }
  }
  if (urlStr.includes(':49000')) {
    const release = await acquireSoapSlot();
    if (debugLogging) debugLog(`SOAP: ${urlStr.split('?')[0]}`);
    try { return await _origFetch(url, opts); } finally { release(); }
  }
  return _origFetch(url, opts);
};

// ── Zugangsdaten/Optionen lesen (überschreibt Env-Vars nicht) ──
// HA-Add-on: /data/options.json. Lokal/Docker ohne /data: fritz-portal/.data/options.json
// (gleiches Format, von Git ignoriert) – praktisch zum Testen ohne Passwort in der Shell.
const OPTIONS_FILE = existsSync('/data/options.json') ? '/data/options.json' : join(DATA_DIR, 'options.json');
// Platzhalter der lokalen Vorlage („DEIN-…") nicht als Zugangsdaten verwenden – ein
// Login-Versuch damit würde nur die Login-Sperre (BlockTime) der Box auslösen
const realOpt = (v) => (v && !/^DEIN-/.test(String(v)) ? v : '');
// Nur die Zugangsdaten neu einlesen – z. B. wenn die Datei erst nach dem Start ausgefüllt wurde
function loadCredentialOptions() {
  try {
    if (!existsSync(OPTIONS_FILE)) return;
    const raw = JSON.parse(readFileSync(OPTIONS_FILE, 'utf-8'));
    const o = { fritzbox_host: realOpt(raw.fritzbox_host), fritzbox_user: realOpt(raw.fritzbox_user), fritzbox_password: realOpt(raw.fritzbox_password) };
    if (o.fritzbox_host     && !process.env.FRITZBOX_HOST)     process.env.FRITZBOX_HOST     = o.fritzbox_host;
    if (o.fritzbox_user     && !process.env.FRITZBOX_USER)     process.env.FRITZBOX_USER     = o.fritzbox_user;
    if (o.fritzbox_password && !process.env.FRITZBOX_PASSWORD) process.env.FRITZBOX_PASSWORD = o.fritzbox_password;
  } catch (e) { console.log(`Optionen (${OPTIONS_FILE}) nicht lesbar: ${e.message}`); }
}
try {
  if (existsSync(OPTIONS_FILE)) {
    const opts = JSON.parse(readFileSync(OPTIONS_FILE, 'utf-8'));
    loadCredentialOptions();
    if (opts.ha_sensors                  !== undefined && !process.env.HA_SENSORS)                  process.env.HA_SENSORS                  = String(opts.ha_sensors);
    if (opts.ha_sensors_interval          !== undefined && !process.env.HA_SENSORS_INTERVAL)          process.env.HA_SENSORS_INTERVAL          = String(opts.ha_sensors_interval);
    if (opts.ha_sensors_traffic_interval  !== undefined && !process.env.HA_SENSORS_TRAFFIC_INTERVAL)  process.env.HA_SENSORS_TRAFFIC_INTERVAL  = String(opts.ha_sensors_traffic_interval);
    if (opts.ha_phone_sensors             !== undefined && !process.env.HA_PHONE_SENSORS)              process.env.HA_PHONE_SENSORS             = String(opts.ha_phone_sensors);
    if (opts.dashboard_card               !== undefined && !process.env.DASHBOARD_CARD)                process.env.DASHBOARD_CARD               = String(opts.dashboard_card);
    if (opts.keep_session_alive           !== undefined && !process.env.KEEP_SESSION_ALIVE)            process.env.KEEP_SESSION_ALIVE           = String(opts.keep_session_alive);
    if (opts.traffic_history_server       !== undefined && !process.env.TRAFFIC_HISTORY_SERVER)        process.env.TRAFFIC_HISTORY_SERVER       = String(opts.traffic_history_server);
    if (opts.debug_logging !== undefined) debugLogging = !!opts.debug_logging;
    console.log('HA Add-on: Fritz!Box-Optionen geladen (' + opts.fritzbox_host + ')' + (debugLogging ? ' [Debug-Logging aktiv]' : ''));
  }
} catch {}

// ── Startup-Warnung: Fritz!Box-Hostname prüfen (BUG-03/10) ──
// Gibt im Protokoll einen klaren Hinweis wenn fritz.box nicht auflösbar ist
(async () => {
  const h = process.env.FRITZBOX_HOST;
  if (!h || /^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return; // IP-Adresse: OK, kein DNS-Check
  try {
    const { lookup } = await import('node:dns/promises');
    await lookup(h);
    debugLog(`Hostname "${h}" erfolgreich aufgelöst`);
  } catch {
    console.log(`\u26a0\uFE0F  Hostname "${h}" konnte nicht aufgelöst werden! Bitte IP-Adresse (z.\u00a0B. 192.168.178.1) statt Hostname in der Add-on-Konfiguration verwenden.`);
  }
})();

const app = express();
app.use(express.json());

// Aktivitäts-Tracker: Bei jeder API-Anfrage `lastUsed` der Session bumpen.
// Wird vom Background-Collector ausgewertet – ist eine Session länger als 5 min idle
// und Keep-Session-Alive ist aus, hört der Collector auf, die FRITZ!Box zu pollen.
// Damit ist die Box wieder „frei" für die HA-eigene Fritz!SmartHome-Integration,
// sobald niemand das Portal aktiv im Browser offen hat.
const SESSION_IDLE_MS = 5 * 60 * 1000;
app.use((req, _res, next) => {
  if (req.path && req.path.startsWith('/api')) {
    const sid = req.headers['x-fritz-sid'];
    const session = sid ? sessions.get(sid) : null;
    if (session) session.lastUsed = Date.now();
  }
  next();
});

// Dashboard-Card (Lovelace) – auch direkt abrufbar, z. B. für Docker-Standalone-Nutzer,
// die sie manuell nach /config/www/ kopieren möchten.
const CARD_FILE = join(__dirname, '..', 'card', 'fritz-portal-card.js');
app.get('/card/fritz-portal-card.js', (req, res) => {
  if (!existsSync(CARD_FILE)) return res.status(404).end();
  res.type('application/javascript').sendFile(CARD_FILE);
});

// Serve static frontend files
const distPath = join(__dirname, '..', 'dist');
const staticPath = existsSync(distPath) ? distPath : null;

if (staticPath) {
  app.use(express.static(staticPath));
  app.get('*', (req, res, next) => {
    if (!req.path.startsWith('/api')) {
      let ingressPath = '';
      const rawIngressHeader = req.headers['x-ingress-path'];
      if (rawIngressHeader) {
        ingressPath = rawIngressHeader.replace(/[^a-zA-Z0-9/_-]/g, '');
      }
      if (ingressPath) {
        try {
          let html = readFileSync(join(staticPath, 'index.html'), 'utf-8');
          html = html.replace('<head>', `<head><script>window.__INGRESS_PATH__="${ingressPath}";</script>`);
          return res.send(html);
        } catch {}
      }
      res.sendFile(join(staticPath, 'index.html'));
    } else {
      next();
    }
  });
}

const sessions = new Map();
const AUTO_SID = 'auto-session-ha-addon';
const APP_VERSION = (() => {
  try { return JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8')).version || '0'; } catch { return '0'; }
})();

// ── Caching ──
const cache = new Map();
const CACHE_TTL = 10000; // 10 Sekunden

// ── Cached Web-SID (vermeidet langsame Login-Requests bei jedem Aufruf) ──
let cachedWebSid = null;
let cachedWebSidTime = 0;
const WEB_SID_TTL = 300000;      // 5 Minuten für gültige SID
const WEB_SID_FAIL_TTL = 30000;  // 30 Sekunden Retry bei fehlgeschlagenem Login

async function getCachedWebSid(session) {
  const now = Date.now();
  // Gültige SID: 5 Minuten ohne Rückfrage verwenden
  if (cachedWebSid && now - cachedWebSidTime < WEB_SID_TTL) return cachedWebSid;
  // Fehlgeschlagene SID: erst nach 30 Sekunden erneut versuchen
  if (cachedWebSid === '' && now - cachedWebSidTime < WEB_SID_FAIL_TTL) return cachedWebSid;
  // Danach die bestehende SID prüfen und weiterverwenden (bleibt bei Nutzung gültig),
  // statt alle 5 Minuten eine neue Session auf der Box anzulegen
  if (isValidSid(cachedWebSid) && await checkWebSid(session.host, cachedWebSid)) {
    cachedWebSidTime = Date.now();
    return cachedWebSid;
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    cachedWebSid = await Promise.race([
      getWebSid(session.host, session.username, session.password),
      new Promise((_, reject) => ctrl.signal.addEventListener('abort', () => reject(new Error('Timeout'))))
    ]);
    clearTimeout(timer);
  } catch {
    cachedWebSid = '';
  }
  cachedWebSidTime = Date.now();
  return cachedWebSid;
}

// ── Letzter bekannter Wert für HA-Sensoren (verhindert Null-Sprünge bei abgelaufenem Cache) ──
const lastKnownFast    = { cpu: 0, ram: 0, cpu_temp: 0, online: 0, free_ips: 0, activeHosts: [] };
const lastKnownTraffic = {};

// MAC → Unix-Timestamp (Sek.), wann Gerät zuletzt als aktiv gesehen wurde. Die
// TR-064-Host-Liste enthält keinen solchen Zeitstempel – wir führen ihn selbst und
// speichern ihn in /data, damit „zuletzt online" einen Add-on-Neustart übersteht.
// knownMacs: alle je gesehenen Geräte → Erkennung neuer Geräte (HA-Event).
const HOSTS_STATE_FILE = join(DATA_DIR, 'fritz-portal-hosts.json');
const lastSeenMap = new Map();
const knownMacs = new Set();
let knownMacsInitialized = false;
try {
  if (existsSync(HOSTS_STATE_FILE)) {
    const st = JSON.parse(readFileSync(HOSTS_STATE_FILE, 'utf-8'));
    for (const [mac, ts] of Object.entries(st.lastSeen || {})) lastSeenMap.set(mac, ts);
    for (const mac of st.known || []) knownMacs.add(mac);
    knownMacsInitialized = knownMacs.size > 0;
  }
} catch {}
function saveHostsState() {
  try {
    writeFileSync(HOSTS_STATE_FILE, JSON.stringify({ lastSeen: Object.fromEntries(lastSeenMap), known: [...knownMacs] }));
  } catch {}
}
setInterval(saveHostsState, 5 * 60 * 1000);
// Beim Stoppen/Neustart des Add-ons (Supervisor sendet SIGTERM) noch einmal sichern
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { saveHostsState(); process.exit(0); });

// Neue Geräte erkennen und als HA-Event melden (fritzportal_new_device). Beim allerersten
// Lauf wird nur die Ausgangsliste gemerkt – sonst käme ein Event für jedes Gerät.
function trackNewHosts(hosts) {
  const fresh = [];
  for (const h of hosts) {
    if (!h.mac || knownMacs.has(h.mac)) continue;
    knownMacs.add(h.mac);
    if (knownMacsInitialized) fresh.push(h);
  }
  knownMacsInitialized = true;
  for (const h of fresh) {
    console.log(`Neues Gerät im Heimnetz: ${h.name || '?'} (${h.mac}, ${h.ip || 'keine IP'})`);
    fireHaEvent('fritzportal_new_device', {
      mac: h.mac, ip: h.ip || '', name: h.name || '', interface: h.interface || '', guest: !!h.guest,
    });
  }
}

// HA-Event über die Core-REST-API auslösen (nutzbar als Automations-Trigger)
async function fireHaEvent(type, data) {
  if (!HA_TOKEN) return;
  try {
    await fetch(`${HA_API}/events/${type}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${HA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch (e) { debugLog(`HA-Event ${type} fehlgeschlagen: ${e.message}`); }
}

// ── Traffic history für Dashboard-Chart (server-seitig, alle 10 Sekunden) ──
const trafficHistory = { down: [], up: [] };

// ── Last-known Total-Byte-Counter pro Session ──
// Wird genutzt, um auf Cable-/5G-Boxen (6660/6690/6860 5G, …) die Live-Rate aus
// dem Delta der monoton steigenden TotalBytes-Counter zu derivieren – diese Boxen
// liefern weder `sync_groups` aus data.lua?page=netMon noch sinnvolle
// `NewByteReceiveRate`/`NewByteSendRate`-Werte aus GetAddonInfos.
const lastTotalBytes = new Map(); // sid -> { totalDown, totalUp, ts }

// ── Eco-Stats history für Dashboard-Popovers (CPU/RAM/Temp, 1h, alle 10 Sekunden) ──
const ecoHistory = { cpu: [], ram: [], temp: [] };

// "Load average" Stil: 1/5/15-Minuten-Mittel der CPU-Auslastung
// CPU-% / 100 → 0..1+ analog zum Unix-Loadavg-Display.
function computeLoadAvg() {
  const now = Date.now();
  const windows = [60_000, 5 * 60_000, 15 * 60_000];
  const calc = (windowMs) => {
    const cutoff = now - windowMs;
    const pts = ecoHistory.cpu.filter(p => p.time >= cutoff);
    if (pts.length === 0) return 0;
    const avg = pts.reduce((s, p) => s + p.value, 0) / pts.length;
    return Math.round(avg) / 100;
  };
  return { load1: calc(windows[0]), load5: calc(windows[1]), load15: calc(windows[2]) };
}

// CPU/RAM/Temperatur aus einer data.lua-Antwort (Seiten home/eco/ecoStat/…) lesen.
// Je nach Modell als Zeitreihe (7590, 6591) oder Direktwert (7530 und ältere).
function parseEcoData(d) {
  const last = (arr) => (Array.isArray(arr) && arr.length ? arr[arr.length - 1] : undefined);
  let cpu      = parseInt(last(d.cpuutil?.series?.[0] || d.cpuUtilization?.series?.[0]) ?? '0', 10) || 0;
  let ram      = Math.round(last(d.ramusage?.series?.[2] || d.ramusage?.series?.[0] || d.ramUsage?.series?.[0]) ?? 0) || 0;
  let cpu_temp = parseInt(last(d.cputemp?.series?.[0] || d.cpuTemp?.series?.[0]) ?? '0', 10) || 0;
  if (!cpu)      cpu      = parseInt(d.cpu  || d.cpuload  || d.cpu_util || d.cpuUtil || d.stat?.cpu || '0', 10) || 0;
  if (!ram)      ram      = parseInt(d.ram  || d.ramutil  || d.ram_util || d.ramUtil || d.memory || d.stat?.ram || d.memUsage || '0', 10) || 0;
  if (!cpu_temp) cpu_temp = parseInt(d.temp || d.cpu_temp || d.cputemp  || d.cpuTemp || d.temperature || d.stat?.temp || '0', 10) || 0;
  return { cpu, ram, cpu_temp };
}

// CPU/RAM/Temperatur von der Box holen (data.lua, mehrere Seiten je nach Modell)
async function fetchEcoStats(session, pages = ['home', 'eco', 'ecoStat', 'overview', 'system', 'sysStat']) {
  const webSid = await getCachedWebSid(session);
  if (!webSid) return null;
  for (const page of pages) {
    try {
      const params = new URLSearchParams({ xhr: '1', sid: webSid, lang: 'de', page, xhrId: 'all' });
      const r = await fetch(`http://${session.host}/data.lua`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const text = await r.text();
      if (!text.trim().startsWith('{')) continue;
      const eco = parseEcoData(JSON.parse(text)?.data || {});
      if (eco.cpu > 0 || eco.ram > 0 || eco.cpu_temp > 0) {
        setCached('eco-stats', eco); // HA-Push liest von dort
        return eco;
      }
    } catch {}
  }
  return null;
}

async function collectEcoHistory(session) {
  const eco = await fetchEcoStats(session, ['home', 'eco', 'ecoStat', 'overview']);
  if (!eco) return;
  const now = Date.now();
  const cutoff = now - 3 * 60 * 60 * 1000; // 3 Stunden
  ecoHistory.cpu.push({ time: now, value: eco.cpu });
  ecoHistory.ram.push({ time: now, value: eco.ram });
  ecoHistory.temp.push({ time: now, value: eco.cpu_temp });
  ecoHistory.cpu  = ecoHistory.cpu.filter(p => p.time > cutoff);
  ecoHistory.ram  = ecoHistory.ram.filter(p => p.time > cutoff);
  ecoHistory.temp = ecoHistory.temp.filter(p => p.time > cutoff);
}

// GetAddonInfos (IGD, Fallback dslforum) – Live-Raten und Gesamt-Bytes seit Verbindungsaufbau
async function getAddonInfos(session) {
  let a = await soapRequest(session.host, 'urn:schemas-upnp-org:service:WANCommonInterfaceConfig:1', 'GetAddonInfos', session.username, session.password, session.controlUrls).catch(() => ({}));
  if (!a?.NewByteSendRate && !a?.NewTotalBytesReceived && !a?.NewX_AVM_DE_TotalBytesReceived64) {
    a = await soapRequest(session.host, 'urn:dslforum-org:service:WANCommonInterfaceConfig:1', 'GetAddonInfos', session.username, session.password, session.controlUrls).catch(() => ({}));
  }
  return a || {};
}

// Aktuelle Internet-Datenrate (Bytes/s) ermitteln – Kaskade:
//  1. data.lua?page=netMon: dieselbe Quelle wie der Live-Graph der Box-Oberfläche
//  2. TR-064 GetCommonLinkProperties → X_AVM-DE_Down/UpstreamCurrentUtilization: offizielle
//     Liste der letzten Raten, funktioniert OHNE Web-Login (z. B. wenn data.lua scheitert)
//  3. GetAddonInfos NewByteReceiveRate/NewByteSendRate
//  4. Delta der TotalBytes-Counter zwischen zwei Abrufen (Cable-/5G-Boxen 6660/6690/6860)
// Liefert zusätzlich den Verlauf (falls die Quelle einen hat) und die GetAddonInfos-
// Antwort (Gesamt-Bytes), damit Aufrufer sie nicht erneut abfragen müssen.
async function getLiveRates(session, key) {
  let downBps = 0, upBps = 0, dsHistory = [], usHistory = [], addon = null;
  try {
    const webSid = await getCachedWebSid(session);
    if (webSid) {
      const params = new URLSearchParams({ xhr: '1', sid: webSid, lang: 'de', page: 'netMon', xhrId: 'all' });
      const r = await fetch(`http://${session.host}/data.lua`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const text = await r.text();
      if (text.trim().startsWith('{')) {
        const group = JSON.parse(text)?.data?.sync_groups?.[0];
        dsHistory = (group?.ds_bps_curr || []).map(Number);
        usHistory = (group?.us_default_bps_curr || []).map(Number);
        downBps = dsHistory[dsHistory.length - 1] || 0;
        upBps   = usHistory[usHistory.length - 1] || 0;
      }
    }
  } catch {}
  if (!downBps && !upBps) {
    try {
      const link = await soapRequest(session.host, 'urn:dslforum-org:service:WANCommonInterfaceConfig:1', 'GetCommonLinkProperties', session.username, session.password, session.controlUrls);
      const list = (v) => String(v || '').split(',').map(x => parseInt(x, 10)).filter(Number.isFinite);
      const ds = list(link?.['NewX_AVM-DE_DownstreamCurrentUtilization']);
      const us = list(link?.['NewX_AVM-DE_UpstreamCurrentUtilization']);
      if (ds.length || us.length) {
        dsHistory = ds; usHistory = us;
        downBps = ds[ds.length - 1] || 0;
        upBps   = us[us.length - 1] || 0;
      }
    } catch {}
  }
  if (!downBps && !upBps) {
    addon = await getAddonInfos(session);
    downBps = parseInt(addon.NewByteReceiveRate || '0', 10) || 0;
    upBps   = parseInt(addon.NewByteSendRate    || '0', 10) || 0;
    if (!downBps && !upBps) {
      const totalDown = parseInt(addon.NewX_AVM_DE_TotalBytesReceived64 || addon.NewTotalBytesReceived || '0', 10) || 0;
      const totalUp   = parseInt(addon.NewX_AVM_DE_TotalBytesSent64     || addon.NewTotalBytesSent     || '0', 10) || 0;
      const prev = lastTotalBytes.get(key);
      const now  = Date.now();
      if (prev && totalDown >= prev.totalDown && totalUp >= prev.totalUp) {
        const dt = (now - prev.ts) / 1000;
        if (dt > 0 && dt < 600) {
          downBps = Math.round((totalDown - prev.totalDown) / dt);
          upBps   = Math.round((totalUp   - prev.totalUp)   / dt);
        }
      }
      if (totalDown > 0 || totalUp > 0) lastTotalBytes.set(key, { totalDown, totalUp, ts: now });
    }
  }
  return { downBps, upBps, dsHistory, usHistory, addon };
}

setInterval(async () => {
  // Nur EINE Session pro Tick abfragen – bei mehreren offenen Sessions entstanden sonst
  // doppelte Punkte im Traffic-Verlauf und doppelte Last auf der Box
  for (const [sid, session] of sessions) {
    // Idle-Skip: Wenn niemand das Portal aktiv benutzt UND keep_session_alive aus ist,
    // hören wir auf, die FRITZ!Box zu pollen – wichtig damit die HA-eigene
    // Fritz!SmartHome-Integration den AHA-Endpoint und data.lua ohne Konkurrenz nutzen
    // kann. Ein neuer API-Call vom Browser hebt den Idle-Status sofort wieder auf
    // (lastUsed wird in der express-Middleware aktualisiert).
    const idle = !keepSessionAlive && (Date.now() - (session.lastUsed || 0) > SESSION_IDLE_MS);
    // Ausnahme: Bei `trafficHistoryServer` sammeln wir im Idle weiterhin NUR den
    // Traffic-Verlauf (leichter netMon-/AddonInfos-Call), damit das Dashboard-Chart
    // lückenlos bleibt. Der schwerere Eco-/Hosts-Teil bleibt im Idle ausgesetzt.
    if (idle && !trafficHistoryServer) continue;
    try {
      const { downBps, upBps } = await getLiveRates(session, sid);
      const now = Date.now();
      trafficHistory.down.push({ time: now, value: downBps });
      trafficHistory.up.push({ time: now, value: upBps });
      const cutoff = now - 30 * 60 * 1000;
      trafficHistory.down = trafficHistory.down.filter(p => p.time > cutoff);
      trafficHistory.up = trafficHistory.up.filter(p => p.time > cutoff);
      // Auch in API-Cache schreiben – HA-Push liest von dort
      const existingNet = getCached('network-stats', 120000) || {};
      setCached('network-stats', { ...existingNet, currentDown: downBps, currentUp: upBps });
    } catch {}
    // Eco-/Hosts-Historie nur im Nicht-Idle-Betrieb (im Idle nur Traffic, s. o.)
    if (!idle) { try { await collectEcoHistory(session); } catch {} }
    break;
  }
}, 30000); // 30s-Tick (vorher 15s) – halbiert die FritzBox-Last des Background-Collectors,
           // ohne dass der Dashboard-Chart spürbar weniger Detail bietet (60 Punkte → 30 min Verlauf).

// Hinweis: Die TTL wird beim *Read* übergeben (nicht beim Write). setCached's drittes
// Argument wird hier ignoriert. Wer einen Eintrag länger als CACHE_TTL halten will,
// muss `getCached(key, gewünschteTtl)` aufrufen.
// Abgelaufene Einträge werden beim Lesen NICHT gelöscht: verschiedene Aufrufer lesen
// denselben Schlüssel mit unterschiedlicher TTL (z. B. device-info: Endpoint 10 s,
// Firmware-Check/MQTT 1 h). Vorher löschte der Leser mit der kürzesten TTL den Eintrag
// für alle anderen. Aufgeräumt wird stattdessen periodisch (s. u.).
function getCached(key, ttl = CACHE_TTL) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < ttl) return entry.data;
  return null;
}
setInterval(() => {
  const cutoff = Date.now() - 2 * 3600 * 1000; // länger als die größte genutzte TTL (1 h)
  for (const [key, entry] of cache) if (entry.ts < cutoff) cache.delete(key);
}, 10 * 60 * 1000);

function setCached(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

// ── Helpers ──

function parseXml(xml) {
  const result = {};
  // [\w-]: AVM-Felder enthalten Bindestriche (NewX_AVM-DE_…) – mit \w allein gingen
  // u. a. HostListPath, MeshListPath, FrequencyBand und LastActivity verloren
  const regex = /<([\w-]+)>([^<]*)<\/\1>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    result[match[1]] = match[2];
  }
  return result;
}

async function soapRequest(host, service, action, username, password, controlUrls, params = {}) {
  const paramsXml = Object.entries(params)
    .map(([k, v]) => `      <${k}>${v}</${k}>`)
    .join('\n');
  const body = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:${action} xmlns:u="${service}">
${paramsXml}
    </u:${action}>
  </s:Body>
</s:Envelope>`;

  const controlUrl = controlUrls?.[service];
  if (!controlUrl) throw new Error(`Kein Control-URL für Service: ${service}`);
  const url = `http://${host}:49000${controlUrl}`;
  const client = new DigestFetch(username, password);
  const resp = await client.fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset="utf-8"',
      'SOAPACTION': `"${service}#${action}"`,
    },
    body,
  });
  const text = await resp.text();
  if (text.includes('<s:Fault>') || text.includes('<faultcode>')) {
    const errorCode = text.match(/<errorCode>([^<]*)<\/errorCode>/)?.[1] || '';
    const errorDesc = text.match(/<errorDescription>([^<]*)<\/errorDescription>/)?.[1] || '';
    const faultStr = text.match(/<faultstring>([^<]*)<\/faultstring>/)?.[1] || 'SOAP Fault';
    throw new Error(errorCode ? `${faultStr} ${errorCode}: ${errorDesc}` : faultStr);
  }
  return parseXml(text);
}

async function discoverControlUrls(host) {
  const controlUrls = {};
  async function parseDescXml(url) {
    try {
      const descRes = await fetch(url);
      const descXml = await descRes.text();
      const serviceRegex = /<service>([\s\S]*?)<\/service>/g;
      let m;
      while ((m = serviceRegex.exec(descXml)) !== null) {
        const block = m[1];
        const type = block.match(/<serviceType>([^<]*)<\/serviceType>/)?.[1] || '';
        const ctrlUrl = block.match(/<controlURL>([^<]*)<\/controlURL>/)?.[1] || '';
        if (type && ctrlUrl) controlUrls[type] = ctrlUrl;
      }
    } catch {}
  }
  await Promise.race([
    Promise.all([
      parseDescXml(`http://${host}:49000/tr64desc.xml`),
      parseDescXml(`http://${host}:49000/igddesc.xml`),
    ]),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
  ]).catch(() => {});

  const fallbacks = {
    'urn:dslforum-org:service:DeviceInfo:1': '/upnp/control/deviceinfo',
    'urn:dslforum-org:service:DeviceConfig:1': '/upnp/control/deviceconfig',
    'urn:dslforum-org:service:LANHostConfigManagement:1': '/upnp/control/lanhostconfigmgm',
    'urn:dslforum-org:service:Hosts:1': '/upnp/control/hosts',
    'urn:dslforum-org:service:WANIPConnection:1': '/upnp/control/wanipconnection',
    'urn:dslforum-org:service:WANPPPConnection:1': '/upnp/control/wanpppconn1',
    'urn:dslforum-org:service:WANCommonInterfaceConfig:1': '/upnp/control/WANCommonIFC1',
    'urn:schemas-upnp-org:service:WANCommonInterfaceConfig:1': '/igdupnp/control/WANCommonIFC1',
    'urn:dslforum-org:service:X_AVM-DE_HostFilter:1': '/upnp/control/x_hostfilter',
    'urn:dslforum-org:service:X_AVM-DE_OnTel:1': '/upnp/control/x_contact',
    'urn:dslforum-org:service:X_AVM-DE_Dect:1': '/upnp/control/x_dect',
    'urn:dslforum-org:service:X_AVM-DE_VoIP:1': '/upnp/control/x_voip',
    'urn:dslforum-org:service:WLANConfiguration:1': '/upnp/control/wlanconfig',
    'urn:dslforum-org:service:WLANConfiguration:2': '/upnp/control/wlanconfig2',
    'urn:dslforum-org:service:WLANConfiguration:3': '/upnp/control/wlanconfig3',
    // Tri-Band-Boxen (z. B. 5690 Pro: 2.4 + 5 + 6 GHz + Gast) haben eine 4. Konfiguration
    'urn:dslforum-org:service:WLANConfiguration:4': '/upnp/control/wlanconfig4',
    // IGD-Variante der WAN-Dienste – funktioniert ohne TR-064-Authentifizierung und
    // dient als letzter Fallback wenn die dslforum-Dienste scheitern (Issue #33)
    'urn:schemas-upnp-org:service:WANIPConnection:1': '/igdupnp/control/WANIPConn1',
    // Welcher WAN-Dienst ist aktiv (PPP vs. IP)? – Issue #39
    'urn:dslforum-org:service:Layer3Forwarding:1': '/upnp/control/layer3forwarding',
    // DSL-Leitungswerte (Sync-Rate, Störabstand, Dämpfung)
    'urn:dslforum-org:service:WANDSLInterfaceConfig:1': '/upnp/control/wandslifconfig1',
    // Firmware-Update-Prüfung
    'urn:dslforum-org:service:UserInterface:1': '/upnp/control/userif',
  };
  for (const [svc, url] of Object.entries(fallbacks)) {
    if (!controlUrls[svc]) controlUrls[svc] = url;
  }
  return controlUrls;
}

// MD5-Response nach AVM-Spezifikation („Session-ID", Technical Note): UTF-16LE über
// "<challenge>-<passwort>", Zeichen mit Codepoint > 255 werden als "." kodiert
// (sonst scheiterte der Login z. B. bei einem „€" im Passwort).
function md5LoginResponse(challenge, password) {
  const safe = Array.from(`${challenge}-${password}`).map(c => (c.codePointAt(0) > 255 ? '.' : c)).join('');
  return `${challenge}-${createHash('md5').update(Buffer.from(safe, 'utf16le')).digest('hex')}`;
}

// PBKDF2-Response (FRITZ!OS 7.24+). Challenge = 2$<iter1>$<salt1>$<iter2>$<salt2>
function pbkdf2LoginResponse(challenge, password) {
  const [, iter1, salt1, iter2, salt2] = challenge.split('$');
  const hash1 = pbkdf2Sync(Buffer.from(password, 'utf8'), Buffer.from(salt1, 'hex'), parseInt(iter1, 10), 32, 'sha256');
  const hash2 = pbkdf2Sync(hash1, Buffer.from(salt2, 'hex'), parseInt(iter2, 10), 32, 'sha256');
  return `${salt2}$${hash2.toString('hex')}`;
}

const isValidSid = (sid) => !!sid && /^[0-9a-f]{16}$/i.test(sid) && sid !== '0000000000000000';
// Sperrzeit nach Fehlanmeldungen (BlockTime) – solange keine weiteren Versuche
let webLoginBlockedUntil = 0;

async function getWebSid(host, username, password) {
  // Laut AVM-Spezifikation gehen GET (Challenge) UND POST (Response) an
  // login_sid.lua?version=2 – ohne den Parameter wertet die Box die Antwort als MD5 aus,
  // eine PBKDF2-Antwort schlägt dann fehl (Issue #31: FRITZ!OS 8.x, 5690 Pro / 7690).
  const loginUrl = `http://${host}/login_sid.lua?version=2`;
  if (Date.now() < webLoginBlockedUntil) return '';
  try {
    const resp = await fetch(loginUrl);
    const text = await resp.text();
    const post = async (response) => {
      const r = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username, response }).toString(),
      });
      const xml = await r.text();
      const sid = xml.match(/<SID>([^<]+)<\/SID>/)?.[1];
      if (isValidSid(sid)) return sid;
      // Falsche Zugangsdaten: die Box verlängert die Sperrzeit mit jedem Fehlversuch
      const block = parseInt(xml.match(/<BlockTime>(\d+)<\/BlockTime>/)?.[1] || '0', 10);
      if (block > 0) webLoginBlockedUntil = Date.now() + block * 1000;
      console.log(`Web-Login fehlgeschlagen (Benutzer/Passwort oder fehlende Berechtigung?)${block ? ` – Box sperrt weitere Versuche für ${block} s` : ''}`);
      return '';
    };

    // XML-Antwort (alle aktuellen FRITZ!OS-Versionen)
    if (text.includes('<SID>') || text.includes('<Challenge>')) {
      const sid = text.match(/<SID>([^<]+)<\/SID>/)?.[1];
      if (isValidSid(sid)) return sid; // Box ohne Passwortschutz
      const challenge = text.match(/<Challenge>([^<]+)<\/Challenge>/)?.[1];
      if (!challenge) return '';
      const block = parseInt(text.match(/<BlockTime>(\d+)<\/BlockTime>/)?.[1] || '0', 10);
      if (block > 10) { webLoginBlockedUntil = Date.now() + block * 1000; return ''; }
      if (block > 0) await new Promise(r => setTimeout(r, block * 1000));
      return await post(challenge.startsWith('2$') ? pbkdf2LoginResponse(challenge, password) : md5LoginResponse(challenge, password));
    }

    // Sehr alte FRITZ!OS-Versionen (z. B. ältere Cable-Firmware): Challenge im HTML/JS
    const htmlChallenge = text.match(/var challenge\s*=\s*['"]([^'"]+)['"]/)?.[1];
    if (htmlChallenge) return await post(md5LoginResponse(htmlChallenge, password));

    // Fallback: data.lua ohne SID testen
    try {
      const testR = await fetch(`http://${host}/data.lua`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ xhr: '1', lang: 'de', page: 'netCnt', xhrId: 'all' }).toString(),
      });
      const testText = await testR.text();
      if (testText.trim().startsWith('{') || testText.includes('const data')) {
        return 'no-auth-needed';
      }
    } catch {}

    return '';
  } catch (err) {
    console.error('getWebSid error:', err.message);
    return '';
  }
}

// Ist eine vorhandene SID noch gültig? (login_sid.lua?version=2&sid=… liefert dieselbe
// SID zurück und verlängert sie – AVM empfiehlt eine SID pro Box statt ständig neuer)
async function checkWebSid(host, sid) {
  try {
    const r = await fetch(`http://${host}/login_sid.lua?version=2&sid=${encodeURIComponent(sid)}`);
    return (await r.text()).match(/<SID>([^<]+)<\/SID>/)?.[1] === sid;
  } catch { return false; }
}

// ── AHA-HTTP: Geräteliste als XML parsen (SmartHome / DECT Smart Devices) ──
// SmartHome-Geräteliste deduplizieren. AVM exportiert manche Geräte (z. B. RolloTron
// DECT) als zwei Einträge mit gleicher AIN: Hauptgerät plus virtuelles Sub-Device für
// einzelne Funktionen. Ohne Dedup erscheint der Rolladen doppelt im Frontend.
// Issue #32: Sub-Units tragen die Basis-AIN mit Suffix („13077 0069166-1") – z. B.
// FRITZ!Smart Energy 250. Für den Dedup-Key wird das Unit-Suffix entfernt, damit
// Hauptgerät + Sub-Unit zu einem Eintrag verschmelzen (so zeigt es auch die Fritz-UI).
function dedupSmartHomeDevices(devices) {
  if (!Array.isArray(devices) || devices.length === 0) return devices;
  const byKey = new Map();
  for (const d of devices) {
    const rawId = String(d.identifier || d.ain || d.id || '').trim();
    const baseId = rawId.replace(/-\d+$/, ''); // Unit-Suffix „-1" abschneiden
    const key = (baseId || String(d.name || '')).replace(/\s+/g, '').toLowerCase();
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) { byKey.set(key, d); continue; }
    // Bei Mehrfachvorkommen: Felder beider Einträge mergen, höchstes functionbitmask
    // gewinnt – das deckt am meisten Funktionen ab.
    const merged = { ...existing };
    for (const [k, v] of Object.entries(d)) {
      if (merged[k] === undefined || merged[k] === '' || merged[k] === 0) merged[k] = v;
    }
    const existingMask = parseInt(existing.functionbitmask || '0', 10) || 0;
    const newMask      = parseInt(d.functionbitmask        || '0', 10) || 0;
    merged.functionbitmask = Math.max(existingMask, newMask);
    // Generischen HAN-FUN-Basisnamen durch den echten Unit-Namen ersetzen
    if (d.name && (!merged.name || /^han-?fun/i.test(String(merged.name).trim()))) merged.name = d.name;
    byKey.set(key, merged);
  }
  return Array.from(byKey.values());
}

function parseAhaDeviceList(xml) {
  const devices = [];
  const deviceRegex = /<device\s([^>]*)>([\s\S]*?)<\/device>/g;
  let dm;
  while ((dm = deviceRegex.exec(xml)) !== null) {
    const attrs = dm[1];
    const body = dm[2];
    const get = (tag) => body.match(new RegExp(`<${tag}>([^<]*)<\/${tag}>`))?.[1] ?? '';
    const device = {
      identifier: attrs.match(/identifier="([^"]*)"/)?.[1] || '',
      id: attrs.match(/\bid="([^"]*)"/)?.[1] || '',
      functionbitmask: parseInt(attrs.match(/functionbitmask="([^"]*)"/)?.[1] || '0', 10),
      productname: attrs.match(/productname="([^"]*)"/)?.[1] || '',
      manufacturer: attrs.match(/manufacturer="([^"]*)"/)?.[1] || '',
      firmware: attrs.match(/fwversion="([^"]*)"/)?.[1] || '',
      present: get('present'),
      name: get('name'),
    };
    const tempBlock = body.match(/<temperature>([\s\S]*?)<\/temperature>/);
    if (tempBlock) {
      const celsius = parseInt(tempBlock[1].match(/<celsius>([^<]*)<\/celsius>/)?.[1] || '', 10);
      const offset  = parseInt(tempBlock[1].match(/<offset>([^<]*)<\/offset>/)?.[1]  || '0', 10);
      if (!isNaN(celsius)) device.temperature = celsius + offset; // in 0.1 °C
    }
    const switchBlock = body.match(/<switch>([\s\S]*?)<\/switch>/);
    if (switchBlock) device.switch_state = switchBlock[1].match(/<state>([^<]*)<\/state>/)?.[1] || '';
    const powerBlock = body.match(/<powermeter>([\s\S]*?)<\/powermeter>/);
    if (powerBlock) {
      device.power   = parseInt(powerBlock[1].match(/<power>([^<]*)<\/power>/)?.[1]     || '0', 10) || 0; // 0.001 W
      device.energy  = parseInt(powerBlock[1].match(/<energy>([^<]*)<\/energy>/)?.[1]   || '0', 10) || 0; // Wh
      device.voltage = parseInt(powerBlock[1].match(/<voltage>([^<]*)<\/voltage>/)?.[1] || '0', 10) || 0; // 0.001 V
    }
    const hkrBlock = body.match(/<hkr>([\s\S]*?)<\/hkr>/);
    if (hkrBlock) {
      device.tist  = parseInt(hkrBlock[1].match(/<tist>([^<]*)<\/tist>/)?.[1]   || '0', 10) || 0; // Ist-Temp
      device.tsoll = parseInt(hkrBlock[1].match(/<tsoll>([^<]*)<\/tsoll>/)?.[1] || '0', 10) || 0; // Soll-Temp
      // AHA: 16–56 = 8–28 °C in 0,5-°C-Schritten; 253/254 = aus/an
      if (device.tsoll >= 16 && device.tsoll <= 56) device.tsoll_celsius = device.tsoll / 2;
    }
    const battery = parseInt(get('battery'), 10);
    if (Number.isFinite(battery)) device.battery = battery;
    if (get('batterylow') === '1') device.batteryLow = true;
    const humidity = parseInt(body.match(/<rel_humidity>([^<]*)<\/rel_humidity>/)?.[1] ?? '', 10);
    if (Number.isFinite(humidity)) device.humidity = humidity;
    devices.push(device);
  }
  return dedupSmartHomeDevices(devices);
}

// Einfacher Tag-Parser für AVM-Listen-XML (Host-Liste). parseXml() kann keine
// Bindestriche in Tag-Namen (X_AVM-DE_…), daher hier eine eigene Variante.
function parseXmlItems(xml, itemTag) {
  const items = [];
  const itemRe = new RegExp(`<${itemTag}>([\\s\\S]*?)<\\/${itemTag}>`, 'g');
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const obj = {};
    const tagRe = /<([\w-]+)>([^<]*)<\/\1>/g;
    let t;
    while ((t = tagRe.exec(m[1])) !== null) obj[t[1]] = decodeXmlEntities(t[2]);
    items.push(obj);
  }
  return items;
}

// Komplette Host-Liste in EINEM Request über die offizielle TR-064-Aktion
// `Hosts:1#X_AVM-DE_GetHostListPath` (FRITZ!OS 7.10+). Die Box liefert einen Pfad zu
// einer XML-Datei mit allen Hosts inkl. Zusatzinfos (Gast, VPN, Internetzugang,
// Port, Geschwindigkeit, Update verfügbar …). Spart gegenüber dem Einzelabruf per
// GetGenericHostEntry ~N SOAP-Requests – bei 90 Geräten ein großer Unterschied für
// die FRITZ!Box-CPU. Gibt null zurück, wenn die Aktion nicht unterstützt wird.
async function getHostsViaHostList(host, username, password, controlUrls) {
  try {
    const r = await soapRequest(host, 'urn:dslforum-org:service:Hosts:1', 'X_AVM-DE_GetHostListPath', username, password, controlUrls);
    const path = r?.['NewX_AVM-DE_HostListPath'];
    if (!path) return null;
    const res = await fetch(`http://${host}:49000${path.startsWith('/') ? '' : '/'}${path}`);
    if (!res.ok) return null;
    const items = parseXmlItems(await res.text(), 'Item');
    if (items.length === 0) return null;
    const flag = (v) => v === '1' || v === 'true';
    const hosts = [];
    for (const e of items) {
      const mac = String(e.MACAddress || '').replace(/-/g, ':').toLowerCase();
      // VPN-Gegenstellen ohne MAC trotzdem aufnehmen – IP dient dann als Schlüssel
      if (!mac && !e.IPAddress) continue;
      const active = flag(e.Active);
      if (active && mac) lastSeenMap.set(mac, Math.floor(Date.now() / 1000));
      const lastActivity = e['X_AVM-DE_LastActivity'] || (lastSeenMap.has(mac) ? String(lastSeenMap.get(mac)) : '');
      hosts.push({
        mac,
        ip: e.IPAddress || '',
        active,
        name: e.HostName || e['X_AVM-DE_FriendlyName'] || e.InterfaceType || '',
        interface: e.InterfaceType || '',
        addressSource: e.AddressSource || '',
        lastActivity,
        // Zusatzinfos aus der Host-Liste (nur hier verfügbar, nicht per GetGenericHostEntry)
        guest:           flag(e['X_AVM-DE_Guest']),
        vpn:             flag(e['X_AVM-DE_VPN']),
        wanAccess:       e['X_AVM-DE_WANAccess'] || '',       // granted | denied | error
        blocked:         flag(e['X_AVM-DE_Disallow']),
        updateAvailable: flag(e['X_AVM-DE_UpdateAvailable']),
        meshable:        flag(e['X_AVM-DE_IsMeshable']),
        model:           e['X_AVM-DE_Model'] || '',
        port:            e['X_AVM-DE_Port'] || '',
        speed:           parseInt(e['X_AVM-DE_Speed'] || '0', 10) || 0, // Mbit/s
        // Ab FRITZ!OS 8.x (Spezifikation 2024–2026): Geräteklasse, Echtzeit-Priorität,
        // Zugangsprofil; editHide = Box erlaubt hier keine Sperre/Priorität/Profiländerung
        deviceClass:     e['X_AVM-DE_DeviceClassUser'] || e['X_AVM-DE_DeviceClass'] || '',
        priority:        flag(e['X_AVM-DE_Priority']),
        filterProfile:   e['X_AVM-DE_FilterProfileID'] || '',
        editHide:        flag(e['X_AVM-DE_HostFilterEditHide']),
        url:             e['X_AVM-DE_URL'] || '', // Weboberfläche (nur Mesh-Geräte)
      });
    }
    debugLog(`Hosts: ${hosts.length} Einträge über X_AVM-DE_GetHostListPath (1 Request)`);
    return hosts;
  } catch (err) {
    debugLog(`Hosts: GetHostListPath nicht verfügbar (${err.message}) – Einzelabruf`);
    return null;
  }
}

// Gleichzeitige Abrufe der Host-Liste zusammenfassen (z. B. /hosts + /ip-stats + Mesh
// beim Seitenaufbau) und das Rohergebnis 10 s vorhalten – sonst holt jeder Aufrufer
// die komplette Liste erneut von der Box.
let hostsInflight = null;
async function getHostsViaSoap(host, username, password, controlUrls) {
  const cached = getCached('hosts-raw', 10000);
  if (cached) return cached;
  if (!hostsInflight) {
    hostsInflight = fetchHostsFromBox(host, username, password, controlUrls)
      .then(h => { setCached('hosts-raw', h); trackNewHosts(h); return h; })
      .finally(() => { hostsInflight = null; });
  }
  return hostsInflight;
}

async function fetchHostsFromBox(host, username, password, controlUrls) {
  const fromList = await getHostsViaHostList(host, username, password, controlUrls);
  if (fromList) return fromList;
  const countRes = await soapRequest(host, 'urn:dslforum-org:service:Hosts:1', 'GetHostNumberOfEntries', username, password, controlUrls);
  const count = parseInt(countRes?.NewHostNumberOfEntries || '0', 10) || 0;
  // Alle Hosts parallel abrufen (statt sequentiell) – deutlich schneller bei >10 Geräten.
  // BATCH von 15 auf 8 gesenkt, um die Fritz!Box nicht mit Bursts zu überfordern und die
  // parallele Nutzung mit der Fritz-SmartHome-Integration in HA zu erleichtern.
  const BATCH = 8; // max. gleichzeitige Requests
  const hosts = [];
  for (let i = 0; i < count; i += BATCH) {
    const indices = Array.from({ length: Math.min(BATCH, count - i) }, (_, j) => i + j);
    const results = await Promise.allSettled(
      indices.map(idx => soapRequest(host, 'urn:dslforum-org:service:Hosts:1', 'GetGenericHostEntry', username, password, controlUrls, { NewIndex: String(idx) }))
    );
    for (const r of results) {
      if (r.status === 'fulfilled') {
        const entry = r.value;
        const mac = (entry.NewMACAddress || '').replace(/-/g, ':').toLowerCase();
        const active = entry.NewActive === '1' || entry.NewActive === 'true';
        if (active && mac) lastSeenMap.set(mac, Math.floor(Date.now() / 1000));
        const soapTs = entry['NewX_AVM-DE_LastActivity'] || '';
        const lastActivity = soapTs || (lastSeenMap.has(mac) ? String(lastSeenMap.get(mac)) : '');
        hosts.push({
          mac,
          ip: entry.NewIPAddress || '',
          active,
          name: entry.NewHostName || entry.NewInterfaceType || '',
          interface: entry.NewInterfaceType || '',
          addressSource: entry.NewAddressSource || '',
          lastActivity,
        });
      }
    }
  }
  return hosts;
}

async function getDeviceInfoViaSoap(host, username, password, controlUrls) {
  return soapRequest(host, 'urn:dslforum-org:service:DeviceInfo:1', 'GetInfo', username, password, controlUrls);
}

// ── netDev-Cache: Fritz-Weboberfläche liefert unter data.lua?page=netDev deutlich
// mehr Infos (conn_type, conn_speed, wlan_band, port) als TR-064 SOAP. Wir cachen 15 s
// und reichen die Daten an /api/fritz/hosts UND /api/fritz/mesh weiter.
async function fetchNetDevMap(session) {
  const cached = getCached('netdev-map', 15000);
  if (cached) return cached;
  const webSid = await getCachedWebSid(session);
  if (!webSid) { const empty = new Map(); setCached('netdev-map', empty, 5000); return empty; }
  try {
    const params = new URLSearchParams({ xhr: '1', sid: webSid, lang: 'de', page: 'netDev', xhrId: 'cleanup' });
    const r = await fetch(`http://${session.host}/data.lua`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const text = await r.text();
    if (!text.trim().startsWith('{')) { const empty = new Map(); setCached('netdev-map', empty, 5000); return empty; }
    const raw = JSON.parse(text);
    const d = raw?.data || raw || {};
    const map = new Map();
    const add = (dev) => {
      const mac = String(dev?.mac || '').replace(/-/g, ':').toLowerCase();
      if (mac) map.set(mac, dev);
    };
    if (Array.isArray(d.active))  d.active.forEach(add);
    if (Array.isArray(d.passive)) d.passive.forEach(add);
    setCached('netdev-map', map, 15000);
    return map;
  } catch (err) {
    console.log(`netDev-Cache Fehler: ${err.message}`);
    const empty = new Map();
    setCached('netdev-map', empty, 5000);
    return empty;
  }
}

// Liste der MAC-Adressen mit statischer DHCP-Reservierung. TR-064
// `NewAddressSource` lügt auf vielen Boxen ("DHCP" trotz Reservierung), und einige
// Firmwares (insbesondere 7530) liefern auch im netDev-Map keine zuverlässigen
// `static_dhcp`-Felder. Deshalb hier eine eigene Quelle als Vereinigung mit den
// netDev-Heuristiken in /api/fritz/hosts.
let staticDhcpSoapUnsupported = false;
async function fetchStaticDhcpMacs(session) {
  const cached = getCached('static-dhcp-macs', 15000);
  if (cached) return cached;
  const macs = new Set();
  const addMac = (raw) => {
    if (!raw) return;
    const m = String(raw).replace(/-/g, ':').toLowerCase();
    if (/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/.test(m)) macs.add(m);
  };
  const webSid = await getCachedWebSid(session);
  // Quelle 1 (data.lua): netSet / lanExpert listen die in der Fritz-UI sichtbaren
  // Reservierungen. Schema variiert pro Firmware – breit suchen.
  if (webSid) {
    for (const page of ['netSet', 'lanExpert', 'home']) {
      try {
        const params = new URLSearchParams({ xhr: '1', sid: webSid, lang: 'de', page, xhrId: 'all' });
        const r = await fetch(`http://${session.host}/data.lua`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });
        const text = await r.text();
        if (!text.trim().startsWith('{')) continue;
        const d = JSON.parse(text)?.data || {};
        const candidates = [
          d.dhcp_reservations, d.dhcpReservations, d.staticDhcp, d.static_dhcp_list,
          d.reservations, d.dhcp?.reservations, d.lan?.reservations, d.devices,
        ];
        for (const list of candidates) {
          if (!Array.isArray(list)) continue;
          for (const e of list) {
            const isStatic =
              e.static_dhcp === true || e.static_dhcp === 1 || e.static_dhcp === '1' ||
              e.is_static === true || e.fixed === true || e.fixedip === true ||
              e.dhcp_static === true || (typeof e.dhcp === 'string' && e.dhcp === '2') ||
              e.ipv4?.static_dhcp === true || e.ipv4?.static_dhcp === 1 || e.ipv4?.static_dhcp === '1';
            if (isStatic) addMac(e.mac || e.macAddress || e.mac_address);
          }
        }
      } catch {}
      if (macs.size > 0) break;
    }
  }
  // Quelle 2 (SOAP): generischer Loop über GetGenericLANHostStaticDHCPEntry, falls
  // data.lua keine Reservierungen geliefert hat. Wenig elegant, aber zuverlässig.
  // Die Aktion steht nicht in der AVM-Spezifikation und fehlt auf den meisten Boxen –
  // nach dem ersten „Invalid Action" nicht jede Minute erneut probieren.
  if (macs.size === 0 && !staticDhcpSoapUnsupported) {
    for (let i = 0; i < 200; i++) {
      try {
        const e = await soapRequest(session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1', 'GetGenericLANHostStaticDHCPEntry', session.username, session.password, session.controlUrls, { NewIndex: String(i) });
        const enabled = e?.NewEnabled === '1' || e?.NewEnabled === 'true' || e?.NewEnabled === true;
        if (enabled) addMac(e.NewMACAddress);
      } catch (err) {
        if (i === 0 && /401|Invalid Action/i.test(String(err?.message))) staticDhcpSoapUnsupported = true;
        break; // Listenende oder Endpoint nicht verfügbar
      }
    }
  }
  setCached('static-dhcp-macs', macs);
  return macs;
}

// Gemeinsame WLAN-Erkennung – muss mit der in normalizeMeshDevices übereinstimmen,
// damit Mesh-Ansicht und Geräteliste dieselben Geräte als WLAN markieren.
function deviceIsWlan(d) {
  if (!d) return false;
  if (d.conn === 'wlan' || d.conn === 'guest') return true;
  if (d.conn === 'lan' || d.conn === 'ethernet') return false;
  if (d.master_wifi_uid) return true;
  if (Array.isArray(d.wlan_UIDs) && d.wlan_UIDs.length > 0) return true;
  if (d.wlan === true || d.active_wlan === true || d.wlan_active === true) return true;
  if (d.wlan?.is_active || d.wlan?.band || d.wlan_std || d.wlan_band) return true;
  if (typeof d.rssi === 'number' && d.rssi !== 0) return true;
  if (d.wlan_show_rssi === 1 || d.wlan_show_rssi === '1') return true;
  const port = String(d.port || d.port_name || '').toLowerCase();
  if (port.includes('wlan') || port.includes('wifi')) return true;
  const s = String(d.conn_type || d.connType || d.medium || d.interface || d.ifname || '').toLowerCase();
  return s.includes('wlan') || s.includes('wifi') || s.includes('wireless') || s.includes('802.11');
}

// Verbindungsinfo in menschlich lesbares Format bringen: "LAN 2 → 1 Gbit/s" oder
// "WLAN 2,4 GHz → 58 Mbit/s". Wenn die Fritz!Box eine vorgefertigte Zeichenkette liefert
// (conn_info/ipinfo), bevorzugen wir die – die trifft das offizielle UI-Wording am besten.
function formatConnDetail(d) {
  if (!d) return { type: '', detail: '', speed: '' };
  const wlan = deviceIsWlan(d);
  const type = wlan ? 'WLAN' : 'LAN';

  // Speed extrahieren
  const speedRaw = d.conn_speed || d.speed || d.cur_data_rate_rx || d.txrate || d.rxrate || 0;
  let speedStr = '';
  if (typeof speedRaw === 'number' && speedRaw > 0) {
    speedStr = speedRaw >= 1000 ? `${(speedRaw / 1000).toFixed(speedRaw % 1000 === 0 ? 0 : 1)} Gbit/s` : `${speedRaw} Mbit/s`;
  } else if (typeof speedRaw === 'string' && speedRaw) {
    speedStr = speedRaw;
  }

  let detail = '';
  if (wlan) {
    const band = d.wlan_band || d.wlan?.band || '';
    if (band) {
      const bandStr = String(band);
      // Zahlwerte: 2 -> 2,4 GHz, 5 -> 5 GHz, 6 -> 6 GHz
      if (bandStr === '2' || bandStr === '24' || /2[,.]?4/.test(bandStr)) detail = '2,4 GHz';
      else if (/^5/.test(bandStr)) detail = '5 GHz';
      else if (/^6/.test(bandStr)) detail = '6 GHz';
      else detail = bandStr;
    }
  } else {
    // LAN: Port-Nummer (port_name ist oft schon formatiert wie "LAN 1")
    if (d.port_name) {
      const pn = String(d.port_name);
      // Entferne doppeltes "LAN" falls schon im port_name enthalten
      detail = pn.replace(/^lan\s*/i, '');
    } else if (typeof d.port === 'number' && d.port > 0) {
      detail = String(d.port);
    } else if (typeof d.port === 'string' && /^\d+$/.test(d.port) && d.port !== '0') {
      detail = d.port;
    }
  }

  // Vollständiger Anzeigetext zusammenbauen
  let display = '';
  if (d.conn_info || d.ipinfo) {
    const s = String(d.conn_info || d.ipinfo);
    // Nur übernehmen wenn es LAN/WLAN-typisch aussieht
    if (/\d+\s*(g?bit|mbit)/i.test(s) || /lan\s*\d/i.test(s) || /wlan/i.test(s)) display = s;
  }
  if (!display) {
    const parts = [type + (detail ? ' ' + detail : '')];
    if (speedStr) parts.push(speedStr);
    display = parts.join(' → ');
  }

  return { type, detail, speed: speedStr, display };
}

// ── Endpoints ──

// Nach Änderungen an Geräten (Löschen, Umbenennen, Sperren, Reservierung) alle
// abgeleiteten Host-Caches verwerfen, damit die nächste Abfrage frisch ist
function invalidateHosts() {
  for (const k of ['hosts', 'hosts-raw', 'netdev-map', 'static-dhcp-macs', 'ip-stats', 'mesh-official', 'mesh-topology', 'mesh-hosts-fallback']) cache.delete(k);
}

app.get('/api/fritz/auto-session', async (req, res) => {
  if (!process.env.FRITZBOX_HOST || !process.env.FRITZBOX_USER || !process.env.FRITZBOX_PASSWORD) loadCredentialOptions();
  const host = process.env.FRITZBOX_HOST;
  const username = process.env.FRITZBOX_USER;
  const password = process.env.FRITZBOX_PASSWORD;
  console.log('Auto-session check:', { host: !!host, username: !!username, password: !!password });
  if (!host || !username || !password) {
    console.log('Auto-session: No credentials configured');
    return res.json({ active: false });
  }
  try {
    const controlUrls = await discoverControlUrls(host);
    sessions.set(AUTO_SID, { host, username, password, controlUrls, isAutoSession: true, lastUsed: Date.now() });
    console.log('Auto-session: Created session with SID:', AUTO_SID);
    // WebSID im Hintergrund vorab cachen, damit eco-stats und network-stats sofort bereit sind
    const autoSession = sessions.get(AUTO_SID);
    getCachedWebSid(autoSession).catch(() => {});
    return res.json({ active: true, sid: AUTO_SID, host });
  } catch (err) {
    console.error('Auto-session error:', err.message);
    return res.json({ active: false });
  }
});

app.get('/api/fritz/device-info', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const cached = getCached('device-info');
  if (cached) return res.json(cached);
  try {
    const info = await getDeviceInfoViaSoap(session.host, session.username, session.password, session.controlUrls);
    setCached('device-info', info);
    return res.json(info);
  } catch (err) {
    console.error('DeviceInfo error:', err.message);
    // Fallback 1: tr64desc.xml – öffentlich zugänglich, kein Login nötig
    try {
      const descRes = await fetch(`http://${session.host}:49000/tr64desc.xml`);
      const descXml = await descRes.text();
      const friendly = descXml.match(/<friendlyName>([^<]*)<\/friendlyName>/)?.[1] || '';
      const model    = descXml.match(/<modelName>([^<]*)<\/modelName>/)?.[1] || '';
      const firmware = descXml.match(/<modelNumber>([^<]*)<\/modelNumber>/)?.[1] || '';
      if (friendly || model) {
        const result = { NewModelName: friendly || model, NewFirmwareVersion: firmware, _source: 'tr64desc' };
        setCached('device-info', result);
        return res.json(result);
      }
    } catch {}
    // Fallback 2: data.lua (benötigt webSid)
    try {
      const webSid = await getCachedWebSid(session);
      if (webSid) {
        for (const page of ['home', 'system', 'overview']) {
          try {
            const params = new URLSearchParams({ xhr: '1', sid: webSid, lang: 'de', page, xhrId: 'all' });
            const r = await fetch(`http://${session.host}/data.lua`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
            const text = await r.text();
            if (!text.trim().startsWith('{')) continue;
            const d = JSON.parse(text)?.data || {};
            const modelName = d.productname || d.model || d.devicename || d.boxInfo?.productname || '';
            if (modelName) {
              const result = { NewModelName: modelName, NewFirmwareVersion: d.fw_version || d.firmware || '', _source: 'data.lua' };
              setCached('device-info', result);
              return res.json(result);
            }
          } catch {}
        }
      }
    } catch {}
    return res.json({ NewModelName: 'FRITZ!Box', NewFirmwareVersion: '' });
  }
});

// Geräteliste inkl. Verbindungsdetails und Erkennung fester IPs, 60 s gecacht.
// Wird vom /hosts-Endpoint UND vom HA-Push genutzt – vorher füllte nur der Browser
// diesen Cache, bei geschlossenem Portal blieben „Geräte online"/„Freie IPs" stehen.
async function getEnrichedHosts(session) {
  const cached = getCached('hosts', 60000);
  if (cached) return cached;
  // SOAP-Hostliste + netDev + DHCP-Reservierungen parallel holen. netDev liefert
  // bessere WLAN/LAN-Klassifizierung und Port-/Geschwindigkeitsdetails; die
  // Reservierungs-Liste füllt die Lücke, wenn netDev kein static_dhcp-Flag liefert
  // (insbesondere 7530-Firmware).
  const [rawHosts, netDevMap, staticMacs] = await Promise.all([
    getHostsViaSoap(session.host, session.username, session.password, session.controlUrls),
    fetchNetDevMap(session),
    fetchStaticDhcpMacs(session),
  ]);
  // Kopien: der Rohcache (hosts-raw) darf durch Anreicherung/Korrekturen nicht verändert werden
  const hosts = rawHosts.map(h => ({ ...h }));
  for (const h of hosts) {
    const dev = netDevMap.get(h.mac);
    if (dev) {
      const conn = formatConnDetail(dev);
      // interface-Feld so setzen, dass der Frontend-isWlan()-Check korrekt greift
      h.interface = conn.type === 'WLAN' ? '802.11' : 'Ethernet';
      h.connType = conn.type;       // 'LAN' | 'WLAN'
      h.connDetail = conn.detail;   // '2' / '2,4 GHz' / '5 GHz' …
      h.connSpeed = conn.speed;     // '1 Gbit/s' / '58 Mbit/s' …
      h.connDisplay = conn.display; // 'LAN 2 → 1 Gbit/s'
    } else if (h.interface) {
      // Kein netDev (z. B. Web-Login fehlgeschlagen): Verbindung aus der TR-064-Host-Liste
      // ableiten – InterfaceType + X_AVM-DE_Port/Speed (Issue #37: WLAN als LAN angezeigt)
      const wlan = /802\.11|wlan|wifi/i.test(h.interface);
      h.connType = wlan ? 'WLAN' : 'LAN';
      h.connDetail = !wlan && h.port && h.port !== '0' ? String(h.port) : '';
      h.connSpeed = h.speed ? (h.speed >= 1000 ? `${+(h.speed / 1000).toFixed(1)} Gbit/s` : `${h.speed} Mbit/s`) : '';
      h.connDisplay = [h.connType + (h.connDetail ? ' ' + h.connDetail : ''), h.connSpeed].filter(Boolean).join(' → ');
    }
    // Feste IP über die Vereinigung mehrerer Quellen ableiten:
    //  - netDev-Felder (best-effort, Firmware-abhängig)
    //  - explizite DHCP-Reservierungs-Liste (data.lua netSet bzw. SOAP)
    const fromNetDev = dev && (
      dev.static_dhcp === true || dev.static_dhcp === 1 || dev.static_dhcp === '1' ||
      dev.ipv4?.static_dhcp === true || dev.ipv4?.static_dhcp === 1 || dev.ipv4?.static_dhcp === '1' ||
      dev.dhcp_static === true || dev.dhcp_static === 1 || dev.dhcp_static === '1' ||
      dev.is_static === true || dev.fixed === true || dev.fixedip === true ||
      (typeof dev.dhcp === 'string' && dev.dhcp === '2')
    );
    const fromList = staticMacs.has(h.mac);
    if (fromNetDev || fromList) h.addressSource = 'Static';
    // netDev liefert je nach Firmware keinen Port/keine Geschwindigkeit → aus der
    // TR-064-Host-Liste ergänzen (vorher stand dann nur „LAN" ohne Details)
    if (h.connType === 'LAN' && !h.connDetail && h.port && h.port !== '0') h.connDetail = String(h.port);
    if (!h.connSpeed && h.speed) h.connSpeed = h.speed >= 1000 ? `${+(h.speed / 1000).toFixed(1)} Gbit/s` : `${h.speed} Mbit/s`;
    if (h.connType && (!h.connDisplay || h.connDisplay === h.connType)) {
      h.connDisplay = [h.connType + (h.connDetail ? ' ' + h.connDetail : ''), h.connSpeed].filter(Boolean).join(' → ');
    }
  }
  applyTopology(hosts);
  setCached('hosts', hosts);
  return hosts;
}

// ── Geräte-Zuordnung: Zugangspunkte erkennen + Benutzer-Korrekturen ──────────
// Die FRITZ!Box sieht Geräte hinter Fremd-Routern/Access Points (z. B. Xiaomi, TP-Link
// im AP-Modus) nur als LAN-Geräte an dem Port, an dem der Router hängt – ob sie dort per
// WLAN oder Kabel verbunden sind, kann sie nicht wissen. Wir erkennen solche Zugangspunkte
// (Name + mehrere Geräte am selben LAN-Port) und hängen die Geräte des Ports darunter.
// Alles lässt sich pro Gerät korrigieren; die Korrekturen liegen in DATA_DIR und
// überstehen damit Add-on-Updates.
const OVERRIDES_FILE = join(DATA_DIR, 'fritz-portal-devices.json');
let deviceOverrides = {};
try {
  if (existsSync(OVERRIDES_FILE)) deviceOverrides = JSON.parse(readFileSync(OVERRIDES_FILE, 'utf-8')).devices || {};
} catch {}
function saveDeviceOverrides() {
  try { writeFileSync(OVERRIDES_FILE, JSON.stringify({ devices: deviceOverrides }, null, 1)); }
  catch (e) { console.error('Geräte-Zuordnungen speichern fehlgeschlagen:', e.message); }
}

const INFRA_NAME_RE = /router|repeater|access.?point|\bap\b|mesh|extender|switch|deco|orbi|eero|unifi|powerline|fritz!/i;
const NOT_INFRA_RE  = /plug|steckdose|shelly|socket|lampe|bulb|leuchte/i;

function applyTopology(hosts) {
  const byMac = new Map(hosts.filter(h => h.mac).map(h => [h.mac, h]));
  const portOf = (h) => (h.connType === 'LAN' || /ethernet/i.test(h.interface || '')) ? parseInt(h.port, 10) || 0 : 0;
  const perPort = new Map();
  for (const h of hosts) {
    const p = portOf(h);
    if (h.active && p) perPort.set(p, (perPort.get(p) || 0) + 1);
  }
  // 1) Zugangspunkte bestimmen: Benutzerangabe > Name + geteilter Port > AVM-Mesh-fähig
  for (const h of hosts) {
    const ov = deviceOverrides[h.mac] || {};
    const name = h.name || '';
    const auto = (INFRA_NAME_RE.test(name) && !NOT_INFRA_RE.test(name) && (perPort.get(portOf(h)) || 0) >= 3) || !!h.meshable;
    h.isInfraAuto = auto;
    h.isInfra = ov.infra === true || (ov.infra !== false && auto);
  }
  // 2) Port → Zugangspunkt (nur kabelgebundene Zugangspunkte direkt an der Box).
  // Automatisch erkannte Router behalten ihren Port; ein zusätzlich von Hand markierter
  // Zugangspunkt am selben Port gilt als nachgeschaltet (hängt hinter dem Router) –
  // vorher übernahm einfach der erste Eintrag der Liste alle Geräte des Ports.
  const apByPort = new Map();
  for (const pass of [true, false]) {
    for (const h of hosts) {
      const p = portOf(h);
      if (h.isInfra && !!h.isInfraAuto === pass && p && !apByPort.has(p)) apByPort.set(p, h);
    }
  }
  // 3) Pro Gerät: Zuordnung und Verbindungsart (Korrektur > Vorgabe des Zugangspunkts > erkannt)
  for (const h of hosts) {
    const ov = deviceOverrides[h.mac] || {};
    h.connAuto = h.connType || (/802\.11|wlan|wifi/i.test(h.interface || '') ? 'WLAN' : 'LAN');
    let via = null;
    if (ov.parent && ov.parent !== 'box') via = byMac.get(ov.parent) || null;
    else if (!ov.parent) {
      const ap = apByPort.get(portOf(h));
      if (ap && ap.mac !== h.mac) { via = ap; h.viaAuto = true; }
    }
    if (via && via.mac === h.mac) via = null;
    const viaOv = via ? (deviceOverrides[via.mac] || {}) : {};
    const conn = ov.conn || (via && viaOv.clientConn) || h.connAuto;
    h.viaMac = via?.mac || '';
    h.viaName = via?.name || '';
    h.connOverride = ov.conn || '';
    if (via || conn !== h.connAuto) {
      // Port/Geschwindigkeit gehören dann zur Leitung der Box zum Zugangspunkt – nicht
      // zum Gerät selbst; deshalb nur Verbindungsart + Zugangspunkt anzeigen
      h.connType = conn;
      h.connDetail = '';
      h.connSpeed = '';
      h.connDisplay = via ? `${conn} · ${via.name}` : conn;
    }
  }
}

app.get('/api/fritz/hosts', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  try {
    return res.json(await getEnrichedHosts(session));
  } catch (err) {
    console.error('Hosts error:', err.message);
    return res.json([]);
  }
});

app.get('/api/fritz/eco-stats', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  // Längere TTL als der CACHE_TTL-Default (10 s): Der Background-Collector tickt alle
  // 30 s; mit 35 s deckt jeder eingehende Request einen Tick ab und der On-Demand-Pfad
  // wird zur reinen Notlösung, falls der Collector noch nie gelaufen ist.
  const cached = getCached('eco-stats', 35000);
  if (cached) return res.json({ ...cached, ...computeLoadAvg() });
  // Letzter Strohhalm: wenn der On-Demand-Pfad gleich 0/0/0 zurückgeben würde,
  // bevorzugen wir den jüngsten Eintrag aus dem ecoHistory-Buffer (wird vom
  // Collector gefüllt, der zuverlässiger arbeitet als der On-Demand-Pfad).
  const lastFromHistory = () => {
    const cpuPt  = ecoHistory.cpu[ecoHistory.cpu.length - 1];
    const ramPt  = ecoHistory.ram[ecoHistory.ram.length - 1];
    const tempPt = ecoHistory.temp[ecoHistory.temp.length - 1];
    if (!cpuPt && !ramPt && !tempPt) return null;
    return {
      cpu: cpuPt?.value || 0,
      ram: ramPt?.value || 0,
      cpu_temp: tempPt?.value || 0,
    };
  };
  try {
    const eco = await fetchEcoStats(session);
    return res.json({ ...(eco || lastFromHistory() || { cpu: 0, ram: 0, cpu_temp: 0 }), ...computeLoadAvg() });
  } catch (err) {
    console.error('EcoStats error:', err.message);
    return res.json({ ...(lastFromHistory() || { cpu: 0, ram: 0, cpu_temp: 0 }), ...computeLoadAvg() });
  }
});

app.get('/api/fritz/eco-history', (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  if (!sessions.get(sid)) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const fmt = (arr) => arr.map(p => ({
    time: new Date(p.time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    value: p.value,
  }));
  return res.json({ cpu: fmt(ecoHistory.cpu), ram: fmt(ecoHistory.ram), temp: fmt(ecoHistory.temp) });
});

app.get('/api/fritz/network-stats', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  // Längere Read-TTL als der Default (10 s), damit zwischen den Collector-Ticks (30 s)
  // nicht jede Browser-Abfrage netMon/GetAddonInfos neu trifft – wichtig für Cable-/5G-
  // Boxen, bei denen die Live-Rate sowieso aus dem Collector-Delta kommt.
  const cached = getCached('network-stats', 35000);
  if (cached) return res.json(cached);

  let { downBps, upBps, dsHistory, usHistory, addon } = await getLiveRates(session, sid);

  // Server-side history for Cable models
  if (dsHistory.length === 0 && trafficHistory.down.length > 0) {
    const now = Date.now();
    dsHistory = trafficHistory.down.filter(p => now - p.time <= 30 * 60 * 1000).map(p => p.value);
    usHistory = trafficHistory.up.filter(p => now - p.time <= 30 * 60 * 1000).map(p => p.value);
  }

  // Gesamt-Bytes: GetAddonInfos nur abfragen, wenn getLiveRates es nicht schon getan hat
  if (!addon) addon = await getAddonInfos(session);
  const totalDown = parseInt(addon.NewX_AVM_DE_TotalBytesReceived64 || addon.NewTotalBytesReceived || '0', 10) || 0;
  const totalUp   = parseInt(addon.NewX_AVM_DE_TotalBytesSent64     || addon.NewTotalBytesSent     || '0', 10) || 0;

  // Serverseitiger 30-min-Verlauf mit echten Timestamps – das Frontend nutzt ihn
  // (wenn ausreichend Punkte vorhanden) zum sofortigen, lückenlosen Initial-Fill des
  // Dashboard-Charts. Wird durchgehend gefüllt wenn `traffic_history_server` aktiv ist.
  const histNow = Date.now();
  // down/up werden im Collector im Gleichschritt gepusht → gleiche Länge & Timestamps.
  const serverHistory = trafficHistory.down
    .map((p, i) => ({ t: p.time, down: p.value, up: trafficHistory.up[i]?.value || 0 }))
    .filter(p => histNow - p.t <= 30 * 60 * 1000);

  const result = { currentDown: downBps, currentUp: upBps, totalDown, totalUp, dsHistory, usHistory, serverHistory };
  setCached('network-stats', result);
  return res.json(result);
});

app.post('/api/fritz/reboot', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  try {
    await soapRequest(session.host, 'urn:dslforum-org:service:DeviceConfig:1', 'Reboot', session.username, session.password, session.controlUrls);
    return res.json({ success: true });
  } catch (err) {
    console.error('Reboot error:', err.message);
    return res.json({ success: false, error: err.message });
  }
});

// Firmware-Update der FRITZ!Box prüfen (UserInterface:1#GetInfo). Die Box prüft selbst
// regelmäßig bei AVM – wir lesen nur ihr Ergebnis. 1 h gecacht; auch vom HA-Push genutzt.
async function getFirmwareStatus(session) {
  const cached = getCached('firmware-status', 3600000);
  if (cached) return cached;
  const r = await soapRequest(session.host, 'urn:dslforum-org:service:UserInterface:1', 'GetInfo', session.username, session.password, session.controlUrls);
  let di = getCached('device-info', 3600000);
  if (!di) {
    try { di = await getDeviceInfoViaSoap(session.host, session.username, session.password, session.controlUrls); setCached('device-info', di); } catch {}
  }
  const result = {
    updateAvailable: r?.NewUpgradeAvailable === '1' || r?.NewUpgradeAvailable === 'true',
    newVersion:      r?.['NewX_AVM-DE_Version'] || '',
    infoUrl:         r?.['NewX_AVM-DE_InfoURL'] || '',
    buildType:       r?.['NewX_AVM-DE_BuildType'] || '',
    currentVersion:  di?.NewSoftwareVersion || '',
  };
  setCached('firmware-status', result);
  return result;
}

app.get('/api/fritz/firmware', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  try {
    return res.json(await getFirmwareStatus(session));
  } catch (err) {
    debugLog(`Firmware-Check nicht verfügbar: ${err.message}`);
    return res.json({ updateAvailable: false, unavailable: true });
  }
});

// Wake-on-LAN über die FRITZ!Box (Hosts:1#X_AVM-DE_WakeOnLANByMACAddress) – die Box
// schickt das Magic Packet selbst ins Heimnetz, funktioniert also auch aus dem HA-Container.
// Geräte-Zuordnung korrigieren: Verbindungsart (LAN/WLAN), Zugangspunkt („box" oder
// MAC eines Zugangspunkts), „ist Zugangspunkt" und Standard-Verbindungsart für dessen
// Geräte. null/'auto' setzt das jeweilige Feld auf automatische Erkennung zurück.
app.get('/api/fritz/device/overrides', (req, res) => {
  if (!sessions.get(req.headers['x-fritz-sid'])) return res.status(401).json({ error: 'Nicht eingeloggt' });
  return res.json({ devices: deviceOverrides });
});

app.post('/api/fritz/device/override', (req, res) => {
  if (!sessions.get(req.headers['x-fritz-sid'])) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const { mac, ...changes } = req.body || {};
  const isMac = (v) => /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/.test(String(v || ''));
  if (!isMac(mac)) return res.status(400).json({ error: 'Ungültige MAC-Adresse' });
  const ov = { ...(deviceOverrides[mac] || {}) };
  const valid = {
    conn:       v => v === 'LAN' || v === 'WLAN',
    clientConn: v => v === 'LAN' || v === 'WLAN',
    parent:     v => v === 'box' || (isMac(v) && v !== mac),
    infra:      v => typeof v === 'boolean',
  };
  for (const [key, value] of Object.entries(changes)) {
    if (!valid[key]) continue;
    if (value === null || value === 'auto') delete ov[key];
    else if (valid[key](value)) ov[key] = value;
    else return res.status(400).json({ error: `Ungültiger Wert für ${key}` });
  }
  if (Object.keys(ov).length) deviceOverrides[mac] = ov; else delete deviceOverrides[mac];
  saveDeviceOverrides();
  // Nur abgeleitete Daten neu berechnen – die Rohdaten der Box bleiben gültig
  for (const k of ['hosts', 'ip-stats', 'mesh-topology', 'mesh-hosts-fallback']) cache.delete(k);
  return res.json({ success: true, override: ov });
});

// ── Zugangsprofile (Kindersicherung, X_AVM-DE_HostFilter, Spezifikation 2025) ──
const HOSTFILTER = 'urn:dslforum-org:service:X_AVM-DE_HostFilter:1';

// Alle Zugangsprofile der Box (Name, Typ). Die Liste kommt als XML-String, je nach
// Firmware evtl. als Pfad zu einer XML-Datei. 5 min gecacht.
async function getFilterProfiles(session) {
  const cached = getCached('filter-profiles', 300000);
  if (cached) return cached;
  const r = await soapRequest(session.host, HOSTFILTER, 'GetFilterProfiles', session.username, session.password, session.controlUrls);
  let xml = decodeXmlEntities(r?.NewFilterProfileList || '');
  if (/^(\/|https?:)/.test(xml.trim())) {
    const url = xml.startsWith('/') ? `http://${session.host}:49000${xml.trim()}` : xml.trim();
    xml = await (await fetch(url)).text();
  }
  const profiles = parseXmlItems(xml, 'FilterProfile').map(p => ({
    id: p.FilterProfileID || '', name: p.Name || p.FilterProfileID || '', type: p.FilterProfileType || '',
  })).filter(p => p.id);
  setCached('filter-profiles', profiles);
  return profiles;
}

app.get('/api/fritz/filter-profiles', async (req, res) => {
  const session = sessions.get(req.headers['x-fritz-sid']);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  try { return res.json({ supported: true, profiles: await getFilterProfiles(session) }); }
  catch (err) { debugLog('Zugangsprofile nicht verfügbar:', err.message); return res.json({ supported: false, profiles: [] }); }
});

const isIPv4 = (v) => /^(\d{1,3}\.){3}\d{1,3}$/.test(String(v || ''));

// Zugangsprofil + Online-Zeit eines Geräts (GetHostEntryByIP); Zeiten in Minuten
app.get('/api/fritz/device/filter', async (req, res) => {
  const session = sessions.get(req.headers['x-fritz-sid']);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  if (!isIPv4(req.query.ip)) return res.json({ supported: false });
  try {
    const r = await soapRequest(session.host, HOSTFILTER, 'GetHostEntryByIP', session.username, session.password, session.controlUrls, { NewIPv4Address: req.query.ip });
    const n = (v) => parseInt(v || '0', 10) || 0;
    return res.json({
      supported: true, profileId: r?.NewFilterProfileID || '',
      timeUsed: n(r?.NewTimeUsed), timeMax: n(r?.NewTimeMax), ticketValid: r?.NewTicketValid === '1',
      ticketsInAdvance: n(r?.NewTicketsInAdvance), wanAccess: r?.NewWANAccess || '',
    });
  } catch (err) {
    debugLog('GetHostEntryByIP:', err.message);
    return res.json({ supported: false });
  }
});

app.post('/api/fritz/device/filter', async (req, res) => {
  const session = sessions.get(req.headers['x-fritz-sid']);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const { ip, profileId } = req.body || {};
  if (!isIPv4(ip) || !/^[\w-]{1,64}$/.test(String(profileId || ''))) return res.status(400).json({ error: 'Ungültige Angaben' });
  try {
    await soapRequest(session.host, HOSTFILTER, 'AddHostEntryToFilterProfile', session.username, session.password, session.controlUrls, { NewIPv4Address: ip, NewFilterProfileID: profileId });
    invalidateHosts();
    return res.json({ success: true });
  } catch (err) {
    return res.json({ success: false, error: /880/.test(err.message) ? 'Für dieses Gerät kann das Profil nicht geändert werden' : err.message });
  }
});

// Zusatz-Surfzeit („Ticket") – nur für Profile mit Zeitbudget/Zeitplan
app.post('/api/fritz/device/ticket', async (req, res) => {
  const session = sessions.get(req.headers['x-fritz-sid']);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const { ip } = req.body || {};
  if (!isIPv4(ip)) return res.status(400).json({ error: 'Ungültige IP-Adresse' });
  try {
    const r = await soapRequest(session.host, HOSTFILTER, 'AddTicketTimeToHostEntryByIP', session.username, session.password, session.controlUrls, { NewIPv4Address: ip });
    return res.json({ success: true, timeUsed: parseInt(r?.NewTimeUsed || '0', 10) || 0, timeMax: parseInt(r?.NewTimeMax || '0', 10) || 0 });
  } catch (err) {
    return res.json({ success: false, error: /880/.test(err.message) ? 'Für dieses Gerät ist kein Ticket möglich' : err.message });
  }
});

// Echtzeit-Priorisierung eines Geräts (Hosts:1#X_AVM-DE_SetPrioritizationByIP) –
// entspricht „Priorisierung → Echtzeitanwendungen" in der FRITZ!Box-Oberfläche
app.post('/api/fritz/device/priority', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const { ip, enabled } = req.body || {};
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(String(ip || ''))) return res.status(400).json({ error: 'Ungültige IP-Adresse' });
  try {
    await soapRequest(session.host, 'urn:dslforum-org:service:Hosts:1', 'X_AVM-DE_SetPrioritizationByIP', session.username, session.password, session.controlUrls, { NewIPAddress: ip, 'NewX_AVM-DE_Priority': enabled ? '1' : '0' });
    invalidateHosts();
    return res.json({ success: true });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

// Automatisches Wake-on-LAN: Die Box weckt das Gerät, sobald aus dem Internet darauf
// zugegriffen wird (Hosts:1#X_AVM-DE_Get/SetAutoWakeOnLANByMACAddress)
app.get('/api/fritz/device/autowol', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  try {
    const r = await soapRequest(session.host, 'urn:dslforum-org:service:Hosts:1', 'X_AVM-DE_GetAutoWakeOnLANByMACAddress', session.username, session.password, session.controlUrls, { NewMACAddress: String(req.query.mac || '') });
    return res.json({ supported: true, enabled: r?.NewAutoWOLEnabled === '1' });
  } catch {
    return res.json({ supported: false, enabled: false });
  }
});

app.post('/api/fritz/device/autowol', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const { mac, enabled } = req.body || {};
  try {
    await soapRequest(session.host, 'urn:dslforum-org:service:Hosts:1', 'X_AVM-DE_SetAutoWakeOnLANByMACAddress', session.username, session.password, session.controlUrls, { NewMACAddress: String(mac || ''), NewAutoWOLEnabled: enabled ? '1' : '0' });
    return res.json({ success: true });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

// Ereignisprotokoll der FRITZ!Box (DeviceInfo:1#X_AVM-DE_GetDeviceLogPath, Fallback
// GetDeviceLog). Filter laut Spec: all, sys, net, fon, wlan, usb. 30 s gecacht.
const DEVICE_LOG_FILTERS = ['all', 'sys', 'net', 'fon', 'wlan', 'usb'];
app.get('/api/fritz/device-log', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const filter = DEVICE_LOG_FILTERS.includes(req.query.filter) ? req.query.filter : 'all';
  const cached = getCached(`device-log-${filter}`, 30000);
  if (cached) return res.json(cached);
  const DI = 'urn:dslforum-org:service:DeviceInfo:1';
  let events = [];
  try {
    const r = await soapRequest(session.host, DI, 'X_AVM-DE_GetDeviceLogPath', session.username, session.password, session.controlUrls);
    const path = r?.NewDeviceLogPath;
    if (path) {
      const url = `http://${session.host}:49000${path.startsWith('/') ? '' : '/'}${path}${path.includes('?') ? '&' : '?'}filter=${filter}`;
      const xml = await (await fetch(url)).text();
      events = parseXmlItems(xml, 'Event').map(e => ({ id: e.id, group: e.group, date: e.date, time: e.time, msg: e.msg }));
    }
  } catch {}
  if (events.length === 0 && filter === 'all') {
    // Ältere Firmwares: Protokoll als Fließtext, eine Zeile pro Ereignis („dd.mm.yy hh:mm:ss Text")
    try {
      const r = await soapRequest(session.host, DI, 'GetDeviceLog', session.username, session.password, session.controlUrls);
      events = String(r?.NewDeviceLog || '').split('\n').filter(Boolean).map(line => {
        const m = line.match(/^(\d{2}\.\d{2}\.\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(.*)$/);
        return m ? { date: m[1], time: m[2], msg: m[3], group: '' } : { date: '', time: '', msg: line, group: '' };
      });
    } catch {}
  }
  const result = { filter, events: events.slice(0, 300) };
  setCached(`device-log-${filter}`, result);
  return res.json(result);
});

app.post('/api/fritz/device/wol', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const mac = String(req.body?.mac || '').trim().toUpperCase();
  if (!/^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/.test(mac)) return res.status(400).json({ error: 'Ungültige MAC-Adresse' });
  try {
    await soapRequest(session.host, 'urn:dslforum-org:service:Hosts:1', 'X_AVM-DE_WakeOnLANByMACAddress', session.username, session.password, session.controlUrls, { NewMACAddress: mac });
    console.log(`Wake-on-LAN an ${mac} gesendet`);
    return res.json({ success: true });
  } catch (err) {
    console.error('Wake-on-LAN error:', err.message);
    return res.json({ success: false, error: err.message });
  }
});

// ============ DHCP EDIT ============

app.post('/api/fritz/network/dhcp', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const { minAddress, maxAddress, subnetMask, dnsServers } = req.body;
  try {
    const current = await soapRequest(session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1', 'GetInfo', session.username, session.password, session.controlUrls);
    await soapRequest(session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1', 'SetInfo', session.username, session.password, session.controlUrls, {
      NewDHCPServerConfigurable: current.NewDHCPServerConfigurable || '1',
      NewDHCPRelay: current.NewDHCPRelay || '0',
      NewMinAddress: minAddress || current.NewMinAddress,
      NewMaxAddress: maxAddress || current.NewMaxAddress,
      NewReservedAddresses: current.NewReservedAddresses || '',
      NewSubnetMask: subnetMask || current.NewSubnetMask,
      NewDNSServers: dnsServers || current.NewDNSServers || '',
      NewDomainName: current.NewDomainName || '',
      NewIPRouters: current.NewIPRouters || '',
    });
    cache.delete('lan-info');
    cache.delete('ip-stats');
    return res.json({ success: true });
  } catch (err) {
    console.error('DHCP update error:', err.message);
    return res.json({ success: false, error: err.message });
  }
});

// ============ DEVICE BLOCK/UNBLOCK ============

app.get('/api/fritz/device/blockstate', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const { mac } = req.query;
  try {
    // IP des Geräts ermitteln: erst gecachte Hosts (60s TTL), dann optionaler Query-Param,
    // erst zuletzt SOAP-Sweep. Vorher wurde immer der komplette Hosts-Sweep durchgeführt,
    // was bei 70 Geräten ~5s gedauert hat und DeviceDetail spürbar verlangsamt hat.
    let ip = '';
    const cachedHosts = getCached('hosts', 60000);
    if (Array.isArray(cachedHosts)) {
      const host = cachedHosts.find(h => h.mac === mac);
      if (host?.ip) ip = host.ip;
    }
    if (!ip && typeof req.query.ip === 'string' && req.query.ip) ip = req.query.ip;
    if (!ip) {
      // Fallback: SOAP-Sweep nur wenn weder Cache noch Query-Param eine IP liefern
      const hosts = await getHostsViaSoap(session.host, session.username, session.password, session.controlUrls);
      ip = hosts.find(h => h.mac === mac)?.ip || '';
    }
    if (!ip) return res.json({ blocked: false });
    const result = await soapRequest(session.host, 'urn:dslforum-org:service:X_AVM-DE_HostFilter:1', 'GetWANAccessByIP', session.username, session.password, session.controlUrls, { NewIPv4Address: ip });
    return res.json({ blocked: result.NewDisallow === '1' || result.NewDisallow === 'true' || result.NewWANAccess === 'denied' });
  } catch (err) {
    console.error('Blockstate error:', err.message);
    return res.json({ blocked: false, error: err.message });
  }
});

app.get('/api/fritz/device/static-dhcp', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const { mac } = req.query;
  try {
    const result = await soapRequest(session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1', 'GetSpecificStaticDHCPEntry', session.username, session.password, session.controlUrls, { NewMACAddress: mac });
    return res.json({ exists: true, ip: result.NewIPAddress || '', hostname: result.NewHostName || '' });
  } catch {}
  // Issue #40: GetSpecificStaticDHCPEntry ist in der AVM-Spezifikation nicht enthalten
  // und schlägt auf den meisten Boxen fehl – die Detailseite zeigte deshalb nie
  // „fest zugewiesen". Fallback: Reservierungs-Erkennung aus der Geräteliste
  // (netDev-Flags + Reservierungsliste der Weboberfläche).
  try {
    const macs = await fetchStaticDhcpMacs(session);
    const host = (getCached('hosts', 300000) || []).find(h => h.mac === mac);
    if (macs.has(String(mac).toLowerCase()) || host?.addressSource === 'Static') {
      return res.json({ exists: true, ip: host?.ip || '', hostname: host?.name || '' });
    }
  } catch {}
  return res.json({ exists: false, ip: '', hostname: '' });
});

app.post('/api/fritz/device/static-dhcp', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const { mac, ip, hostname } = req.body;
  // Versuch 1: SOAP (TR-064)
  try {
    try {
      const existing = await soapRequest(session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1', 'GetSpecificStaticDHCPEntry', session.username, session.password, session.controlUrls, { NewMACAddress: mac });
      if (existing.NewIPAddress) {
        await soapRequest(session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1', 'DeleteStaticDHCPEntry', session.username, session.password, session.controlUrls, { NewIPAddress: existing.NewIPAddress, NewMACAddress: mac });
      }
    } catch {}
    await soapRequest(session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1', 'AddStaticDHCPEntry', session.username, session.password, session.controlUrls, { NewIPAddress: ip, NewMACAddress: mac, NewHostName: hostname || '' });
    invalidateHosts();
    return res.json({ success: true });
  } catch (soapErr) {
    // Erwartbar: die SOAP-Aktion fehlt auf den meisten Firmwares → data.lua
    debugLog('Static DHCP SOAP nicht verfügbar, nutze data.lua:', soapErr.message);
  }
  // Versuch 2: data.lua Fallback
  try {
    const webSid = await getCachedWebSid(session);
    if (!webSid) return res.json({ success: false, error: 'Kein webSid verf\u00fcgbar' });
    const params = new URLSearchParams({
      xhr: '1', sid: webSid, lang: 'de', page: 'edit_device',
      'dev_name': hostname || '', 'dev_ip': ip, 'static_dhcp': '1', 'dev': mac,
      'btn_save': '', 'back_to_page': 'netDev', 'apply': '', 'oldpage': 'edit_device',
    });
    const r = await fetch(`http://${session.host}/data.lua`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const text = await r.text();
    if (r.ok && !text.includes('"error"')) {
      invalidateHosts();
      console.log('Static DHCP: data.lua Fallback erfolgreich');
      return res.json({ success: true, _source: 'data.lua' });
    }
    return res.json({ success: false, error: 'data.lua hat die \u00c4nderung nicht \u00fcbernommen' });
  } catch (err) {
    console.error('Static DHCP set error (data.lua):', err.message);
    return res.json({ success: false, error: err.message });
  }
});

app.delete('/api/fritz/device/static-dhcp', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const { mac } = req.body;
  // Versuch 1: SOAP
  try {
    const existing = await soapRequest(session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1', 'GetSpecificStaticDHCPEntry', session.username, session.password, session.controlUrls, { NewMACAddress: mac });
    await soapRequest(session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1', 'DeleteStaticDHCPEntry', session.username, session.password, session.controlUrls, { NewIPAddress: existing.NewIPAddress, NewMACAddress: mac });
    invalidateHosts();
    return res.json({ success: true });
  } catch (soapErr) {
    debugLog('Static DHCP delete SOAP nicht verfügbar, nutze data.lua:', soapErr.message);
  }
  // Versuch 2: data.lua Fallback
  try {
    const webSid = await getCachedWebSid(session);
    if (!webSid) return res.json({ success: false, error: 'Kein webSid verf\u00fcgbar' });
    const params = new URLSearchParams({
      xhr: '1', sid: webSid, lang: 'de', page: 'edit_device',
      'dev_ip': '', 'static_dhcp': '0', 'dev': mac,
      'btn_save': '', 'back_to_page': 'netDev', 'apply': '', 'oldpage': 'edit_device',
    });
    const r = await fetch(`http://${session.host}/data.lua`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (r.ok) {
      invalidateHosts();
      console.log('Static DHCP delete: data.lua Fallback erfolgreich');
      return res.json({ success: true, _source: 'data.lua' });
    }
    return res.json({ success: false, error: 'data.lua hat die \u00c4nderung nicht \u00fcbernommen' });
  } catch (err) {
    console.error('Static DHCP delete error (data.lua):', err.message);
    return res.json({ success: false, error: err.message });
  }
});

app.post('/api/fritz/device/block', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const { mac, blocked } = req.body;
  try {
    const hosts = getCached('hosts', 60000) || await getHostsViaSoap(session.host, session.username, session.password, session.controlUrls);
    const host = hosts.find(h => h.mac === mac);
    if (!host?.ip) return res.json({ success: false, error: 'IP-Adresse des Geräts nicht gefunden' });
    await soapRequest(session.host, 'urn:dslforum-org:service:X_AVM-DE_HostFilter:1', 'DisallowWANAccessByIP', session.username, session.password, session.controlUrls, { NewIPv4Address: host.ip, NewDisallow: blocked ? '1' : '0' });
    invalidateHosts();
    return res.json({ success: true });
  } catch (err) {
    console.error('Block device error:', err.message);
    return res.json({ success: false, error: err.message });
  }
});

// Gerät aus der FRITZ!Box-Hostliste entfernen.
// Primär TR-064 (`Hosts:1#X_AVM-DE_DeleteHost`, AVM-Erweiterung). Bei Boxen die das
// nicht implementieren (alte Firmwares) bleibt data.lua als Fallback. Die FRITZ!Box
// verweigert das Löschen aktiver Geräte – das prüfen wir vorab im Cache, damit der
// Anwender eine klare Fehlermeldung bekommt statt eines kryptischen UPnP-Fehlers.
app.delete('/api/fritz/device', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const { mac } = req.body || {};
  if (!mac) return res.json({ success: false, error: 'mac fehlt' });

  // Vorab: Online-Geräte ablehnen (FRITZ!Box würde sowieso fehlschlagen)
  const cachedHosts = getCached('hosts', 60000);
  if (Array.isArray(cachedHosts)) {
    const host = cachedHosts.find(h => h.mac === mac);
    if (host?.active) return res.json({ success: false, error: 'Aktive Geräte können nicht entfernt werden – Gerät muss offline sein.' });
  }

  // Versuch 1: TR-064. Wichtig: Parametername ist `NewMacAddress` (nicht `NewMACAddress`)
  try {
    await soapRequest(session.host, 'urn:dslforum-org:service:Hosts:1', 'X_AVM-DE_DeleteHost', session.username, session.password, session.controlUrls, { NewMacAddress: mac });
    invalidateHosts();
    cache.delete('netdev-map');
    lastSeenMap.delete(mac);
    return res.json({ success: true, _source: 'soap' });
  } catch (soapErr) {
    console.log('Delete host SOAP fehlgeschlagen, versuche data.lua:', soapErr.message);
  }

  // Versuch 2: data.lua-Fallback (FRITZ!Box-Web-UI nutzt selbe Route beim "×" auf netDev)
  try {
    const webSid = await getCachedWebSid(session);
    if (!webSid) return res.json({ success: false, error: 'Kein webSid verfügbar' });
    const params = new URLSearchParams({
      xhr: '1', sid: webSid, lang: 'de', page: 'netDev',
      dev: mac, btn_del: '', back_to_page: 'netDev',
    });
    const r = await fetch(`http://${session.host}/data.lua`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const text = await r.text();
    if (r.ok && !text.includes('"error"')) {
      invalidateHosts();
      cache.delete('netdev-map');
      lastSeenMap.delete(mac);
      return res.json({ success: true, _source: 'data.lua' });
    }
    return res.json({ success: false, error: 'data.lua hat das Löschen nicht bestätigt' });
  } catch (err) {
    console.error('Delete host error (data.lua):', err.message);
    return res.json({ success: false, error: err.message });
  }
});

app.post('/api/fritz/device/update', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const { mac, name } = req.body || {};
  if (!mac || !name) return res.json({ success: false, error: 'mac und name erforderlich' });
  try {
    // Hostnamen erlauben nur A–Z, a–z, 0–9 und Bindestrich (X_AVM-DE_HostnameAllowedChars)
    const sanitized = name.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss').replace(/[^A-Za-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);
    if (!sanitized) throw new Error('Name enthält keine gültigen Zeichen');
    await soapRequest(session.host, 'urn:dslforum-org:service:Hosts:1', 'X_AVM-DE_SetHostNameByMACAddress', session.username, session.password, session.controlUrls, { NewMACAddress: mac, NewHostName: sanitized });
    invalidateHosts();
    return res.json({ success: true });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

// ============ NETZWERK ============

// LAN-/DHCP-Konfiguration (LANHostConfigManagement#GetInfo) – wird von /network/lan,
// /network/dhcp und /ip-stats gebraucht, die das Frontend parallel aufruft. 60 s gecacht.
async function getLanInfo(session) {
  const cached = getCached('lan-info', 60000);
  if (cached) return cached;
  const r = await soapRequest(session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1', 'GetInfo', session.username, session.password, session.controlUrls);
  setCached('lan-info', r);
  return r;
}

app.get('/api/fritz/network/lan', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  try {
    return res.json(await getLanInfo(session));
  } catch {
    // Fallback für Modelle ohne LANHostConfigManagement (z. B. 7530 ältere Firmware)
    try {
      const webSid = await getCachedWebSid(session);
      if (!webSid) return res.json({});
      for (const page of ['lanExpert', 'lan', 'home']) {
        try {
          const params = new URLSearchParams({ xhr: '1', sid: webSid, lang: 'de', page, xhrId: 'all' });
          const r = await fetch(`http://${session.host}/data.lua`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
          const text = await r.text();
          if (!text.trim().startsWith('{')) continue;
          const d = JSON.parse(text)?.data || {};
          const ipAddr = d.ip_address || d.ipAddress || d.NewIPAddress || d.ip || '';
          const subnet = d.subnet_mask || d.subnetMask || d.NewSubnetMask || '';
          const minAddr = d.dhcp_start || d.dhcpStart || d.NewMinAddress || '';
          const maxAddr = d.dhcp_end   || d.dhcpEnd   || d.NewMaxAddress || '';
          if (ipAddr || minAddr) return res.json({ NewIPAddress: ipAddr, NewSubnetMask: subnet, NewMinAddress: minAddr, NewMaxAddress: maxAddr, _source: 'data.lua' });
        } catch {}
      }
    } catch {}
    console.error('LAN error: Kein kompatibler LAN-Endpunkt gefunden');
    return res.json({});
  }
});

// Anzeigename der Anschlussart (WANCommonInterfaceConfig#GetCommonLinkProperties)
// Werte laut AVM-Spezifikation WANCommonInterfaceConfig (v22, 2026-02)
const WAN_ACCESS_LABELS = {
  'DSL': 'DSL', 'Ethernet': 'Ethernet', 'X_AVM-DE_Fiber': 'Glasfaser',
  'X_AVM-DE_Cable': 'Kabel', 'X_AVM-DE_LTE': 'Mobilfunk (LTE/5G)', 'X_AVM-DE_UMTS': 'Mobilfunk (UMTS)',
};

// WAN-Status zusammentragen: welcher Verbindungsdienst aktiv ist, externe IPv4/IPv6,
// Anschlussart (DSL/Glasfaser/Kabel/Mobilfunk – Issue #33: DSL vs. LTE-Backup),
// Layer-1-Raten und bei DSL die Leitungswerte. 60 s gecacht; genutzt vom
// /network/wan-Endpoint und vom HA-Sensor-Push. Null, wenn kein WAN-Dienst antwortet.
async function getWanStatus(session) {
  const cached = getCached('wan-status', 60000);
  if (cached) return cached;
  const soap = (svc, action) => soapRequest(session.host, svc, action, session.username, session.password, session.controlUrls);
  const PPP = 'urn:dslforum-org:service:WANPPPConnection:1';
  const IP  = 'urn:dslforum-org:service:WANIPConnection:1';
  const IGD = 'urn:schemas-upnp-org:service:WANIPConnection:1';

  // Issue #39: Auf DSL-Boxen (7530) existieren PPP- UND IP-Dienst; der zuerst probierte
  // IP-Dienst meldete „Connecting" ohne IP. Layer3Forwarding nennt den aktiven Dienst.
  let order = [IP, PPP, IGD];
  try {
    const def = await soap('urn:dslforum-org:service:Layer3Forwarding:1', 'GetDefaultConnectionService');
    if (/WANPPPConnection/i.test(def?.NewDefaultConnectionService || '')) order = [PPP, IP, IGD];
  } catch {}

  let result = null;
  let fallback = null;
  for (const svc of order) {
    try {
      const [ip, status] = await Promise.all([soap(svc, 'GetExternalIPAddress'), soap(svc, 'GetStatusInfo')]);
      const entry = { ...ip, ...status, _wanService: svc, NewConnectionType: svc === PPP ? 'PPPoE' : 'IP' };
      // Bevorzugt den Dienst, der tatsächlich verbunden ist
      if (status?.NewConnectionStatus === 'Connected') { result = entry; break; }
      if (!fallback) fallback = entry;
    } catch {}
  }
  result = result || fallback;
  if (!result) return null;

  try {
    const v6 = await soap(IP, 'X_AVM-DE_GetExternalIPv6Address');
    if (v6?.NewExternalIPv6Address) result.ipv6 = v6.NewExternalIPv6Address;
  } catch {}
  const WCIC = 'urn:dslforum-org:service:WANCommonInterfaceConfig:1';
  try {
    const link = await soap(WCIC, 'GetCommonLinkProperties');
    result.accessType      = link?.NewWANAccessType || '';
    result.accessTypeLabel = WAN_ACCESS_LABELS[result.accessType] || (result.accessType === 'unknown' ? '' : result.accessType);
    result.linkStatus      = link?.NewPhysicalLinkStatus || '';
    result.upstreamMax     = parseInt(link?.NewLayer1UpstreamMaxBitRate   || '0', 10) || 0; // bit/s
    result.downstreamMax   = parseInt(link?.NewLayer1DownstreamMaxBitRate || '0', 10) || 0;
  } catch {}
  // Sync-/Brutto-/Tarif-Raten für ALLE Anschlussarten (nicht nur DSL) – neu in der
  // AVM-Spezifikation 2026-02; ältere Firmwares kennen die Aktion nicht
  try {
    const a = await soap(WCIC, 'X_AVM-DE_GetAddonInfos');
    const n = (v) => parseInt(v || '0', 10) || 0;
    const rates = {
      syncDown: n(a?.['NewX_AVM-DE_SyncDownstream']),     syncUp: n(a?.['NewX_AVM-DE_SyncUpstream']),
      tariffDown: n(a?.['NewX_AVM-DE_TariffDataRateDownstream']), tariffUp: n(a?.['NewX_AVM-DE_TariffDataRateUpstream']),
    };
    if (Object.values(rates).some(Boolean)) result.rates = rates; // bit/s
    if (!result.accessType && a?.['NewX_AVM-DE_WANAccessType']) {
      result.accessType = a['NewX_AVM-DE_WANAccessType'];
      result.accessTypeLabel = WAN_ACCESS_LABELS[result.accessType] || '';
    }
  } catch {}
  try {
    const p = await soap(WCIC, 'X_AVM-DE_GetActiveProvider');
    if (p?.['NewX_AVM-DE_Provider']) result.provider = p['NewX_AVM-DE_Provider'];
  } catch {}
  if (!result.accessType || result.accessType === 'DSL') {
    try {
      const d = await soap('urn:dslforum-org:service:WANDSLInterfaceConfig:1', 'GetInfo');
      if (d && d.NewDownstreamCurrRate !== undefined) {
        // Raten in kbit/s, Störabstand/Dämpfung in 0,1 dB
        const tenth = (v) => (v === undefined || v === '' ? null : +(parseInt(v, 10) / 10).toFixed(1));
        result.dsl = {
          status:        d.NewStatus || '',
          downCurr:      parseInt(d.NewDownstreamCurrRate || '0', 10) || 0,
          upCurr:        parseInt(d.NewUpstreamCurrRate   || '0', 10) || 0,
          downMax:       parseInt(d.NewDownstreamMaxRate  || '0', 10) || 0,
          upMax:         parseInt(d.NewUpstreamMaxRate    || '0', 10) || 0,
          snrDown:       tenth(d.NewDownstreamNoiseMargin),
          snrUp:         tenth(d.NewUpstreamNoiseMargin),
          attDown:       tenth(d.NewDownstreamAttenuation),
          attUp:         tenth(d.NewUpstreamAttenuation),
        };
        // Fehlerzähler seit dem letzten Sync – hilfreich bei instabilen Leitungen
        try {
          const st = await soap('urn:dslforum-org:service:WANDSLInterfaceConfig:1', 'GetStatisticsTotal');
          const n = (v) => (v === undefined || v === '' ? null : parseInt(v, 10) || 0);
          result.dsl.crcErrors = n(st?.NewCRCErrors);
          result.dsl.fecErrors = n(st?.NewFECErrors);
          result.dsl.erroredSecs = n(st?.NewErroredSecs);
        } catch {}
      }
    } catch {}
  }
  setCached('wan-status', result);
  return result;
}

app.get('/api/fritz/network/wan', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const wan = await getWanStatus(session);
  if (wan) return res.json(wan);
  // Fallback via data.lua (z.B. Fritz!Box 6490 ohne vollständigen TR-064-Zugriff)
  try {
    const webSid = await getCachedWebSid(session);
    if (webSid) {
      for (const page of ['internet', 'wan', 'netMoni', 'home']) {
        try {
          const params = new URLSearchParams({ xhr: '1', sid: webSid, lang: 'de', page, xhrId: 'all' });
          const r = await fetch(`http://${session.host}/data.lua`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
          const text = await r.text();
          if (!text.trim().startsWith('{')) continue;
          const d = JSON.parse(text)?.data || {};
          const externalIp = d.ip || d.ipv4 || d.external_ip || d.wan_ip || d.internetIp || '';
          const connStatus = d.connection || d.wanStatus || d.status || '';
          if (externalIp) return res.json({ NewExternalIPAddress: externalIp, NewConnectionStatus: connStatus, _source: 'data.lua' });
        } catch {}
      }
    }
  } catch {}
  console.error('WAN error: Kein kompatibler WAN-Service gefunden (weder IPConnection noch PPPConnection)');
  return res.json({});
});

// XML-Entities auflösen (`&auml;` / `&#252;` / `&#xE4;`). SOAP-Antworten der Fritz!Box
// liefern Umlaute teils als benannte oder numerische Entities; ohne Decode landen sie
// als `Mein Caf&eacute;` im UI.
function decodeXmlEntities(s) {
  if (typeof s !== 'string' || s.indexOf('&') === -1) return s;
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
    auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü',
    szlig: 'ß', eacute: 'é', Eacute: 'É', agrave: 'à', egrave: 'è',
    nbsp: ' ' };
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => (named[n] !== undefined ? named[n] : m));
}

// Vorhandene WLANConfiguration-Indizes ermitteln: aus den per tr64desc.xml entdeckten
// Services (Tri-Band-Boxen wie die 5690 Pro haben 4: 2.4/5/6 GHz + Gast), mindestens 1–4.
// Issue #31: mit fest 1–4 fehlte auf Tri-Band-Boxen kein Index, aber die Discovery kann
// auch mehr liefern – daher dynamisch.
function wlanServiceIndices(session) {
  const indices = new Set([1, 2, 3, 4]);
  for (const svc of Object.keys(session.controlUrls || {})) {
    const m = svc.match(/^urn:dslforum-org:service:WLANConfiguration:(\d+)$/);
    if (m) indices.add(parseInt(m[1], 10));
  }
  return [...indices].sort((a, b) => a - b);
}

// WLAN-Aktiv-Status robust auslesen – neuere Boxen liefern teils "true"/"Up" in
// anderer Schreibweise (Issue #31: WLAN als „Inaktiv" angezeigt obwohl eingeschaltet)
function wlanEnabled(info) {
  const status = String(info?.NewStatus || '').toLowerCase();
  const enable = String(info?.NewEnable || '').toLowerCase();
  return status === 'up' || enable === '1' || enable === 'true';
}

app.get('/api/fritz/network/wlan', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  try {
    const results = [];
    for (const i of wlanServiceIndices(session)) {
      try {
        const svc = `urn:dslforum-org:service:WLANConfiguration:${i}`;
        const info = await soapRequest(session.host, svc, 'GetInfo', session.username, session.password, session.controlUrls);
        if (!info || typeof info !== 'object' || info.NewSSID === undefined) continue;
        let keyPassphrase = '';
        try {
          const keys = await soapRequest(session.host, svc, 'GetSecurityKeys', session.username, session.password, session.controlUrls);
          keyPassphrase = keys.NewKeyPassphrase || '';
        } catch {}
        // Frequenzband direkt von der Box erfragen (2400/5000/6000) – zuverlässiger als
        // die Kanal-Heuristik und einzige Möglichkeit, 6-GHz-WLANs zu erkennen (Issue #31)
        let band = '';
        try {
          const ext = await soapRequest(session.host, svc, 'X_AVM-DE_GetWLANExtInfo', session.username, session.password, session.controlUrls);
          band = ext?.['NewX_AVM-DE_FrequencyBand'] || '';
        } catch {}
        if (info.NewSSID) info.NewSSID = decodeXmlEntities(info.NewSSID);
        if (info.NewSecure) info.NewSecure = decodeXmlEntities(info.NewSecure);
        results.push({ ...info, NewKeyPassphrase: decodeXmlEntities(keyPassphrase), _index: i, _band: band });
      } catch {}
    }
    return res.json(results);
  } catch (err) {
    console.error('WLAN error:', err.message);
    return res.json([]);
  }
});

// WLAN (z. B. Gastzugang) ein-/ausschalten. TR-064-`SetEnable` braucht in der
// Fritz!Box-Benutzerverwaltung „FRITZ!Box-Einstellungen" inkl. Schreibrecht.
// Helper wird sowohl vom REST-Endpoint als auch vom MQTT-Command-Handler genutzt.
async function setWlanEnable(session, index, enable) {
  const svc = `urn:dslforum-org:service:WLANConfiguration:${index}`;
  await soapRequest(session.host, svc, 'SetEnable', session.username, session.password, session.controlUrls, {
    NewEnable: enable ? '1' : '0',
  });
  // Cache invalidieren, damit der nächste Lesevorgang den neuen Status liefert
  cache.delete('network-wlan');
}

// Liest den Enable-Status aller WLAN-Konfigurationen (Index 1–4). 30 s gecacht unter
// `network-wlan`. Liefert nur tatsächlich vorhandene WLANs (GetInfo erfolgreich).
async function getWlanStates(session) {
  const cached = getCached('network-wlan', 30000);
  if (cached) return cached;
  const states = [];
  for (const i of wlanServiceIndices(session)) {
    try {
      const svc = `urn:dslforum-org:service:WLANConfiguration:${i}`;
      const info = await soapRequest(session.host, svc, 'GetInfo', session.username, session.password, session.controlUrls);
      if (!info || typeof info !== 'object' || info.NewSSID === undefined) continue;
      const ssid = decodeXmlEntities(info.NewSSID || '');
      states.push({ index: i, ssid, enabled: wlanEnabled(info), label: ssid || `WLAN ${i}` });
    } catch {}
  }
  if (states.length) setCached('network-wlan', states);
  return states;
}

app.post('/api/fritz/network/wlan/enable', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const { index, enable } = req.body || {};
  if (!index || enable === undefined) return res.status(400).json({ error: 'index und enable erforderlich' });
  try {
    await setWlanEnable(session, index, enable);
    return res.json({ success: true });
  } catch (err) {
    console.error(`WLAN ${index} SetEnable error:`, err.message);
    return res.json({ success: false, error: err.message });
  }
});

app.post('/api/fritz/network/wlan', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const { index, passphrase } = req.body;
  if (!index || !passphrase) return res.status(400).json({ error: 'index und passphrase erforderlich' });
  try {
    const svc = `urn:dslforum-org:service:WLANConfiguration:${index}`;
    const current = await soapRequest(session.host, svc, 'GetSecurityKeys', session.username, session.password, session.controlUrls);
    await soapRequest(session.host, svc, 'SetSecurityKeys', session.username, session.password, session.controlUrls, {
      NewWEPKey0: current.NewWEPKey0 || '',
      NewWEPKey1: current.NewWEPKey1 || '',
      NewWEPKey2: current.NewWEPKey2 || '',
      NewWEPKey3: current.NewWEPKey3 || '',
      NewPreSharedKey: current.NewPreSharedKey || passphrase,
      NewKeyPassphrase: passphrase,
    });
    return res.json({ success: true });
  } catch (err) {
    console.error('WLAN set key error:', err.message);
    return res.json({ success: false, error: err.message });
  }
});

app.get('/api/fritz/network/dhcp', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  try {
    return res.json(await getLanInfo(session));
  } catch {
    // Fallback via data.lua (z. B. 7530 ältere Firmware)
    try {
      const webSid = await getCachedWebSid(session);
      if (!webSid) return res.json({});
      for (const page of ['lanExpert', 'lan', 'home']) {
        try {
          const params = new URLSearchParams({ xhr: '1', sid: webSid, lang: 'de', page, xhrId: 'all' });
          const r = await fetch(`http://${session.host}/data.lua`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
          const text = await r.text();
          if (!text.trim().startsWith('{')) continue;
          const d = JSON.parse(text)?.data || {};
          const minAddr = d.dhcp_start || d.dhcpStart || d.NewMinAddress || '';
          const maxAddr = d.dhcp_end   || d.dhcpEnd   || d.NewMaxAddress || '';
          const subnet  = d.subnet_mask || d.subnetMask || d.NewSubnetMask || '';
          if (minAddr || maxAddr) return res.json({ NewMinAddress: minAddr, NewMaxAddress: maxAddr, NewSubnetMask: subnet, _source: 'data.lua' });
        } catch {}
      }
    } catch {}
    console.error('DHCP error: Kein kompatibler DHCP-Endpunkt gefunden');
    return res.json({});
  }
});

// ============ IP STATS ============

function ipToInt(ip) {
  const parts = (ip || '').split('.');
  if (parts.length !== 4) return 0;
  return ((parseInt(parts[0], 10) << 24) | (parseInt(parts[1], 10) << 16) | (parseInt(parts[2], 10) << 8) | parseInt(parts[3], 10)) >>> 0;
}

// Belegung des DHCP-Bereichs (gesamt/vergeben/frei), 30 s gecacht – vom Endpoint und
// vom HA-Push („Freie IP-Adressen") genutzt
async function getIpStats(session) {
  const cached = getCached('ip-stats', 30000);
  if (cached) return cached;
  const calcStats = async (minAddress, maxAddress) => {
    const hosts = await getEnrichedHosts(session).catch(() => []);
    const minInt = ipToInt(minAddress);
    const maxInt = ipToInt(maxAddress);
    const total = (minInt && maxInt && maxInt >= minInt) ? maxInt - minInt + 1 : 0;
    const used = hosts.filter(h => { if (!h.ip) return false; const ipInt = ipToInt(h.ip); return ipInt >= minInt && ipInt <= maxInt; }).length;
    return { total, used, free: Math.max(0, total - used), minAddress, maxAddress };
  };
  let range = null;
  try {
    const dhcp = await getLanInfo(session);
    range = [dhcp.NewMinAddress || '', dhcp.NewMaxAddress || ''];
  } catch (err) {
    debugLog('IP-Stats: LANHostConfigManagement nicht verfügbar:', err.message);
    // Fallback via data.lua für ältere Modelle (z.B. 6490) ohne TR-064-Zugriff
    const webSid = await getCachedWebSid(session);
    for (const page of webSid ? ['lanExpert', 'lan', 'home'] : []) {
      try {
        const params = new URLSearchParams({ xhr: '1', sid: webSid, lang: 'de', page, xhrId: 'all' });
        const r = await fetch(`http://${session.host}/data.lua`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
        const text = await r.text();
        if (!text.trim().startsWith('{')) continue;
        const d = JSON.parse(text)?.data || {};
        const minAddr = d.dhcp_start || d.dhcpStart || d.NewMinAddress || '';
        const maxAddr = d.dhcp_end   || d.dhcpEnd   || d.NewMaxAddress || '';
        if (minAddr && maxAddr) { range = [minAddr, maxAddr]; break; }
      } catch {}
    }
  }
  if (!range) return { total: 0, used: 0, free: 0, minAddress: '', maxAddress: '' };
  const result = await calcStats(range[0], range[1]);
  setCached('ip-stats', result);
  return result;
}

app.get('/api/fritz/ip-stats', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  return res.json(await getIpStats(session));
});

// ============ MESH ============

// ── Offizielle Mesh-Topologie (TR-064 Hosts:1#X_AVM-DE_GetMeshListPath) ──
// Die Box liefert einen Pfad zu einer JSON-Datei mit allen Mesh-Knoten, ihren
// Schnittstellen (AP:2G/5G/6G, LAN-Ports) und den Verbindungen dazwischen inkl.
// Linkrate und Signalqualität. Das ist dieselbe Quelle wie die Mesh-Übersicht der
// FRITZ!Box-Oberfläche – funktioniert ohne Web-Login (data.lua) und unabhängig vom
// Modell (Issues #35/#37/#38/#39: Repeater-Hierarchie fehlte, alles hing am Master).
async function fetchMeshList(session) {
  const r = await soapRequest(session.host, 'urn:dslforum-org:service:Hosts:1', 'X_AVM-DE_GetMeshListPath', session.username, session.password, session.controlUrls);
  const path = r?.['NewX_AVM-DE_MeshListPath'];
  if (!path) return null;
  const res = await fetch(`http://${session.host}:49000${path.startsWith('/') ? '' : '/'}${path}`);
  if (!res.ok) return null;
  const json = await res.json();
  return Array.isArray(json?.nodes) && json.nodes.length > 0 ? json : null;
}

// Frequenzband einer Mesh-Schnittstelle: aus dem Namen ("AP:5G:0") oder dem Kanal
function meshIfaceBand(iface) {
  const name = String(iface?.name || '').toUpperCase();
  if (name.includes(':2G')) return '2,4 GHz';
  if (name.includes(':5G')) return '5 GHz';
  if (name.includes(':6G')) return '6 GHz';
  const ch = parseInt(iface?.current_channel, 10);
  if (ch >= 1 && ch <= 14) return '2,4 GHz';
  if (ch >= 32 && ch <= 177) return '5 GHz';
  return '';
}

function formatMbit(mbit) {
  if (!mbit) return '';
  return mbit >= 1000 ? `${+(mbit / 1000).toFixed(1)} Gbit/s` : `${Math.round(mbit)} Mbit/s`;
}

// Baut aus der Mesh-Liste das Frontend-Format { nodes, links } auf. Eltern-Kind-
// Beziehungen per Breitensuche ab dem Master: Repeater hängen am Master, Clients am
// Repeater, über den sie tatsächlich verbunden sind. Nur Knoten mit aktiver
// Verbindung (state CONNECTED) – Offline-Geräte zeigt die Geräteliste.
function buildMeshFromMeshList(json, hosts) {
  const nodesByUid = new Map();
  const ifaceByUid = new Map(); // Schnittstellen-UID → { node, iface }
  for (const n of json.nodes) {
    nodesByUid.set(n.uid, n);
    for (const i of n.node_interfaces || []) ifaceByUid.set(i.uid, { node: n, iface: i });
  }
  // Verbindungen sammeln (jede taucht an beiden Enden auf → per UID deduplizieren)
  const adj = new Map();
  const seen = new Set();
  for (const n of json.nodes) {
    for (const i of n.node_interfaces || []) {
      for (const l of i.node_links || []) {
        if (seen.has(l.uid) || String(l.state || '').toUpperCase() !== 'CONNECTED') continue;
        seen.add(l.uid);
        for (const [a, b] of [[l.node_1_uid, l.node_2_uid], [l.node_2_uid, l.node_1_uid]]) {
          if (!adj.has(a)) adj.set(a, []);
          adj.get(a).push({ peer: b, link: l });
        }
      }
    }
  }

  // Laut AVM-FAQ sind Schleifen möglich (PLC-Bus, Dual-Band-Verbindungen) und zwei
  // Knoten können mehrfach verbunden sein → schnellste Verbindung zuerst, damit die
  // Breitensuche sie als Eltern-Kind-Link wählt
  const rateOf = (l) => Math.max(+l.cur_data_rate_rx || 0, +l.cur_data_rate_tx || 0);
  for (const list of adj.values()) list.sort((a, b) => rateOf(b.link) - rateOf(a.link));

  const master = json.nodes.find(n => String(n.mesh_role).toLowerCase() === 'master') || json.nodes[0];
  const hostByMac = new Map((hosts || []).filter(h => h.mac).map(h => [h.mac, h]));
  const macsOf = (n) => [n.device_mac_address, ...(n.node_interfaces || []).map(i => i.mac_address)]
    .filter(Boolean).map(m => String(m).toLowerCase());
  const hostOf = (n) => { for (const m of macsOf(n)) { const h = hostByMac.get(m); if (h) return h; } return null; };

  const outNodes = [];
  const outLinks = [];
  const visited = new Set([master.uid]);
  const queue = [master.uid];
  const toNode = (n, linkInfo) => {
    const h = hostOf(n);
    const isMaster = n.uid === master.uid;
    const meshed = !!n.is_meshed;
    const role = isMaster ? 'master' : (meshed || String(n.mesh_role).toLowerCase() === 'slave') ? 'satellite' : 'client';
    const node = {
      uid: n.uid,
      name: n.device_name || h?.name || n.device_mac_address || 'Gerät',
      mac: String(n.device_mac_address || h?.mac || '').toLowerCase(),
      ip: h?.ip || '',
      role,
      is_meshed: meshed,
      model: n.device_model || h?.model || '',
      firmware: meshed ? (n.device_firmware_version || '') : '',
      updateAvailable: !!h?.updateAvailable,
      guest: !!h?.guest,
      url: meshed && !isMaster ? (h?.url || '') : '',
      interfaces: [{ type: linkInfo?.type || 'LAN', name: '' }],
    };
    if (linkInfo) {
      node.connType = linkInfo.type;
      node.connDetail = linkInfo.band;
      node.connSpeed = formatMbit(linkInfo.rate);
      node.connDisplay = [linkInfo.type + (linkInfo.band ? ' ' + linkInfo.band : ''), node.connSpeed].filter(Boolean).join(' → ');
      node.linkRate = linkInfo.rate;
      node.signal = linkInfo.signal;
      node.band = linkInfo.band;
    }
    return node;
  };

  outNodes.push(toNode(master, null));
  while (queue.length) {
    const parentUid = queue.shift();
    for (const { peer, link } of adj.get(parentUid) || []) {
      if (visited.has(peer) || !nodesByUid.has(peer)) continue;
      visited.add(peer);
      queue.push(peer);
      const lt = String(link.type || '').toUpperCase();
      const type = lt === 'WLAN' ? 'WLAN' : lt === 'PLC' ? 'PLC' : 'LAN'; // PLC = Powerline
      const rate = rateOf(link) / 1000; // kbit/s → Mbit/s
      // Band vom Access-Point-seitigen Interface (das des Elternknotens)
      const parentIfaceUid = link.node_1_uid === parentUid ? link.node_interface_1_uid : link.node_interface_2_uid;
      const band = type === 'WLAN' ? meshIfaceBand(ifaceByUid.get(parentIfaceUid)?.iface) : '';
      // RCPI → dBm (IEEE 802.11k: dBm = RCPI/2 − 110); 255 = unbekannt
      const rcpi = +link.rx_rcpi;
      const signal = type === 'WLAN' && rcpi > 0 && rcpi < 255 ? Math.round(rcpi / 2 - 110) : null;
      outNodes.push(toNode(nodesByUid.get(peer), { type, band, rate, signal }));
      outLinks.push({ from: parentUid, to: peer, type, speed: rate });
    }
  }
  // meshTotal: alle Mesh-fähigen FRITZ!-Geräte inkl. getrennter → „2 von 3 online"
  const meshTotal = json.nodes.filter(n => n.is_meshed).length;
  return { nodes: outNodes, links: outLinks, meshTotal, _source: 'meshlist' };
}

// Mesh-Topologie über die offizielle Schnittstelle, 30 s gecacht. Wird vom
// /api/fritz/mesh-Endpoint und vom HA-Sensor-Push (Mesh-Geräte) genutzt.
async function getOfficialMesh(session) {
  const cached = getCached('mesh-official', 30000);
  if (cached) return cached;
  try {
    const json = await fetchMeshList(session);
    if (!json) return null;
    const hosts = getCached('hosts', 300000)
      || await getHostsViaSoap(session.host, session.username, session.password, session.controlUrls).catch(() => []);
    const result = buildMeshFromMeshList(json, hosts);
    // Die Box selbst steht nicht in ihrer eigenen Host-Liste → IP aus der Session
    const master = result.nodes.find(n => n.role === 'master');
    if (master && !master.ip) master.ip = String(session.host || '').replace(/^https?:\/\//, '').split(':')[0];
    const sat = result.nodes.filter(n => n.role === 'satellite').length;
    console.log(`Mesh: offizielle Mesh-Liste – ${result.nodes.length} Knoten, davon ${sat} Mesh-Repeater`);
    setCached('mesh-official', result);
    return result;
  } catch (err) {
    console.log(`Mesh: GetMeshListPath nicht verfügbar (${err.message}) – Fallback auf Weboberfläche`);
    return null;
  }
}

// Zugangspunkte und Benutzer-Korrekturen (applyTopology) auf eine Mesh-Topologie
// übertragen – für alle Quellen (offizielle Mesh-Liste, Weboberfläche, Host-Liste).
// Platzierungen der FRITZ!-Mesh-Liste (z. B. unter einem FRITZ!Repeater) werden nur
// durch eine ausdrückliche Benutzerangabe überschrieben.
function applyTopologyToMesh(mesh, hosts) {
  if (!mesh?.nodes?.length) return mesh;
  const hostByMac = new Map(hosts.filter(h => h.mac).map(h => [h.mac, h]));
  const master = mesh.nodes.find(n => n.role === 'master') || mesh.nodes[0];
  const nodeByMac = new Map(mesh.nodes.filter(n => n.mac).map(n => [String(n.mac).toLowerCase(), n]));
  const linkTo = new Map(mesh.links.map(l => [l.to, l]));
  for (const n of mesh.nodes) {
    if (n === master) continue;
    const h = hostByMac.get(String(n.mac || '').toLowerCase());
    if (!h) continue;
    const ov = deviceOverrides[h.mac] || {};
    if (h.isInfra && n.role === 'client') n.infra = true;
    let link = linkTo.get(n.uid);
    const target = h.viaMac ? nodeByMac.get(h.viaMac) : ov.parent === 'box' ? master : null;
    const placedByAvm = link && link.from !== master.uid && mesh._source === 'meshlist';
    if (target && target !== n && (!placedByAvm || ov.parent)) {
      if (link) link.from = target.uid;
      else { link = { from: target.uid, to: n.uid, type: h.connType, speed: 0 }; mesh.links.push(link); linkTo.set(n.uid, link); }
    }
    if (h.viaMac || h.connType !== h.connAuto) {
      if (link) { link.type = h.connType; link.speed = 0; }
      Object.assign(n, {
        interfaces: [{ type: h.connType, name: '' }], connType: h.connType, connDisplay: h.connDisplay,
        connDetail: '', connSpeed: '', band: '', linkRate: 0, signal: null,
      });
    }
  }
  // Zyklen (z. B. A → B und B → A per Korrektur) auflösen: die Schleife an genau einer
  // Stelle trennen (dieser Knoten kommt an die Box) – Geräte darunter bleiben, wo sie sind
  for (const n of mesh.nodes) {
    const seen = new Set([n.uid]);
    let cur = linkTo.get(n.uid);
    while (cur && cur.from !== master.uid) {
      if (seen.has(cur.from)) { cur.from = master.uid; break; }
      seen.add(cur.from);
      cur = linkTo.get(cur.from);
    }
  }
  return mesh;
}

app.get('/api/fritz/mesh', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  const isWlanIface = (t) => { const s = (t || '').toLowerCase(); return s.includes('wlan') || s.includes('802.11') || s.includes('wireless') || s.includes('wifi'); };
  // Zugangspunkte/Korrekturen auf eine Kopie anwenden (gecachte Rohdaten bleiben unverändert)
  const enriched = await getEnrichedHosts(session).catch(() => []);
  const withTopology = (m) => applyTopologyToMesh(structuredClone(m), enriched);

  async function buildMeshFromHosts() {
    try {
      const hosts = enriched.length ? enriched : await getHostsViaSoap(session.host, session.username, session.password, session.controlUrls);
      if (!hosts || hosts.length === 0) return null;
      let masterName = 'FRITZ!Box';
      const di = getCached('device-info');
      if (di?.NewModelName) masterName = di.NewModelName;
      const masterNode = { uid: 'master', name: masterName, mac: '', ip: session.host, role: 'master', is_meshed: true, model: masterName, interfaces: [] };
      const masterIp = session.host.replace(/^https?:\/\//, '');
      const clientNodes = hosts.filter(h => h.active && h.ip !== masterIp && (h.name || '').toLowerCase() !== 'fritz.box').map((h, i) => ({
        uid: h.mac || String(i),
        name: h.name || h.ip || `Gerät ${i + 1}`,
        mac: h.mac || '',
        ip: h.ip || '',
        role: 'client',
        is_meshed: false,
        model: '',
        interfaces: [{ type: h.connType || h.interface || 'LAN', name: '' }],
        connDisplay: h.connDisplay || '',
      }));
      const links = clientNodes.map(c => ({
        from: 'master', to: c.uid,
        type: isWlanIface(c.interfaces[0]?.type) ? 'WLAN' : 'LAN',
        speed: 0,
      }));
      console.log(`Mesh: Fallback aus Host-Liste (${clientNodes.length} aktive Geräte)`);
      return { nodes: [masterNode, ...clientNodes], links, _source: 'hosts-fallback' };
    } catch (err) {
      console.log(`Mesh: Host-Fallback Fehler: ${err.message}`);
      return null;
    }
  }

  // Force-Hosts-Ansicht wenn source=hosts angefordert
  if (req.query.source === 'hosts') {
    const cached = getCached('mesh-hosts-fallback', 30000);
    if (cached) return res.json(cached);
    const result = await buildMeshFromHosts();
    if (result) {
      const out = withTopology(result);
      setCached('mesh-hosts-fallback', out);
      return res.json(out);
    }
    return res.json({ nodes: [], links: [] });
  }

  const cached = getCached('mesh-topology', 30000);
  if (cached) return res.json(cached);

  // Primär: offizielle Mesh-Liste (TR-064). Die Weboberflächen-Kaskade unten bleibt
  // als Fallback für Boxen/Firmwares ohne X_AVM-DE_GetMeshListPath.
  const official = await getOfficialMesh(session);
  if (official && official.nodes.length > 1) {
    const out = withTopology(official);
    setCached('mesh-topology', out);
    return res.json(out);
  }

  const webSid = await getCachedWebSid(session);
  if (!webSid) {
    console.log('Mesh: kein webSid verfügbar – Host-Liste als Fallback');
    const fb = await buildMeshFromHosts();
    return res.json(fb ? withTopology(fb) : { nodes: [], links: [] });
  }

  // timeoutFetch: Holt den Rate-Limiter-Slot ZUERST und startet den Abort-Timer dann.
  // So wird die Queue-Wartezeit nicht vom Timeout-Budget abgezogen – wichtig seit 1.3.9
  // (strengere Limits: 2 parallel data.lua + 400ms Mindestabstand).
  async function timeoutFetch(url, opts = {}, ms = 8000) {
    const urlStr = typeof url === 'string' ? url : String(url || '');
    const needsDataSlot = urlStr.includes('/data.lua');
    const needsSoapSlot = !needsDataSlot && urlStr.includes(':49000');
    const release = needsDataSlot ? await acquireDataLuaSlot()
                  : needsSoapSlot ? await acquireSoapSlot()
                  : () => {};
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      // Direkt _origFetch – sonst würde patchedFetch einen zweiten Slot holen.
      return await (needsDataSlot || needsSoapSlot
        ? _origFetch(url, { ...opts, signal: ctrl.signal })
        : fetch(url, { ...opts, signal: ctrl.signal }));
    } finally {
      clearTimeout(timer);
      release();
    }
  }

  // Gemeinsamer Mesh-Extractor – wird sowohl von /data.lua-Antworten als auch von
  // den älteren `.lua`-Endpunkten (meshlist, mesh_overview) verwendet. Die FRITZ!OS-7.50+
  // mesh_overview-Variante (6690/6860) packt die Topologie z. B. unter `data.topology`,
  // ältere meshlist.lua-Antworten unter `meshlist.nodes` – wir prüfen alle bekannten Pfade.
  function extractMeshFromJson(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const containers = [raw, raw.data, raw.meshlist, raw.data?.meshlist, raw.data?.mesh];
    for (const c of containers) {
      if (!c || typeof c !== 'object') continue;
      const nodeList = c.nodes || c.meshNodes || c.mesh_nodes ||
                       c.topology?.nodes || c.topo?.nodes ||
                       c.vars?.topology?.nodes || null;
      const linkList = c.links || c.meshLinks || c.mesh_links ||
                       c.topology?.links || c.topo?.links ||
                       c.vars?.topology?.links || null;
      if (nodeList && Array.isArray(nodeList) && nodeList.length > 0) {
        return normalizeMeshData(nodeList, linkList || []);
      }
    }
    const d = raw?.data || raw || {};
    // netDev-Format: { data: { active: [...], passive: [...] } } – Quelle der Fritz-UI-Mesh-Ansicht
    const activeDevices = Array.isArray(d.active) ? d.active : null;
    if (activeDevices && activeDevices.length > 0) {
      return normalizeMeshDevices(activeDevices);
    }
    const devices = d.devices || d.data || [];
    if (Array.isArray(devices) && devices.length > 0) {
      const meshDevices = devices.filter(dev =>
        dev.mesh_role || dev.is_mesh_master !== undefined || dev.meshRole ||
        dev.node_interfaces || dev.type === 'mesh_master' || dev.type === 'mesh_satellite'
      );
      if (meshDevices.length > 0) return normalizeMeshDevices(meshDevices);
    }
    return null;
  }

  async function tryDataLuaPage(page, xhrId = 'all', timeoutMs = 15000) {
    try {
      const params = new URLSearchParams({ xhr: '1', sid: webSid, lang: 'de', page, xhrId });
      const r = await timeoutFetch(`http://${session.host}/data.lua`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      }, timeoutMs);
      const text = await r.text();
      console.log(`Mesh: page=${page}${xhrId !== 'all' ? ' xhrId=' + xhrId : ''} status=${r.status} length=${text.length}`);
      if (!text.trim().startsWith('{')) return null;
      const raw = JSON.parse(text);
      const result = extractMeshFromJson(raw);
      if (!result) {
        const topKeys = Object.keys(raw || {}).slice(0, 10).join(',');
        const dataKeys = raw?.data && typeof raw.data === 'object' ? Object.keys(raw.data).slice(0, 10).join(',') : '';
        console.log(`Mesh: page=${page} extract leer (top=[${topKeys}] data=[${dataKeys}])`);
      }
      return result;
    } catch (err) {
      console.log(`Mesh: page=${page} Fehler: ${err.message}`);
      return null;
    }
  }

  async function tryUrl(label, url) {
    try {
      const r = await timeoutFetch(url, {}, 8000);
      const text = await r.text();
      console.log(`Mesh: ${label} status=${r.status} length=${text.length}`);
      if (r.status === 404) return null;
      if (!text.trim().startsWith('{')) return null;
      const raw = JSON.parse(text);
      const result = extractMeshFromJson(raw);
      if (!result) {
        const topKeys = Object.keys(raw || {}).slice(0, 10).join(',');
        const dataKeys = raw?.data && typeof raw.data === 'object' ? Object.keys(raw.data).slice(0, 10).join(',') : '';
        console.log(`Mesh: ${label} extract leer (top=[${topKeys}] data=[${dataKeys}])`);
      }
      return result;
    } catch (err) {
      console.log(`Mesh: ${label} Fehler: ${err.message}`);
      return null;
    }
  }

  console.log('Mesh: starte Abfragen (gestaffelt, mit Early-Exit)');

  // Phase 1: Nicht-data.lua-Endpunkte parallel – umgehen den Rate-Limiter
  const phase1 = await Promise.all([
    tryUrl('meshlist.lua',              `http://${session.host}/meshlist.lua?sid=${webSid}`),
    tryUrl('internet/meshlist.lua',     `http://${session.host}/internet/meshlist.lua?sid=${webSid}&useajax=1`),
    tryUrl('mesh_overview.lua',         `http://${session.host}/net/mesh_overview.lua?sid=${webSid}`),
  ]);
  let found = phase1.find(r => r !== null);

  // Phase 2: data.lua-Seiten seriell mit Early-Exit – verhindert Rate-Limiter-Staus.
  // netDev+xhrId=cleanup ist die Quelle, die die Fritz-Weboberfläche selbst für die
  // Mesh-Ansicht nutzt (liefert data.active mit mesh_role pro Gerät) → zuerst versuchen.
  // Für unbekannte Seiten hängt die Fritz!Box teilweise bis zum Timeout, daher kurze
  // Timeouts für die spekulativen Fallback-Seiten.
  if (!found) {
    const pages = [
      ['netDev',   'cleanup', 15000],
      ['mesh',     'all',     15000],
      ['meshTopo', 'all',      6000],
      ['netTopo',  'all',      6000],
      ['hostTopo', 'all',      6000],
    ];
    for (const [page, xhrId, ms] of pages) {
      const r = await tryDataLuaPage(page, xhrId, ms);
      if (r) { found = r; break; }
    }
  }

  if (found) {
    // Fritz!Box als Master sicherstellen – viele netDev-Responses enthalten die Box selbst
    // nicht in `data.active`, wodurch ein zufälliger Client als Master erschien.
    const hasMaster = (found.nodes || []).some(n => n.role === 'master');
    if (!hasMaster) {
      const MASTER_UID = '__fritzbox_master__';
      const di = getCached('device-info');
      const masterName = di?.NewModelName || 'FRITZ!Box';
      const masterIp = String(session.host || '').replace(/^https?:\/\//, '').split(':')[0];
      const masterNode = {
        uid: MASTER_UID,
        name: masterName,
        mac: di?.NewMACAddress || '',
        ip: masterIp,
        role: 'master',
        is_meshed: true,
        model: masterName,
        interfaces: [{ type: 'LAN', name: '' }],
      };
      found.nodes = [masterNode, ...(found.nodes || [])];
      // Waisen-Knoten (ohne eingehenden Link) unter den Master hängen.
      const linkedTo = new Set((found.links || []).map(l => l.to));
      const newLinks = [];
      for (const n of found.nodes) {
        if (n.uid === MASTER_UID) continue;
        if (!linkedTo.has(n.uid)) {
          newLinks.push({
            from:  MASTER_UID,
            to:    n.uid,
            type:  n.interfaces?.[0]?.type || 'LAN',
            speed: 0,
          });
        }
      }
      found.links = [...(found.links || []), ...newLinks];
      console.log(`Mesh: Kein Master im Response – FRITZ!Box als Master injiziert (${newLinks.length} Waisen verbunden)`);
    }
    const out = withTopology(found);
    setCached('mesh-topology', out);
    return res.json(out);
  }

  // Letzter Fallback: Pseudo-Mesh aus Host-Liste
  const hostFallback = await buildMeshFromHosts();
  if (hostFallback) {
    const out = withTopology(hostFallback);
    setCached('mesh-topology', out);
    return res.json(out);
  }

  // Negativ-Ergebnis ebenfalls cachen (60s) – verhindert wiederholte Timeouts bei jedem Seitenaufruf
  console.log('Mesh: keine Topologie-Daten gefunden');
  const empty = { nodes: [], links: [] };
  setCached('mesh-topology', empty, 60000);
  return res.json(empty);
});

function normalizeMeshData(nodes, links) {
  const normalized = nodes.map((n, i) => ({
    uid:       n.uid || n.id || n.mac || String(i),
    name:      n.friendly_name || n.name || n.hostname || n.FriendlyName || `Gerät ${i + 1}`,
    mac:       n.mac_address || n.mac || n.MACAddress || '',
    ip:        n.ipv4_address || n.ip || n.IPAddress || '',
    role:      (n.mesh_role || n.role || '').toLowerCase().includes('master') ? 'master'
             : (n.mesh_role || n.role || '').toLowerCase().includes('satellite') ? 'satellite'
             : 'client',
    is_meshed: n.is_meshed !== undefined ? n.is_meshed : (n.isMeshed || false),
    model:     n.device_model || n.model || '',
    interfaces: (n.node_interfaces || []).map(iface => ({
      type: iface.type || iface.medium || '',
      name: iface.name || '',
    })),
  }));
  const normalizedLinks = links.map(l => ({
    from: l.node1_uid || l.from || l.source || '',
    to:   l.node2_uid || l.to   || l.target || '',
    type: l.type || l.medium || 'LAN',
    speed: l.cur_data_rate_rx || l.speed || 0,
  }));
  return { nodes: normalized, links: normalizedLinks };
}

function normalizeMeshDevices(devices) {
  const roleOf = (d) => {
    if (d.active_mesh_master === 1 || d.active_mesh_master === '1') return 'master';
    if (d.is_mesh_master || d.own === true || d.is_own === true || d.own_device_data) return 'master';
    if (d.type === 'mesh_master' || d.type === 'own') return 'master';
    if (d.mesh_role === 'master' || d.meshRole === 'master') return 'master';
    if (d.mesh_role === 'slave' || d.mesh_role === 'satellite' || d.meshRole === 'satellite') return 'satellite';
    return 'client';
  };
  const nodes = devices.map((d, i) => {
    const conn = formatConnDetail(d);
    return {
      uid:       d.UID || d.uid || d.mac || String(i),
      name:      d.name || d.friendly_name || d.hostname || d.FriendlyName || `Gerät ${i + 1}`,
      mac:       d.mac || d.MACAddress || '',
      ip:        d.ipv4?.ip || d.ip || d.IPAddress || '',
      role:      roleOf(d),
      is_meshed: d.is_mesh_supported !== false,
      model:     d.model || d.device_model || d.product || '',
      interfaces: [{ type: conn.type || 'LAN', name: '' }],
      connDetail:  conn.detail,
      connSpeed:   conn.speed,
      connDisplay: conn.display,
    };
  });
  // Links aus Parent-Referenzen ableiten – bevorzugt master_wifi_uid (WLAN-Parent).
  const links = [];
  devices.forEach(d => {
    const parentUid = d.master_wifi_uid || d.parent?.uid || d.parent_uid || d.master_uid;
    const childUid  = d.UID || d.uid || d.mac;
    if (parentUid && childUid && parentUid !== childUid) {
      links.push({
        from:  parentUid,
        to:    childUid,
        type:  deviceIsWlan(d) ? 'WLAN' : 'LAN',
        speed: d.cur_data_rate_rx || d.speed || 0,
      });
    }
  });
  return { nodes, links };
}

// ============ TELEFONIE ============

// Strenge Namens-Normalisierung für Cross-Reference zwischen den Listen
// (SOAP-DECT, AHA-SmartHome, data.lua-DECT). Whitespace, Bindestriche,
// Unterstriche werden komprimiert; deutsche Umlaute/Akzente werden auf ASCII
// abgebildet. So matcht „Comet DECT-Bad" zwischen DECT- und AHA-Liste auch
// dann noch, wenn der User den Namen in einer Quelle anders geschrieben hat.
function normDectName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // Akzente strippen
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ''); // alles außer alnum killen → "Comet DECT-Bad" → "cometdectbad"
}

// Liefert die DECT-Klassifizierung aus data.lua?page=dect. Die FRITZ!Box-UI
// trennt dort sauber zwischen `handsets`/`mobiles` (= echte Telefone) und
// `devices` (= DECT-Smart-Home-Aktoren wie DECT 200, DECT 301, Comet DECT,
// HAN-FUN-Schaltsteckdosen). Das nutzen wir, um SOAP-Entries trennscharf
// zu klassifizieren – Cross-Reference mit AHA allein fängt Aktoren nicht ab,
// die in der AHA-Liste anders heißen oder dort gar nicht auftauchen.
async function fetchDectClassification(session) {
  const cached = getCached('dect-classification', 60000);
  if (cached) return cached;
  const empty = { phoneNames: new Set(), actorNames: new Set() };
  const webSid = await getCachedWebSid(session);
  if (!webSid) return empty;
  for (const page of ['dect', 'dectMobile', 'dectDevices']) {
    try {
      const params = new URLSearchParams({ xhr: '1', sid: webSid, lang: 'de', page, xhrId: 'all' });
      const r = await fetch(`http://${session.host}/data.lua`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const text = await r.text();
      if (!text.trim().startsWith('{')) continue;
      const d = JSON.parse(text)?.data || {};
      const dectData = d.dect || d;
      const handsetSources = [d.handsets, d.mobiles, dectData.handsets, dectData.mobiles].filter(Array.isArray);
      const actorSources   = [d.devices, dectData.devices, d.smartHome, dectData.smartHome].filter(Array.isArray);
      const result = { phoneNames: new Set(), actorNames: new Set() };
      for (const list of handsetSources) {
        for (const h of list) {
          const n = normDectName(h.name || h.device_name || h.displayname || '');
          if (n) result.phoneNames.add(n);
        }
      }
      for (const list of actorSources) {
        for (const a of list) {
          const n = normDectName(a.name || a.device_name || a.displayname || '');
          if (n) result.actorNames.add(n);
        }
      }
      if (result.phoneNames.size + result.actorNames.size > 0) {
        setCached('dect-classification', result);
        return result;
      }
    } catch {}
  }
  return empty;
}

// Heuristik: ist dieses Gerät ein DECT-Telefon (kein Smart-Home-Aktor)?
// AVM-Telefone tragen typischerweise den productname „FRITZ!Fon …" bzw. einen
// Namen mit „Mobilteil"/„Handset". Außerdem sind sie technisch HAN-FUN-Geräte
// ohne Schalt-/Heiz-/Sensor-Bits (functionbitmask == 0/1).
function looksLikePhone(d) {
  const name        = String(d.name        || '').toLowerCase();
  const productname = String(d.productname || '').toLowerCase();
  const mask        = parseInt(d.functionbitmask || '0', 10) || 0;
  if (productname.startsWith('fritz!fon') || productname.includes('handset')) return true;
  if (/\b(mobilteil|handset|fon\b|c5|c6|mt-d|x6)/i.test(name)) return true;
  // Smart-Home-spezifische Bits (Schalter/Heizung/Sensor/Lampe/Rollade) → kein Telefon
  const SMARTHOME_MASK = (1<<2)|(1<<4)|(1<<5)|(1<<6)|(1<<7)|(1<<8)|(1<<9)|(1<<13)|(1<<15)|(1<<16)|(1<<17)|(1<<18)|(1<<19)|(1<<20);
  if (mask & SMARTHOME_MASK) return false;
  return false;
}

// Liefert die rohe SmartHome-Geräteliste (AHA-XML, mit data.lua-Fallback) und cached
// das Ergebnis serverseitig. Wird sowohl von /api/fritz/smartHome als auch von
// /api/fritz/dect (zur Filterung) verwendet.
// FRITZ! Smart Home REST API (FRITZ!OS 8.20+, Spezifikation 1.0.0 für 8.50):
// GET /api/v0/smarthome/overview mit Header „Authorization: AVM-SID <sid>". Liefert
// Geräte inkl. Zigbee, Akkustand, Firmware und Update-Hinweis; die Messwerte stecken
// in den Units (Interfaces). Wir bilden auf das AHA-Format ab, das Frontend & DECT-
// Filter bereits kennen (temperature in 0,1 °C, power in mW, energy in Wh).
function mapSmartHomeRest(overview) {
  const unitsByDevice = new Map();
  for (const u of overview?.units || []) {
    if (!u.deviceUid) continue;
    if (!unitsByDevice.has(u.deviceUid)) unitsByDevice.set(u.deviceUid, []);
    unitsByDevice.get(u.deviceUid).push(u);
  }
  return (overview?.devices || []).map(d => {
    const dev = {
      identifier: d.ain || d.UID || '',
      name: d.name || d.productName || '',
      productname: d.productName || '',
      manufacturer: d.manufacturer || '',
      present: d.isConnected ? '1' : '0',
      category: d.productCategory || '',
      zigbee: !!d.isZigbeeDevice,
      firmware: d.firmwareVersion || '',
      updateAvailable: !!d.isUpdateAvailable,
      battery: Number.isFinite(d.batteryValue) ? d.batteryValue : null,
      batteryLow: !!d.isBatteryLow,
      _source: 'rest',
    };
    for (const u of unitsByDevice.get(d.UID) || []) {
      const i = u.interfaces || {};
      if (Number.isFinite(i.temperatureInterface?.celsius)) dev.temperature = Math.round(i.temperatureInterface.celsius * 10);
      if (Number.isFinite(i.humidityInterface?.relativeHumidity)) dev.humidity = i.humidityInterface.relativeHumidity;
      if (typeof i.onOffInterface?.active === 'boolean') dev.switch_state = i.onOffInterface.active ? '1' : '0';
      if (Number.isFinite(i.multimeterInterface?.power)) dev.power = i.multimeterInterface.power;
      if (Number.isFinite(i.multimeterInterface?.energy)) dev.energy = i.multimeterInterface.energy;
      const sp = i.thermostatInterface?.setPointTemperature;
      if (Number.isFinite(sp)) dev.tsoll_celsius = sp;
      if (Number.isFinite(i.levelControlInterface?.level)) dev.level = i.levelControlInterface.level;
      // Jüngster Messwert-/Alarm-Zeitstempel (Unix-Sekunden) → „zuletzt aktiv" im Dashboard
      const times = [i.temperatureInterface?.lastInfoTime, i.humidityInterface?.lastInfoTime,
        i.multimeterInterface?.lastInfoTimePower, i.alertInterface?.lastAlertTime].filter(Number.isFinite);
      if (times.length) dev.lastChange = Math.max(dev.lastChange || 0, ...times);
    }
    return dev;
  });
}

async function fetchSmartHomeRest(session, webSid) {
  if (!isValidSid(webSid)) return null;
  try {
    const r = await fetch(`http://${session.host}/api/v0/smarthome/overview`, {
      headers: { 'Authorization': `AVM-SID ${webSid}`, 'Accept': 'application/json' },
    });
    if (!r.ok) return null; // 404 auf FRITZ!OS < 8.20
    const devices = mapSmartHomeRest(await r.json());
    debugLog(`SmartHome: ${devices.length} Geräte über die Smart-Home-REST-API`);
    return devices;
  } catch { return null; }
}

async function fetchSmartHomeDevices(session) {
  const cached = getCached('smartHome', 60000); // 60s TTL – Smart-Home-Status ändert sich langsam
  if (cached) return cached;
  const webSid = await getCachedWebSid(session);
  if (!webSid) return [];
  // Primär (FRITZ!OS 8.20+): Smart-Home-REST-API – kennt auch Zigbee-Geräte
  const rest = await fetchSmartHomeRest(session, webSid);
  if (rest && rest.length > 0) {
    setCached('smartHome', rest);
    return rest;
  }
  // Danach: AHA-HTTP XML Interface (offizielle Schnittstelle bis FRITZ!OS 8.1x)
  try {
    const ahaUrl = `http://${session.host}/webservices/homeautoswitch.lua?switchcmd=getdevicelistinfos&sid=${webSid}`;
    const r = await fetch(ahaUrl);
    const xml = await r.text();
    if (xml.includes('<devicelist')) {
      const devices = parseAhaDeviceList(xml);
      if (devices.length > 0) {
        setCached('smartHome', devices);
        return devices;
      }
    }
  } catch {}
  // Fallback: data.lua
  try {
    const params = new URLSearchParams({ xhr: '1', sid: webSid, lang: 'de', page: 'smartHome', xhrId: 'all' });
    const r = await fetch(`http://${session.host}/data.lua`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const text = await r.text();
    if (text.trim().startsWith('{')) {
      const data = JSON.parse(text);
      const devices = data?.data?.devices || data?.data || [];
      if (Array.isArray(devices) && devices.length > 0) {
        const dedup = dedupSmartHomeDevices(devices);
        setCached('smartHome', dedup);
        return dedup;
      }
    }
  } catch {}
  setCached('smartHome', []); // negativ-cachen, sonst hämmert das Frontend bei jedem Reload
  return [];
}

app.get('/api/fritz/smartHome', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  try {
    const [all, classification] = await Promise.all([
      fetchSmartHomeDevices(session),
      fetchDectClassification(session).catch(() => ({ phoneNames: new Set(), actorNames: new Set() })),
    ]);
    const phoneNames = classification.phoneNames || new Set();
    // Telefone aus SmartHome rauswerfen – zwei Quellen kombiniert:
    //  - looksLikePhone() = Heuristik auf productname/Name
    //  - data.lua-handsets-Whitelist = was die FRITZ!Box selbst als „Mobilteil" listet
    const filtered = all.filter(d => {
      if (looksLikePhone(d)) return false;
      const n = normDectName(d.name);
      if (n && phoneNames.has(n)) return false;
      return true;
    });
    return res.json(filtered);
  } catch (err) {
    console.error('SmartHome error:', err.message);
    return res.json([]);
  }
});

// DECT-Geräteliste über TR-064. Primär X_AVM-DE_Dect#GetDectListPath (eine XML-Datei,
// FRITZ!OS 7.39+), sonst Einzelabruf per GetGenericDectEntry. Felder laut AVM-Spec:
// Id, Active, Name, Model, UpdateAvailable. Die Id trennt sauber: 1–6 = Telefone
// (Mobilteile), ab 16 = DECT-ULE-Geräte (Smart-Home-Aktoren wie DECT 200/301).
async function fetchDectEntries(session) {
  const DECT = 'urn:dslforum-org:service:X_AVM-DE_Dect:1';
  const soap = (action, params) => soapRequest(session.host, DECT, action, session.username, session.password, session.controlUrls, params);
  try {
    const r = await soap('GetDectListPath');
    const path = r?.NewDectListPath;
    if (path) {
      const res = await fetch(`http://${session.host}:49000${path.startsWith('/') ? '' : '/'}${path}`);
      if (res.ok) {
        const items = parseXmlItems(await res.text(), 'Item');
        if (items.length) return items.map(e => ({ id: parseInt(e.Id, 10), name: e.Name || '', model: e.Model || '', active: e.Active === '1', updateAvailable: e.UpdateAvailable === '1' }));
      }
    }
  } catch {}
  const list = [];
  try {
    const countRes = await soap('GetNumberOfDectEntries');
    const count = parseInt(countRes?.NewNumberOfEntries || '0', 10) || 0;
    for (let i = 0; i < count; i++) {
      try {
        const e = await soap('GetGenericDectEntry', { NewIndex: String(i) });
        list.push({ id: parseInt(e.NewID, 10), name: e.NewName || '', model: e.NewModel || '', active: e.NewActive === '1', updateAvailable: e.NewUpdateAvailable === '1' });
      } catch {}
    }
  } catch {}
  return list;
}

app.get('/api/fritz/dect', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  // 60s Cache – DECT-Status ändert sich selten
  const cached = getCached('dect', 60000);
  if (cached) return res.json(cached);
  try {
    const entries = await fetchDectEntries(session);
    // Mit Id lässt sich eindeutig klassifizieren – ohne Namens-Heuristik
    const hasIds = entries.some(e => Number.isFinite(e.id));
    let handsets = entries
      .filter(e => !hasIds || (e.id >= 1 && e.id <= 15))
      .map(e => ({
        name: e.name || `Mobilteil ${e.id || ''}`.trim(),
        model: e.model, id: String(e.id ?? ''), updateAvailable: e.updateAvailable,
        // registered: steht in der Liste; active: eingeschaltet und erreichbar
        registered: true, active: e.active, connected: false, battery: '',
      }));

    // Basisstation (DECT an/aus, Name, Eco) und Akkustand gibt es nur über data.lua –
    // GetDECTInfo ist keine TR-064-Aktion (schlug auf allen Boxen fehl)
    const baseInfo = {};
    const webSid = await getCachedWebSid(session);
    if (webSid) {
      for (const page of ['dect', 'dectReg', 'dectSet']) {
        try {
          const params = new URLSearchParams({ xhr: '1', sid: webSid, lang: 'de', page, xhrId: 'all' });
          const r = await fetch(`http://${session.host}/data.lua`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
          });
          const text = await r.text();
          if (!text.trim().startsWith('{')) continue;
          const d = JSON.parse(text);
          const dectData = d?.data?.dect || d?.data || {};
          if (dectData.active !== undefined) baseInfo.NewDECTActive = dectData.active === true || dectData.active === '1' ? '1' : '0';
          if (dectData.name || dectData.base_name || dectData.basename) baseInfo.NewDECTBaseName = dectData.name || dectData.base_name || dectData.basename;
          if (dectData.ecomode !== undefined) baseInfo.NewDECTPowerActive = dectData.ecomode === true || dectData.ecomode === '1' ? '1' : '0';
          // Nur `handsets`/`mobiles` sind Telefone – `devices` sind DECT-Aktoren
          const webList = [d?.data?.handsets, dectData.handsets, d?.data?.mobiles, dectData.mobiles].find(l => Array.isArray(l) && l.length);
          if (webList) {
            const fromWeb = webList.map(h => ({
              name: h.name || h.device_name || h.devicename || h.displayname || 'Mobilteil',
              model: h.model || h.product || h.productname || '',
              id: String(h.id || h.intern_id || h.index || ''),
              registered: true,
              active: h.active === '1' || h.active === true || h.connected === '1' || h.connected === true
                || h.registered === '1' || h.state === 'connected' || h.state === 'active',
              connected: h.incall === '1' || h.incall === true || h.state === 'incall',
              battery: String(h.battery || h.akku || h.batterycharge || ''),
            }));
            if (handsets.length === 0) {
              handsets = fromWeb;
            } else {
              // TR-064 liefert keinen Akkustand/Gesprächsstatus → aus der Weboberfläche ergänzen
              const byName = new Map(fromWeb.map(h => [normDectName(h.name), h]));
              for (const h of handsets) {
                const w = byName.get(normDectName(h.name));
                if (w) { h.battery = w.battery; h.connected = w.connected; }
              }
            }
            break;
          }
        } catch {}
      }
    }

    // Ohne Ids (nur data.lua-Daten): Aktoren über AHA-Liste/Modell/Heuristik aussortieren
    if (!hasIds && handsets.length) {
      const [shDevices, classification] = await Promise.all([
        fetchSmartHomeDevices(session).catch(() => []),
        fetchDectClassification(session).catch(() => ({ phoneNames: new Set(), actorNames: new Set() })),
      ]);
      const actorNames = new Set([...shDevices.map(d => normDectName(d.name)), ...(classification.actorNames || [])].filter(Boolean));
      const phoneNames = classification.phoneNames || new Set();
      handsets = handsets.filter(h => {
        const n = normDectName(h.name);
        if (n && phoneNames.has(n)) return true;
        if (n && actorNames.has(n)) return false;
        if (/dect\s*\d{3}|smart\s*(energy|thermo|control|gateway)|rollotron|comet|blind/i.test(h.model || '')) return false;
        // Issue #34: nicht eindeutig klassifizierbare Einträge behalten
        return true;
      });
    }

    if (handsets.length > 0 && baseInfo.NewDECTActive === undefined) baseInfo.NewDECTActive = '1';
    const result = { ...baseInfo, handsets };
    setCached('dect', result);
    return res.json(result);
  } catch (err) {
    console.error('DECT error:', err.message);
    return res.json({ handsets: [] });
  }
});

// Anrufliste holen – wird vom REST-Endpoint und vom HA-Telefonie-Sensor-Push genutzt.
// 60s Cache – Anrufliste muss nicht sekundengenau sein und der XML-Download
// war auf einigen Fritz!Boxen >5s.
async function fetchCallList(session) {
  const cached = getCached('calls', 60000);
  if (cached) return cached;
  let result = await soapRequest(session.host, 'urn:dslforum-org:service:X_AVM-DE_OnTel:1', 'GetCallList', session.username, session.password, session.controlUrls);
  if (!result?.NewCallListURL && !result?.['NewX_AVM-DE_CallListURL']) {
    result = await soapRequest(session.host, 'urn:dslforum-org:service:X_AVM-DE_VoIP:1', 'X_AVM-DE_GetCallList', session.username, session.password, session.controlUrls);
  }
  const callListUrl = result?.NewCallListURL || result?.['NewX_AVM-DE_CallListURL'];
  if (!callListUrl) return null;
  // Standard sind bis zu 999 Einträge – 250 reichen für Liste & Sensoren und entlasten
  // die Box (die Liste wird bei aktiven Telefonie-Sensoren minütlich geholt)
  const callRes = await fetch(`${callListUrl}${callListUrl.includes('?') ? '&' : '?'}max=250`);
  const xml = await callRes.text();
  const calls = [];
  const regex = /<Call>([\s\S]*?)<\/Call>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const x = match[1];
    const type = x.match(/<Type>([^<]*)<\/Type>/)?.[1] || '';
    const date = x.match(/<Date>([^<]*)<\/Date>/)?.[1] || '';
    // Issue #28: AVM kodiert Sonderzeichen in <Name>/<Device> als XML-Entities
    // (`&amp;` für `&`, `&auml;`/`&#252;` für Umlaute …). Ohne Decode landen die
    // 1:1 im Frontend – darum decodeXmlEntities auf alle Text-Felder.
    const name = decodeXmlEntities(x.match(/<Name>([^<]*)<\/Name>/)?.[1] || '');
    const duration = x.match(/<Duration>([^<]*)<\/Duration>/)?.[1] || '';
    const caller = decodeXmlEntities(x.match(/<Caller>([^<]*)<\/Caller>/)?.[1] || '');
    const called = decodeXmlEntities(x.match(/<Called>([^<]*)<\/Called>/)?.[1] || '');
    const device = decodeXmlEntities(x.match(/<Device>([^<]*)<\/Device>/)?.[1] || '');
    // Fritz-XML-Semantik: Caller = wer angerufen hat, Called = wer angerufen wurde.
    // Das passt 1:1 auf from/to – egal ob eingehend oder ausgehend.
    // Eingehend (1), Verpasst (2), Aktiv eingehend (9), Abgewiesen (10) → Gegenstelle = Caller.
    const isIncoming = type === '1' || type === '2' || type === '9' || type === '10';
    // number (Altfeld) zeigt weiterhin die Gegenstelle – für Rückwärtskompatibilität
    const number = isIncoming ? caller : called;
    // Issue #41: AVM liefert <Duration> als „h:mm" (Stunden:Minuten), nicht „m:ss" –
    // „0:05" sind 5 Minuten. Zusätzlich als Minutenwert für Anzeige & HA-Sensoren.
    const dm = duration.match(/^(\d+):(\d{1,2})$/);
    const durationMin = dm ? parseInt(dm[1], 10) * 60 + parseInt(dm[2], 10) : null;
    calls.push({ date, name, number, from: caller, to: called, device, type, duration, durationMin });
  }
  setCached('calls', calls);
  return calls;
}

app.get('/api/fritz/calls', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  try {
    const calls = await fetchCallList(session);
    return res.json(calls || []);
  } catch (err) {
    console.error('Calls error:', err.message);
    return res.json([]);
  }
});

// ============ TRAFFIC ============

async function collectTrafficCounters(session) {
  // 1. Versuche data.lua mit Web-SID (klassische FritzBox)
  const webSid = await getCachedWebSid(session);
  if (webSid) {
    try {
      const params = new URLSearchParams({ xhr: '1', sid: webSid, lang: 'de', page: 'netCnt', xhrId: 'all' });
      const r = await fetch(`http://${session.host}/data.lua`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const text = await r.text();

      if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
        try {
          const raw = JSON.parse(text);
          const d = raw?.data || raw || {};
          function rowBytes(e, dirIn) {
            const fields = dirIn ? [e.grossbytes_in, e.bytes_in, e.rx_bytes, e.rx, e.in] : [e.grossbytes_out, e.bytes_out, e.tx_bytes, e.tx, e.out];
            for (const f of fields) if (f !== undefined && f !== null) return parseInt(f) || 0;
            return 0;
          }
          function rowTime(e) {
            const fields = [e.time, e.onlinetime, e.online_time, e.onlineTime, e.duration];
            for (const f of fields) if (f !== undefined) { const s = parseInt(f) || 0; return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}`; }
            return '00:00';
          }
          const labels = ['Heute', 'Gestern', 'Aktuelle Woche', 'Aktueller Monat', 'Vormonat'];
          const mkRow = (e, i) => ({ name: e.name || labels[i], received: rowBytes(e, true), sent: rowBytes(e, false), onlineTime: rowTime(e), connections: parseInt(e.connections || '0') || 0 });
          if (d.today !== undefined) {
            const result = { rows: ['today','yesterday','week','month','last_month'].map((k,i) => mkRow(d[k]||{},i)) };
            setCached('traffic-counters', result);
            return result;
          }
          if (d.heute !== undefined) {
            const result = { rows: ['heute','gestern','woche','monat','vormonat'].map((k,i) => mkRow(d[k]||{},i)) };
            setCached('traffic-counters', result);
            return result;
          }
          const arr = Array.isArray(d) ? d : (d.tablelist || d.netCnt || d.count || d.stat || d.rows || d.list);
          if (Array.isArray(arr) && arr.length > 0) {
            const result = { rows: arr.slice(0,5).map((e,i) => mkRow(e,i)) };
            setCached('traffic-counters', result);
            return result;
          }
        } catch {}
      }

      // HTML fallback
      function parseNetCntHtml(html) {
        function extractJsData(h) {
          const idx = h.indexOf('const data = ');
          if (idx === -1) return null;
          const start = h.indexOf('{', idx);
          if (start === -1) return null;
          let depth = 0;
          for (let i = start; i < h.length; i++) {
            if (h[i] === '{') depth++;
            else if (h[i] === '}') { depth--; if (depth === 0) { try { return JSON.parse(h.substring(start, i + 1)); } catch { return null; } } }
          }
          return null;
        }
        function highLow(high, low) { return parseInt(high || '0') * 4294967296 + parseInt(low || '0'); }
        function jsKey(name) {
          const n = name.toLowerCase();
          if (n.includes('vormonat')) return 'LastMonth';
          if (n.includes('monat')) return 'ThisMonth';
          if (n.includes('woche')) return 'ThisWeek';
          if (n.includes('gestern')) return 'Yesterday';
          if (n.includes('heute')) return 'Today';
          return null;
        }
        const jsData = extractJsData(html);
        const trMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
        const allRows = trMatches.map(m => {
          const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => c[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
          return cells;
        }).filter(cells => cells.length >= 2);
        const keywords = ['heute', 'gestern', 'woche', 'monat', 'vormonat'];
        const dataRows = allRows.filter(row => row[0] && keywords.some(k => row[0].toLowerCase().includes(k)));
        if (dataRows.length === 0 && jsData) {
          const mapping = [
            { key: 'Today', name: 'Heute' }, { key: 'Yesterday', name: 'Gestern' },
            { key: 'ThisWeek', name: 'Aktuelle Woche' }, { key: 'ThisMonth', name: 'Aktueller Monat' },
            { key: 'LastMonth', name: 'Vormonat' },
          ];
          return mapping.filter(e => jsData[e.key]).map(e => ({
            name: e.name, onlineTime: '00:00',
            received: highLow(jsData[e.key].BytesReceivedHigh, jsData[e.key].BytesReceivedLow),
            sent: highLow(jsData[e.key].BytesSentHigh, jsData[e.key].BytesSentLow),
            connections: 0,
          }));
        }
        const labels = ['Heute', 'Gestern', 'Aktuelle Woche', 'Aktueller Monat', 'Vormonat'];
        return dataRows.slice(0, 5).map((cells, i) => {
          const name = cells[0] || labels[i];
          const onlineTime = cells.find(c => /^\d+:\d+$/.test(c)) || '00:00';
          const connCell = [...cells].reverse().find(c => /^\d+$/.test(c));
          const connections = connCell ? parseInt(connCell) : 0;
          let received = 0, sent = 0;
          if (jsData) { const k = jsKey(name); if (k && jsData[k]) { received = highLow(jsData[k].BytesReceivedHigh, jsData[k].BytesReceivedLow); sent = highLow(jsData[k].BytesSentHigh, jsData[k].BytesSentLow); } }
          return { name, onlineTime, received, sent, connections };
        });
      }

      const parsed = parseNetCntHtml(text);
      if (parsed && parsed.length > 0) {
        const result = { rows: parsed };
        setCached('traffic-counters', result);
        return result;
      }
    } catch (err) {
      console.error('Traffic counters data.lua error:', err.message);
    }
  }

  // 2. Fallback: FritzBox Gesamt-Traffic aus SOAP (Cable)
  try {
    const addonInfo = await getAddonInfos(session);
    const totalDown = parseInt(addonInfo['NewX_AVM_DE_TotalBytesReceived64'] || addonInfo['NewTotalBytesReceived'] || '0', 10) || 0;
    const totalUp = parseInt(addonInfo['NewX_AVM_DE_TotalBytesSent64'] || addonInfo['NewTotalBytesSent'] || '0', 10) || 0;
    const currentDown = parseInt(addonInfo['NewByteReceiveRate'] || '0', 10) || 0;
    const currentUp = parseInt(addonInfo['NewByteSendRate'] || '0', 10) || 0;
    const result = {
      rows: [
        { name: 'Gesamt', received: totalDown, sent: totalUp, onlineTime: '', connections: 0 },
      ],
      currentDown,
      currentUp,
    };
    setCached('traffic-counters', result);
    return result;
  } catch (err) {
    console.error('Traffic counters SOAP fallback error:', err.message);
    return { rows: [], currentDown: 0, currentUp: 0 };
  }
}

// Diagnose für die Traffic-Seite: welche Quelle liefert Zählerwerte? (Der Button „Diagnose"
// rief diesen Endpoint schon länger auf – er existierte aber nicht.)
app.get('/api/fritz/traffic-raw', async (req, res) => {
  const session = sessions.get(req.headers['x-fritz-sid']);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const gb = (b) => `${(b / 1073741824).toFixed(2)} GB`;
  const out = {};
  const webSid = await getCachedWebSid(session);
  if (!webSid) out['data.lua netCnt'] = 'kein Web-Login möglich';
  else {
    try {
      const params = new URLSearchParams({ xhr: '1', sid: webSid, lang: 'de', page: 'netCnt', xhrId: 'all' });
      const r = await fetch(`http://${session.host}/data.lua`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
      const text = await r.text();
      out['data.lua netCnt'] = text.trim().startsWith('{')
        ? `HTTP ${r.status}, JSON-Felder: ${Object.keys(JSON.parse(text)?.data || {}).slice(0, 12).join(', ') || '—'}`
        : `HTTP ${r.status}, ${text.length} Zeichen ${text.includes('const data') ? '(HTML mit Daten)' : '(keine Daten)'}`;
    } catch (e) { out['data.lua netCnt'] = `Fehler: ${e.message}`; }
  }
  try {
    const a = await getAddonInfos(session);
    const down = parseInt(a.NewX_AVM_DE_TotalBytesReceived64 || a.NewTotalBytesReceived || '0', 10) || 0;
    const up   = parseInt(a.NewX_AVM_DE_TotalBytesSent64     || a.NewTotalBytesSent     || '0', 10) || 0;
    out['TR-064 GetAddonInfos'] = down || up ? `seit Verbindungsaufbau ↓ ${gb(down)} / ↑ ${gb(up)}` : 'keine Werte';
  } catch (e) { out['TR-064 GetAddonInfos'] = `Fehler: ${e.message}`; }
  return res.json(out);
});

app.get('/api/fritz/traffic-counters', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  // Tages-/Monatszähler ändern sich langsam – 60 s reichen (vorher 10 s Default)
  const cached = getCached('traffic-counters', 60000);
  if (cached) return res.json(cached);

  return res.json(await collectTrafficCounters(session));
});

// Version endpoint
// Im Docker-Image liegt nur server/package.json (die Root-package.json wird nicht
// kopiert) – vorher lieferte der Endpoint dort immer den Fallback „1.1.2"
app.get('/api/fritz/version', (req, res) => res.json({ version: APP_VERSION }));

// ============ HA SENSOR PUSH ============

const HA_TOKEN = process.env.SUPERVISOR_TOKEN || process.env.HASSIO_TOKEN || '';
// Überschreibbar für Tests bzw. Docker-Standalone mit Long-Lived-Token (HA_API_URL)
const HA_API   = process.env.HA_API_URL || 'http://supervisor/core/api';

// Laufzeit-Einstellungen (aus /data/fritz-portal.json überschreibbar)
const SETTINGS_FILE = join(DATA_DIR, 'fritz-portal.json');
let haSensorsEnabled     = process.env.HA_SENSORS === 'true';
let haFastIntervalSec    = Math.max(10,  parseInt(process.env.HA_SENSORS_INTERVAL          || '60',  10));
let haTrafficIntervalSec = Math.max(30,  parseInt(process.env.HA_SENSORS_TRAFFIC_INTERVAL  || '300', 10));
// Telefonie-Sensoren (letzter Anruf / verpasst / eingehend) – Opt-in, weil nicht
// jeder Telefonie über die FRITZ!Box nutzt und der Anruflisten-Download die Box belastet.
let haPhoneSensorsEnabled = process.env.HA_PHONE_SENSORS === 'true';
// Default: aus. Wer dauerhafte HA-Sensor-Updates braucht, muss die Option in der
// System-Page (oder per Add-on-Config) explizit aktivieren.
let keepSessionAlive     = process.env.KEEP_SESSION_ALIVE === 'true';
// Default: aus. Wenn an, sammelt der Background-Collector den Traffic-Verlauf
// durchgehend (auch bei geschlossenem Portal), damit das Dashboard-Chart beim
// Zurückkehren die kompletten 30 min zeigt – kostet etwas mehr FritzBox-Last.
let trafficHistoryServer = process.env.TRAFFIC_HISTORY_SERVER === 'true';
// Optionale Dashboard-Boxen „Letzte Anrufe" und „SmartHome" (Standard: an)
let dashboardCalls     = true;
let dashboardSmartHome = true;

try {
  if (existsSync(SETTINGS_FILE)) {
    const s = JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'));
    if (s.ha_sensors !== undefined)             haSensorsEnabled     = !!s.ha_sensors;
    if (s.ha_sensors_interval)                  haFastIntervalSec    = Math.max(10,  parseInt(s.ha_sensors_interval,        10));
    if (s.ha_sensors_traffic_interval)          haTrafficIntervalSec = Math.max(30,  parseInt(s.ha_sensors_traffic_interval, 10));
    if (s.ha_phone_sensors !== undefined)       haPhoneSensorsEnabled = !!s.ha_phone_sensors;
    if (s.keep_session_alive !== undefined)     keepSessionAlive     = !!s.keep_session_alive;
    if (s.traffic_history_server !== undefined) trafficHistoryServer = !!s.traffic_history_server;
    if (s.dashboard_calls !== undefined)        dashboardCalls       = !!s.dashboard_calls;
    if (s.dashboard_smarthome !== undefined)    dashboardSmartHome   = !!s.dashboard_smarthome;
  }
} catch {}

// ── MQTT Discovery: Fritz!Box als eigenes Gerät in HA registrieren ──
let mqttAvailable = false;

async function publishMqtt(topic, payload, retain = false) {
  try {
    const payloadStr = typeof payload === 'object' ? JSON.stringify(payload) : String(payload);
    const res = await fetch(`${HA_API}/services/mqtt/publish`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${HA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, payload: payloadStr, retain }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error(`MQTT publish Fehler (${topic}): HTTP ${res.status} ${txt}`);
    }
    return res.ok;
  } catch (e) { console.error(`MQTT publish Fehler (${topic}):`, e.message); return false; }
}

function fritzboxDevice() {
  const di = getCached('device-info');
  return {
    identifiers: ['fritzportal_fritzbox'],
    name: 'FRITZ!Portal',
    manufacturer: 'FRITZ!Portal',
    model: di?.NewModelName || 'FRITZ!Box',
    sw_version: di?.NewFirmwareVersion || '',
    configuration_url: `http://${process.env.FRITZBOX_HOST || 'fritz.box'}`,
  };
}

const MQTT_SENSORS = [
  { id: 'cpu',            name: 'CPU-Auslastung',     unit: '%',   icon: 'mdi:chip',           device_class: null,          state_class: 'measurement' },
  { id: 'ram',            name: 'RAM-Auslastung',     unit: '%',   icon: 'mdi:memory',         device_class: null,          state_class: 'measurement' },
  { id: 'temperature',    name: 'CPU-Temperatur',     unit: '°C',  icon: 'mdi:thermometer',    device_class: 'temperature', state_class: 'measurement' },
  { id: 'online_devices', name: 'Geräte online',      unit: '',    icon: 'mdi:devices',        device_class: null,          state_class: 'measurement', json_attributes: true },
  { id: 'free_ips',       name: 'Freie IP-Adressen',  unit: '',    icon: 'mdi:ip-network',     device_class: null,          state_class: 'measurement' },
  { id: 'download_speed', name: 'Download aktuell',   unit: 'MB/s',icon: 'mdi:download',       device_class: 'data_rate',   state_class: 'measurement' },
  { id: 'upload_speed',   name: 'Upload aktuell',     unit: 'MB/s',icon: 'mdi:upload',         device_class: 'data_rate',   state_class: 'measurement' },
];

// Telefonie-Sensoren: Zustand = Name (oder Nummer) der Gegenstelle, Details
// (Nummer, Name, Datum, Dauer, eigenes Gerät) als Attribute. Damit kann sich der
// User in HA eine eigene Anruf-Card bauen.
const MQTT_PHONE_SENSORS = [
  { id: 'last_call',          name: 'Letzter Anruf',             icon: 'mdi:phone-log' },
  { id: 'last_missed_call',   name: 'Letzter verpasster Anruf',  icon: 'mdi:phone-missed' },
  { id: 'last_incoming_call', name: 'Letzter eingehender Anruf', icon: 'mdi:phone-incoming' },
];

const MQTT_TRAFFIC_SENSORS = [
  { suffix: 'today',      name: 'Heute' },
  { suffix: 'yesterday',  name: 'Gestern' },
  { suffix: 'week',       name: 'Aktuelle Woche' },
  { suffix: 'month',      name: 'Aktueller Monat' },
  { suffix: 'last_month', name: 'Vormonat' },
];

async function publishMqttDiscovery() {
  if (!HA_TOKEN) return;
  console.log('MQTT Discovery: Teste Broker-Verbindung...');
  const ok = await publishMqtt('fritzportal/status', 'online', true);
  if (!ok) { mqttAvailable = false; console.log('MQTT Discovery: Broker nicht erreichbar – REST-API Fallback aktivieren falls Sensoren gewünscht'); return; }
  mqttAvailable = true;
  // Lazy-Entitäten beim nächsten Push neu registrieren (z. B. nach Broker-Neustart)
  lazyDiscovered.clear();
  console.log('MQTT Discovery: Broker erreichbar – registriere Sensoren...');
  const device = fritzboxDevice();
  let registered = 0;
  for (const s of MQTT_SENSORS) {
    const config = {
      name: s.name, unique_id: `fritzportal_${s.id}`, object_id: `fritzportal_${s.id}`,
      state_topic: `fritzportal/${s.id}/state`,
      unit_of_measurement: s.unit || undefined, icon: s.icon,
      device_class: s.device_class || undefined, state_class: s.state_class || undefined,
      // Geräte-online: aktive Hosts (Name/IP/Typ) als Attribute mitliefern
      json_attributes_topic: s.json_attributes ? `fritzportal/${s.id}/attributes` : undefined,
      device,
    };
    if (await publishMqtt(`homeassistant/sensor/fritzportal_${s.id}/config`, config, true)) registered++;
  }
  for (const t of MQTT_TRAFFIC_SENSORS) {
    for (const dir of ['received', 'sent']) {
      const id = `traffic_${t.suffix}_${dir}`;
      const config = {
        name: `${dir === 'received' ? 'Download' : 'Upload'} ${t.name}`,
        unique_id: `fritzportal_${id}`, object_id: `fritzportal_${id}`,
        state_topic: `fritzportal/${id}/state`,
        unit_of_measurement: 'MB',
        icon: dir === 'received' ? 'mdi:download-network' : 'mdi:upload-network',
        device_class: 'data_size', state_class: 'total',
        device,
      };
      if (await publishMqtt(`homeassistant/sensor/fritzportal_${id}/config`, config, true)) registered++;
    }
  }
  // Telefonie-Sensoren nur registrieren wenn die Option aktiv ist (Opt-in)
  if (haPhoneSensorsEnabled) {
    for (const s of MQTT_PHONE_SENSORS) {
      const config = {
        name: s.name, unique_id: `fritzportal_${s.id}`, object_id: `fritzportal_${s.id}`,
        state_topic: `fritzportal/${s.id}/state`,
        json_attributes_topic: `fritzportal/${s.id}/attributes`,
        icon: s.icon,
        device,
      };
      if (await publishMqtt(`homeassistant/sensor/fritzportal_${s.id}/config`, config, true)) registered++;
    }
  }
  const total = MQTT_SENSORS.length + MQTT_TRAFFIC_SENSORS.length * 2 + (haPhoneSensorsEnabled ? MQTT_PHONE_SENSORS.length : 0);
  console.log(`MQTT Discovery: ${registered}/${total} Sensoren registriert`);
}

// ── WLAN-Schalter (MQTT-Switch mit command_topic) ──
// Discovery wird erst publiziert, sobald wir eine WLAN-Liste von der Box haben (Session
// nötig). Welche Indizes existieren, hängt vom Modell ab – daher dynamisch.
let wlanDiscoveryPublished = false;
const wlanDiscoveredIdx = new Set();

async function publishWlanDiscovery(states) {
  const device = fritzboxDevice();
  for (const w of states) {
    const config = {
      name: `WLAN ${w.label}`,
      unique_id:    `fritzportal_wlan_${w.index}`,
      object_id:    `fritzportal_wlan_${w.index}`,
      command_topic: `fritzportal/wlan/${w.index}/set`,
      state_topic:   `fritzportal/wlan/${w.index}/state`,
      payload_on: 'ON', payload_off: 'OFF',
      icon: 'mdi:wifi',
      optimistic: false,
      device,
    };
    if (await publishMqtt(`homeassistant/switch/fritzportal_wlan_${w.index}/config`, config, true)) {
      wlanDiscoveredIdx.add(w.index);
    }
  }
  wlanDiscoveryPublished = true;
  console.log(`MQTT Discovery: ${wlanDiscoveredIdx.size} WLAN-Schalter registriert`);
}

// ── Echte MQTT-Broker-Verbindung – ausschließlich zum Empfangen der Schaltbefehle.
// Sensor-/State-Publishes laufen weiterhin über den Supervisor-Proxy (publishMqtt).
// Broker-Zugangsdaten kommen aus der Supervisor-Service-Discovery.
let mqttBrokerClient = null;

async function connectMqttBroker() {
  if (!HA_TOKEN || mqttBrokerClient) return;
  let info;
  try {
    const r = await fetch('http://supervisor/services/mqtt', {
      headers: { 'Authorization': `Bearer ${HA_TOKEN}` },
    });
    if (!r.ok) { console.log(`MQTT-Broker: Service-Discovery nicht verfügbar (HTTP ${r.status}) – WLAN-Schalter inaktiv`); return; }
    info = (await r.json())?.data;
  } catch (e) {
    console.log('MQTT-Broker: Service-Discovery fehlgeschlagen – WLAN-Schalter inaktiv:', e.message);
    return;
  }
  if (!info?.host) { console.log('MQTT-Broker: keine Broker-Daten – WLAN-Schalter inaktiv'); return; }
  const proto = info.ssl ? 'mqtts' : 'mqtt';
  const url = `${proto}://${info.host}:${info.port || 1883}`;
  const client = mqtt.connect(url, {
    username: info.username || undefined,
    password: info.password || undefined,
    reconnectPeriod: 15000,
    connectTimeout: 10000,
  });
  mqttBrokerClient = client;

  client.on('connect', () => {
    console.log(`MQTT-Broker: verbunden (${url}) – abonniere WLAN-Schaltbefehle`);
    client.subscribe('fritzportal/wlan/+/set', (err) => {
      if (err) console.error('MQTT-Broker: subscribe-Fehler:', err.message);
    });
  });

  client.on('message', async (topic, payload) => {
    const m = topic.match(/^fritzportal\/wlan\/(\d+)\/set$/);
    if (!m) return;
    const index = parseInt(m[1], 10);
    const enable = String(payload).trim().toUpperCase() === 'ON';
    const session = [...sessions.values()][0];
    if (!session) {
      console.log(`MQTT-Broker: WLAN-${index}-Befehl (${enable ? 'ON' : 'OFF'}) ignoriert – keine aktive FRITZ!Box-Session (keep_session_alive aktivieren)`);
      return;
    }
    try {
      await setWlanEnable(session, index, enable);
      console.log(`MQTT-Broker: WLAN ${index} ${enable ? 'aktiviert' : 'deaktiviert'}`);
      // State sofort zurückspiegeln (optimistic:false → HA wartet auf state_topic)
      await publishMqtt(`fritzportal/wlan/${index}/state`, enable ? 'ON' : 'OFF');
    } catch (e) {
      console.error(`MQTT-Broker: WLAN ${index} SetEnable-Fehler:`, e.message);
    }
  });

  client.on('error', (e) => console.error('MQTT-Broker Fehler:', e.message));
  client.on('close', () => console.log('MQTT-Broker: Verbindung getrennt – Reconnect läuft'));
}

async function setState(entityId, state, attributes = {}) {
  try {
    await fetch(`${HA_API}/states/${entityId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${HA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: String(state), attributes }),
    });
  } catch (e) {
    console.error(`HA Sensor Push Fehler (${entityId}):`, e.message);
  }
}

async function pushFastSensorsToHA() {
  if (!HA_TOKEN) return;
  const eco     = getCached('eco-stats',     120000) || {};
  // Hosts/IP-Belegung aktiv nachladen (60 s/30 s gecacht) – nicht nur lesen, was der
  // Browser zufällig zuletzt abgefragt hat
  const session = [...sessions.values()][0];
  const hosts   = (session && await getEnrichedHosts(session).catch(() => null)) || getCached('hosts', 300000) || [];
  const ipStats = (session && await getIpStats(session).catch(() => null)) || getCached('ip-stats', 300000) || {};
  const net     = getCached('network-stats', 120000) || {};

  // Nur aktualisieren wenn Wert > 0 – verhindert dass abgelaufener Cache als "0" gesendet wird
  if ((eco.cpu      || 0) > 0) lastKnownFast.cpu      = eco.cpu;
  if ((eco.ram      || 0) > 0) lastKnownFast.ram      = eco.ram;
  if ((eco.cpu_temp || 0) > 0) lastKnownFast.cpu_temp = eco.cpu_temp;
  const activeHosts = hosts.filter(h => h.active);
  const online = activeHosts.length;
  if (online      > 0) lastKnownFast.online   = online;
  if ((ipStats.free || 0) > 0) lastKnownFast.free_ips = ipStats.free;

  // Liste der aktiven Hosts als Sensor-Attribute (Name/IP/Typ), sortiert nach
  // letzter Aktivität (neueste zuerst) – analog zur HOSTS.ACTIVE-Liste im Dashboard.
  // So sieht der User als Sensor-Wert die Anzahl und in den Attributen die Geräteliste.
  if (online > 0) {
    lastKnownFast.activeHosts = activeHosts
      .slice()
      .sort((a, b) => (parseInt(b.lastActivity || '0', 10) || 0) - (parseInt(a.lastActivity || '0', 10) || 0))
      .map(h => ({
        name: h.name || h.ip || h.mac, ip: h.ip || '', mac: h.mac || '',
        type: h.connType || (h.interface?.includes('802.11') ? 'WLAN' : 'LAN'),
        // Ab v1.4.7 für die Dashboard-Card: Verbindungsdetail + Gast-Kennzeichen
        conn: h.connDisplay || '', guest: !!h.guest,
      }));
  }
  const hostAttrs = { count: lastKnownFast.online, active_hosts: lastKnownFast.activeHosts || [] };

  // Download/Upload: 0 ist gültiger Wert (kein Traffic), immer aktuell senden
  const dl = +(( net.currentDown || 0) / 1048576).toFixed(3);
  const ul = +((net.currentUp   || 0) / 1048576).toFixed(3);

  // MQTT: Daten immer senden wenn Broker erreichbar
  if (mqttAvailable) {
    await publishMqtt('fritzportal/cpu/state', lastKnownFast.cpu);
    await publishMqtt('fritzportal/ram/state', lastKnownFast.ram);
    await publishMqtt('fritzportal/temperature/state', lastKnownFast.cpu_temp);
    await publishMqtt('fritzportal/online_devices/state', lastKnownFast.online);
    await publishMqtt('fritzportal/online_devices/attributes', hostAttrs, true);
    await publishMqtt('fritzportal/free_ips/state', lastKnownFast.free_ips);
    await publishMqtt('fritzportal/download_speed/state', dl);
    await publishMqtt('fritzportal/upload_speed/state', ul);
  }
  // REST-API Fallback: zusätzlich wenn aktiviert.
  // state_class='measurement' aktiviert HA-Langzeit-Statistik (mean/min/max), damit die
  // Sensoren in HA-Statistik-Diagrammen verwendbar sind (Forums-Wunsch v1.4.4).
  if (haSensorsEnabled) {
    await setState('sensor.fritzportal_cpu',            lastKnownFast.cpu,      { unit_of_measurement: '%',   friendly_name: 'FRITZ!Portal CPU-Auslastung',    icon: 'mdi:chip',            unique_id: 'fritzportal_rest_cpu',            state_class: 'measurement' });
    await setState('sensor.fritzportal_ram',            lastKnownFast.ram,      { unit_of_measurement: '%',   friendly_name: 'FRITZ!Portal RAM-Auslastung',    icon: 'mdi:memory',          unique_id: 'fritzportal_rest_ram',            state_class: 'measurement' });
    await setState('sensor.fritzportal_temperature',    lastKnownFast.cpu_temp, { unit_of_measurement: '°C',  friendly_name: 'FRITZ!Portal CPU-Temperatur',    icon: 'mdi:thermometer',     unique_id: 'fritzportal_rest_temperature',    device_class: 'temperature', state_class: 'measurement' });
    await setState('sensor.fritzportal_online_devices', lastKnownFast.online,   { unit_of_measurement: '',    friendly_name: 'FRITZ!Portal Geräte online',     icon: 'mdi:devices',         unique_id: 'fritzportal_rest_online_devices', state_class: 'measurement', active_hosts: lastKnownFast.activeHosts || [] });
    await setState('sensor.fritzportal_free_ips',       lastKnownFast.free_ips, { unit_of_measurement: '',    friendly_name: 'FRITZ!Portal Freie IP-Adressen', icon: 'mdi:ip-network',      unique_id: 'fritzportal_rest_free_ips',       state_class: 'measurement' });
    await setState('sensor.fritzportal_download_speed', dl, { unit_of_measurement: 'MB/s', friendly_name: 'FRITZ!Portal Download aktuell',  icon: 'mdi:download', device_class: 'data_rate', unique_id: 'fritzportal_rest_download_speed', state_class: 'measurement' });
    await setState('sensor.fritzportal_upload_speed',   ul, { unit_of_measurement: 'MB/s', friendly_name: 'FRITZ!Portal Upload aktuell',    icon: 'mdi:upload',   device_class: 'data_rate', unique_id: 'fritzportal_rest_upload_speed',   state_class: 'measurement' });
  }

  // WLAN-Status: MQTT-Switch-State (steuerbar) + REST-Nur-Anzeige-Sensor.
  // Benötigt eine aktive Session – getWlanStates ist 30 s gecacht.
  const wlanSession = [...sessions.values()][0];
  if (wlanSession) {
    let wlanStates = [];
    try { wlanStates = await getWlanStates(wlanSession); } catch {}
    if (wlanStates.length) {
      // Discovery einmalig publizieren, sobald wir wissen welche WLANs existieren
      if (mqttAvailable && !wlanDiscoveryPublished) {
        try { await publishWlanDiscovery(wlanStates); } catch {}
      }
      for (const w of wlanStates) {
        if (mqttAvailable) {
          await publishMqtt(`fritzportal/wlan/${w.index}/state`, w.enabled ? 'ON' : 'OFF');
        }
        if (haSensorsEnabled) {
          await setState(`sensor.fritzportal_wlan_${w.index}`, w.enabled ? 'on' : 'off', {
            friendly_name: `FRITZ!Portal WLAN ${w.label}`,
            icon: 'mdi:wifi',
            unique_id: `fritzportal_rest_wlan_${w.index}`,
          });
        }
      }
    }
  }
}

// ── Netzwerk-/Infrastruktur-Entitäten (ab v1.4.7) ──
// Werden „lazy" registriert: die MQTT-Discovery-Config wird erst publiziert, wenn die
// Box für die Entität tatsächlich Daten liefert. So bekommen z. B. Kabel-/Glasfaser-
// Kunden keine dauerhaft leeren DSL-Sensoren.
const NET_ENTITIES = {
  wan_connected:   { component: 'binary_sensor', id: 'wan_connected',   name: 'Internetverbindung', icon: 'mdi:web', device_class: 'connectivity', json_attributes: true },
  wan_access_type: { component: 'sensor', id: 'wan_access_type', name: 'Anschlussart',      icon: 'mdi:router-network' },
  external_ip:     { component: 'sensor', id: 'external_ip',     name: 'Externe IP',        icon: 'mdi:ip-network-outline' },
  dsl_downstream:  { component: 'sensor', id: 'dsl_downstream',  name: 'DSL-Sync Download', icon: 'mdi:download-network', unit: 'Mbit/s', device_class: 'data_rate', state_class: 'measurement' },
  dsl_upstream:    { component: 'sensor', id: 'dsl_upstream',    name: 'DSL-Sync Upload',   icon: 'mdi:upload-network',   unit: 'Mbit/s', device_class: 'data_rate', state_class: 'measurement' },
  mesh_devices:    { component: 'sensor', id: 'mesh_devices',    name: 'Mesh-Geräte online', icon: 'mdi:access-point-network', state_class: 'measurement', json_attributes: true },
  firmware_update: { component: 'binary_sensor', id: 'firmware_update', name: 'Firmware-Update', icon: 'mdi:package-up', device_class: 'update', json_attributes: true },
};
const lazyDiscovered = new Set();

async function ensureMqttEntity(def) {
  const key = `${def.component}/${def.id}`;
  if (lazyDiscovered.has(key)) return;
  const config = {
    name: def.name, unique_id: `fritzportal_${def.id}`, object_id: `fritzportal_${def.id}`,
    state_topic: `fritzportal/${def.id}/state`,
    json_attributes_topic: def.json_attributes ? `fritzportal/${def.id}/attributes` : undefined,
    icon: def.icon, unit_of_measurement: def.unit, device_class: def.device_class, state_class: def.state_class,
    ...(def.component === 'binary_sensor' ? { payload_on: 'ON', payload_off: 'OFF' } : {}),
    device: fritzboxDevice(),
  };
  if (await publishMqtt(`homeassistant/${def.component}/fritzportal_${def.id}/config`, config, true)) lazyDiscovered.add(key);
}

// Wert einer Netzwerk-Entität an HA senden (MQTT und/oder REST-Fallback).
// Für binary_sensor ist `value` ein Boolean.
async function pushNetEntity(def, value, attributes = {}) {
  const isBinary = def.component === 'binary_sensor';
  if (mqttAvailable) {
    await ensureMqttEntity(def);
    await publishMqtt(`fritzportal/${def.id}/state`, isBinary ? (value ? 'ON' : 'OFF') : value);
    if (def.json_attributes) await publishMqtt(`fritzportal/${def.id}/attributes`, attributes, true);
  }
  if (haSensorsEnabled) {
    await setState(`${def.component}.fritzportal_${def.id}`, isBinary ? (value ? 'on' : 'off') : value, {
      friendly_name: `FRITZ!Portal ${def.name}`, icon: def.icon,
      unit_of_measurement: def.unit, device_class: def.device_class, state_class: def.state_class,
      unique_id: `fritzportal_rest_${def.id}`,
      ...attributes,
    });
  }
}

let lastExternalIp = '';

// WAN-Status im schnellen Intervall – Verbindungsabbrüche sollen zeitnah in HA ankommen
// (Issue #33: „Sensor DSL up/down für Skripte", „DSL oder LTE?")
async function pushWanSensorsToHA() {
  if (!HA_TOKEN) return;
  const session = [...sessions.values()][0];
  if (!session) return;
  let wan;
  try { wan = await getWanStatus(session); } catch { return; }
  if (!wan) return;
  const connected = wan.NewConnectionStatus === 'Connected';
  // Wechsel der externen IPv4 als HA-Event (z. B. für DynDNS-/Benachrichtigungs-Automationen)
  const ip = wan.NewExternalIPAddress || '';
  if (ip && lastExternalIp && ip !== lastExternalIp) {
    console.log(`Externe IP geändert: ${lastExternalIp} → ${ip}`);
    fireHaEvent('fritzportal_external_ip_changed', { old_ip: lastExternalIp, new_ip: ip });
  }
  if (ip) lastExternalIp = ip;
  await pushNetEntity(NET_ENTITIES.wan_connected, connected, {
    status: wan.NewConnectionStatus || '', access_type: wan.accessTypeLabel || '', provider: wan.provider || '',
    external_ip: wan.NewExternalIPAddress || '', external_ipv6: wan.ipv6 || '',
    uptime_s: parseInt(wan.NewUptime || '0', 10) || 0,
  });
  if (wan.accessTypeLabel) await pushNetEntity(NET_ENTITIES.wan_access_type, wan.accessTypeLabel);
  if (wan.NewExternalIPAddress) await pushNetEntity(NET_ENTITIES.external_ip, wan.NewExternalIPAddress);
  if (wan.dsl && wan.dsl.downCurr > 0) {
    await pushNetEntity(NET_ENTITIES.dsl_downstream, +(wan.dsl.downCurr / 1000).toFixed(1));
    await pushNetEntity(NET_ENTITIES.dsl_upstream,   +(wan.dsl.upCurr   / 1000).toFixed(1));
  }
}

// Mesh + Firmware im langsamen (Traffic-)Intervall – ändern sich selten
async function pushInfraSensorsToHA() {
  if (!HA_TOKEN) return;
  const session = [...sessions.values()][0];
  if (!session) return;
  const mesh = await getOfficialMesh(session).catch(() => null);
  if (mesh) {
    const infra = mesh.nodes.filter(n => n.role === 'master' || n.role === 'satellite');
    const clientsOf = (uid) => mesh.links.filter(l => l.from === uid).length;
    await pushNetEntity(NET_ENTITIES.mesh_devices, infra.length, {
      total: mesh.meshTotal || infra.length,
      clients: mesh.nodes.length - infra.length,
      devices: infra.map(n => ({
        name: n.name, model: n.model, role: n.role, ip: n.ip, firmware: n.firmware || '',
        link: n.connDisplay || '', clients: clientsOf(n.uid), update_available: !!n.updateAvailable,
      })),
    });
  }
  try {
    const fw = await getFirmwareStatus(session);
    await pushNetEntity(NET_ENTITIES.firmware_update, fw.updateAvailable, {
      installed_version: fw.currentVersion || '', latest_version: fw.newVersion || '', release_url: fw.infoUrl || '',
    });
  } catch {}
}

// ── Telefonie-Sensoren: letzter Anruf / letzter verpasster / letzter eingehender ──
// Zustand = Name der Gegenstelle (Fallback: Nummer), Details als Attribute.
// Anruf-Typen (AVM): 1 = eingehend angenommen, 2 = verpasst, 3 = ausgehend,
// 9 = eingehend aktiv, 10 = abgewiesen, 11 = ausgehend aktiv.
const CALL_TYPE_LABELS = {
  '1': 'incoming', '2': 'missed', '3': 'outgoing',
  '9': 'incoming_active', '10': 'rejected', '11': 'outgoing_active',
};

function callToSensorPayload(call) {
  if (!call) return { state: '-', attributes: {} };
  const state = call.name || call.number || 'Unbekannt';
  return {
    state,
    attributes: {
      number:    call.number || '',
      name:      call.name || '',
      date:      call.date || '',
      duration:  call.duration || '',
      duration_minutes: call.durationMin ?? null,
      type:      CALL_TYPE_LABELS[call.type] || call.type || '',
      device:    call.device || '',
      from:      call.from || '',
      to:        call.to || '',
    },
  };
}

async function pushPhoneSensorsToHA() {
  if (!HA_TOKEN || !haPhoneSensorsEnabled) return;
  const session = [...sessions.values()][0];
  if (!session) return;
  let calls;
  try { calls = await fetchCallList(session); } catch { return; }
  if (!Array.isArray(calls) || calls.length === 0) return;

  // Liste ist absteigend nach Datum sortiert (neuester Eintrag zuerst)
  const lastCall     = calls[0];
  const lastMissed   = calls.find(c => c.type === '2');
  const lastIncoming = calls.find(c => c.type === '1' || c.type === '9');

  const sensors = [
    { id: 'last_call',          call: lastCall,     friendly: 'FRITZ!Portal Letzter Anruf',             icon: 'mdi:phone-log' },
    { id: 'last_missed_call',   call: lastMissed,   friendly: 'FRITZ!Portal Letzter verpasster Anruf',  icon: 'mdi:phone-missed' },
    { id: 'last_incoming_call', call: lastIncoming, friendly: 'FRITZ!Portal Letzter eingehender Anruf', icon: 'mdi:phone-incoming' },
  ];

  for (const s of sensors) {
    const { state, attributes } = callToSensorPayload(s.call);
    // MQTT: immer wenn Broker erreichbar
    if (mqttAvailable) {
      await publishMqtt(`fritzportal/${s.id}/state`, state);
      await publishMqtt(`fritzportal/${s.id}/attributes`, attributes, true);
    }
    // REST-API Fallback: zusätzlich wenn aktiviert
    if (haSensorsEnabled) {
      await setState(`sensor.fritzportal_${s.id}`, state, {
        friendly_name: s.friendly, icon: s.icon,
        unique_id: `fritzportal_rest_${s.id}`,
        ...attributes,
      });
    }
  }
}

async function pushTrafficSensorsToHA() {
  if (!HA_TOKEN) return;
  // Cache mit großzügigem TTL lesen (doppeltes Intervall als Puffer)
  let tc = getCached('traffic-counters', haTrafficIntervalSec * 2 * 1000);
  if (!tc) {
    // Kein Cache-Eintrag → aktiv von der FritzBox holen
    const session = [...sessions.values()][0];
    if (!session) return;
    try { tc = await collectTrafficCounters(session); } catch { return; }
  }
  if (!tc?.rows) return;
  const keys  = ['today', 'yesterday', 'week', 'month', 'last_month'];
  const names = ['Heute', 'Gestern', 'Aktuelle Woche', 'Aktueller Monat', 'Vormonat'];
  // Letzten Wert für Traffic-Sensoren beibehalten – kein Null-Sprung bei abgelaufenem Cache
  tc.rows.forEach(row => {
    if (row.received > 0) lastKnownTraffic[row.name + '_dl'] = row.received;
    if (row.sent     > 0) lastKnownTraffic[row.name + '_ul'] = row.sent;
  });
  // Einheit für REST-API-Traffic-Sensoren bewusst stabil auf GB – HA Long-Term-Statistik
  // erlaubt keinen Unit-Wechsel über die Zeit, sonst werden Datenpunkte verworfen oder die
  // Statistik bricht ab. Forums-Wunsch (v1.4.4): GB statt MB für übersichtlichere
  // Statistik-Diagramme, da sich die Y-Achseneinheit im HA-Statistik-Chart nicht ändern lässt.
  function bytesToHaValue(bytes) {
    return { value: +(bytes / (1024 * 1024 * 1024)).toFixed(3), unit: 'GB' };
  }
  // MQTT: Traffic-Daten immer senden wenn Broker erreichbar
  if (mqttAvailable) {
    for (let i = 0; i < tc.rows.length; i++) {
      const row = tc.rows[i];
      const k   = keys[i];
      const mbDl = +((lastKnownTraffic[row.name + '_dl'] || row.received) / (1024 * 1024)).toFixed(2);
      const mbUl = +((lastKnownTraffic[row.name + '_ul'] || row.sent)     / (1024 * 1024)).toFixed(2);
      await publishMqtt(`fritzportal/traffic_${k}_received/state`, mbDl);
      await publishMqtt(`fritzportal/traffic_${k}_sent/state`, mbUl);
    }
  }
  // REST-API Fallback: zusätzlich wenn aktiviert
  if (haSensorsEnabled) {
    for (let i = 0; i < tc.rows.length; i++) {
      const row = tc.rows[i];
      const k   = keys[i];
      const lbl = names[i];
      const rx = bytesToHaValue(row.received);
      const tx = bytesToHaValue(row.sent);
      await setState(`sensor.fritzportal_traffic_${k}_received`, rx.value, { unit_of_measurement: rx.unit, friendly_name: `FRITZ!Portal Download ${lbl}`, icon: 'mdi:download-network', device_class: 'data_size', state_class: 'total', unique_id: `fritzportal_rest_traffic_${k}_received` });
      await setState(`sensor.fritzportal_traffic_${k}_sent`,     tx.value, { unit_of_measurement: tx.unit, friendly_name: `FRITZ!Portal Upload ${lbl}`,   icon: 'mdi:upload-network',   device_class: 'data_size', state_class: 'total', unique_id: `fritzportal_rest_traffic_${k}_sent` });
    }
  }
}

let haFastTimer    = null;
let haTrafficTimer = null;

function startHaTimers() {
  if (haFastTimer)    clearInterval(haFastTimer);
  if (haTrafficTimer) clearInterval(haTrafficTimer);
  haFastTimer    = null;
  haTrafficTimer = null;
  if (!HA_TOKEN) {
    console.log('HA Sensor Push deaktiviert – kein SUPERVISOR_TOKEN (kein HA-Betrieb)');
    return;
  }
  // MQTT Discovery immer versuchen – erstellt das Gerät in HA
  publishMqttDiscovery().catch(() => {});
  // Echte Broker-Verbindung für die WLAN-Schaltbefehle (command_topic)
  connectMqttBroker().catch(() => {});
  const restInfo = haSensorsEnabled ? ' + REST-API Fallback aktiv' : '';
  console.log(`HA Sensor Push gestartet: MQTT Discovery${restInfo} (Systemsensoren: ${haFastIntervalSec}s, Traffic: ${haTrafficIntervalSec}s)`);
  // Telefonie-Sensoren laufen im Fast-Intervall mit – fetchCallList cached 60s,
  // die FRITZ!Box wird also höchstens einmal pro Minute nach der Anrufliste gefragt.
  haFastTimer    = setInterval(() => {
    pushFastSensorsToHA().catch(() => {});
    pushPhoneSensorsToHA().catch(() => {});
    pushWanSensorsToHA().catch(() => {});
  }, haFastIntervalSec * 1000);
  haTrafficTimer = setInterval(() => {
    pushTrafficSensorsToHA().catch(() => {});
    pushInfraSensorsToHA().catch(() => {});
  }, haTrafficIntervalSec * 1000);
  // Mesh/Firmware einmal kurz nach dem Start, nicht erst nach dem ersten Traffic-Intervall
  setTimeout(() => { pushInfraSensorsToHA().catch(() => {}); }, 45000);
}

startHaTimers();

// ── Dashboard-Card automatisch installieren ────────────────────────────────
// 1. Card-Datei nach <HA-config>/www/fritz-portal/ kopieren (→ /local/fritz-portal/…)
// 2. Als Lovelace-Ressource registrieren (WebSocket-API über den Supervisor-Proxy).
//    Klappt nur im Storage-Modus von Lovelace; im YAML-Modus geben wir einen Hinweis aus.
// Abschaltbar über die Add-on-Option dashboard_card: false.
const CARD_RESOURCE_URL = `/local/fritz-portal/fritz-portal-card.js?v=${APP_VERSION}`;

// Führt eine Folge von WebSocket-Kommandos gegen die HA-Core-API aus. Jedes Kommando
// ist eine Funktion (bisherigeErgebnisse) => message. Ergebnis: Array der Antworten.
function haWebSocketCall(messages) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://supervisor/core/websocket');
    const results = [];
    let id = 0;
    const timer = setTimeout(() => { ws.terminate(); reject(new Error('Timeout')); }, 15000);
    const done = (err, val) => { clearTimeout(timer); try { ws.close(); } catch {} err ? reject(err) : resolve(val); };
    const sendNext = () => {
      const build = messages[results.length];
      if (!build) return done(null, results);
      ws.send(JSON.stringify({ id: ++id, ...build(results) }));
    };
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(String(raw)); } catch { return; }
      if (m.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: HA_TOKEN }));
      else if (m.type === 'auth_ok') sendNext();
      else if (m.type === 'auth_invalid') done(new Error('auth_invalid'));
      else if (m.type === 'result' && m.id === id) {
        if (!m.success) return done(new Error(m.error?.message || 'WS-Fehler'));
        results.push(m.result); sendNext();
      }
    });
    ws.on('error', (e) => done(e));
  });
}

async function installDashboardCard() {
  if (process.env.DASHBOARD_CARD === 'false') return;
  if (!existsSync(CARD_FILE)) return;
  const configDir = ['/homeassistant', '/config'].find(d => existsSync(d));
  if (!configDir) return; // kein HA-Config-Mapping (z. B. Docker-Standalone)
  try {
    const target = join(configDir, 'www', 'fritz-portal');
    mkdirSync(target, { recursive: true });
    const src = readFileSync(CARD_FILE);
    const dest = join(target, 'fritz-portal-card.js');
    if (!existsSync(dest) || !readFileSync(dest).equals(src)) {
      writeFileSync(dest, src);
      console.log(`Dashboard-Card: nach ${dest} kopiert`);
    }
  } catch (e) {
    console.log('Dashboard-Card: Kopieren fehlgeschlagen:', e.message);
    return;
  }
  if (!HA_TOKEN) return;
  try {
    const [resources] = await haWebSocketCall([() => ({ type: 'lovelace/resources' })]);
    const existing = (resources || []).find(r => String(r.url || '').includes('fritz-portal-card.js'));
    if (existing?.url === CARD_RESOURCE_URL) return;
    await haWebSocketCall([() => existing
      ? { type: 'lovelace/resources/update', resource_id: existing.id, res_type: 'module', url: CARD_RESOURCE_URL }
      : { type: 'lovelace/resources/create', res_type: 'module', url: CARD_RESOURCE_URL }]);
    console.log(`Dashboard-Card: Lovelace-Ressource ${existing ? 'aktualisiert' : 'registriert'} (${CARD_RESOURCE_URL})`);
  } catch (e) {
    console.log(`Dashboard-Card: automatische Registrierung nicht möglich (${e.message}). ` +
      `Bitte manuell als Ressource eintragen: ${CARD_RESOURCE_URL} (Typ: JavaScript-Modul)`);
  }
}

installDashboardCard().catch(() => {});

// ── Keep-Session-Alive ─────────────────────────────────────────────────────
// Erstellt beim Add-on-Start automatisch die AUTO_SID-Session, sobald die
// FRITZ!Box-Zugangsdaten in der HA-Add-on-Konfiguration hinterlegt sind. Damit
// fängt der Background-Collector (15s-Tick) sofort an, eco/network/host-Caches
// zu füllen – HA-Sensoren werden also auch dann aktualisiert, wenn niemand
// die Web-UI im Browser geöffnet hat.
async function ensureKeepAliveSession() {
  if (!keepSessionAlive) return;
  if (sessions.has(AUTO_SID)) return;
  const host     = process.env.FRITZBOX_HOST;
  const username = process.env.FRITZBOX_USER;
  const password = process.env.FRITZBOX_PASSWORD;
  if (!host || !username || !password) {
    console.log('Keep-Session-Alive: keine FritzBox-Zugangsdaten – Session-Aufbau übersprungen.');
    return;
  }
  try {
    const controlUrls = await discoverControlUrls(host);
    sessions.set(AUTO_SID, { host, username, password, controlUrls, isAutoSession: true, lastUsed: Date.now() });
    const autoSession = sessions.get(AUTO_SID);
    getCachedWebSid(autoSession).catch(() => {});
    console.log('Keep-Session-Alive: Auto-Session beim Start aufgebaut.');
  } catch (err) {
    console.error('Keep-Session-Alive: Aufbau fehlgeschlagen:', err.message);
  }
}

ensureKeepAliveSession().catch(() => {});
// Zusätzlich periodisch nachprüfen, falls die Box beim ersten Versuch nicht erreichbar war
setInterval(() => { ensureKeepAliveSession().catch(() => {}); }, 60000);

function saveSettings() {
  try {
    writeFileSync(SETTINGS_FILE, JSON.stringify({
      ha_sensors:                  haSensorsEnabled,
      ha_sensors_interval:         haFastIntervalSec,
      ha_sensors_traffic_interval: haTrafficIntervalSec,
      ha_phone_sensors:            haPhoneSensorsEnabled,
      debug_logging:               debugLogging,
      keep_session_alive:          keepSessionAlive,
      traffic_history_server:      trafficHistoryServer,
      dashboard_calls:             dashboardCalls,
      dashboard_smarthome:         dashboardSmartHome,
    }));
  } catch (e) { console.error('Settings speichern fehlgeschlagen:', e.message); }
}

// Reine Anzeige-Einstellungen des Dashboards – ohne Neustart der HA-Timer
app.post('/api/fritz/dashboard-settings', (req, res) => {
  if (!sessions.get(req.headers['x-fritz-sid'])) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const { dashboard_calls, dashboard_smarthome } = req.body || {};
  if (dashboard_calls !== undefined)     dashboardCalls     = !!dashboard_calls;
  if (dashboard_smarthome !== undefined) dashboardSmartHome = !!dashboard_smarthome;
  saveSettings();
  return res.json({ success: true, dashboard_calls: dashboardCalls, dashboard_smarthome: dashboardSmartHome });
});

app.get('/api/fritz/ha-settings', (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  if (!sessions.get(sid)) return res.status(401).json({ error: 'Nicht eingeloggt' });
  return res.json({
    ha_sensors:                  haSensorsEnabled,
    ha_sensors_interval:         haFastIntervalSec,
    ha_sensors_traffic_interval: haTrafficIntervalSec,
    ha_phone_sensors:            haPhoneSensorsEnabled,
    ha_available:                !!HA_TOKEN,
    mqtt_available:              mqttAvailable,
    debug_logging:               debugLogging,
    keep_session_alive:          keepSessionAlive,
    traffic_history_server:      trafficHistoryServer,
    dashboard_calls:             dashboardCalls,
    dashboard_smarthome:         dashboardSmartHome,
  });
});

app.post('/api/fritz/ha-settings', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  if (!sessions.get(sid)) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const { ha_sensors, ha_sensors_interval, ha_sensors_traffic_interval, ha_phone_sensors, debug_logging, keep_session_alive, traffic_history_server } = req.body;
  if (ha_sensors !== undefined)                  haSensorsEnabled     = !!ha_sensors;
  if (ha_phone_sensors !== undefined) {
    const wasOn = haPhoneSensorsEnabled;
    haPhoneSensorsEnabled = !!ha_phone_sensors;
    if (wasOn !== haPhoneSensorsEnabled) {
      console.log(`Telefonie-Sensoren ${haPhoneSensorsEnabled ? 'aktiviert' : 'deaktiviert'}`);
      // Beim Deaktivieren die Discovery-Configs entfernen, damit die Entitäten
      // nicht als verwaiste Sensoren in HA stehen bleiben
      if (wasOn && !haPhoneSensorsEnabled && mqttAvailable) {
        for (const s of MQTT_PHONE_SENSORS) {
          publishMqtt(`homeassistant/sensor/fritzportal_${s.id}/config`, '', true).catch(() => {});
        }
      }
      // Beim Aktivieren sofort einmal pushen, damit der User nicht aufs Intervall warten muss
      if (!wasOn && haPhoneSensorsEnabled) setTimeout(() => { pushPhoneSensorsToHA().catch(() => {}); }, 2000);
    }
  }
  if (ha_sensors_interval !== undefined)         haFastIntervalSec    = Math.max(10,  parseInt(ha_sensors_interval,         10) || 60);
  if (ha_sensors_traffic_interval !== undefined) haTrafficIntervalSec = Math.max(30,  parseInt(ha_sensors_traffic_interval, 10) || 300);
  if (debug_logging !== undefined)               { debugLogging = !!debug_logging; console.log(`Debug-Logging ${debugLogging ? 'aktiviert' : 'deaktiviert'}`); }
  if (traffic_history_server !== undefined)      { trafficHistoryServer = !!traffic_history_server; console.log(`Traffic-Verlauf serverseitig ${trafficHistoryServer ? 'aktiviert' : 'deaktiviert'}`); }
  if (keep_session_alive !== undefined) {
    const wasOn = keepSessionAlive;
    keepSessionAlive = !!keep_session_alive;
    console.log(`Keep-Session-Alive ${keepSessionAlive ? 'aktiviert' : 'deaktiviert'}`);
    // Beim Aktivieren sofort eine Auto-Session erstellen, falls noch keine läuft –
    // sonst bliebe der Background-Collector bis zum nächsten Browser-Aufruf untätig.
    if (keepSessionAlive && !wasOn) ensureKeepAliveSession().catch(() => {});
  }
  saveSettings();
  // Sync to HA Add-on config (requires hassio_api: true)
  try {
    const infoRes = await fetch('http://supervisor/addons/self/info', {
      headers: { 'Authorization': `Bearer ${HA_TOKEN}` },
    });
    if (infoRes.ok) {
      const info = await infoRes.json();
      const opts = info.data?.options || {};
      await fetch('http://supervisor/addons/self/options', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${HA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ options: { ...opts, ha_sensors: haSensorsEnabled, ha_sensors_interval: haFastIntervalSec, ha_sensors_traffic_interval: haTrafficIntervalSec, ha_phone_sensors: haPhoneSensorsEnabled, debug_logging: debugLogging, keep_session_alive: keepSessionAlive, traffic_history_server: trafficHistoryServer } }),
      });
    }
  } catch {}
  startHaTimers();
  return res.json({ success: true, ha_sensors: haSensorsEnabled, ha_sensors_interval: haFastIntervalSec, ha_sensors_traffic_interval: haTrafficIntervalSec, ha_phone_sensors: haPhoneSensorsEnabled, keep_session_alive: keepSessionAlive, traffic_history_server: trafficHistoryServer });
});

const PORT = 3003;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`FritzBox Proxy Server läuft auf http://0.0.0.0:${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} ist bereits belegt – läuft FRITZ!Portal schon (z. B. in einem anderen Terminal)? Den anderen Prozess beenden (Strg+C) und erneut starten.`);
    process.exit(1);
  }
  throw err;
});

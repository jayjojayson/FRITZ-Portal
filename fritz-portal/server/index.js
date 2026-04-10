import express from 'express';
import DigestFetch from 'digest-fetch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Timestamps für alle Konsolenausgaben (HA-Protokoll) ──
const _log   = console.log.bind(console);
const _error = console.error.bind(console);
const _ts = () => new Date().toLocaleTimeString('de-DE', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
console.log   = (...args) => _log(`[${_ts()}]`, ...args);
console.error = (...args) => _error(`[${_ts()}]`, ...args);

// ── HA Add-on: Zugangsdaten aus /data/options.json lesen (überschreibt Env-Vars nicht) ──
try {
  if (existsSync('/data/options.json')) {
    const opts = JSON.parse(readFileSync('/data/options.json', 'utf-8'));
    if (opts.fritzbox_host     && !process.env.FRITZBOX_HOST)     process.env.FRITZBOX_HOST     = opts.fritzbox_host;
    if (opts.fritzbox_user     && !process.env.FRITZBOX_USER)     process.env.FRITZBOX_USER     = opts.fritzbox_user;
    if (opts.fritzbox_password && !process.env.FRITZBOX_PASSWORD) process.env.FRITZBOX_PASSWORD = opts.fritzbox_password;
    if (opts.ha_sensors                  !== undefined && !process.env.HA_SENSORS)                  process.env.HA_SENSORS                  = String(opts.ha_sensors);
    if (opts.ha_sensors_interval          !== undefined && !process.env.HA_SENSORS_INTERVAL)          process.env.HA_SENSORS_INTERVAL          = String(opts.ha_sensors_interval);
    if (opts.ha_sensors_traffic_interval  !== undefined && !process.env.HA_SENSORS_TRAFFIC_INTERVAL)  process.env.HA_SENSORS_TRAFFIC_INTERVAL  = String(opts.ha_sensors_traffic_interval);
    console.log('HA Add-on: Fritz!Box-Optionen geladen (' + opts.fritzbox_host + ')');
  }
} catch {}

const app = express();
app.use(express.json());

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
  // Gültige SID: für 5 Minuten cachen
  if (cachedWebSid !== null && cachedWebSid !== '' && now - cachedWebSidTime < WEB_SID_TTL) return cachedWebSid;
  // Fehlgeschlagene SID: erst nach 30 Sekunden erneut versuchen
  if (cachedWebSid === '' && now - cachedWebSidTime < WEB_SID_FAIL_TTL) return cachedWebSid;
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
const lastKnownFast    = { cpu: 0, ram: 0, cpu_temp: 0, online: 0, free_ips: 0 };
const lastKnownTraffic = {};

// ── Traffic history für Dashboard-Chart (server-seitig, alle 10 Sekunden) ──
const trafficHistory = { down: [], up: [] };

// ── Eco-Stats history für Dashboard-Popovers (CPU/RAM/Temp, 1h, alle 10 Sekunden) ──
const ecoHistory = { cpu: [], ram: [], temp: [] };

async function collectEcoHistory(session) {
  const webSid = await getCachedWebSid(session);
  if (!webSid) return;
  const pages = ['home', 'eco', 'ecoStat', 'overview'];
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
      const d = JSON.parse(text)?.data || {};
      const cpuSeries  = d.cpuutil?.series?.[0]  || d.cpuUtilization?.series?.[0]  || [];
      const ramSeries  = d.ramusage?.series?.[2]  || d.ramusage?.series?.[0] || d.ramUsage?.series?.[0] || [];
      const tempSeries = d.cputemp?.series?.[0]   || d.cpuTemp?.series?.[0]  || [];
      let cpu      = cpuSeries.length  > 0 ? parseInt(cpuSeries[cpuSeries.length - 1],   10) : 0;
      let ram      = ramSeries.length  > 0 ? Math.round(ramSeries[ramSeries.length - 1])    : 0;
      let temp     = tempSeries.length > 0 ? parseInt(tempSeries[tempSeries.length - 1], 10) : 0;
      if (cpu  === 0) cpu  = parseInt(d.cpu  || d.cpuload || d.cpu_util  || d.cpuUtil  || d.stat?.cpu  || '0', 10) || 0;
      if (ram  === 0) ram  = parseInt(d.ram  || d.ramutil || d.ram_util  || d.ramUtil  || d.memory || d.stat?.ram || d.memUsage || '0', 10) || 0;
      if (temp === 0) temp = parseInt(d.temp || d.cpu_temp || d.cputemp  || d.cpuTemp  || d.temperature || d.stat?.temp || '0', 10) || 0;
      if (cpu  === 0 && typeof d.cpuUtil     === 'number') cpu  = d.cpuUtil;
      if (ram  === 0 && typeof d.ramUtil     === 'number') ram  = d.ramUtil;
      if (temp === 0 && typeof d.temperature === 'number') temp = d.temperature;
      if (cpu > 0 || ram > 0 || temp > 0) {
        const now = Date.now();
        const cutoff = now - 3 * 60 * 60 * 1000; // 3 Stunden
        ecoHistory.cpu.push({ time: now, value: cpu });
        ecoHistory.ram.push({ time: now, value: ram });
        ecoHistory.temp.push({ time: now, value: temp });
        ecoHistory.cpu  = ecoHistory.cpu.filter(p => p.time > cutoff);
        ecoHistory.ram  = ecoHistory.ram.filter(p => p.time > cutoff);
        ecoHistory.temp = ecoHistory.temp.filter(p => p.time > cutoff);
        // Auch in API-Cache schreiben – HA-Push liest von dort
        setCached('eco-stats', { cpu, ram, cpu_temp: temp });
        return;
      }
    } catch {}
  }
}

setInterval(async () => {
  for (const [sid, session] of sessions) {
    try {
      let addonInfo = await soapRequest(session.host, 'urn:schemas-upnp-org:service:WANCommonInterfaceConfig:1', 'GetAddonInfos', session.username, session.password, session.controlUrls);
      if (!addonInfo['NewByteSendRate'] && !addonInfo['NewTotalBytesReceived']) {
        addonInfo = await soapRequest(session.host, 'urn:dslforum-org:service:WANCommonInterfaceConfig:1', 'GetAddonInfos', session.username, session.password, session.controlUrls);
      }
      const downBps = parseInt(addonInfo['NewByteReceiveRate'] || '0', 10) || 0;
      const upBps = parseInt(addonInfo['NewByteSendRate'] || '0', 10) || 0;
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
    try { await collectEcoHistory(session); } catch {}
  }
}, 10000);

function getCached(key, ttl = CACHE_TTL) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < ttl) return entry.data;
  cache.delete(key);
  return null;
}

function setCached(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

// ── Helpers ──

function parseXml(xml) {
  const result = {};
  const regex = /<(\w+)>([^<]*)<\/\1>/g;
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
  };
  for (const [svc, url] of Object.entries(fallbacks)) {
    if (!controlUrls[svc]) controlUrls[svc] = url;
  }
  return controlUrls;
}

async function getWebSid(host, username, password) {
  const loginUrl = `http://${host}/login_sid.lua`;
  try {
    const resp = await fetch(loginUrl);
    const text = await resp.text();

    // XML-Antwort (klassische FritzBox)
    if (text.includes('<SID>') || text.includes('<Challenge>')) {
      const sidMatch = text.match(/<SID>([^<]+)<\/SID>/);
      if (sidMatch && sidMatch[1] && sidMatch[1] !== '0000000000000000') return sidMatch[1];
      const challengeMatch = text.match(/<Challenge>([^<]+)<\/Challenge>/);
      if (!challengeMatch) return '';
      const challenge = challengeMatch[1];
      const challengeBuf = Buffer.from(challenge + '-' + password, 'utf16le');
      const responseStr = createHash('md5').update(challengeBuf).digest('hex');
      const formData = new URLSearchParams({ username, response: challenge + '-' + responseStr });
      const loginResp = await fetch(loginUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: formData.toString() });
      const loginText = await loginResp.text();
      const newSid = loginText.match(/<SID>([^<]+)<\/SID>/);
      if (newSid && newSid[1] !== '0000000000000000') return newSid[1];
    }

    // Fritz!Box Cable: HTML-Antwort mit challenge in JS
    const challengeMatch = text.match(/var challenge\s*=\s*['"]([^'"]+)['"]/);
    if (challengeMatch) {
      const challenge = challengeMatch[1];
      const challengeBuf = Buffer.from(challenge + '-' + password, 'utf16le');
      const responseStr = createHash('md5').update(challengeBuf).digest('hex');
      const formData = new URLSearchParams({ username, response: challenge + '-' + responseStr });
      const loginResp = await fetch(loginUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: formData.toString() });
      const loginText = await loginResp.text();
      const newSid = loginText.match(/<SID>([^<]+)<\/SID>/);
      if (newSid && newSid[1] !== '0000000000000000') return newSid[1];
    }

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

// ── AHA-HTTP: Geräteliste als XML parsen (SmartHome / DECT Smart Devices) ──
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
    }
    devices.push(device);
  }
  return devices;
}

async function getHostsViaSoap(host, username, password, controlUrls) {
  const countRes = await soapRequest(host, 'urn:dslforum-org:service:Hosts:1', 'GetHostNumberOfEntries', username, password, controlUrls);
  const count = parseInt(countRes?.NewHostNumberOfEntries || '0', 10) || 0;
  // Alle Hosts parallel abrufen (statt sequentiell) – deutlich schneller bei >10 Geräten
  const BATCH = 15; // max. gleichzeitige Requests
  const hosts = [];
  for (let i = 0; i < count; i += BATCH) {
    const indices = Array.from({ length: Math.min(BATCH, count - i) }, (_, j) => i + j);
    const results = await Promise.allSettled(
      indices.map(idx => soapRequest(host, 'urn:dslforum-org:service:Hosts:1', 'GetGenericHostEntry', username, password, controlUrls, { NewIndex: String(idx) }))
    );
    for (const r of results) {
      if (r.status === 'fulfilled') {
        const entry = r.value;
        hosts.push({
          mac: (entry.NewMACAddress || '').replace(/-/g, ':').toLowerCase(),
          ip: entry.NewIPAddress || '',
          active: entry.NewActive === '1' || entry.NewActive === 'true',
          name: entry.NewHostName || entry.NewInterfaceType || '',
          interface: entry.NewInterfaceType || '',
        });
      }
    }
  }
  return hosts;
}

async function getDeviceInfoViaSoap(host, username, password, controlUrls) {
  return soapRequest(host, 'urn:dslforum-org:service:DeviceInfo:1', 'GetInfo', username, password, controlUrls);
}

// ── Endpoints ──

app.get('/api/fritz/auto-session', async (req, res) => {
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
    sessions.set(AUTO_SID, { host, username, password, controlUrls, isAutoSession: true });
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

app.get('/api/fritz/hosts', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const cached = getCached('hosts', 60000); // Hosts 60s cachen – ändert sich selten
  if (cached) return res.json(cached);
  try {
    const hosts = await getHostsViaSoap(session.host, session.username, session.password, session.controlUrls);
    setCached('hosts', hosts);
    return res.json(hosts);
  } catch (err) {
    console.error('Hosts error:', err.message);
    return res.json([]);
  }
});

app.get('/api/fritz/eco-stats', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const cached = getCached('eco-stats');
  if (cached) return res.json(cached);
  try {
    const webSid = await getCachedWebSid(session);
    if (!webSid) return res.json({ cpu: 0, ram: 0, cpu_temp: 0 });

    const pages = ['home', 'eco', 'ecoStat', 'overview', 'system', 'sysStat'];
    for (const page of pages) {
      try {
        const params = new URLSearchParams({ xhr: '1', sid: webSid, lang: 'de', page, xhrId: 'all' });
        const r = await fetch(`http://${session.host}/data.lua`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });
        const text = await r.text();
        if (text.trim().startsWith('{')) {
          const data = JSON.parse(text);
          const d = data?.data || {};
          // Standard-Pfade (7590, 6591)
          const cpuSeries  = d.cpuutil?.series?.[0]  || d.cpuUtilization?.series?.[0]  || [];
          const ramSeries  = d.ramusage?.series?.[2]  || d.ramusage?.series?.[0] || d.ramUsage?.series?.[0] || [];
          const tempSeries = d.cputemp?.series?.[0]   || d.cpuTemp?.series?.[0]  || [];
          let cpu      = cpuSeries.length  > 0 ? parseInt(cpuSeries[cpuSeries.length - 1],   10) : 0;
          let ram      = ramSeries.length  > 0 ? Math.round(ramSeries[ramSeries.length - 1])    : 0;
          let cpu_temp = tempSeries.length > 0 ? parseInt(tempSeries[tempSeries.length - 1], 10) : 0;
          // Direktwert-Fallback (7530 und ältere Modelle)
          if (cpu      === 0) cpu      = parseInt(d.cpu      || d.cpuload  || d.cpu_util  || d.cpuUtil  || d.stat?.cpu  || '0', 10) || 0;
          if (ram      === 0) ram      = parseInt(d.ram      || d.ramutil  || d.ram_util  || d.ramUtil  || d.memory     || d.stat?.ram || d.memUsage || '0', 10) || 0;
          if (cpu_temp === 0) cpu_temp = parseInt(d.temp     || d.cpu_temp || d.cputemp   || d.cpuTemp  || d.temperature || d.stat?.temp || '0', 10) || 0;
          // 7530: Werte können in d.data.stat oder als direkte Zahlen liegen
          if (cpu === 0 && typeof d.cpuUtil === 'number')      cpu      = d.cpuUtil;
          if (ram === 0 && typeof d.ramUtil === 'number')      ram      = d.ramUtil;
          if (cpu_temp === 0 && typeof d.temperature === 'number') cpu_temp = d.temperature;
          if (cpu > 0 || ram > 0 || cpu_temp > 0) {
            const result = { cpu, ram, cpu_temp };
            setCached('eco-stats', result);
            return res.json(result);
          }
        }
      } catch {}
    }
    return res.json({ cpu: 0, ram: 0, cpu_temp: 0 });
  } catch (err) {
    console.error('EcoStats error:', err.message);
    return res.json({ cpu: 0, ram: 0, cpu_temp: 0 });
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

  const cached = getCached('network-stats');
  if (cached) return res.json(cached);

  let downBps = 0, upBps = 0, dsHistory = [], usHistory = [];
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
        const data = JSON.parse(text);
        const syncGroups = data?.data?.sync_groups || [];
        if (syncGroups[0]) {
          const group = syncGroups[0];
          dsHistory = group.ds_bps_curr || [];
          usHistory = group.us_default_bps_curr || [];
          if (dsHistory.length > 0) downBps = dsHistory[dsHistory.length - 1] || 0;
          if (usHistory.length > 0) upBps = usHistory[usHistory.length - 1] || 0;
        }
      }
    }
  } catch (e) { console.error('NetworkMonitor error:', e.message); }

  // Fallback: GetAddonInfos für Live-Speeds
  if (downBps === 0 && upBps === 0) {
    try {
      let addonInfo = await soapRequest(session.host, 'urn:schemas-upnp-org:service:WANCommonInterfaceConfig:1', 'GetAddonInfos', session.username, session.password, session.controlUrls);
      if (!addonInfo['NewByteSendRate'] && !addonInfo['NewTotalBytesReceived']) {
        addonInfo = await soapRequest(session.host, 'urn:dslforum-org:service:WANCommonInterfaceConfig:1', 'GetAddonInfos', session.username, session.password, session.controlUrls);
      }
      downBps = parseInt(addonInfo['NewByteReceiveRate'] || '0', 10) || 0;
      upBps = parseInt(addonInfo['NewByteSendRate'] || '0', 10) || 0;
    } catch (e) { console.error('AddonInfos fallback error:', e.message); }
  }

  // Server-side history for Cable models
  if (dsHistory.length === 0 && trafficHistory.down.length > 0) {
    const now = Date.now();
    dsHistory = trafficHistory.down.filter(p => now - p.time <= 30 * 60 * 1000).map(p => p.value);
    usHistory = trafficHistory.up.filter(p => now - p.time <= 30 * 60 * 1000).map(p => p.value);
  }

  let totalDown = 0, totalUp = 0;
  try {
    let addonInfo = await soapRequest(session.host, 'urn:schemas-upnp-org:service:WANCommonInterfaceConfig:1', 'GetAddonInfos', session.username, session.password, session.controlUrls);
    if (!addonInfo['NewTotalBytesReceived'] && !addonInfo['NewX_AVM_DE_TotalBytesReceived64']) {
      addonInfo = await soapRequest(session.host, 'urn:dslforum-org:service:WANCommonInterfaceConfig:1', 'GetAddonInfos', session.username, session.password, session.controlUrls);
    }
    totalDown = parseInt(addonInfo['NewX_AVM_DE_TotalBytesReceived64'] || addonInfo['NewTotalBytesReceived'] || '0', 10) || 0;
    totalUp = parseInt(addonInfo['NewX_AVM_DE_TotalBytesSent64'] || addonInfo['NewTotalBytesSent'] || '0', 10) || 0;
  } catch (e) { console.error('AddonInfos error:', e.message); }

  const result = { currentDown: downBps, currentUp: upBps, totalDown, totalUp, dsHistory, usHistory };
  setCached('network-stats', result);
  return res.json(result);
});

app.get('/api/fritz/device-stats', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const mac = req.query.mac;
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  try {
    const hosts = await getHostsViaSoap(session.host, session.username, session.password, session.controlUrls);
    const device = hosts.find(h => h.mac === mac);
    if (!device) return res.status(404).json({ error: 'Gerät nicht gefunden' });
    return res.json({ device, downBytes: 0, upBytes: 0 });
  } catch (err) {
    console.error('DeviceStats error:', err.message);
    return res.json({ device: null, downBytes: 0, upBytes: 0 });
  }
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

app.post('/api/fritz/logout', (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  if (sid !== AUTO_SID) {
    sessions.delete(sid);
  }
  return res.json({ success: true });
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
    const hosts = await getHostsViaSoap(session.host, session.username, session.password, session.controlUrls);
    const host = hosts.find(h => h.mac === mac);
    if (!host?.ip) return res.json({ blocked: false });
    const result = await soapRequest(session.host, 'urn:dslforum-org:service:X_AVM-DE_HostFilter:1', 'GetWANAccessByIP', session.username, session.password, session.controlUrls, { NewIPv4Address: host.ip });
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
  } catch {
    return res.json({ exists: false, ip: '', hostname: '' });
  }
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
    return res.json({ success: true });
  } catch (soapErr) {
    console.log('Static DHCP SOAP fehlgeschlagen, versuche data.lua:', soapErr.message);
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
    return res.json({ success: true });
  } catch (soapErr) {
    console.log('Static DHCP delete SOAP fehlgeschlagen, versuche data.lua:', soapErr.message);
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
    const hosts = await getHostsViaSoap(session.host, session.username, session.password, session.controlUrls);
    const host = hosts.find(h => h.mac === mac);
    if (!host?.ip) return res.json({ success: false, error: 'IP-Adresse des Geräts nicht gefunden' });
    await soapRequest(session.host, 'urn:dslforum-org:service:X_AVM-DE_HostFilter:1', 'DisallowWANAccessByIP', session.username, session.password, session.controlUrls, { NewIPv4Address: host.ip, NewDisallow: blocked ? '1' : '0' });
    return res.json({ success: true });
  } catch (err) {
    console.error('Block device error:', err.message);
    return res.json({ success: false, error: err.message });
  }
});

app.post('/api/fritz/device/update', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const { mac, name, ip } = req.body;
  const errors = [];
  if (name) {
    try {
      const sanitized = name.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss').replace(/[^A-Za-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);
      if (!sanitized) throw new Error('Name enthält keine gültigen Zeichen');
      await soapRequest(session.host, 'urn:dslforum-org:service:Hosts:1', 'X_AVM-DE_SetHostNameByMACAddress', session.username, session.password, session.controlUrls, { NewMACAddress: mac, NewHostName: sanitized });
    } catch (err) { errors.push(`Name: ${err.message}`); }
  }
  if (ip) {
    try {
      await soapRequest(session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1', 'AddStaticDHCPEntry', session.username, session.password, session.controlUrls, { NewIPAddress: ip, NewHostName: name || '', NewMACAddress: mac });
    } catch (err) { errors.push(`IP: ${err.message}`); }
  }
  if (errors.length > 0) return res.json({ success: false, error: errors.join('; ') });
  return res.json({ success: true });
});

// ============ NETZWERK ============

app.get('/api/fritz/network/lan', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  try {
    const result = await soapRequest(session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1', 'GetInfo', session.username, session.password, session.controlUrls);
    return res.json(result);
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

app.get('/api/fritz/network/wan', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  // WANIPConnection:1 (DHCP/Kabel-Modelle); Fallback: WANPPPConnection:1 (DSL/PPPoE wie 7530)
  for (const svc of ['urn:dslforum-org:service:WANIPConnection:1', 'urn:dslforum-org:service:WANPPPConnection:1']) {
    try {
      const [ip, status] = await Promise.all([
        soapRequest(session.host, svc, 'GetExternalIPAddress', session.username, session.password, session.controlUrls),
        soapRequest(session.host, svc, 'GetStatusInfo',        session.username, session.password, session.controlUrls),
      ]);
      return res.json({ ...ip, ...status, _wanService: svc });
    } catch {}
  }
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

app.get('/api/fritz/network/wlan', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  try {
    const results = [];
    for (let i = 1; i <= 3; i++) {
      try {
        const svc = `urn:dslforum-org:service:WLANConfiguration:${i}`;
        const info = await soapRequest(session.host, svc, 'GetInfo', session.username, session.password, session.controlUrls);
        let keyPassphrase = '';
        try {
          const keys = await soapRequest(session.host, svc, 'GetSecurityKeys', session.username, session.password, session.controlUrls);
          keyPassphrase = keys.NewKeyPassphrase || '';
        } catch {}
        results.push({ ...info, NewKeyPassphrase: keyPassphrase, _index: i });
      } catch {}
    }
    return res.json(results);
  } catch (err) {
    console.error('WLAN error:', err.message);
    return res.json([]);
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
    const result = await soapRequest(session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1', 'GetInfo', session.username, session.password, session.controlUrls);
    return res.json(result);
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

app.get('/api/fritz/ip-stats', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const cached = getCached('ip-stats', 30000); // 30 Sekunden cachen
  if (cached) return res.json(cached);
  function ipToInt(ip) {
    const parts = (ip || '').split('.');
    if (parts.length !== 4) return 0;
    return ((parseInt(parts[0], 10) << 24) | (parseInt(parts[1], 10) << 16) | (parseInt(parts[2], 10) << 8) | parseInt(parts[3], 10)) >>> 0;
  }
  async function calcStats(minAddress, maxAddress) {
    const hosts = await getHostsViaSoap(session.host, session.username, session.password, session.controlUrls);
    const minInt = ipToInt(minAddress);
    const maxInt = ipToInt(maxAddress);
    const total = (minInt && maxInt && maxInt >= minInt) ? maxInt - minInt + 1 : 0;
    const used = hosts.filter(h => { if (!h.ip) return false; const ipInt = ipToInt(h.ip); return ipInt >= minInt && ipInt <= maxInt; }).length;
    const free = Math.max(0, total - used);
    return { total, used, free, minAddress, maxAddress };
  }
  try {
    const dhcp = await soapRequest(session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1', 'GetInfo', session.username, session.password, session.controlUrls);
    const result = await calcStats(dhcp.NewMinAddress || '', dhcp.NewMaxAddress || '');
    setCached('ip-stats', result);
    return res.json(result);
  } catch (err) {
    console.error('IP-Stats error:', err.message);
    // Fallback via data.lua für ältere Modelle (z.B. 6490) ohne TR-064-Zugriff
    try {
      const webSid = await getCachedWebSid(session);
      if (webSid) {
        for (const page of ['lanExpert', 'lan', 'home']) {
          try {
            const params = new URLSearchParams({ xhr: '1', sid: webSid, lang: 'de', page, xhrId: 'all' });
            const r = await fetch(`http://${session.host}/data.lua`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
            const text = await r.text();
            if (!text.trim().startsWith('{')) continue;
            const d = JSON.parse(text)?.data || {};
            const minAddr = d.dhcp_start || d.dhcpStart || d.NewMinAddress || '';
            const maxAddr = d.dhcp_end   || d.dhcpEnd   || d.NewMaxAddress || '';
            if (minAddr && maxAddr) {
              const result = await calcStats(minAddr, maxAddr).catch(() => ({ total: 0, used: 0, free: 0, minAddress: minAddr, maxAddress: maxAddr }));
              setCached('ip-stats', result);
              return res.json(result);
            }
          } catch {}
        }
      }
    } catch {}
    return res.json({ total: 0, used: 0, free: 0, minAddress: '', maxAddress: '' });
  }
});

// ============ MESH ============

app.get('/api/fritz/mesh', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  const isWlanIface = (t) => { const s = (t || '').toLowerCase(); return s.includes('wlan') || s.includes('802.11') || s.includes('wireless') || s.includes('wifi'); };

  async function buildMeshFromHosts() {
    try {
      const hosts = await getHostsViaSoap(session.host, session.username, session.password, session.controlUrls);
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
        interfaces: [{ type: h.interface || 'LAN', name: '' }],
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
      setCached('mesh-hosts-fallback', result, 30000);
      return res.json(result);
    }
    return res.json({ nodes: [], links: [] });
  }

  const cached = getCached('mesh-topology', 30000);
  if (cached) return res.json(cached);

  const webSid = await getCachedWebSid(session);
  if (!webSid) { console.log('Mesh: kein webSid verfügbar'); return res.json({ nodes: [], links: [] }); }

  // Alle Seiten + meshlist.lua parallel abfragen (statt seriell) → max. 10s Wartezeit
  async function tryDataLuaPage(page) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const params = new URLSearchParams({ xhr: '1', sid: webSid, lang: 'de', page, xhrId: 'all' });
      const r = await fetch(`http://${session.host}/data.lua`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        signal: ctrl.signal,
      });
      const text = await r.text();
      console.log(`Mesh: page=${page} status=${r.status} length=${text.length}`);
      if (!text.trim().startsWith('{')) return null;
      const raw = JSON.parse(text);
      const d = raw?.data || raw || {};

      const nodeList = d.nodes || d.meshNodes || d.mesh_nodes ||
                       d.topology?.nodes || d.topo?.nodes || null;
      const linkList = d.links || d.meshLinks || d.mesh_links ||
                       d.topology?.links || d.topo?.links || null;
      if (nodeList && Array.isArray(nodeList) && nodeList.length > 0) {
        return normalizeMeshData(nodeList, linkList || []);
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
    } catch (err) {
      console.log(`Mesh: page=${page} Fehler: ${err.message}`);
      return null;
    } finally { clearTimeout(timer); }
  }

  async function tryMeshlist() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const r = await fetch(`http://${session.host}/meshlist.lua?sid=${webSid}`, { signal: ctrl.signal });
      const text = await r.text();
      console.log(`Mesh: meshlist.lua status=${r.status} length=${text.length}`);
      if (r.status === 404) return null;
      if (!text.trim().startsWith('{')) return null;
      const raw = JSON.parse(text);
      const nodeList = raw?.meshlist?.nodes || raw?.nodes || [];
      if (nodeList.length > 0) return normalizeMeshData(nodeList, raw?.meshlist?.links || raw?.links || []);
      return null;
    } catch (err) {
      console.log(`Mesh: meshlist.lua Fehler: ${err.message}`);
      return null;
    } finally { clearTimeout(timer); }
  }

  // Alternativer Endpunkt: /net/mesh_overview.lua (manche FritzOS-Versionen)
  async function tryMeshOverview() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const r = await fetch(`http://${session.host}/net/mesh_overview.lua?sid=${webSid}`, { signal: ctrl.signal });
      const text = await r.text();
      console.log(`Mesh: mesh_overview.lua status=${r.status} length=${text.length}`);
      if (r.status === 404) return null;
      if (!text.trim().startsWith('{')) return null;
      const raw = JSON.parse(text);
      const nodeList = raw?.nodes || raw?.meshlist?.nodes || [];
      if (nodeList.length > 0) return normalizeMeshData(nodeList, raw?.links || raw?.meshlist?.links || []);
      return null;
    } catch (err) {
      console.log(`Mesh: mesh_overview.lua Fehler: ${err.message}`);
      return null;
    } finally { clearTimeout(timer); }
  }

  console.log('Mesh: starte parallele Abfragen');
  const results = await Promise.all([
    tryDataLuaPage('meshTopo'),
    tryDataLuaPage('netTopo'),
    tryDataLuaPage('hostTopo'),
    tryDataLuaPage('mesh'),
    tryDataLuaPage('meshSet'),
    tryDataLuaPage('meshNet'),
    tryMeshlist(),
    tryMeshOverview(),
  ]);

  const found = results.find(r => r !== null);
  if (found) {
    setCached('mesh-topology', found, 30000);
    return res.json(found);
  }

  // Letzter Fallback: Pseudo-Mesh aus Host-Liste
  const hostFallback = await buildMeshFromHosts();
  if (hostFallback) {
    setCached('mesh-topology', hostFallback, 30000);
    return res.json(hostFallback);
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
  const nodes = devices.map((d, i) => ({
    uid:       d.mac || d.uid || String(i),
    name:      d.name || d.hostname || d.FriendlyName || `Gerät ${i + 1}`,
    mac:       d.mac || d.MACAddress || '',
    ip:        d.ip || d.IPAddress || '',
    role:      d.is_mesh_master || d.meshRole === 'master' || d.mesh_role === 'master' ? 'master'
             : d.mesh_role === 'satellite' || d.meshRole === 'satellite' ? 'satellite'
             : 'client',
    is_meshed: true,
    model:     d.model || d.device_model || '',
    interfaces: [],
  }));
  // Links aus Parent-Referenzen ableiten
  const links = [];
  devices.forEach(d => {
    if (d.parent_uid || d.master_uid) {
      links.push({ from: d.parent_uid || d.master_uid, to: d.mac || d.uid, type: d.medium || 'WiFi', speed: 0 });
    }
  });
  return { nodes, links };
}

// ============ TELEFONIE ============

app.get('/api/fritz/smartHome', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  try {
    const webSid = await getCachedWebSid(session);
    // Primär: AHA-HTTP XML Interface (offizielle Schnittstelle für SmartHome/DECT-Geräte)
    if (webSid) {
      try {
        const ahaUrl = `http://${session.host}/webservices/homeautoswitch.lua?switchcmd=getdevicelistinfos&sid=${webSid}`;
        const r = await fetch(ahaUrl);
        const xml = await r.text();
        if (xml.includes('<devicelist')) {
          const devices = parseAhaDeviceList(xml);
          if (devices.length > 0) return res.json(devices);
        }
      } catch {}
    }
    // Fallback: data.lua
    if (webSid) {
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
          if (Array.isArray(devices) && devices.length > 0) return res.json(devices);
        }
      } catch {}
    }
    return res.json([]);
  } catch (err) {
    console.error('SmartHome error:', err.message);
    return res.json([]);
  }
});

app.get('/api/fritz/dect', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  try {
    // SOAP-Aufrufe einzeln kapseln – ein Fehler darf den data.lua-Fallback nicht blockieren
    let baseInfo = {};
    try {
      baseInfo = await soapRequest(session.host, 'urn:dslforum-org:service:X_AVM-DE_Dect:1', 'GetDECTInfo', session.username, session.password, session.controlUrls);
    } catch (e) { console.log('DECT GetDECTInfo SOAP fehlgeschlagen (Fallback folgt):', e.message); }

    let count = 0;
    try {
      const countRes = await soapRequest(session.host, 'urn:dslforum-org:service:X_AVM-DE_Dect:1', 'GetNumberOfDectEntries', session.username, session.password, session.controlUrls);
      count = parseInt(countRes?.NewNumberOfEntries || '0', 10) || 0;
    } catch {}

    const handsets = [];
    for (let i = 0; i < count; i++) {
      try {
        const entry = await soapRequest(session.host, 'urn:dslforum-org:service:X_AVM-DE_Dect:1', 'GetGenericDectEntry', session.username, session.password, session.controlUrls, { NewIndex: String(i) });
        handsets.push({
          name: entry.NewDeviceName || entry.NewName || `Handset ${i + 1}`,
          model: entry.NewManufacturerOUI || '',
          id: entry.NewIntId || entry.NewId || String(i),
          active: entry.NewActive === '1',
          connected: entry.NewConnected === '1',
          battery: entry.NewBatteryChargeStat || entry.NewBattery || '',
        });
      } catch {}
    }
    const soapOk = baseInfo && (baseInfo.NewDECTActive !== undefined || baseInfo.NewDECTBaseName !== undefined);
    if (!soapOk || handsets.length === 0) {
      const webSid = await getCachedWebSid(session);
      if (webSid) {
        // Verschiedene data.lua-Seiten durchprobieren: 'dect' listet angemeldete Handsets,
        // 'dectReg' zeigt Registrierungsstatus, 'dectSet' enthält Basiseinstellungen
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
            if (!soapOk) {
              baseInfo.NewDECTActive = dectData.active === true || dectData.active === '1' ? '1' : '0';
              baseInfo.NewDECTBaseName = dectData.name || dectData.base_name || dectData.basename || '';
              baseInfo.NewDECTPowerActive = dectData.ecomode === true || dectData.ecomode === '1' ? '1' : '0';
            }
            if (handsets.length === 0) {
              // Breit suchen: verschiedene Pfade für Handset-Listen
              const candidates = [
                d?.data?.handsets, dectData.handsets,
                dectData.devices,  dectData.mobiles,
                d?.data?.mobiles,  d?.data?.devices,
              ];
              for (const list of candidates) {
                if (Array.isArray(list) && list.length > 0) {
                  for (const h of list) {
                    handsets.push({
                      name: h.name || h.device_name || h.devicename || h.displayname || 'Handset',
                      model: h.model || h.product || h.productname || '',
                      id: String(h.id || h.intern_id || h.index || ''),
                      active: h.active === '1' || h.active === true,
                      connected: h.connect === '1' || h.connected === '1' || h.connected === true || h.registered === '1',
                      battery: String(h.battery || h.akku || h.batterycharge || ''),
                    });
                  }
                  break;
                }
              }
            }
            if (handsets.length > 0) break;
          } catch {}
        }
      }
    }
    return res.json({ ...baseInfo, handsets });
  } catch (err) {
    console.error('DECT error:', err.message);
    return res.json({ handsets: [] });
  }
});

app.get('/api/fritz/calls', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  try {
    let result = await soapRequest(session.host, 'urn:dslforum-org:service:X_AVM-DE_OnTel:1', 'GetCallList', session.username, session.password, session.controlUrls);
    if (!result?.NewCallListURL && !result?.['NewX_AVM-DE_CallListURL']) {
      result = await soapRequest(session.host, 'urn:dslforum-org:service:X_AVM-DE_VoIP:1', 'X_AVM-DE_GetCallList', session.username, session.password, session.controlUrls);
    }
    const callListUrl = result?.NewCallListURL || result?.['NewX_AVM-DE_CallListURL'];
    if (callListUrl) {
      const callRes = await fetch(callListUrl);
      const xml = await callRes.text();
      const calls = [];
      const regex = /<Call>([\s\S]*?)<\/Call>/g;
      let match;
      while ((match = regex.exec(xml)) !== null) {
        const x = match[1];
        const type = x.match(/<Type>([^<]*)<\/Type>/)?.[1] || '';
        const date = x.match(/<Date>([^<]*)<\/Date>/)?.[1] || '';
        const name = x.match(/<Name>([^<]*)<\/Name>/)?.[1] || '';
        const duration = x.match(/<Duration>([^<]*)<\/Duration>/)?.[1] || '';
        const caller = x.match(/<Caller>([^<]*)<\/Caller>/)?.[1] || '';
        const called = x.match(/<Called>([^<]*)<\/Called>/)?.[1] || '';
        const number = (type === '3' || type === '1' || type === '10') ? caller : called;
        calls.push({ date, name, number, type, duration });
      }
      return res.json(calls);
    }
    return res.json([]);
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
    let addonInfo = await soapRequest(session.host, 'urn:schemas-upnp-org:service:WANCommonInterfaceConfig:1', 'GetAddonInfos', session.username, session.password, session.controlUrls);
    if (!addonInfo['NewTotalBytesReceived'] && !addonInfo['NewX_AVM_DE_TotalBytesReceived64']) {
      addonInfo = await soapRequest(session.host, 'urn:dslforum-org:service:WANCommonInterfaceConfig:1', 'GetAddonInfos', session.username, session.password, session.controlUrls);
    }
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

app.get('/api/fritz/traffic-counters', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  const cached = getCached('traffic-counters');
  if (cached) return res.json(cached);

  return res.json(await collectTrafficCounters(session));
});

// Version endpoint
app.get('/api/fritz/version', async (req, res) => {
  try {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return res.json({ version: pkg.version });
  } catch {
    return res.json({ version: '1.1.2' });
  }
});

// ============ HA SENSOR PUSH ============

const HA_TOKEN = process.env.SUPERVISOR_TOKEN || '';
const HA_API   = 'http://supervisor/core/api';

// Laufzeit-Einstellungen (aus /data/fritz-portal.json überschreibbar)
const SETTINGS_FILE = '/data/fritz-portal.json';
let haSensorsEnabled     = process.env.HA_SENSORS === 'true';
let haFastIntervalSec    = Math.max(10,  parseInt(process.env.HA_SENSORS_INTERVAL          || '60',  10));
let haTrafficIntervalSec = Math.max(30,  parseInt(process.env.HA_SENSORS_TRAFFIC_INTERVAL  || '300', 10));

try {
  if (existsSync(SETTINGS_FILE)) {
    const s = JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'));
    if (s.ha_sensors !== undefined)         haSensorsEnabled     = !!s.ha_sensors;
    if (s.ha_sensors_interval)              haFastIntervalSec    = Math.max(10,  parseInt(s.ha_sensors_interval,        10));
    if (s.ha_sensors_traffic_interval)      haTrafficIntervalSec = Math.max(30,  parseInt(s.ha_sensors_traffic_interval, 10));
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
    if (!res.ok) console.error(`MQTT publish Fehler (${topic}): HTTP ${res.status}`);
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
  { id: 'online_devices', name: 'Geräte online',      unit: '',    icon: 'mdi:devices',        device_class: null,          state_class: 'measurement' },
  { id: 'free_ips',       name: 'Freie IP-Adressen',  unit: '',    icon: 'mdi:ip-network',     device_class: null,          state_class: 'measurement' },
  { id: 'download_speed', name: 'Download aktuell',   unit: 'MB/s',icon: 'mdi:download',       device_class: 'data_rate',   state_class: 'measurement' },
  { id: 'upload_speed',   name: 'Upload aktuell',     unit: 'MB/s',icon: 'mdi:upload',         device_class: 'data_rate',   state_class: 'measurement' },
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
  if (!ok) { mqttAvailable = false; console.log('MQTT Discovery: Broker nicht erreichbar – REST-API Fallback wird genutzt wenn aktiviert'); return; }
  mqttAvailable = true;
  console.log('MQTT Discovery: Broker erreichbar – registriere Sensoren...');
  const device = fritzboxDevice();
  for (const s of MQTT_SENSORS) {
    const config = {
      name: s.name, unique_id: `fritzportal_${s.id}`, object_id: `fritzportal_${s.id}`,
      state_topic: `fritzportal/${s.id}/state`,
      unit_of_measurement: s.unit || undefined, icon: s.icon,
      device_class: s.device_class || undefined, state_class: s.state_class || undefined,
      device,
    };
    await publishMqtt(`homeassistant/sensor/fritzportal_${s.id}/config`, config, true);
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
      await publishMqtt(`homeassistant/sensor/fritzportal_${id}/config`, config, true);
    }
  }
  console.log('MQTT Discovery: alle Sensoren registriert');
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
  const hosts   = getCached('hosts',          60000) || [];
  const ipStats = getCached('ip-stats',       60000) || {};
  const net     = getCached('network-stats', 120000) || {};

  // Nur aktualisieren wenn Wert > 0 – verhindert dass abgelaufener Cache als "0" gesendet wird
  if ((eco.cpu      || 0) > 0) lastKnownFast.cpu      = eco.cpu;
  if ((eco.ram      || 0) > 0) lastKnownFast.ram      = eco.ram;
  if ((eco.cpu_temp || 0) > 0) lastKnownFast.cpu_temp = eco.cpu_temp;
  const online = hosts.filter(h => h.active).length;
  if (online      > 0) lastKnownFast.online   = online;
  if ((ipStats.free || 0) > 0) lastKnownFast.free_ips = ipStats.free;

  // Download/Upload: 0 ist gültiger Wert (kein Traffic), immer aktuell senden
  const dl = +(( net.currentDown || 0) / 1048576).toFixed(3);
  const ul = +((net.currentUp   || 0) / 1048576).toFixed(3);

  if (mqttAvailable) {
    await publishMqtt('fritzportal/cpu/state', lastKnownFast.cpu);
    await publishMqtt('fritzportal/ram/state', lastKnownFast.ram);
    await publishMqtt('fritzportal/temperature/state', lastKnownFast.cpu_temp);
    await publishMqtt('fritzportal/online_devices/state', lastKnownFast.online);
    await publishMqtt('fritzportal/free_ips/state', lastKnownFast.free_ips);
    await publishMqtt('fritzportal/download_speed/state', dl);
    await publishMqtt('fritzportal/upload_speed/state', ul);
  } else if (haSensorsEnabled) {
    await setState('sensor.fritzportal_cpu',            lastKnownFast.cpu,      { unit_of_measurement: '%',   friendly_name: 'FRITZ!Portal CPU-Auslastung',    icon: 'mdi:chip',            unique_id: 'fritzportal_rest_cpu' });
    await setState('sensor.fritzportal_ram',            lastKnownFast.ram,      { unit_of_measurement: '%',   friendly_name: 'FRITZ!Portal RAM-Auslastung',    icon: 'mdi:memory',          unique_id: 'fritzportal_rest_ram' });
    await setState('sensor.fritzportal_temperature',    lastKnownFast.cpu_temp, { unit_of_measurement: '°C',  friendly_name: 'FRITZ!Portal CPU-Temperatur',    icon: 'mdi:thermometer',     unique_id: 'fritzportal_rest_temperature',    device_class: 'temperature' });
    await setState('sensor.fritzportal_online_devices', lastKnownFast.online,   { unit_of_measurement: '',    friendly_name: 'FRITZ!Portal Geräte online',     icon: 'mdi:devices',         unique_id: 'fritzportal_rest_online_devices' });
    await setState('sensor.fritzportal_free_ips',       lastKnownFast.free_ips, { unit_of_measurement: '',    friendly_name: 'FRITZ!Portal Freie IP-Adressen', icon: 'mdi:ip-network',      unique_id: 'fritzportal_rest_free_ips' });
    await setState('sensor.fritzportal_download_speed', dl, { unit_of_measurement: 'MB/s', friendly_name: 'FRITZ!Portal Download aktuell',  icon: 'mdi:download', device_class: 'data_rate', unique_id: 'fritzportal_rest_download_speed' });
    await setState('sensor.fritzportal_upload_speed',   ul, { unit_of_measurement: 'MB/s', friendly_name: 'FRITZ!Portal Upload aktuell',    icon: 'mdi:upload',   device_class: 'data_rate', unique_id: 'fritzportal_rest_upload_speed' });
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
  function bytesToHaValue(bytes) {
    if (bytes < 1024 * 1024 * 1024) return { value: +(bytes / (1024 * 1024)).toFixed(2), unit: 'MB' };
    return { value: +(bytes / (1024 * 1024 * 1024)).toFixed(3), unit: 'GB' };
  }
  if (mqttAvailable) {
    for (let i = 0; i < tc.rows.length; i++) {
      const row = tc.rows[i];
      const k   = keys[i];
      const mbDl = +((lastKnownTraffic[row.name + '_dl'] || row.received) / (1024 * 1024)).toFixed(2);
      const mbUl = +((lastKnownTraffic[row.name + '_ul'] || row.sent)     / (1024 * 1024)).toFixed(2);
      await publishMqtt(`fritzportal/traffic_${k}_received/state`, mbDl);
      await publishMqtt(`fritzportal/traffic_${k}_sent/state`, mbUl);
    }
  } else if (haSensorsEnabled) {
    for (let i = 0; i < tc.rows.length; i++) {
      const row = tc.rows[i];
      const k   = keys[i];
      const lbl = names[i];
      const rx = bytesToHaValue(row.received);
      const tx = bytesToHaValue(row.sent);
      await setState(`sensor.fritzportal_traffic_${k}_received`, rx.value, { unit_of_measurement: rx.unit, friendly_name: `FRITZ!Portal Download ${lbl}`, icon: 'mdi:download-network', device_class: 'data_size', unique_id: `fritzportal_rest_traffic_${k}_received` });
      await setState(`sensor.fritzportal_traffic_${k}_sent`,     tx.value, { unit_of_measurement: tx.unit, friendly_name: `FRITZ!Portal Upload ${lbl}`,   icon: 'mdi:upload-network',   device_class: 'data_size', unique_id: `fritzportal_rest_traffic_${k}_sent` });
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
  // MQTT Discovery immer versuchen
  publishMqttDiscovery().catch(() => {});
  haFastTimer    = setInterval(() => { pushFastSensorsToHA().catch(() => {}); },    haFastIntervalSec    * 1000);
  haTrafficTimer = setInterval(() => { pushTrafficSensorsToHA().catch(() => {}); }, haTrafficIntervalSec * 1000);
  const restInfo = haSensorsEnabled ? ' + REST-API Fallback aktiv' : ' (REST-API Fallback deaktiviert)';
  console.log(`HA Sensor Push gestartet: MQTT Discovery${restInfo} (Systemsensoren: ${haFastIntervalSec}s, Traffic: ${haTrafficIntervalSec}s)`);
}

startHaTimers();

app.get('/api/fritz/ha-settings', (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  if (!sessions.get(sid)) return res.status(401).json({ error: 'Nicht eingeloggt' });
  return res.json({
    ha_sensors:                  haSensorsEnabled,
    ha_sensors_interval:         haFastIntervalSec,
    ha_sensors_traffic_interval: haTrafficIntervalSec,
    ha_available:                !!HA_TOKEN,
    mqtt_available:              mqttAvailable,
  });
});

app.post('/api/fritz/ha-settings', (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  if (!sessions.get(sid)) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const { ha_sensors, ha_sensors_interval, ha_sensors_traffic_interval } = req.body;
  if (ha_sensors !== undefined)                  haSensorsEnabled     = !!ha_sensors;
  if (ha_sensors_interval !== undefined)         haFastIntervalSec    = Math.max(10,  parseInt(ha_sensors_interval,         10) || 60);
  if (ha_sensors_traffic_interval !== undefined) haTrafficIntervalSec = Math.max(30,  parseInt(ha_sensors_traffic_interval, 10) || 300);
  try {
    writeFileSync(SETTINGS_FILE, JSON.stringify({
      ha_sensors:                  haSensorsEnabled,
      ha_sensors_interval:         haFastIntervalSec,
      ha_sensors_traffic_interval: haTrafficIntervalSec,
    }));
  } catch (e) { console.error('Settings speichern fehlgeschlagen:', e.message); }
  startHaTimers();
  return res.json({ success: true, ha_sensors: haSensorsEnabled, ha_sensors_interval: haFastIntervalSec, ha_sensors_traffic_interval: haTrafficIntervalSec });
});

const PORT = 3003;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`FritzBox Proxy Server läuft auf http://0.0.0.0:${PORT}`);
});

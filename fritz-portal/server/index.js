import express from 'express';
import DigestFetch from 'digest-fetch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── HA Add-on: Zugangsdaten aus /data/options.json lesen (überschreibt Env-Vars nicht) ──
try {
  if (existsSync('/data/options.json')) {
    const opts = JSON.parse(readFileSync('/data/options.json', 'utf-8'));
    if (opts.fritzbox_host     && !process.env.FRITZBOX_HOST)     process.env.FRITZBOX_HOST     = opts.fritzbox_host;
    if (opts.fritzbox_user     && !process.env.FRITZBOX_USER)     process.env.FRITZBOX_USER     = opts.fritzbox_user;
    if (opts.fritzbox_password && !process.env.FRITZBOX_PASSWORD) process.env.FRITZBOX_PASSWORD = opts.fritzbox_password;
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
const WEB_SID_TTL = 300000; // 5 Minuten

async function getCachedWebSid(session) {
  if (cachedWebSid !== null && Date.now() - cachedWebSidTime < WEB_SID_TTL) return cachedWebSid;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
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

// ── Traffic history für Dashboard-Chart (server-seitig, alle 10 Sekunden) ──
const trafficHistory = { down: [], up: [] };
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
    } catch {}
  }
}, 10000);

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
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

async function getHostsViaSoap(host, username, password, controlUrls) {
  const countRes = await soapRequest(host, 'urn:dslforum-org:service:Hosts:1', 'GetHostNumberOfEntries', username, password, controlUrls);
  const count = parseInt(countRes?.NewHostNumberOfEntries || '0', 10) || 0;
  const hosts = [];
  for (let i = 0; i < count; i++) {
    try {
      const entry = await soapRequest(host, 'urn:dslforum-org:service:Hosts:1', 'GetGenericHostEntry', username, password, controlUrls, { NewIndex: String(i) });
      hosts.push({
        mac: (entry.NewMACAddress || '').replace(/-/g, ':').toLowerCase(),
        ip: entry.NewIPAddress || '',
        active: entry.NewActive === '1' || entry.NewActive === 'true',
        name: entry.NewHostName || entry.NewInterfaceType || '',
        interface: entry.NewInterfaceType || '',
      });
    } catch {}
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
    return res.json({ NewModelName: 'FRITZ!Box', NewFirmwareVersion: '' });
  }
});

app.get('/api/fritz/hosts', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const cached = getCached('hosts');
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

    const pages = ['home', 'eco', 'overview'];
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
          const cpuSeries = d.cpuutil?.series?.[0] || [];
          const ramSeries = d.ramusage?.series?.[2] || [];
          const tempSeries = d.cputemp?.series?.[0] || [];
          const cpu = cpuSeries.length > 0 ? parseInt(cpuSeries[cpuSeries.length - 1], 10) : 0;
          const ram = ramSeries.length > 0 ? Math.round(ramSeries[ramSeries.length - 1]) : 0;
          const cpu_temp = tempSeries.length > 0 ? parseInt(tempSeries[tempSeries.length - 1], 10) : 0;
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
  try {
    try {
      const existing = await soapRequest(session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1', 'GetSpecificStaticDHCPEntry', session.username, session.password, session.controlUrls, { NewMACAddress: mac });
      if (existing.NewIPAddress) {
        await soapRequest(session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1', 'DeleteStaticDHCPEntry', session.username, session.password, session.controlUrls, { NewIPAddress: existing.NewIPAddress, NewMACAddress: mac });
      }
    } catch {}
    await soapRequest(session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1', 'AddStaticDHCPEntry', session.username, session.password, session.controlUrls, { NewIPAddress: ip, NewMACAddress: mac, NewHostName: hostname || '' });
    return res.json({ success: true });
  } catch (err) {
    console.error('Static DHCP set error:', err.message);
    return res.json({ success: false, error: err.message });
  }
});

app.delete('/api/fritz/device/static-dhcp', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const { mac } = req.body;
  try {
    const existing = await soapRequest(session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1', 'GetSpecificStaticDHCPEntry', session.username, session.password, session.controlUrls, { NewMACAddress: mac });
    await soapRequest(session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1', 'DeleteStaticDHCPEntry', session.username, session.password, session.controlUrls, { NewIPAddress: existing.NewIPAddress, NewMACAddress: mac });
    return res.json({ success: true });
  } catch (err) {
    console.error('Static DHCP delete error:', err.message);
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
  } catch (err) {
    console.error('LAN error:', err.message);
    return res.json({});
  }
});

app.get('/api/fritz/network/wan', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  try {
    const ip = await soapRequest(session.host, 'urn:dslforum-org:service:WANIPConnection:1', 'GetExternalIPAddress', session.username, session.password, session.controlUrls);
    const status = await soapRequest(session.host, 'urn:dslforum-org:service:WANIPConnection:1', 'GetStatusInfo', session.username, session.password, session.controlUrls);
    return res.json({ ...ip, ...status });
  } catch (err) {
    console.error('WAN error:', err.message);
    return res.json({});
  }
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
  } catch (err) {
    console.error('DHCP error:', err.message);
    return res.json({});
  }
});

// ============ IP STATS ============

app.get('/api/fritz/ip-stats', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  try {
    const dhcp = await soapRequest(session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1', 'GetInfo', session.username, session.password, session.controlUrls);
    const hosts = await getHostsViaSoap(session.host, session.username, session.password, session.controlUrls);
    const minAddress = dhcp.NewMinAddress || '';
    const maxAddress = dhcp.NewMaxAddress || '';
    function ipToInt(ip) {
      const parts = ip.split('.');
      if (parts.length !== 4) return 0;
      return ((parseInt(parts[0], 10) << 24) | (parseInt(parts[1], 10) << 16) | (parseInt(parts[2], 10) << 8) | parseInt(parts[3], 10)) >>> 0;
    }
    function intToIp(n) {
      return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
    }
    const minInt = ipToInt(minAddress);
    const maxInt = ipToInt(maxAddress);
    const total = (minInt && maxInt && maxInt >= minInt) ? maxInt - minInt + 1 : 0;
    const usedIps = new Set(hosts.filter(h => h.ip).map(h => ipToInt(h.ip)));
    const used = hosts.filter(h => { if (!h.ip) return false; const ipInt = ipToInt(h.ip); return ipInt >= minInt && ipInt <= maxInt; }).length;
    const free = Math.max(0, total - used);
    const freeIps = [];
    for (let i = minInt; i <= maxInt && freeIps.length < 5; i++) {
      if (!usedIps.has(i)) freeIps.push(intToIp(i));
    }
    return res.json({ total, used, free, minAddress, maxAddress, freeIps });
  } catch (err) {
    console.error('IP-Stats error:', err.message);
    return res.json({ total: 0, used: 0, free: 0, minAddress: '', maxAddress: '', freeIps: [] });
  }
});

// ============ TELEFONIE ============

app.get('/api/fritz/smartHome', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  try {
    const webSid = await getWebSid(session.host, session.username, session.password);
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
      return res.json(Array.isArray(devices) ? devices : []);
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
    const baseInfo = await soapRequest(session.host, 'urn:dslforum-org:service:X_AVM-DE_Dect:1', 'GetDECTInfo', session.username, session.password, session.controlUrls);
    const countRes = await soapRequest(session.host, 'urn:dslforum-org:service:X_AVM-DE_Dect:1', 'GetNumberOfDectEntries', session.username, session.password, session.controlUrls);
    const count = parseInt(countRes?.NewNumberOfEntries || '0', 10) || 0;
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
      try {
        const webSid = await getWebSid(session.host, session.username, session.password);
        const params = new URLSearchParams({ xhr: '1', sid: webSid, lang: 'de', page: 'dectSet', xhrId: 'all' });
        const r = await fetch(`http://${session.host}/data.lua`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });
        const text = await r.text();
        if (text.trim().startsWith('{')) {
          const d = JSON.parse(text);
          const dectData = d?.data?.dect || d?.data || {};
          if (!soapOk) {
            baseInfo.NewDECTActive = dectData.active === true || dectData.active === '1' ? '1' : '0';
            baseInfo.NewDECTBaseName = dectData.name || dectData.base_name || dectData.basename || '';
            baseInfo.NewDECTPowerActive = dectData.ecomode === true || dectData.ecomode === '1' ? '1' : '0';
          }
          if (handsets.length === 0) {
            const list = d?.data?.handsets || dectData.handsets || dectData.devices || [];
            for (const h of (Array.isArray(list) ? list : [])) {
              handsets.push({
                name: h.name || h.device_name || h.devicename || 'Handset',
                model: h.model || h.product || '',
                id: String(h.id || h.intern_id || h.index || ''),
                active: h.active === '1' || h.active === true,
                connected: h.connect === '1' || h.connected === '1' || h.connected === true,
                battery: String(h.battery || h.akku || ''),
              });
            }
          }
        }
      } catch {}
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

app.get('/api/fritz/traffic-counters', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  const cached = getCached('traffic-counters');
  if (cached) return res.json(cached);

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
            return res.json(result);
          }
          if (d.heute !== undefined) {
            const result = { rows: ['heute','gestern','woche','monat','vormonat'].map((k,i) => mkRow(d[k]||{},i)) };
            setCached('traffic-counters', result);
            return res.json(result);
          }
          const arr = Array.isArray(d) ? d : (d.tablelist || d.netCnt || d.count || d.stat || d.rows || d.list);
          if (Array.isArray(arr) && arr.length > 0) {
            const result = { rows: arr.slice(0,5).map((e,i) => mkRow(e,i)) };
            setCached('traffic-counters', result);
            return res.json(result);
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
        return res.json(result);
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
    return res.json(result);
  } catch (err) {
    console.error('Traffic counters SOAP fallback error:', err.message);
    return res.json({ rows: [], currentDown: 0, currentUp: 0 });
  }
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

const PORT = 3003;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`FritzBox Proxy Server läuft auf http://0.0.0.0:${PORT}`);
});

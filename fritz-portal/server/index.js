import express from 'express';
import { FritzBox } from '@lukesthl/fritzbox';
import DigestFetch from 'digest-fetch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';

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
const releaseDistPath = join(__dirname, 'dist');
const staticPath = existsSync(distPath) ? distPath : (existsSync(releaseDistPath) ? releaseDistPath : null);

if (staticPath) {
  app.use(express.static(staticPath));
  app.get('*', (req, res, next) => {
    if (!req.path.startsWith('/api')) {
      // HA Ingress: X-Ingress-Path-Header → Basispfad als JS-Variable ins HTML injizieren
      const rawIngress = req.headers['x-ingress-path'];
      if (rawIngress) {
        const ingressPath = rawIngress.replace(/[^a-zA-Z0-9/_-]/g, '');
        try {
          let html = readFileSync(join(staticPath, 'index.html'), 'utf-8');
          html = html.replace(
            '<head>',
            `<head><script>window.__INGRESS_PATH__="${ingressPath}";</script>`
          );
          return res.send(html);
        } catch { /* fall through */ }
      }
      res.sendFile(join(staticPath, 'index.html'));
    } else {
      next();
    }
  });
}

const sessions = new Map();

// Traffic tracking for monthly consumption
const trafficData = new Map();

function parseXml(xml) {
  const result = {};
  const regex = /<(\w+)>([^<]*)<\/\1>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    result[match[1]] = match[2];
  }
  return result;
}

async function soapRequest(host, service, action, username, password, controlUrls) {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:${action} xmlns:u="${service}" />
  </s:Body>
</s:Envelope>`;

  const controlUrl = controlUrls?.[service];
  if (!controlUrl) {
    console.error('No control URL for service:', service);
    return {};
  }

  const url = `http://${host}:49000${controlUrl}`;

  const client = new DigestFetch(username, password);
  const res = await client.fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset="utf-8"',
      'SOAPACTION': `"${service}#${action}"`,
    },
    body,
  });

  const text = await res.text();
  return parseXml(text);
}

function trackTraffic(sid, downBytes, upBytes) {
  if (!trafficData.has(sid)) {
    trafficData.set(sid, { totalDown: 0, totalUp: 0, lastReset: Date.now() });
  }
  const data = trafficData.get(sid);
  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  if (data.lastReset < monthAgo) {
    data.totalDown = 0;
    data.totalUp = 0;
    data.lastReset = Date.now();
  }
  data.totalDown += downBytes;
  data.totalUp += upBytes;
}

app.post('/api/fritz/login', async (req, res) => {
  const { host, username, password } = req.body;
  const fritzHost = host || 'fritz.box';

  try {
    const fb = new FritzBox({
      username,
      password,
      host: fritzHost,
    });

    const deviceInfo = await fb.deviceInfo.getInfo();
    const sid = Math.random().toString(36).substring(2) + Date.now().toString(36);

    // Discover service control URLs from device description
    const controlUrls = {};

    async function parseDescXml(url) {
      try {
        const descRes = await fetch(url);
        const descXml = await descRes.text();
        const serviceRegex = /<service>([\/\S\s]*?)<\/service>/g;
        let m;
        while ((m = serviceRegex.exec(descXml)) !== null) {
          const block = m[1];
          const type = block.match(/<serviceType>([^<]*)<\/serviceType>/)?.[1] || '';
          const ctrlUrl = block.match(/<controlURL>([^<]*)<\/controlURL>/)?.[1] || '';
          if (type && ctrlUrl) {
            controlUrls[type] = ctrlUrl;
          }
        }
      } catch (err) {
        console.error(`Failed to parse ${url}:`, err.message);
      }
    }

    // Parse both TR-064 and UPnP IGD descriptions
    await Promise.all([
      parseDescXml(`http://${fritzHost}:49000/tr64desc.xml`),
      parseDescXml(`http://${fritzHost}:49000/igddesc.xml`),
    ]);

    // Known fallback URLs in case discovery fails
    const fallbacks = {
      'urn:schemas-upnp-org:service:WANCommonInterfaceConfig:1': '/igdupnp/control/WANCommonIFC1',
      'urn:dslforum-org:service:WANCommonInterfaceConfig:1': '/upnp/control/WANCommonIFC1',
      'urn:dslforum-org:service:X_AVM-DE_HostFilter:1': '/upnp/control/x_hostfilter',
      'urn:dslforum-org:service:X_AVM-DE_OnTel:1': '/upnp/control/x_contact',
      'urn:dslforum-org:service:X_AVM-DE_Dect:1': '/upnp/control/x_dect',
      'urn:dslforum-org:service:X_VoIP:1': '/upnp/control/x_voip',
    };
    for (const [svc, url] of Object.entries(fallbacks)) {
      if (!controlUrls[svc]) controlUrls[svc] = url;
    }

    console.log('Discovered control URLs:', JSON.stringify(controlUrls, null, 2));

    sessions.set(sid, { host: fritzHost, username, password, fb, controlUrls });

    return res.json({ success: true, sid });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.json({ success: false, error: err.message });
  }
});

app.get('/api/fritz/device-info', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);

  if (!session) {
    return res.status(401).json({ error: 'Nicht eingeloggt' });
  }

  try {
    const info = await session.fb.deviceInfo.getInfo();
    return res.json(info);
  } catch (err) {
    console.error('DeviceInfo error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/fritz/hosts', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);

  if (!session) {
    return res.status(401).json({ error: 'Nicht eingeloggt' });
  }

  try {
    const hosts = await session.fb.lanDeviceHosts.getHosts();
    return res.json(hosts);
  } catch (err) {
    console.error('Hosts error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/fritz/eco-stats', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);

  if (!session) {
    return res.status(401).json({ error: 'Nicht eingeloggt' });
  }

  try {
    const raw = await session.fb.unofficial.ecoStat.getEcoStat();
    const data = raw?.data || {};

    const cpuSeries = data.cpuutil?.series?.[0] || [];
    const cpu = cpuSeries.length > 0 ? parseInt(cpuSeries[cpuSeries.length - 1], 10) : 0;

    const ramSeries = data.ramusage?.series?.[2] || [];
    const ram = ramSeries.length > 0 ? Math.round(ramSeries[ramSeries.length - 1]) : 0;

    const tempSeries = data.cputemp?.series?.[0] || [];
    const cpu_temp = tempSeries.length > 0 ? parseInt(tempSeries[tempSeries.length - 1], 10) : 0;

    return res.json({ cpu, ram, cpu_temp });
  } catch (err) {
    console.error('EcoStats error:', err.message);
    return res.json({ cpu: 0, ram: 0, cpu_temp: 0 });
  }
});

app.get('/api/fritz/network-stats', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);

  if (!session) {
    return res.status(401).json({ error: 'Nicht eingeloggt' });
  }

  try {
    // Live speeds — in a separate try/catch so a library error doesn't stop the totals
    let downBps = 0;
    let upBps = 0;
    let dsHistory = [];
    let usHistory = [];
    try {
      const stats = await session.fb.unofficial.networkMonitor.getNetworkStats();
      if (stats?.data?.sync_groups?.[0]) {
        const group = stats.data.sync_groups[0];
        dsHistory = group.ds_bps_curr || [];
        usHistory = group.us_default_bps_curr || [];
        if (dsHistory.length > 0) downBps = dsHistory[dsHistory.length - 1] || 0;
        if (usHistory.length > 0) upBps = usHistory[usHistory.length - 1] || 0;
      }
    } catch (e) { console.error('NetworkMonitor error:', e.message); }

    // Read real monthly totals directly from Fritz!Box
    let totalDown = 0;
    let totalUp = 0;
    try {
      // Try UPnP IGD service first, then TR-064 fallback
      let addonInfo = await soapRequest(session.host, 'urn:schemas-upnp-org:service:WANCommonInterfaceConfig:1', 'GetAddonInfos', session.username, session.password, session.controlUrls);
      if (!addonInfo['NewTotalBytesReceived'] && !addonInfo['NewX_AVM_DE_TotalBytesReceived64']) {
        addonInfo = await soapRequest(session.host, 'urn:dslforum-org:service:WANCommonInterfaceConfig:1', 'GetAddonInfos', session.username, session.password, session.controlUrls);
      }
      console.log('AddonInfos response:', JSON.stringify(addonInfo));
      totalDown = parseInt(addonInfo['NewX_AVM_DE_TotalBytesReceived64'] || addonInfo['NewTotalBytesReceived'] || '0', 10) || 0;
      totalUp = parseInt(addonInfo['NewX_AVM_DE_TotalBytesSent64'] || addonInfo['NewTotalBytesSent'] || '0', 10) || 0;
    } catch (e) { console.error('AddonInfos error:', e.message); }

    return res.json({ currentDown: downBps, currentUp: upBps, totalDown, totalUp, dsHistory, usHistory });
  } catch (err) {
    console.error('NetworkStats error:', err.message);
    return res.json({ currentDown: 0, currentUp: 0, totalDown: 0, totalUp: 0, dsHistory: [], usHistory: [] });
  }
});

app.get('/api/fritz/device-stats', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const mac = req.query.mac;
  const session = sessions.get(sid);

  if (!session) {
    return res.status(401).json({ error: 'Nicht eingeloggt' });
  }

  try {
    const hosts = await session.fb.lanDeviceHosts.getHosts();
    const device = hosts.find(h => h.mac === mac);

    if (!device) {
      return res.status(404).json({ error: 'Ger\u00e4t nicht gefunden' });
    }

    // Try to get device-specific stats from network monitor
    const stats = await session.fb.unofficial.networkMonitor.getNetworkStats();

    let deviceDown = 0;
    let deviceUp = 0;

    if (stats?.data?.sync_groups) {
      for (const group of stats.data.sync_groups) {
        deviceDown += (group.down || 0) / hosts.length;
        deviceUp += (group.up || 0) / hosts.length;
      }
    }

    return res.json({
      device,
      downBytes: Math.round(deviceDown),
      upBytes: Math.round(deviceUp),
    });
  } catch (err) {
    console.error('DeviceStats error:', err.message);
    return res.json({ device: null, downBytes: 0, upBytes: 0 });
  }
});

app.post('/api/fritz/reboot', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);

  if (!session) {
    return res.status(401).json({ error: 'Nicht eingeloggt' });
  }

  try {
    await session.fb.deviceConfig.reboot();
    return res.json({ success: true });
  } catch (err) {
    console.error('Reboot error:', err.message);
    return res.json({ success: false, error: err.message });
  }
});

app.post('/api/fritz/logout', (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  // Auto-Session (HA Add-on) bleibt permanent aktiv
  if (sid !== AUTO_SID) {
    sessions.delete(sid);
    trafficData.delete(sid);
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
    // Aktuelle Einstellungen lesen, damit nicht angegebene Felder unveraendert bleiben
    const current = await soapRequest(session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1', 'GetInfo', session.username, session.password, session.controlUrls);

    await soapRequestWithParams(
      session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1', 'SetInfo',
      {
        NewDHCPServerConfigurable: current.NewDHCPServerConfigurable || '1',
        NewDHCPRelay: current.NewDHCPRelay || '0',
        NewMinAddress: minAddress || current.NewMinAddress,
        NewMaxAddress: maxAddress || current.NewMaxAddress,
        NewReservedAddresses: current.NewReservedAddresses || '',
        NewSubnetMask: subnetMask || current.NewSubnetMask,
        NewDNSServers: dnsServers || current.NewDNSServers || '',
        NewDomainName: current.NewDomainName || '',
        NewIPRouters: current.NewIPRouters || '',
      },
      session.username, session.password, session.controlUrls
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('DHCP update error:', err.message);
    return res.json({ success: false, error: err.message });
  }
});

// ============ DEVICE BLOCK/UNBLOCK ============

// Helper: SOAP-Request mit Parametern und vollständiger Fehlerauswertung
async function soapRequestWithParams(host, service, action, params, username, password, controlUrls) {
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
    const fullError = errorCode ? `${faultStr} ${errorCode}: ${errorDesc}` : faultStr;
    console.error(`SOAP Fault [${action}]:`, fullError);
    throw new Error(fullError);
  }
  return parseXml(text);
}

// Aktuellen Sperrstatus eines Geräts abfragen (via X_AVM-DE_HostFilter:1, IP-basiert)
app.get('/api/fritz/device/blockstate', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  const { mac } = req.query;
  try {
    // IP zur MAC-Adresse ermitteln
    const hosts = await session.fb.lanDeviceHosts.getHosts();
    const host = hosts.find(h => h.mac === mac);
    if (!host?.ip) return res.json({ blocked: false });

    const result = await soapRequestWithParams(
      session.host, 'urn:dslforum-org:service:X_AVM-DE_HostFilter:1',
      'GetWANAccessByIP',
      { NewIPv4Address: host.ip },
      session.username, session.password, session.controlUrls
    );
    return res.json({ blocked: result.NewDisallow === '1' || result.NewDisallow === 'true' || result.NewWANAccess === 'denied' });
  } catch (err) {
    console.error('Blockstate error:', err.message);
    return res.json({ blocked: false, error: err.message });
  }
});

// DHCP-Reservierung lesen
app.get('/api/fritz/device/static-dhcp', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  const { mac } = req.query;
  try {
    const result = await soapRequestWithParams(
      session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1',
      'GetSpecificStaticDHCPEntry',
      { NewMACAddress: mac },
      session.username, session.password, session.controlUrls
    );
    return res.json({ exists: true, ip: result.NewIPAddress || '', hostname: result.NewHostName || '' });
  } catch (err) {
    // Fault = kein Eintrag vorhanden
    return res.json({ exists: false, ip: '', hostname: '' });
  }
});

// DHCP-Reservierung setzen
app.post('/api/fritz/device/static-dhcp', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  const { mac, ip, hostname } = req.body;
  try {
    // Falls bereits ein Eintrag existiert, erst löschen (Fritz!Box erlaubt keine Duplikate)
    try {
      const existing = await soapRequestWithParams(
        session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1',
        'GetSpecificStaticDHCPEntry', { NewMACAddress: mac },
        session.username, session.password, session.controlUrls
      );
      if (existing.NewIPAddress) {
        await soapRequestWithParams(
          session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1',
          'DeleteStaticDHCPEntry', { NewIPAddress: existing.NewIPAddress, NewMACAddress: mac },
          session.username, session.password, session.controlUrls
        );
      }
    } catch { /* kein bestehender Eintrag */ }

    await soapRequestWithParams(
      session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1',
      'AddStaticDHCPEntry',
      { NewIPAddress: ip, NewMACAddress: mac, NewHostName: hostname || '' },
      session.username, session.password, session.controlUrls
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('Static DHCP set error:', err.message);
    return res.json({ success: false, error: err.message });
  }
});

// DHCP-Reservierung entfernen
app.delete('/api/fritz/device/static-dhcp', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  const { mac } = req.body;
  try {
    const existing = await soapRequestWithParams(
      session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1',
      'GetSpecificStaticDHCPEntry', { NewMACAddress: mac },
      session.username, session.password, session.controlUrls
    );
    await soapRequestWithParams(
      session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1',
      'DeleteStaticDHCPEntry', { NewIPAddress: existing.NewIPAddress, NewMACAddress: mac },
      session.username, session.password, session.controlUrls
    );
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
    // IP zur MAC-Adresse ermitteln
    const hosts = await session.fb.lanDeviceHosts.getHosts();
    const host = hosts.find(h => h.mac === mac);
    if (!host?.ip) return res.json({ success: false, error: 'IP-Adresse des Geräts nicht gefunden (Gerät offline?)' });

    await soapRequestWithParams(
      session.host, 'urn:dslforum-org:service:X_AVM-DE_HostFilter:1',
      'DisallowWANAccessByIP',
      { NewIPv4Address: host.ip, NewDisallow: blocked ? '1' : '0' },
      session.username, session.password, session.controlUrls
    );
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

  // Name setzen (Hostname muss RFC 952/1123-konform sein: nur A-Z, 0-9, Bindestrich)
  if (name) {
    try {
      const sanitized = name
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
        .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
        .replace(/ß/g, 'ss')
        .replace(/[^A-Za-z0-9-]/g, '-')  // Leerzeichen und Sonderzeichen → Bindestrich
        .replace(/-+/g, '-')             // mehrfache Bindestriche zusammenfassen
        .replace(/^-+|-+$/g, '')         // führende/nachgestellte Bindestriche entfernen
        .slice(0, 63);
      if (!sanitized) throw new Error('Name enthält keine gültigen Zeichen');
      await soapRequestWithParams(
        session.host, 'urn:dslforum-org:service:Hosts:1',
        'X_AVM-DE_SetHostNameByMACAddress',
        { NewMACAddress: mac, NewHostName: sanitized },
        session.username, session.password, session.controlUrls
      );
    } catch (err) {
      console.error('Set name error:', err.message);
      errors.push(`Name: ${err.message}`);
    }
  }

  // Statische IP-Reservierung setzen (DHCP-Reservierung)
  if (ip) {
    try {
      await soapRequestWithParams(
        session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1',
        'AddStaticDHCPEntry',
        { NewIPAddress: ip, NewHostName: name || '', NewMACAddress: mac },
        session.username, session.password, session.controlUrls
      );
    } catch (err) {
      console.error('Set IP error:', err.message);
      errors.push(`IP: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    return res.json({ success: false, error: errors.join('; ') });
  }
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
        // Passwort separat abrufen (GetSecurityKeys)
        let keyPassphrase = '';
        try {
          const keys = await soapRequestWithParams(
            session.host, svc, 'GetSecurityKeys', {},
            session.username, session.password, session.controlUrls
          );
          keyPassphrase = keys.NewKeyPassphrase || '';
        } catch { /* ignorieren falls nicht verfügbar */ }
        results.push({ ...info, NewKeyPassphrase: keyPassphrase, _index: i });
      } catch {}
    }
    return res.json(results);
  } catch (err) {
    console.error('WLAN error:', err.message);
    return res.json([]);
  }
});

// WLAN-Passwort (und optional SSID) setzen
app.post('/api/fritz/network/wlan', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  const { index, passphrase } = req.body; // index = 1/2/3
  if (!index || !passphrase) return res.status(400).json({ error: 'index und passphrase erforderlich' });

  try {
    const svc = `urn:dslforum-org:service:WLANConfiguration:${index}`;
    // Aktuelle Keys lesen, damit WEP-Felder unverändert bleiben
    const current = await soapRequestWithParams(
      session.host, svc, 'GetSecurityKeys', {},
      session.username, session.password, session.controlUrls
    );
    await soapRequestWithParams(
      session.host, svc, 'SetSecurityKeys',
      {
        NewWEPKey0: current.NewWEPKey0 || '',
        NewWEPKey1: current.NewWEPKey1 || '',
        NewWEPKey2: current.NewWEPKey2 || '',
        NewWEPKey3: current.NewWEPKey3 || '',
        NewPreSharedKey: current.NewPreSharedKey || passphrase,
        NewKeyPassphrase: passphrase,
      },
      session.username, session.password, session.controlUrls
    );
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
    const [dhcp, hosts] = await Promise.all([
      soapRequest(session.host, 'urn:dslforum-org:service:LANHostConfigManagement:1', 'GetInfo', session.username, session.password, session.controlUrls),
      session.fb.lanDeviceHosts.getHosts(),
    ]);

    const minAddress = dhcp.NewMinAddress || '';
    const maxAddress = dhcp.NewMaxAddress || '';

    function ipToInt(ip) {
      const parts = ip.split('.');
      if (parts.length !== 4) return 0;
      return ((parseInt(parts[0], 10) << 24) | (parseInt(parts[1], 10) << 16) | (parseInt(parts[2], 10) << 8) | parseInt(parts[3], 10)) >>> 0;
    }

    const minInt = ipToInt(minAddress);
    const maxInt = ipToInt(maxAddress);
    const total = (minInt && maxInt && maxInt >= minInt) ? maxInt - minInt + 1 : 0;

    const used = hosts.filter(h => {
      if (!h.ip) return false;
      const ipInt = ipToInt(h.ip);
      return ipInt >= minInt && ipInt <= maxInt;
    }).length;

    const free = Math.max(0, total - used);

    return res.json({ total, used, free, minAddress, maxAddress });
  } catch (err) {
    console.error('IP-Stats error:', err.message);
    return res.json({ total: 0, used: 0, free: 0, minAddress: '', maxAddress: '' });
  }
});

// ============ TELEFONIE ============

app.get('/api/fritz/smartHome', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  try {
    const { devices } = await session.fb.smartHome.getDevices();
    return res.json(devices);
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
    // TR-064: Basisinfo + Handsets
    const baseInfo = await soapRequest(session.host, 'urn:dslforum-org:service:X_AVM-DE_Dect:1', 'GetDECTInfo', session.username, session.password, session.controlUrls);

    // Korrekte Action laut AVM TR-064: GetNumberOfDectEntries (mit 's')
    const countRes = await soapRequest(session.host, 'urn:dslforum-org:service:X_AVM-DE_Dect:1', 'GetNumberOfDectEntries', session.username, session.password, session.controlUrls);
    const count = parseInt(countRes?.NewNumberOfEntries || '0') || 0;

    const handsets = [];
    for (let i = 0; i < count; i++) {
      try {
        const entry = await soapRequestWithParams(
          session.host, 'urn:dslforum-org:service:X_AVM-DE_Dect:1', 'GetGenericDectEntry',
          { NewIndex: String(i) },
          session.username, session.password, session.controlUrls
        );
        handsets.push({
          name:      entry.NewDeviceName        || entry.NewName        || `Handset ${i + 1}`,
          model:     entry.NewManufacturerOUI   || '',
          id:        entry.NewIntId             || entry.NewId          || String(i),
          active:    entry.NewActive            === '1',
          connected: entry.NewConnected         === '1',
          battery:   entry.NewBatteryChargeStat || entry.NewBattery     || '',
        });
      } catch {}
    }

    // Fallback via data.lua (Fritz!Box Cable liefert DECT-Infos oft nur so)
    const soapOk = baseInfo && (baseInfo.NewDECTActive !== undefined || baseInfo.NewDECTBaseName !== undefined);
    if (!soapOk || handsets.length === 0) {
      try {
        const webSid = await session.fb.getSid();
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
          // Basisinfo auffüllen falls SOAP leer
          if (!soapOk) {
            baseInfo.NewDECTActive    = dectData.active    === true || dectData.active    === '1' ? '1' : '0';
            baseInfo.NewDECTBaseName  = dectData.name      || dectData.base_name || dectData.basename || '';
            baseInfo.NewDECTPowerActive = dectData.ecomode === true || dectData.ecomode === '1' ? '1' : '0';
          }
          // Handsets
          if (handsets.length === 0) {
            const list = d?.data?.handsets || dectData.handsets || dectData.devices || [];
            for (const h of (Array.isArray(list) ? list : [])) {
              handsets.push({
                name:      h.name || h.device_name || h.devicename || 'Handset',
                model:     h.model || h.product || '',
                id:        String(h.id || h.intern_id || h.index || ''),
                active:    h.active === '1' || h.active === true,
                connected: h.connect === '1' || h.connected === '1' || h.connected === true,
                battery:   String(h.battery || h.akku || ''),
              });
            }
          }
        }
      } catch (e) {
        console.error('DECT data.lua fallback error:', e.message);
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
    // Korrekte Service: X_AVM-DE_OnTel:1 / GetCallList
    let result = await soapRequest(session.host, 'urn:dslforum-org:service:X_AVM-DE_OnTel:1', 'GetCallList', session.username, session.password, session.controlUrls);
    // Fallback auf alten VoIP-Service
    if (!result?.NewCallListURL && !result?.['NewX_AVM-DE_CallListURL']) {
      result = await soapRequest(session.host, 'urn:dslforum-org:service:X_VoIP:1', 'X_AVM-DE_GetCallList', session.username, session.password, session.controlUrls);
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
        const type     = x.match(/<Type>([^<]*)<\/Type>/)?.[1]     || '';
        const date     = x.match(/<Date>([^<]*)<\/Date>/)?.[1]     || '';
        const name     = x.match(/<Name>([^<]*)<\/Name>/)?.[1]     || '';
        const duration = x.match(/<Duration>([^<]*)<\/Duration>/)?.[1] || '';
        // Eingehend/Verpasst: Nummer in <Caller>, Ausgehend: in <Called>
        const caller   = x.match(/<Caller>([^<]*)<\/Caller>/)?.[1] || '';
        const called   = x.match(/<Called>([^<]*)<\/Called>/)?.[1] || '';
        const number   = (type === '3' || type === '1' || type === '10') ? caller : called;
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

// Temporärer Debug-Endpoint: gibt rohen HTML-Dump zurück
app.get('/api/fritz/traffic-raw', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  try {
    const webSid = await session.fb.getSid();
    const host = session.host;
    const results = {};

    // 1. Vollständiges netCnt HTML holen und analysieren
    const body = new URLSearchParams({ xhr:'1', sid:webSid, lang:'de', page:'netCnt', xhrId:'all' });
    const r = await fetch(`http://${host}/data.lua`, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: body.toString() });
    const fullHtml = await r.text();
    results.fullLen = fullHtml.length;
    results.chunk0_800   = fullHtml.substring(0, 800);
    results.chunk800_1600 = fullHtml.substring(800, 1600);
    results.chunk1600_3000 = fullHtml.substring(1600, 3000);
    results.chunk3000_5000 = fullHtml.substring(3000, 5000);
    results.chunk5000_7000 = fullHtml.substring(5000, 7000);
    results.chunk7000_end  = fullHtml.substring(7000);
    // Alle Stellen mit GB, MB, grossbytes, datalabel
    const gbMatches = [...fullHtml.matchAll(/[^\n<]{0,60}(?:GB|MB|grossbytes|datalabel|bytes_in|bytes_out)[^\n<]{0,60}/gi)];
    results.gbMatches = gbMatches.slice(0, 20).map(m => m[0].trim());

    // 2. query.lua mit verschiedenen Feldnamen
    const queryVariants = [
      'NetCnt=all', 'netCnt_today=all', 'InternetCnt=all',
      'netCnt_today=grossbytes_in,grossbytes_out,onlinetime,connections',
      'stat=netCnt', 'inetstat=all',
    ];
    for (const q of queryVariants) {
      try {
        const qr = await fetch(`http://${host}/query.lua?sid=${webSid}&${q}`);
        const qt = await qr.text();
        results[`query_${q.split('=')[0]}`] = qt.substring(0, 200);
      } catch(e) { results[`query_${q.split('=')[0]}`] = `ERR: ${e.message}`; }
    }

    // 3. Lua-Seiten direkt
    const luaPages = [
      `/internet/inetstat_counter.lua?sid=${webSid}`,
      `/internet/counter.lua?sid=${webSid}`,
      `/data.lua` // POST mit page=inetStat
    ];
    for (const p of luaPages) {
      try {
        let opts = {};
        if (p === '/data.lua') { opts = { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({xhr:'1',sid:webSid,lang:'de',page:'inetStat',xhrId:'all'}).toString() }; }
        const pr = await fetch(`http://${host}${p}`, opts);
        results[`lua_${p.split('/').pop().split('?')[0]}`] = (await pr.text()).substring(0, 300);
      } catch(e) { results[`lua_${p.split('/').pop()}`] = `ERR: ${e.message}`; }
    }

    res.json(results);
  } catch (err) {
    res.json({ error: err.message });
  }
});

app.get('/api/fritz/traffic-counters', async (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  const session = sessions.get(sid);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  function parseNetCntHtml(html) {
    // Eingebettetes JS-Objekt: const data = {"Today":{"BytesSentHigh":"...","BytesSentLow":"...",...},...}
    // Fritz!Box Cable füllt Tabellenzellen erst client-seitig per JS; Rohwerte stehen im JS-Objekt.
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
    function highLow(high, low) {
      return parseInt(high || '0') * 4294967296 + parseInt(low || '0');
    }
    // Schlüssel im JS-Objekt je nach Zeilenname
    function jsKey(name) {
      const n = name.toLowerCase();
      if (n.includes('vormonat')) return 'LastMonth';
      if (n.includes('monat'))   return 'ThisMonth';
      if (n.includes('woche'))   return 'ThisWeek';
      if (n.includes('gestern')) return 'Yesterday';
      if (n.includes('heute'))   return 'Today';
      return null;
    }
    const jsData = extractJsData(html);
    // HTML-Tabelle für Zeilennamen, Online-Zeit und Verbindungsanzahl
    const trMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    const allRows = trMatches.map(m => {
      const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
        .map(c => c[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
      return cells;
    }).filter(cells => cells.length >= 2);
    const keywords = ['heute', 'gestern', 'woche', 'monat', 'vormonat'];
    const dataRows = allRows.filter(row =>
      row[0] && keywords.some(k => row[0].toLowerCase().includes(k))
    );
    if (dataRows.length === 0 && !jsData) return null;
    // Fallback: nur JS-Daten, keine Tabelle
    if (dataRows.length === 0 && jsData) {
      const mapping = [
        { key: 'Today',     name: 'Heute' },
        { key: 'Yesterday', name: 'Gestern' },
        { key: 'ThisWeek',  name: 'Aktuelle Woche' },
        { key: 'ThisMonth', name: 'Aktueller Monat' },
        { key: 'LastMonth', name: 'Vormonat' },
      ];
      return mapping.filter(e => jsData[e.key]).map(e => ({
        name: e.name,
        onlineTime: '00:00',
        received: highLow(jsData[e.key].BytesReceivedHigh, jsData[e.key].BytesReceivedLow),
        sent:     highLow(jsData[e.key].BytesSentHigh,     jsData[e.key].BytesSentLow),
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
      if (jsData) {
        const k = jsKey(name);
        if (k && jsData[k]) {
          received = highLow(jsData[k].BytesReceivedHigh, jsData[k].BytesReceivedLow);
          sent     = highLow(jsData[k].BytesSentHigh,     jsData[k].BytesSentLow);
        }
      }
      return { name, onlineTime, received, sent, connections };
    });
  }

  try {
    const webSid = await session.fb.getSid();
    const params = new URLSearchParams({ xhr: '1', sid: webSid, lang: 'de', page: 'netCnt', xhrId: 'all' });
    const r = await fetch(`http://${session.host}/data.lua`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const text = await r.text();

    // Try JSON first (Fritz!OS 7.x+ might return JSON)
    if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
      try {
        const raw = JSON.parse(text);
        const d = raw?.data || raw || {};
        function rowBytes(e, dirIn) {
          const fields = dirIn
            ? [e.grossbytes_in, e.bytes_in, e.rx_bytes, e.rx, e.in]
            : [e.grossbytes_out, e.bytes_out, e.tx_bytes, e.tx, e.out];
          for (const f of fields) if (f !== undefined && f !== null) return parseInt(f) || 0;
          return 0;
        }
        function rowTime(e) {
          const fields = [e.time, e.onlinetime, e.online_time, e.onlineTime, e.duration];
          for (const f of fields) if (f !== undefined) {
            const s = parseInt(f) || 0;
            return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}`;
          }
          return '00:00';
        }
        const labels = ['Heute', 'Gestern', 'Aktuelle Woche', 'Aktueller Monat', 'Vormonat'];
        const mkRow = (e, i) => ({ name: e.name || labels[i], received: rowBytes(e, true), sent: rowBytes(e, false), onlineTime: rowTime(e), connections: parseInt(e.connections || '0') || 0 });
        if (d.today !== undefined) return res.json({ rows: ['today','yesterday','week','month','last_month'].map((k,i) => mkRow(d[k]||{},i)) });
        if (d.heute !== undefined) return res.json({ rows: ['heute','gestern','woche','monat','vormonat'].map((k,i) => mkRow(d[k]||{},i)) });
        const arr = Array.isArray(d) ? d : (d.tablelist || d.netCnt || d.count || d.stat || d.rows || d.list);
        if (Array.isArray(arr) && arr.length > 0) return res.json({ rows: arr.slice(0,5).map((e,i) => mkRow(e,i)) });
      } catch {}
    }

    // HTML fallback – Fritz!OS Cable returns HTML for this page
    const parsed = parseNetCntHtml(text);
    if (parsed && parsed.length > 0) {
      return res.json({ rows: parsed });
    }

    return res.json({ rows: [], debug: `Unbekanntes Format: ${text.substring(0, 300)}` });
  } catch (err) {
    console.error('Traffic counters error:', err.message);
    return res.json({ rows: [], debug: `Server-Fehler: ${err.message}` });
  }
});

app.get('/api/fritz/auto-session', (req, res) => {
  // Auto-session endpoint - returns false when no auto-login is configured
  res.json({ active: false });
});

app.post('/api/fritz/logout', (req, res) => {
  const sid = req.headers['x-fritz-sid'];
  if (sessions.has(sid)) {
    sessions.delete(sid);
  }
  res.json({ success: true });
});

const PORT = 3003;
app.listen(PORT, () => {
  console.log(`FritzBox Proxy Server läuft auf http://localhost:${PORT}`);
});

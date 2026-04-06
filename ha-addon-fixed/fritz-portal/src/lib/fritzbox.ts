import { Md5 } from 'ts-md5';

export interface FritzBoxConfig {
  username: string;
  password: string;
  host?: string;
  ssl?: boolean;
}

export interface DeviceInfo {
  NewModelName: string;
  NewHardwareVersion: string;
  NewSerialNumber: string;
  NewFirmwareVersion: string;
  NewWebUIVersion: string;
  NewUpTime: number;
}

export interface Host {
  mac: string;
  ip: string;
  active: boolean;
  name: string;
  interface: string;
}

export interface EcoStat {
  cpu: number;
  ram: number;
  cpu_temp: number;
}

export interface NetworkStats {
  data: {
    sync_groups: Array<{
      name: string;
      up: number;
      down: number;
    }>;
  };
}

function createSoapRequest(service: string, action: string, body: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:${action} xmlns:u="urn:schemas-upnp-org:service:${service}:1">
      ${body}
    </u:${action}>
  </s:Body>
</s:Envelope>`;
}

function getAuthHeader(username: string, password: string): string {
  const credentials = btoa(`${username}:${password}`);
  return `Basic ${credentials}`;
}

export class FritzBox {
  private username: string;
  private password: string;

  constructor(config: FritzBoxConfig) {
    this.username = config.username;
    this.password = config.password;
  }

  private async request(service: string, action: string, body: string = ''): Promise<string> {
    const url = `/fritz/upnp/control/${service.replace(/-/g, '_')}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset="utf-8"',
        'SOAPACTION': `"urn:schemas-upnp-org:service:${service}:1#${action}"`,
        'Authorization': getAuthHeader(this.username, this.password),
      },
      body: createSoapRequest(service, action, body),
    });

    return response.text();
  }

  private parseXmlResponse(xml: string): Record<string, string> {
    const result: Record<string, string> = {};
    const regex = /<(\w+)>([^<]*)<\/\1>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      result[match[1]] = match[2];
    }
    return result;
  }

  async login(): Promise<boolean> {
    const loginUrl = `/api/login/login_sid.lua`;
    
    console.log('Login: Fetching challenge from', loginUrl);
    
    const response = await fetch(loginUrl);
    console.log('Login: Response status', response.status);
    
    const text = await response.text();
    console.log('Login: Response body', text);
    
    const sidMatch = text.match(/<SID>([^<]+)<\/SID>/);
    
    if (sidMatch && sidMatch[1] && sidMatch[1] !== '0000000000000000') {
      console.log('Login: Already authenticated');
      return true;
    }

    const challengeMatch = text.match(/<Challenge>([^<]+)<\/Challenge>/);
    if (!challengeMatch) {
      console.log('Login: No challenge found');
      return false;
    }
    
    const challenge = challengeMatch[1];
    console.log('Login: Challenge', challenge);
    
    // Fritzbox erfordert UTF-16LE Kodierung für den MD5-Hash
    const encoder = new TextEncoder();
    const utf16Challenge = challenge.split('').map(c => c + '\0').join('');
    const utf16Password = this.password.split('').map(c => c + '\0').join('');
    const utf16Str = utf16Challenge + '-' + utf16Password;
    
    const responseStr = Md5.hashStr(utf16Str);
    console.log('Login: Response hash', responseStr);
    
    const challengeResponse = challenge + ':' + responseStr;

    const formData = new URLSearchParams();
    formData.append('username', this.username);
    formData.append('response', challengeResponse);

    console.log('Login: Sending response...');
    
    const loginResponse = await fetch(loginUrl, {
      method: 'POST',
      body: formData,
    });
    
    console.log('Login: Response status', loginResponse.status);
    
    const loginText = await loginResponse.text();
    console.log('Login: Response body', loginText);
    
    const newSidMatch = loginText.match(/<SID>([^<]+)<\/SID>/);
    
    if (newSidMatch && newSidMatch[1] !== '0000000000000000') {
      console.log('Login: Success');
      return true;
    }
    
    console.log('Login: Failed');
    return false;
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    const xml = await this.request('device_info', 'GetInfo');
    const data = this.parseXmlResponse(xml);
    
    return {
      NewModelName: data.NewModelName || '',
      NewHardwareVersion: data.NewHardwareVersion || '',
      NewSerialNumber: data.NewSerialNumber || '',
      NewFirmwareVersion: data.NewFirmwareVersion || '',
      NewWebUIVersion: data.NewWebUIVersion || '',
      NewUpTime: parseInt(data.NewUpTime || '0', 10),
    };
  }

  async getHosts(): Promise<Host[]> {
    const xml = await this.request('lan_device_hosts', 'GetHostList');
    const hosts: Host[] = [];
    
    const hostMatches = xml.match(/<Host[^>]*>[\s\S]*?<\/Host>/g) || [];
    
    for (const hostXml of hostMatches) {
      const mac = hostXml.match(/<MACAddress>([^<]+)<\/MACAddress>/)?.[1] || '';
      const ip = hostXml.match(/<IPAddress>([^<]+)<\/IPAddress>/)?.[1] || '';
      const active = hostXml.match(/<Active>([^<]+)<\/Active>/)?.[1] === '1';
      const name = hostXml.match(/<HostName>([^<]+)<\/HostName>/)?.[1] || '';
      const interface_ = hostXml.match(/<Interface>([^<]+)<\/Interface>/)?.[1] || '';
      
      if (mac) {
        hosts.push({ mac, ip, active, name, interface: interface_ });
      }
    }
    
    return hosts;
  }

  async getEcoStat(): Promise<EcoStat> {
    const url = `/api/login/data.lua`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': getAuthHeader(this.username, this.password),
      },
    });
    
    const text = await response.text();
    
    try {
      const data = JSON.parse(text);
      return {
        cpu: data.data?.cpu || 0,
        ram: data.data?.ram || 0,
        cpu_temp: data.data?.cpu_temp || 0,
      };
    } catch {
      return { cpu: 0, ram: 0, cpu_temp: 0 };
    }
  }

  async reboot(): Promise<void> {
    await this.request('device_config', 'Reboot');
  }
}

export function createFritzBoxInstance(config: FritzBoxConfig): FritzBox {
  return new FritzBox(config);
}

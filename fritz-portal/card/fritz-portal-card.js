/*
 * FRITZ!Portal Dashboard-Card für Home Assistant
 * ------------------------------------------------
 * Zeigt die vom FRITZ!Portal-Add-on gelieferten Sensoren (sensor.fritzportal_*)
 * im Terminal-Look des Portals: System-Kacheln, Internet/WAN, Live-Traffic mit
 * Verlauf, aktive Geräte (Suche/Filter/Sortierung), Mesh, WLAN-Schalter, Anrufe.
 *
 * Wird vom Add-on automatisch nach /local/fritz-portal/ kopiert und als
 * Lovelace-Ressource registriert. Keine externen Abhängigkeiten.
 *
 *   type: custom:fritz-portal-card
 *   sections: [system, wan, traffic, hosts, mesh, wlan, phone]   # optional
 *   hosts_limit: 8                                               # optional
 */

const CARD_VERSION = '1.4.7';
const ALL_SECTIONS = ['system', 'wan', 'traffic', 'hosts', 'mesh', 'wlan', 'phone'];
const SECTION_LABELS = {
  system: 'System (CPU, RAM, Temperatur, Geräte)',
  wan: 'Internet / WAN',
  traffic: 'Traffic live + Verlauf',
  hosts: 'Aktive Geräte',
  mesh: 'Mesh',
  wlan: 'WLAN-Schalter',
  phone: 'Anrufe',
};

// Alle dynamischen Texte (Gerätenamen kommen aus dem Netzwerk!) escapen
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const isIPv4 = (ip) => /^(\d{1,3}\.){3}\d{1,3}$/.test(String(ip || ''));
const ipNum = (ip) => String(ip || '0.0.0.0').split('.').reduce((a, p) => a * 256 + (parseInt(p, 10) || 0), 0);
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

const STYLE = `
  :host {
    --fp-mono: 'JetBrains Mono', 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    --fp-bg: #ffffff; --fp-bg2: #eef1f5; --fp-text: #1a1f28; --fp-text2: #5a6678; --fp-muted: #8a93a3;
    --fp-border: #d8dde5; --fp-border2: #c0c8d4; --fp-accent: #2b6fd9; --fp-ok: #2f9d6b;
    --fp-warn: #c97b1a; --fp-bad: #d24343; --fp-cyan: #1cabd4; --fp-wlan: #10b981; --fp-lan: #3b82f6;
  }
  :host([dark]) {
    --fp-bg: #1a1f28; --fp-bg2: #1d2330; --fp-text: #dde3ec; --fp-text2: #8390a3; --fp-muted: #525d6e;
    --fp-border: #2a323e; --fp-border2: #3a4554; --fp-accent: #5aa6ff; --fp-ok: #4ad19a;
    --fp-warn: #ffb86c; --fp-bad: #ff6b6b; --fp-cyan: #7be0ff;
  }
  ha-card { background: var(--fp-bg); color: var(--fp-text); font-family: var(--fp-mono);
    border: 1px solid var(--fp-border); border-radius: 0; overflow: hidden; }
  .head { display: flex; align-items: center; gap: 10px; padding: 10px 14px;
    border-bottom: 1px solid var(--fp-border); background: var(--fp-bg2); }
  .head .title { font-weight: 600; font-size: 14px; letter-spacing: .5px; }
  .head .title::before { content: '┃ '; color: var(--fp-accent); }
  .head .meta { margin-left: auto; font-size: 11px; color: var(--fp-text2); display: flex; gap: 10px; align-items: center; }
  .chip { font-size: 10px; letter-spacing: 1px; padding: 2px 6px; border: 1px solid currentColor; text-transform: uppercase; white-space: nowrap; }
  .chip.ok { color: var(--fp-ok); } .chip.bad { color: var(--fp-bad); } .chip.warn { color: var(--fp-warn); }
  .chip.muted { color: var(--fp-text2); }
  .sec { border-bottom: 1px solid var(--fp-border); }
  .sec:last-of-type { border-bottom: none; }
  .sec-head { display: flex; justify-content: space-between; align-items: center; padding: 8px 14px 0;
    font-size: 10px; letter-spacing: 1.4px; color: var(--fp-text2); text-transform: uppercase; }
  .sec-head .t::before { content: '── '; color: var(--fp-muted); }
  .sec-body { padding: 8px 14px 12px; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(72px, 1fr)); gap: 8px; }
  .tile { position: relative; border: 1px solid var(--fp-border); padding: 9px 10px 8px; cursor: pointer; min-width: 0; }
  .tile:hover { background: var(--fp-bg2); }
  .tile .tk { position: absolute; font-size: 10px; line-height: 1; color: var(--fp-accent); }
  .tile .tl { top: -2px; left: -1px; } .tile .tr { top: -2px; right: -1px; }
  .tile .bl { bottom: -3px; left: -1px; } .tile .br { bottom: -3px; right: -1px; }
  .tile .lbl { font-size: 10px; letter-spacing: 1.2px; color: var(--fp-text2); text-transform: uppercase; }
  .tile .val { font-size: 21px; font-weight: 600; margin-top: 4px; white-space: nowrap; }
  .tile .val small { font-size: 11px; color: var(--fp-text2); font-weight: 400; margin-left: 3px; }
  .bar { height: 3px; background: var(--fp-border2); margin-top: 7px; position: relative; }
  .bar > span { position: absolute; inset: 0 auto 0 0; background: var(--fp-accent); }
  .bar > span.warn { background: var(--fp-warn); } .bar > span.bad { background: var(--fp-bad); }
  .kv { display: grid; grid-template-columns: auto 1fr; gap: 3px 14px; font-size: 12px; }
  .kv .k { color: var(--fp-text2); }
  .kv .v { text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rates { display: flex; gap: 18px; align-items: baseline; flex-wrap: wrap; }
  .rate { font-size: 22px; font-weight: 600; }
  .rate small { font-size: 11px; color: var(--fp-text2); font-weight: 400; margin-left: 3px; }
  .rate .ar { font-size: 14px; margin-right: 4px; }
  .rate.dn .ar { color: var(--fp-cyan); } .rate.up .ar { color: var(--fp-wlan); }
  .totals { margin-left: auto; font-size: 11px; color: var(--fp-text2); text-align: right; line-height: 1.5; }
  svg.spark { width: 100%; height: 46px; display: block; margin-top: 8px; }
  .tools { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-bottom: 8px; }
  .tools input { flex: 1; min-width: 110px; font-family: var(--fp-mono); font-size: 12px; padding: 5px 8px;
    background: transparent; color: var(--fp-text); border: 1px solid var(--fp-border); border-radius: 0; outline: none; }
  .tools input:focus { border-color: var(--fp-accent); }
  button.fb { font-family: var(--fp-mono); font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
    padding: 5px 8px; background: transparent; color: var(--fp-text2); border: 1px solid var(--fp-border);
    border-radius: 0; cursor: pointer; }
  button.fb:hover { color: var(--fp-text); border-color: var(--fp-border2); }
  button.fb.on { color: var(--fp-accent); border-color: var(--fp-accent); background: color-mix(in srgb, var(--fp-accent) 10%, transparent); }
  .rows { display: flex; flex-direction: column; }
  .row { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; gap: 8px; align-items: center;
    padding: 5px 0; border-top: 1px dashed var(--fp-border); font-size: 12px; }
  .row:first-child { border-top: none; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--fp-lan); }
  .dot.wlan { background: var(--fp-wlan); } .dot.guest { background: var(--fp-warn); }
  .dot.off { background: var(--fp-muted); } .dot.master { background: var(--fp-cyan); }
  .dot.sat { background: var(--fp-warn); }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .name .sub { color: var(--fp-text2); font-size: 11px; margin-left: 6px; }
  .right { color: var(--fp-text2); font-size: 11px; text-align: right; white-space: nowrap; }
  .right a { color: var(--fp-text); text-decoration: none; }
  .right a:hover { color: var(--fp-accent); }
  .more { margin-top: 6px; font-size: 11px; color: var(--fp-accent); cursor: pointer; background: none; border: none; font-family: var(--fp-mono); padding: 0; }
  .toggle { width: 34px; height: 18px; border: 1px solid var(--fp-border2); position: relative; cursor: pointer; background: transparent; padding: 0; }
  .toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; background: var(--fp-muted); transition: left .15s; }
  .toggle.on { border-color: var(--fp-ok); } .toggle.on::after { left: 18px; background: var(--fp-ok); }
  .toggle[disabled] { cursor: default; opacity: .6; }
  .empty { font-size: 12px; color: var(--fp-text2); padding: 6px 0; }
  .foot { display: flex; justify-content: space-between; padding: 6px 14px; font-size: 10px; color: var(--fp-muted);
    letter-spacing: .6px; border-top: 1px solid var(--fp-border); text-transform: uppercase; }
`;

class FritzPortalCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._ui = { search: '', filter: 'all', sort: 'activity', expanded: false };
    this._history = { down: [], up: [], fetched: 0 };
    this._renderPending = false;
  }

  static getStubConfig() { return { sections: ['system', 'wan', 'traffic', 'hosts'] }; }
  static getConfigElement() { return document.createElement('fritz-portal-card-editor'); }

  setConfig(config) {
    this._config = {
      title: 'FRITZ!Portal',
      entity_prefix: 'fritzportal',
      sections: ALL_SECTIONS,
      hosts_limit: 8,
      theme: 'auto',
      ...(config || {}),
    };
    if (this._config.hosts_sort) this._ui.sort = this._config.hosts_sort;
    this._ownIds = null; // Präfix kann sich geändert haben
    this._scheduleRender();
  }

  set hass(hass) {
    const prev = this._hass;
    this._hass = hass;
    const dark = this._config?.theme === 'dark' || (this._config?.theme !== 'light' && !!hass?.themes?.darkMode);
    const darkChanged = dark !== this.hasAttribute('dark');
    this.toggleAttribute('dark', dark);
    this._maybeFetchHistory();
    // HA ruft diesen Setter bei JEDER Zustandsänderung irgendeiner Entität auf – nur neu
    // zeichnen, wenn sich eine eigene Entität geändert hat (HA erzeugt dann ein neues
    // State-Objekt, daher reicht der Referenzvergleich)
    if (!prev || darkChanged || this._ownStatesChanged(prev, hass)) this._scheduleRender();
  }

  _ownStatesChanged(prev, next) {
    const prefix = `.${this._config?.entity_prefix || 'fritzportal'}_`;
    const count = Object.keys(next.states).length;
    if (!this._ownIds || this._statesCount !== count) {
      this._statesCount = count;
      this._ownIds = Object.keys(next.states).filter(id => id.includes(prefix));
      return true;
    }
    return this._ownIds.some(id => prev.states[id] !== next.states[id]);
  }

  getCardSize() { return 2 + (this._config?.sections || ALL_SECTIONS).length * 2; }

  // ── Helpers ──
  _id(domain, suffix) { return `${domain}.${this._config.entity_prefix}_${suffix}`; }
  _st(domain, suffix) { return this._hass?.states?.[this._id(domain, suffix)]; }
  _val(suffix) { const s = this._st('sensor', suffix); return s && !['unknown', 'unavailable'].includes(s.state) ? s.state : null; }
  _show(section) { return (this._config.sections || ALL_SECTIONS).includes(section); }
  _moreInfo(entityId) {
    this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
  }

  _scheduleRender() {
    if (this._renderPending) return;
    this._renderPending = true;
    requestAnimationFrame(() => { this._renderPending = false; this._render(); });
  }

  // Verlauf der Live-Raten (letzte 30 min) aus der HA-History – max. 1×/Minute
  async _maybeFetchHistory() {
    if (!this._hass || !this._show('traffic')) return;
    if (Date.now() - this._history.fetched < 60000) return;
    this._history.fetched = Date.now();
    const ids = [this._id('sensor', 'download_speed'), this._id('sensor', 'upload_speed')];
    if (!ids.every(id => this._hass.states[id])) return;
    try {
      const start = new Date(Date.now() - 30 * 60000).toISOString();
      const res = await this._hass.callApi('GET',
        `history/period/${start}?filter_entity_id=${ids.join(',')}&minimal_response&no_attributes`);
      const series = (arr) => (arr || []).map(p => num(p.state)).filter(v => v !== null);
      const byId = {};
      for (const arr of res || []) if (arr?.[0]?.entity_id) byId[arr[0].entity_id] = arr;
      this._history.down = series(byId[ids[0]]);
      this._history.up = series(byId[ids[1]]);
      this._scheduleRender();
    } catch { /* History nicht verfügbar (z. B. Recorder aus) – Sparkline entfällt */ }
  }

  // ── Render ──
  _render() {
    if (!this._config || !this._hass) return;
    const root = this.shadowRoot;
    // Fokus/Cursor im Suchfeld über Re-Renders hinweg erhalten
    const active = root.activeElement;
    const keepFocus = active?.id === 'fp-search';
    const selStart = keepFocus ? active.selectionStart : 0;

    const sections = [];
    if (this._show('system'))  sections.push(this._renderSystem());
    if (this._show('wan'))     sections.push(this._renderWan());
    if (this._show('traffic')) sections.push(this._renderTraffic());
    if (this._show('hosts'))   sections.push(this._renderHosts());
    if (this._show('mesh'))    sections.push(this._renderMesh());
    if (this._show('wlan'))    sections.push(this._renderWlan());
    if (this._show('phone'))   sections.push(this._renderPhone());
    const body = sections.filter(Boolean).join('');

    const wan = this._hass.states[this._id('binary_sensor', 'wan_connected')];
    const fw = this._hass.states[this._id('binary_sensor', 'firmware_update')];
    const chips = [];
    if (wan) chips.push(wan.state === 'on' ? '<span class="chip ok">● online</span>' : '<span class="chip bad">● offline</span>');
    if (fw?.state === 'on') chips.push(`<span class="chip warn" title="${esc(fw.attributes.latest_version)}">FW-Update</span>`);

    const anyEntity = Object.keys(this._hass.states).some(id => id.includes(`.${this._config.entity_prefix}_`));

    root.innerHTML = `
      <style>${STYLE}</style>
      <ha-card>
        <div class="head">
          <span class="title">${esc(this._config.title)}</span>
          <span class="meta">${chips.join('')}</span>
        </div>
        ${anyEntity ? body : `<div class="sec"><div class="sec-body"><div class="empty">
          Keine FRITZ!Portal-Sensoren gefunden (${esc(this._config.entity_prefix)}_*).<br>
          Bitte das Add-on starten und MQTT oder den REST-API-Fallback aktivieren.</div></div></div>`}
        <div class="foot"><span>fritz!portal card v${CARD_VERSION}</span><span>${new Date().toLocaleTimeString()}</span></div>
      </ha-card>`;
    this._bind();

    if (keepFocus) {
      const inp = root.getElementById('fp-search');
      if (inp) { inp.focus(); inp.setSelectionRange(selStart, selStart); }
    }
  }

  _sec(title, right, body) {
    return `<div class="sec"><div class="sec-head"><span class="t">${esc(title)}</span><span>${right || ''}</span></div>
      <div class="sec-body">${body}</div></div>`;
  }

  _tile(label, value, unit, suffix, pct) {
    const cls = pct === null || pct === undefined ? '' : pct >= 85 ? 'bad' : pct >= 65 ? 'warn' : '';
    const bar = pct === null || pct === undefined ? '' :
      `<div class="bar"><span class="${cls}" style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>`;
    return `<div class="tile" data-more="${esc(this._id('sensor', suffix))}">
      <span class="tk tl">┌</span><span class="tk tr">┐</span><span class="tk bl">└</span><span class="tk br">┘</span>
      <div class="lbl">${esc(label)}</div>
      <div class="val">${value === null ? '—' : esc(value)}${value !== null && unit ? `<small>${esc(unit)}</small>` : ''}</div>${bar}</div>`;
  }

  _renderSystem() {
    const cpu = num(this._val('cpu')), ram = num(this._val('ram')), temp = num(this._val('temperature'));
    const online = this._val('online_devices'), free = this._val('free_ips');
    if ([cpu, ram, temp, online, free].every(v => v === null)) return '';
    const tiles = [
      this._tile('CPU', cpu === null ? null : Math.round(cpu), '%', 'cpu', cpu),
      this._tile('RAM', ram === null ? null : Math.round(ram), '%', 'ram', ram),
      this._tile('Temp', temp === null ? null : Math.round(temp), '°C', 'temperature', temp === null ? null : temp / 0.95),
      this._tile('Online', online, '', 'online_devices'),
      this._tile('Freie IPs', free, '', 'free_ips'),
    ];
    return this._sec('system.status', '', `<div class="tiles">${tiles.join('')}</div>`);
  }

  _renderWan() {
    const wan = this._hass.states[this._id('binary_sensor', 'wan_connected')];
    const type = this._val('wan_access_type');
    const ip = this._val('external_ip');
    const dn = num(this._val('dsl_downstream')), up = num(this._val('dsl_upstream'));
    if (!wan && !type && !ip) return '';
    const a = wan?.attributes || {};
    const uptime = a.uptime_s ? `${Math.floor(a.uptime_s / 86400)}d ${Math.floor((a.uptime_s % 86400) / 3600)}h` : '';
    const rows = [
      ['Status', wan ? (wan.state === 'on' ? '<span style="color:var(--fp-ok)">verbunden</span>' : '<span style="color:var(--fp-bad)">getrennt</span>') : '—'],
      ['Anschluss', esc(type || a.access_type || '—')],
      ...(a.provider ? [['Anbieter', esc(a.provider)]] : []),
      ['IPv4', esc(ip || a.external_ip || '—')],
    ];
    if (a.external_ipv6) rows.push(['IPv6', `<span title="${esc(a.external_ipv6)}">${esc(a.external_ipv6)}</span>`]);
    if (dn !== null) rows.push(['DSL-Sync', `↓ ${esc(dn)} / ↑ ${esc(up ?? '—')} Mbit/s`]);
    if (uptime) rows.push(['Online seit', esc(uptime)]);
    const kv = rows.map(([k, v]) => `<span class="k">${k}</span><span class="v">${v}</span>`).join('');
    return this._sec('internet.wan', '', `<div class="kv">${kv}</div>`);
  }

  _spark(down, up) {
    const pts = (arr, w, h, max) => arr.map((v, i) =>
      `${(i / Math.max(1, arr.length - 1) * w).toFixed(1)},${(h - (v / max) * (h - 2) - 1).toFixed(1)}`).join(' ');
    if (down.length < 2 && up.length < 2) return '';
    const max = Math.max(0.01, ...down, ...up);
    return `<svg class="spark" viewBox="0 0 300 46" preserveAspectRatio="none">
      <polyline points="${pts(down, 300, 46, max)}" fill="none" stroke="var(--fp-cyan)" stroke-width="1.4" vector-effect="non-scaling-stroke"/>
      <polyline points="${pts(up, 300, 46, max)}" fill="none" stroke="var(--fp-wlan)" stroke-width="1.2" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>
    </svg>`;
  }

  _renderTraffic() {
    const dl = num(this._val('download_speed')), ul = num(this._val('upload_speed'));
    if (dl === null && ul === null) return '';
    // Sensor liefert MB/s → für die Anzeige in Mbit/s umrechnen
    const mbit = (v) => v === null ? '—' : (v * 8 >= 100 ? Math.round(v * 8) : (v * 8).toFixed(1));
    const tdl = num(this._val('traffic_today_received')), tul = num(this._val('traffic_today_sent'));
    const unitOf = (s) => this._st('sensor', s)?.attributes?.unit_of_measurement || '';
    const totals = tdl !== null ? `<div class="totals">heute<br>↓ ${esc(tdl)} ${esc(unitOf('traffic_today_received'))} · ↑ ${esc(tul ?? '—')} ${esc(unitOf('traffic_today_sent'))}</div>` : '';
    const body = `<div class="rates">
        <span class="rate dn" data-more="${esc(this._id('sensor', 'download_speed'))}"><span class="ar">↓</span>${mbit(dl)}<small>Mbit/s</small></span>
        <span class="rate up" data-more="${esc(this._id('sensor', 'upload_speed'))}"><span class="ar">↑</span>${mbit(ul)}<small>Mbit/s</small></span>
        ${totals}
      </div>${this._spark(this._history.down, this._history.up)}`;
    return this._sec('traffic.live', '30 min', body);
  }

  _renderHosts() {
    const st = this._st('sensor', 'online_devices');
    const hosts = st?.attributes?.active_hosts;
    if (!Array.isArray(hosts)) return '';
    const ui = this._ui;
    const q = ui.search.trim().toLowerCase();
    let list = hosts.filter(h => {
      if (ui.filter === 'lan' && h.type !== 'LAN') return false;
      if (ui.filter === 'wlan' && h.type !== 'WLAN') return false;
      if (ui.filter === 'guest' && !h.guest) return false;
      if (!q) return true;
      return [h.name, h.ip, h.mac].some(v => String(v || '').toLowerCase().includes(q));
    });
    // Attribut ist bereits nach Aktivität sortiert (neueste zuerst)
    if (ui.sort === 'ip') list = [...list].sort((a, b) => ipNum(a.ip) - ipNum(b.ip));
    if (ui.sort === 'name') list = [...list].sort((a, b) => String(a.name).localeCompare(String(b.name), 'de'));
    const limit = ui.expanded ? list.length : (this._config.hosts_limit || 8);
    const rows = list.slice(0, limit).map(h => {
      const cls = h.guest ? 'guest' : h.type === 'WLAN' ? 'wlan' : '';
      const ip = isIPv4(h.ip) ? `<a href="http://${esc(h.ip)}" target="_blank" rel="noopener noreferrer">${esc(h.ip)}</a>` : esc(h.ip || '—');
      return `<div class="row" title="${esc([h.mac, h.conn].filter(Boolean).join(' · '))}">
        <span class="dot ${cls}"></span>
        <span class="name">${esc(h.name)}${h.conn ? `<span class="sub">${esc(h.conn)}</span>` : ''}</span>
        <span class="right">${ip}</span></div>`;
    }).join('');
    const hasGuest = hosts.some(h => h.guest);
    const fb = (id, label) => `<button class="fb ${ui.filter === id ? 'on' : ''}" data-filter="${id}">${label}</button>`;
    const sortLabel = { activity: '↕ aktiv', ip: '↕ ip', name: '↕ name' }[ui.sort];
    const tools = `<div class="tools">
        <input id="fp-search" type="search" placeholder="suchen…" value="${esc(ui.search)}">
        ${fb('all', 'alle')}${fb('lan', 'lan')}${fb('wlan', 'wlan')}${hasGuest ? fb('guest', 'gast') : ''}
        <button class="fb" data-sort="1" title="Sortierung wechseln">${sortLabel}</button>
      </div>`;
    const more = list.length > (this._config.hosts_limit || 8)
      ? `<button class="more" data-expand="1">${ui.expanded ? '▲ weniger' : `▼ alle ${list.length} anzeigen`}</button>` : '';
    return this._sec('hosts.active', `${hosts.length} online`,
      tools + (rows ? `<div class="rows">${rows}</div>` : '<div class="empty">Keine Treffer</div>') + more);
  }

  _renderMesh() {
    const st = this._st('sensor', 'mesh_devices');
    const devs = st?.attributes?.devices;
    if (!Array.isArray(devs) || devs.length === 0) return '';
    const total = st.attributes.total || devs.length;
    const rows = devs.map(d => {
      const cls = d.role === 'master' ? 'master' : 'sat';
      const upd = d.update_available ? ' <span class="chip warn">update</span>' : '';
      return `<div class="row">
        <span class="dot ${cls}"></span>
        <span class="name">${esc(d.name)}<span class="sub">${esc(d.model || '')}${d.firmware ? ' · ' + esc(d.firmware) : ''}</span>${upd}</span>
        <span class="right">${esc(d.link || (d.role === 'master' ? 'master' : ''))}${d.clients ? ` · ${esc(d.clients)} cl.` : ''}</span></div>`;
    }).join('');
    const chip = devs.length < total ? `<span class="chip warn">${devs.length}/${total} online</span>` : `${devs.length}/${total} online`;
    return this._sec('mesh.nodes', chip, `<div class="rows">${rows}</div>`);
  }

  _renderWlan() {
    const prefix = `${this._config.entity_prefix}_wlan_`;
    const ids = Object.keys(this._hass.states)
      .filter(id => (id.startsWith('switch.') || id.startsWith('sensor.')) && id.split('.')[1].startsWith(prefix))
      .sort();
    // Steuerbarer Schalter (MQTT) hat Vorrang vor dem Nur-Anzeige-Sensor (REST)
    const byIdx = new Map();
    for (const id of ids) {
      const idx = id.split('_').pop();
      if (!byIdx.has(idx) || id.startsWith('switch.')) byIdx.set(idx, id);
    }
    if (byIdx.size === 0) return '';
    const rows = [...byIdx.values()].map(id => {
      const s = this._hass.states[id];
      const on = s.state === 'on';
      const name = String(s.attributes.friendly_name || id).replace(/^FRITZ!Portal\s+/, '').replace(/^WLAN\s+/, '');
      const ctl = id.startsWith('switch.');
      return `<div class="row"><span class="dot ${on ? 'wlan' : 'off'}"></span>
        <span class="name">${esc(name)}</span>
        <span class="right"><button class="toggle ${on ? 'on' : ''}" ${ctl ? `data-toggle="${esc(id)}"` : 'disabled title="Nur Anzeige (kein MQTT)"'}></button></span></div>`;
    }).join('');
    return this._sec('wlan.ssid', '', `<div class="rows">${rows}</div>`);
  }

  _renderPhone() {
    const items = [
      ['last_call', '☎', 'letzter'],
      ['last_missed_call', '✕', 'verpasst'],
      ['last_incoming_call', '↙', 'eingehend'],
    ].map(([suffix, icon, label]) => {
      const s = this._st('sensor', suffix);
      if (!s) return '';
      const a = s.attributes || {};
      const nr = a.number && a.number !== s.state ? `<span class="sub">${esc(a.number)}</span>` : '';
      const color = suffix === 'last_missed_call' ? 'var(--fp-bad)' : 'var(--fp-text2)';
      const dur = a.duration_minutes ? ` · ${esc(a.duration_minutes)} min` : '';
      return `<div class="row" data-more="${esc(this._id('sensor', suffix))}" style="cursor:pointer">
        <span style="color:${color};font-size:11px">${icon}</span>
        <span class="name">${esc(s.state === '-' ? '—' : s.state)}${nr}</span>
        <span class="right">${esc(label)} · ${esc(a.date || '—')}${dur}</span></div>`;
    }).join('');
    if (!items) return '';
    return this._sec('phone.calls', '', `<div class="rows">${items}</div>`);
  }

  _bind() {
    const root = this.shadowRoot;
    root.querySelectorAll('[data-more]').forEach(el =>
      el.addEventListener('click', () => this._moreInfo(el.dataset.more)));
    root.querySelectorAll('[data-filter]').forEach(el =>
      el.addEventListener('click', () => { this._ui.filter = el.dataset.filter; this._render(); }));
    root.querySelector('[data-sort]')?.addEventListener('click', () => {
      const order = ['activity', 'ip', 'name'];
      this._ui.sort = order[(order.indexOf(this._ui.sort) + 1) % order.length];
      this._render();
    });
    root.querySelector('[data-expand]')?.addEventListener('click', () => {
      this._ui.expanded = !this._ui.expanded; this._render();
    });
    root.getElementById('fp-search')?.addEventListener('input', (e) => {
      this._ui.search = e.target.value; this._render();
    });
    root.querySelectorAll('[data-toggle]').forEach(el => el.addEventListener('click', () => {
      this._hass.callService('switch', 'toggle', { entity_id: el.dataset.toggle });
    }));
  }
}

// ── Visueller Editor ──
class FritzPortalCardEditor extends HTMLElement {
  setConfig(config) { this._config = { ...config }; this._render(); }
  set hass(hass) { this._hass = hass; }

  _emit() {
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true }));
  }

  _render() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    const sections = this._config.sections || ALL_SECTIONS;
    this.shadowRoot.innerHTML = `
      <style>
        .ed { display: flex; flex-direction: column; gap: 10px; font-size: 14px; }
        label { display: flex; align-items: center; gap: 8px; }
        input[type=text], input[type=number] { padding: 6px 8px; font-size: 14px; width: 100%; box-sizing: border-box; }
        .grp { border: 1px solid var(--divider-color, #ccc); padding: 8px 10px; }
        .grp b { display: block; margin-bottom: 6px; }
      </style>
      <div class="ed">
        <label>Titel <input type="text" id="title" value="${esc(this._config.title || 'FRITZ!Portal')}"></label>
        <div class="grp"><b>Bereiche</b>
          ${ALL_SECTIONS.map(s => `<label><input type="checkbox" data-sec="${s}" ${sections.includes(s) ? 'checked' : ''}> ${esc(SECTION_LABELS[s])}</label>`).join('')}
        </div>
        <label>Anzahl Geräte (eingeklappt) <input type="number" id="limit" min="1" max="200" value="${esc(this._config.hosts_limit || 8)}"></label>
        <label>Darstellung
          <select id="theme">
            ${['auto', 'dark', 'light'].map(t => `<option value="${t}" ${(this._config.theme || 'auto') === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </label>
      </div>`;
    const r = this.shadowRoot;
    r.getElementById('title').addEventListener('change', e => { this._config = { ...this._config, title: e.target.value }; this._emit(); });
    r.getElementById('limit').addEventListener('change', e => { this._config = { ...this._config, hosts_limit: parseInt(e.target.value, 10) || 8 }; this._emit(); });
    r.getElementById('theme').addEventListener('change', e => { this._config = { ...this._config, theme: e.target.value }; this._emit(); });
    r.querySelectorAll('[data-sec]').forEach(cb => cb.addEventListener('change', () => {
      const chosen = ALL_SECTIONS.filter(s => r.querySelector(`[data-sec="${s}"]`).checked);
      this._config = { ...this._config, sections: chosen };
      this._emit();
    }));
  }
}

if (!customElements.get('fritz-portal-card')) customElements.define('fritz-portal-card', FritzPortalCard);
if (!customElements.get('fritz-portal-card-editor')) customElements.define('fritz-portal-card-editor', FritzPortalCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some(c => c.type === 'fritz-portal-card')) {
  window.customCards.push({
    type: 'fritz-portal-card',
    name: 'FRITZ!Portal',
    description: 'FRITZ!Box-Übersicht im Terminal-Look: System, Internet, Traffic, Geräte, Mesh, WLAN und Anrufe.',
    preview: true,
    documentationURL: 'https://github.com/jayjojayson/FRITZ-Portal',
  });
}

console.info(`%c FRITZ!PORTAL-CARD %c v${CARD_VERSION} `,
  'background:#2b6fd9;color:#fff;font-weight:600', 'background:#1a1f28;color:#dde3ec');

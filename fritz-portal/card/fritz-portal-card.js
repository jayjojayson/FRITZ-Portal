/*
 * FRITZ!Portal Dashboard-Card für Home Assistant
 * ------------------------------------------------
 * Zeigt die vom FRITZ!Portal-Add-on gelieferten Sensoren (sensor.fritzportal_*)
 * im Terminal-Look des Portals (oder im Home-Assistant-Design): System-Kacheln,
 * Internet/WAN, Live-Traffic mit Verlauf, Traffic-Statistik, aktive Geräte
 * (Suche/Filter/Sortierung), Mesh, Netzwerk-Grafik, WLAN-Schalter, Anrufe und Smart Home.
 *
 * Wird vom Add-on automatisch nach /local/fritz-portal/ kopiert und als
 * Lovelace-Ressource registriert. Keine externen Abhängigkeiten.
 *
 *   type: custom:fritz-portal-card
 *   sections: [system, wan, traffic, traffic_stats, hosts, mesh, wlan, phone, smarthome]
 *   hosts_limit: 8          # Geräte im eingeklappten Zustand
 *   phone_count: 5          # Anzahl der letzten Anrufe
 *   smarthome_group: group  # group (FRITZ!Box-Gruppen) | category (Gerätetyp) | none
 *   ha_style: false         # true = Standard-Design von Home Assistant
 *   topology_view: network  # Netzwerk-Grafik: network (Cluster je Zugangspunkt) | mesh (Baum)
 *   topology_names: false   # Netzwerk-Grafik: Gerätenamen anzeigen
 *   topology_clients: true  # Mesh-Baum: auch Endgeräte zeigen (sonst nur Zugangspunkte)
 */

const CARD_VERSION = '1.5.1';
const ALL_SECTIONS = ['system', 'wan', 'traffic', 'traffic_stats', 'hosts', 'mesh', 'topology', 'wlan', 'phone', 'smarthome'];
const SECTION_LABELS = {
  system: 'System (CPU, RAM, Temperatur, Geräte)',
  wan: 'Internet / WAN',
  traffic: 'Traffic live + Verlauf',
  traffic_stats: 'Traffic-Statistik (Heute … Vormonat)',
  hosts: 'Aktive Geräte',
  mesh: 'Mesh',
  topology: 'Netzwerk-Grafik (Mesh-Baum / Netzwerk-Cluster)',
  wlan: 'WLAN-Schalter',
  phone: 'Anrufe',
  smarthome: 'Smart Home',
};
const HA_TITLES = {
  'system.status': 'System', 'internet.wan': 'Internet', 'traffic.live': 'Traffic live', 'traffic.stats': 'Traffic-Statistik',
  'hosts.active': 'Aktive Geräte', 'mesh.nodes': 'Mesh', 'net.topology': 'Netzwerk', 'wlan.ssid': 'WLAN', 'phone.calls': 'Anrufe', 'smarthome': 'Smart Home',
};
// Farben der Netzwerk-Grafik wie in der Mesh-/Netzwerk-Ansicht des Panels
const TOPO = {
  master: { stroke: '#06b6d4', fill: '#0e7490' }, ap: { stroke: '#f59e0b', fill: '#78350f' },
  LAN: { stroke: '#3b82f6', fill: '#1e3a5f', dash: '0' }, WLAN: { stroke: '#10b981', fill: '#065f46', dash: '6 3' },
};
const TREE_FOLD = 10; // Mesh-Baum: ab so vielen Endgeräten je Zugangspunkt eingeklappt
const SMARTHOME_CATEGORY = {
  socket: 'Steckdosen', thermostat: 'Heizung', lamp: 'Licht', blind: 'Rollläden',
  sensor: 'Sensoren', control: 'Taster', other: 'Sonstige',
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
  /* Option „Home-Assistant-Design": Farben, Schrift und Rundungen aus dem aktiven HA-Theme */
  :host([ha]) {
    --fp-mono: var(--ha-font-family-body, var(--paper-font-body1_-_font-family, Roboto, sans-serif));
    --fp-bg: var(--ha-card-background, var(--card-background-color, #fff));
    --fp-bg2: var(--ha-card-background, var(--card-background-color, #fff));
    --fp-text: var(--primary-text-color); --fp-text2: var(--secondary-text-color);
    --fp-muted: var(--disabled-text-color, var(--secondary-text-color));
    --fp-border: var(--divider-color); --fp-border2: var(--divider-color);
    --fp-accent: var(--primary-color); --fp-ok: var(--success-color, #43a047);
    --fp-warn: var(--warning-color, #ffa600); --fp-bad: var(--error-color, #db4437);
    --fp-cyan: var(--info-color, var(--primary-color));
  }
  :host([ha]) ha-card { border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color));
    border-radius: var(--ha-card-border-radius, 12px); box-shadow: var(--ha-card-box-shadow, none); }
  :host([ha]) .head { background: transparent; border-bottom: none; padding: 16px 16px 4px; }
  :host([ha]) .head .title { font-size: 20px; font-weight: 400; letter-spacing: 0; }
  :host([ha]) .head .title::before, :host([ha]) .sec-head .t::before, :host([ha]) .tile .tk { display: none; }
  :host([ha]) .sec { border-bottom: none; }
  :host([ha]) .sec-head, :host([ha]) .tile .lbl, :host([ha]) .grp, :host([ha]) table.stats th, :host([ha]) .foot { text-transform: none; letter-spacing: 0; }
  :host([ha]) .sec-head { font-size: 12px; padding: 12px 16px 0; font-weight: 500; }
  :host([ha]) .tile, :host([ha]) .tools input, :host([ha]) button.fb { border-radius: 8px; }
  :host([ha]) .chip { border-radius: 10px; }
  :host([ha]) .foot { display: none; }
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
  /* Kacheln immer in einer Reihe; erst bei sehr schmalen Karten 3 Spalten (Container-Query
     richtet sich nach der Kartenbreite, nicht nach dem Bildschirm) */
  .sec-body { container-type: inline-size; }
  .tiles { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
  @container (max-width: 300px) { .tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  .tile { position: relative; border: 1px solid var(--fp-border); padding: 9px 7px 8px; cursor: pointer; min-width: 0; }
  .tile:hover { background: var(--fp-bg2); }
  .tile .tk { position: absolute; font-size: 10px; line-height: 1; color: var(--fp-accent); }
  .tile .tl { top: -2px; left: -1px; } .tile .tr { top: -2px; right: -1px; }
  .tile .bl { bottom: -3px; left: -1px; } .tile .br { bottom: -3px; right: -1px; }
  .tile .lbl { font-size: 9.5px; letter-spacing: 1px; color: var(--fp-text2); text-transform: uppercase;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tile .val { font-size: 21px; font-weight: 600; margin-top: 4px; white-space: nowrap; }
  .tile .val small { font-size: 10px; color: var(--fp-text2); font-weight: 400; margin-left: 2px; }
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
  table.stats { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.stats th { font-weight: 500; font-size: 10px; letter-spacing: 1px; color: var(--fp-text2);
    text-transform: uppercase; text-align: right; padding: 4px 0; border-bottom: 1px solid var(--fp-border); }
  table.stats th:first-child, table.stats td:first-child { text-align: left; }
  table.stats td { text-align: right; padding: 5px 0; border-top: 1px dashed var(--fp-border); white-space: nowrap; }
  table.stats tr:first-of-type td { border-top: none; }
  table.stats .dn { color: var(--fp-cyan); } table.stats .up { color: var(--fp-wlan); }
  /* Netzwerk-Grafik: Mesh-Baum (HTML, Linien per CSS – unabhängig von der Schrift) */
  .tree { display: flex; flex-direction: column; }
  .trow { display: flex; align-items: stretch; min-height: 30px; }
  .tc { width: 14px; flex: none; position: relative; }
  .tc.pipe::before, .tc.tee::before, .tc.end::before { content: ''; position: absolute; left: 6px; top: 0; bottom: 0;
    border-left: 1px solid var(--fp-border2); }
  .tc.end::before { bottom: 50%; }
  .tc.tee::after, .tc.end::after { content: ''; position: absolute; left: 6px; right: 0; top: 50%;
    border-top: 1.5px solid var(--lc, var(--fp-border2)); }
  .tc.wlan::after { border-top-style: dashed; }
  .tbox { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; margin: 2px 0; padding: 3px 8px;
    border: 1px solid var(--bc); background: color-mix(in srgb, var(--bc) 14%, transparent); font-size: 12px; }
  :host([ha]) .tbox { border-radius: 8px; }
  .tbox .name { flex: 1; }
  .tbox .ip { color: var(--fp-text2); font-size: 11px; margin-left: 6px; }
  .badge { font-size: 10px; padding: 1px 6px; border: 1px solid currentColor; white-space: nowrap; border-radius: 9px; }
  /* Netzwerk-Grafik: Cluster-Ansicht (SVG) */
  svg.topo { width: 100%; height: auto; max-height: 560px; display: block; cursor: grab; touch-action: pan-y; }
  .zoom { display: inline-flex; gap: 2px; margin-right: 6px; }
  .zoom .zk { min-width: 46px; }
  svg.topo .lbl { fill: var(--fp-text); stroke: var(--fp-bg); paint-order: stroke; font-family: var(--fp-mono); }
  .topo-sum { display: flex; gap: 12px; flex-wrap: wrap; font-size: 11px; color: var(--fp-text2); margin-bottom: 6px; }
  .grp { font-size: 10px; letter-spacing: 1.2px; color: var(--fp-text2); text-transform: uppercase; margin: 8px 0 2px; }
  .grp:first-child { margin-top: 0; }
  .foot { display: flex; justify-content: space-between; padding: 6px 14px; font-size: 10px; color: var(--fp-muted);
    letter-spacing: .6px; border-top: 1px solid var(--fp-border); text-transform: uppercase; }
`;

class FritzPortalCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._ui = { search: '', filter: 'all', sort: 'activity', expanded: false, treeOpen: new Set(),
      zoom: { k: 1, x: 0, y: 0 }, treeK: 1 };
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
      phone_count: 5,
      smarthome_group: 'group',
      ha_style: false,
      theme: 'auto',
      topology_view: 'network',
      topology_names: false,
      topology_clients: true,
      ...(config || {}),
    };
    this._ui.topo = this._config.topology_view === 'mesh' ? 'mesh' : 'network';
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
    this.toggleAttribute('ha', !!this._config?.ha_style);
    this._maybeLoadAliases();
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
      this._ownIds = Object.keys(next.states).filter(id => id.includes(prefix))
        .concat(Object.values(this._alias || {}));
      return true;
    }
    return this._ownIds.some(id => prev.states[id] !== next.states[id]);
  }

  // Seit HA 2026.4 wird object_id der MQTT-Discovery ignoriert – frisch angelegte
  // Entitäten heißen dann z. B. sensor.fritz_portal_cpu_auslastung. Über die unique_id
  // (fritzportal_<id>) aus der Entity-Registry auf die erwarteten IDs abbilden.
  async _maybeLoadAliases() {
    const count = Object.keys(this._hass?.states || {}).length;
    if (!this._hass?.connection || this._aliasLoading || this._aliasCount === count) return;
    // Neue (lazy) Entitäten → höchstens einmal pro Minute neu laden
    if (this._aliasLoaded && Date.now() - this._aliasLoaded < 60000) return;
    this._aliasLoading = true;
    this._aliasCount = count;
    try {
      const list = await this._hass.connection.sendMessagePromise({ type: 'config/entity_registry/list' });
      const prefix = this._config?.entity_prefix || 'fritzportal';
      const alias = {};
      for (const e of list || []) {
        if (e.platform !== 'mqtt' || !e.unique_id?.startsWith('fritzportal_')) continue;
        const canonical = `${e.entity_id.split('.')[0]}.${prefix}_${e.unique_id.slice('fritzportal_'.length)}`;
        if (canonical !== e.entity_id) alias[canonical] = e.entity_id;
      }
      const changed = JSON.stringify(alias) !== JSON.stringify(this._alias || {});
      this._alias = alias;
      if (changed) { this._ownIds = null; this._scheduleRender(); }
    } catch { /* ohne Registry-Zugriff bleiben die Standard-IDs */ }
    this._aliasLoaded = Date.now();
    this._aliasLoading = false;
  }

  getCardSize() { return 2 + (this._config?.sections || ALL_SECTIONS).length * 2; }

  // ── Helpers ──
  _id(domain, suffix) { return this._resolve(`${domain}.${this._config.entity_prefix}_${suffix}`); }
  _resolve(id) { return this._hass?.states?.[id] ? id : (this._alias?.[id] || id); }
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
    if (this._show('traffic_stats')) sections.push(this._renderTrafficStats());
    if (this._show('hosts'))   sections.push(this._renderHosts());
    if (this._show('mesh'))    sections.push(this._renderMesh());
    if (this._show('topology')) sections.push(this._renderTopology());
    if (this._show('wlan'))    sections.push(this._renderWlan());
    if (this._show('phone'))   sections.push(this._renderPhone());
    if (this._show('smarthome')) sections.push(this._renderSmartHome());
    const body = sections.filter(Boolean).join('');

    const wan = this._hass.states[this._id('binary_sensor', 'wan_connected')];
    const fw = this._hass.states[this._id('binary_sensor', 'firmware_update')];
    const chips = [];
    if (wan) chips.push(wan.state === 'on' ? '<span class="chip ok">● online</span>' : '<span class="chip bad">● offline</span>');
    if (fw?.state === 'on') chips.push(`<span class="chip warn" title="${esc(fw.attributes.latest_version)}">FW-Update</span>`);

    const anyEntity = Object.keys(this._hass.states).some(id => id.includes(`.${this._config.entity_prefix}_`))
      || Object.values(this._alias || {}).some(id => this._hass.states[id]);

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
    // Im Home-Assistant-Design lesbare Überschriften statt Terminal-Bezeichnungen
    const shown = this._config.ha_style ? (HA_TITLES[title] || title) : title;
    return `<div class="sec"><div class="sec-head"><span class="t">${esc(shown)}</span><span>${right || ''}</span></div>
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
      // „IP-Pool … frei" wie im Portal-Dashboard – passt auch in schmale Kacheln
      this._tile('IP-Pool', free, 'frei', 'free_ips'),
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

  // ── Netzwerk-Grafik: Mesh-Baum oder Cluster je Zugangspunkt (wie im Panel) ──
  // Daten: sensor.fritzportal_topology (nodes: id, name, role, parent, link, ip)
  _topoModel() {
    const nodes = this._st('sensor', 'topology')?.attributes?.nodes;
    if (!Array.isArray(nodes) || nodes.length === 0) return null;
    const master = nodes.find(n => n.role === 'master') || nodes[0];
    const byId = new Map(nodes.map(n => [n.id, n]));
    const children = new Map(nodes.map(n => [n.id, []]));
    const parentOf = (n) => (n.parent && n.parent !== n.id && byId.has(n.parent) ? n.parent : master.id);
    for (const n of nodes) if (n !== master) children.get(parentOf(n)).push(n);
    const isHub = (n) => n === master || n.role === 'repeater' || n.role === 'ap' || children.get(n.id).length > 0;
    return { nodes, master, byId, children, parentOf, isHub };
  }

  _renderTopology() {
    const m = this._topoModel();
    if (!m) return '';
    const view = this._ui.topo || 'network';
    const k = view === 'mesh' ? this._ui.treeK : this._ui.zoom.k;
    const tabs = `<span class="tools" style="margin:0">
      <span class="zoom" title="Strg/⌘ + Mausrad: zoomen${view === 'network' ? ' · Ziehen: verschieben' : ''}">
        <button class="fb" data-zoom="out" aria-label="Verkleinern">−</button><button class="fb zk" data-zoom="reset" aria-label="Ansicht zurücksetzen">${Math.round(k * 100)} %</button><button class="fb" data-zoom="in" aria-label="Vergrößern">+</button></span>
      <button class="fb ${view === 'network' ? 'on' : ''}" data-topo="network">Netzwerk</button>
      <button class="fb ${view === 'mesh' ? 'on' : ''}" data-topo="mesh">Mesh</button></span>`;
    const body = view === 'mesh' ? this._renderMeshTree(m) : this._renderCluster(m);
    return this._sec('net.topology', tabs, body);
  }

  // Zoom: Baum per CSS-zoom, Netzwerk-Grafik per Transformation (Punkt unter der Maus bleibt
  // stehen). Nur das Nötige im DOM aktualisieren – kein komplettes Neuzeichnen je Mausrad-Schritt.
  _zoomTopo(factor, cx, cy) {
    if (this._ui.topo === 'mesh') {
      this._ui.treeK = Math.min(3, Math.max(0.4, this._ui.treeK * factor));
    } else {
      const z = this._ui.zoom, { W = 0, H = 0 } = this._topoWH || {};
      const k = Math.min(8, Math.max(0.4, z.k * factor));
      if (cx === undefined) { cx = W / 2; cy = H / 2; }
      this._ui.zoom = { k, x: cx - (cx - z.x) * (k / z.k), y: cy - (cy - z.y) * (k / z.k) };
    }
    this._applyZoom();
  }

  _applyZoom() {
    const root = this.shadowRoot;
    const z = this._ui.zoom;
    root.querySelector('svg.topo .zg')?.setAttribute('transform', `translate(${z.x.toFixed(1)},${z.y.toFixed(1)}) scale(${z.k})`);
    const tree = root.querySelector('.tree');
    if (tree) tree.style.zoom = this._ui.treeK;
    const lbl = root.querySelector('.zoom .zk');
    if (lbl) lbl.textContent = `${Math.round((this._ui.topo === 'mesh' ? this._ui.treeK : z.k) * 100)} %`;
  }

  _bindZoom(root) {
    root.querySelectorAll('[data-zoom]').forEach(el => el.addEventListener('click', () => {
      const a = el.dataset.zoom;
      if (a === 'reset') { this._ui.zoom = { k: 1, x: 0, y: 0 }; this._ui.treeK = 1; this._applyZoom(); }
      else this._zoomTopo(a === 'in' ? 1.25 : 1 / 1.25);
    }));
    const svg = root.querySelector('svg.topo');
    // Strg/⌘ + Mausrad bzw. Trackpad-Geste zoomt; normales Mausrad scrollt das Dashboard
    const wheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const f = Math.exp(-e.deltaY * 0.0025);
      if (svg && this._ui.topo !== 'mesh') {
        const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
        const p = pt.matrixTransform(svg.getScreenCTM().inverse());
        this._zoomTopo(f, p.x, p.y);
      } else this._zoomTopo(f);
    };
    root.querySelector('.tree')?.addEventListener('wheel', wheel, { passive: false });
    if (!svg) return;
    svg.addEventListener('wheel', wheel, { passive: false });
    // Verschieben per Ziehen (Maus/Touch)
    let drag = null;
    svg.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, vx: this._ui.zoom.x, vy: this._ui.zoom.y, s: svg.getScreenCTM()?.a || 1 };
      svg.setPointerCapture(e.pointerId);
      svg.style.cursor = 'grabbing';
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this._ui.zoom = { ...this._ui.zoom, x: drag.vx + (e.clientX - drag.x) / drag.s, y: drag.vy + (e.clientY - drag.y) / drag.s };
      this._applyZoom();
    });
    const end = () => { drag = null; svg.style.cursor = ''; };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
  }

  _renderMeshTree(m) {
    const showClients = this._config.topology_clients !== false;
    const sortKids = (list) => [...list].sort((a, b) =>
      Number(!m.isHub(a)) - Number(!m.isHub(b)) || String(a.name).localeCompare(String(b.name), 'de'));
    const clientCount = (n) => m.children.get(n.id).filter(c => !m.isHub(c)).length;
    const rows = [];
    // Tiefensuche; „lasts" merkt je Ebene, ob der Vorfahr der letzte Eintrag war (für die Linien)
    const walk = (n, lasts) => {
      const isMaster = n === m.master;
      const hub = m.isHub(n);
      const col = isMaster ? TOPO.master : hub ? TOPO.ap : TOPO[n.link === 'WLAN' ? 'WLAN' : 'LAN'];
      const lineCol = TOPO[n.link === 'WLAN' ? 'WLAN' : 'LAN'].stroke;
      const cells = lasts.map((last, i) => {
        const own = i === lasts.length - 1;
        const cls = own ? (last ? 'end' : 'tee') : (last ? '' : 'pipe');
        return `<span class="tc ${cls}${own && n.link === 'WLAN' ? ' wlan' : ''}"${own ? ` style="--lc:${lineCol}"` : ''}></span>`;
      }).join('');
      const cnt = clientCount(n);
      const badge = isMaster ? `<span class="badge" style="color:${TOPO.master.stroke}">${cnt} Geräte</span>`
        : hub ? `<span class="badge" style="color:${TOPO.ap.stroke}">${n.role === 'repeater' ? 'Repeater' : 'Zugangspunkt'}${cnt ? ' · ' + cnt : ''}</span>`
        : `<span class="badge" style="color:${lineCol}">${esc(n.link || 'LAN')}</span>`;
      rows.push(`<div class="trow">${cells}<div class="tbox" style="--bc:${col.stroke}" title="${esc(n.name)}${n.ip ? ' · ' + esc(n.ip) : ''}">
        <span class="name">${esc(n.name)}${n.ip ? `<span class="ip">${esc(n.ip)}</span>` : ''}</span>${badge}</div></div>`);
      // Viele Endgeräte an einem Zugangspunkt eingeklappt (Klick klappt auf/zu)
      const kids = sortKids(m.children.get(n.id));
      const hubKids = kids.filter(c => m.isHub(c));
      const clientKids = showClients ? kids.filter(c => !m.isHub(c)) : [];
      const foldable = clientKids.length > TREE_FOLD;
      const open = !foldable || this._ui.treeOpen.has(n.id);
      const items = [...hubKids, ...(open ? clientKids : [])];
      if (foldable) items.push(null);
      items.forEach((c, i) => {
        const last = i === items.length - 1;
        if (c) return walk(c, [...lasts, last]);
        const cells = [...lasts, last].map((l, j, arr) => `<span class="tc ${j === arr.length - 1 ? 'end' : l ? '' : 'pipe'}"></span>`).join('');
        rows.push(`<div class="trow">${cells}<button class="more" data-tree="${esc(n.id)}" style="margin:0 0 0 6px">${open
          ? '▴ einklappen' : `▾ ${clientKids.length} Geräte anzeigen`}</button></div>`);
      });
    };
    walk(m.master, []);
    return `<div class="tree" style="zoom:${this._ui.treeK}">${rows.join('')}</div>`;
  }

  _renderCluster(m) {
    const names = !!this._config.topology_names;
    const hubs = m.nodes.filter(m.isHub);
    const hubSet = new Set(hubs.map(h => h.id));
    const clientsOf = new Map(hubs.map(h => [h.id, []]));
    for (const n of m.nodes) {
      if (hubSet.has(n.id)) continue;
      const p = m.parentOf(n);
      clientsOf.get(hubSet.has(p) ? p : m.master.id).push(n);
    }
    const total = m.nodes.length - hubs.length;
    const nodeR = total <= 15 ? 16 : total <= 40 ? 12 : total <= 80 ? 9 : 7;
    const spacing = Math.max(nodeR * 3.2, names ? 56 : 24);
    const hubR = (h) => (h === m.master ? 34 : 26);
    // Geräte in Ringen um den Zugangspunkt – LAN und WLAN jeweils zusammenhängend
    const layout = (hub, members) => {
      const sorted = [...members].sort((a, b) =>
        Number(a.link === 'WLAN') - Number(b.link === 'WLAN') || String(a.name).localeCompare(String(b.name), 'de'));
      const pos = [];
      let r = hubR(hub) + nodeR + 40, i = 0;
      while (i < sorted.length) {
        const cap = Math.max(6, Math.floor(2 * Math.PI * r / spacing));
        const cnt = Math.min(cap, sorted.length - i);
        for (let k = 0; k < cnt; k++) {
          const a = 2 * Math.PI * k / cnt - Math.PI / 2;
          pos.push({ node: sorted[i + k], x: r * Math.cos(a), y: r * Math.sin(a) });
        }
        i += cnt;
        if (i < sorted.length) r += Math.max(spacing, nodeR * 3);
      }
      return { pos, radius: (members.length ? r + nodeR : hubR(hub) + 22) + (names ? 18 : 6) };
    };
    const clusters = hubs.map(h => ({ hub: h, ...layout(h, clientsOf.get(h.id)) }));
    const center = clusters.find(c => c.hub === m.master);
    const others = clusters.filter(c => c !== center).sort((a, b) => b.radius - a.radius);
    // Zugangspunkte um die Box verteilen – Winkelanteil nach Clustergröße, ohne Überschneidung
    const gap = names ? 50 : 34;
    const at = new Map([[m.master.id, { x: 0, y: 0 }]]);
    if (others.length) {
      const widths = others.map(c => 2 * c.radius + gap);
      const sum = widths.reduce((a, b) => a + b, 0);
      const D = Math.max(center.radius + Math.max(...others.map(c => c.radius)) + gap, sum / (2 * Math.PI));
      let acc = 0;
      others.forEach((c, idx) => {
        const a = (acc + widths[idx] / 2) / sum * 2 * Math.PI - Math.PI / 2;
        acc += widths[idx];
        const dist = others.length === 1 ? center.radius + c.radius + gap : D;
        at.set(c.hub.id, { x: dist * Math.cos(a), y: dist * Math.sin(a) });
      });
    }
    const pad = names ? 40 : 20;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of clusters) {
      const p = at.get(c.hub.id);
      minX = Math.min(minX, p.x - c.radius); maxX = Math.max(maxX, p.x + c.radius);
      minY = Math.min(minY, p.y - c.radius); maxY = Math.max(maxY, p.y + c.radius);
    }
    const W = maxX - minX + 2 * pad, H = maxY - minY + 2 * pad, ox = pad - minX, oy = pad - minY;
    this._topoWH = { W, H };
    const f = (v) => v.toFixed(1);
    const short = (s, max) => (String(s).length > max ? String(s).slice(0, max - 1) + '…' : String(s));
    const tip = (n) => `<title>${esc(n.name)}${n.ip ? ' · ' + esc(n.ip) : ''}${n.role === 'client' ? ' · ' + esc(n.link) : ''}</title>`;
    const parts = [];
    for (const c of clusters) {
      const p = at.get(c.hub.id), col = c.hub === m.master ? TOPO.master : TOPO.ap;
      parts.push(`<circle cx="${f(p.x + ox)}" cy="${f(p.y + oy)}" r="${f(c.radius)}" fill="${col.stroke}" fill-opacity="0.035" stroke="${col.stroke}" stroke-opacity="0.22" stroke-dasharray="4 6"/>`);
    }
    for (const c of others) {
      const parent = at.has(m.parentOf(c.hub)) ? m.parentOf(c.hub) : m.master.id;
      const a = at.get(parent), b = at.get(c.hub.id), col = TOPO[c.hub.link === 'WLAN' ? 'WLAN' : 'LAN'];
      parts.push(`<line x1="${f(a.x + ox)}" y1="${f(a.y + oy)}" x2="${f(b.x + ox)}" y2="${f(b.y + oy)}" stroke="${col.stroke}" stroke-width="3" stroke-dasharray="${col.dash}" stroke-opacity="0.7"/>`);
    }
    for (const c of clusters) {
      const hp = at.get(c.hub.id);
      for (const { node, x, y } of c.pos) {
        const col = TOPO[node.link === 'WLAN' ? 'WLAN' : 'LAN'];
        parts.push(`<line x1="${f(hp.x + ox)}" y1="${f(hp.y + oy)}" x2="${f(hp.x + x + ox)}" y2="${f(hp.y + y + oy)}" stroke="${col.stroke}" stroke-width="1.3" stroke-dasharray="${col.dash}" stroke-opacity="0.2"/>`);
      }
    }
    for (const c of clusters) {
      const hp = at.get(c.hub.id);
      for (const { node, x, y } of c.pos) {
        const col = TOPO[node.link === 'WLAN' ? 'WLAN' : 'LAN'];
        parts.push(`<g transform="translate(${f(hp.x + x + ox)},${f(hp.y + y + oy)})">${tip(node)}
          <circle r="${nodeR}" fill="${col.fill}" stroke="${col.stroke}" stroke-width="1.5"/>
          ${names ? `<text class="lbl" y="${nodeR + 12}" text-anchor="middle" font-size="9.5" stroke-width="2.5">${esc(short(node.name, 12))}</text>` : ''}</g>`);
      }
    }
    for (const c of clusters) {
      const p = at.get(c.hub.id), isMaster = c.hub === m.master, r = hubR(c.hub), col = isMaster ? TOPO.master : TOPO.ap;
      parts.push(`<g transform="translate(${f(p.x + ox)},${f(p.y + oy)})">${tip(c.hub)}
        <circle r="${r}" fill="${col.fill}" stroke="${col.stroke}" stroke-width="2.5"/>
        <text y="2" text-anchor="middle" font-size="${isMaster ? 15 : 13}" fill="#fff" font-weight="700">${c.pos.length}</text>
        <text y="13" text-anchor="middle" font-size="7" fill="rgba(255,255,255,0.75)" letter-spacing="0.5">GERÄTE</text>
        <text class="lbl" y="${r + 15}" text-anchor="middle" font-size="11" font-weight="600" stroke-width="4">${esc(short(c.hub.name, 24))}</text></g>`);
    }
    const wlan = m.nodes.filter(n => !hubSet.has(n.id) && n.link === 'WLAN').length;
    const sum = `<div class="topo-sum"><span>${total} Geräte</span>
      <span style="color:${TOPO.LAN.stroke}">● ${total - wlan} LAN</span><span style="color:${TOPO.WLAN.stroke}">● ${wlan} WLAN</span>
      ${others.length ? `<span style="color:${TOPO.ap.stroke}">● ${others.length} Zugangspunkte</span>` : ''}</div>`;
    const z = this._ui.zoom;
    return `${sum}<svg class="topo" viewBox="0 0 ${f(W)} ${f(H)}" role="img" aria-label="Netzwerk-Topologie">
      <g class="zg" transform="translate(${f(z.x)},${f(z.y)}) scale(${z.k})">${parts.join('')}</g></svg>`;
  }

  _renderWlan() {
    const prefix = `${this._config.entity_prefix}_wlan_`;
    // Erwartete IDs (inkl. umbenannter Entitäten aus der Registry)
    const ids = [...new Set([...Object.keys(this._hass.states), ...Object.keys(this._alias || {})])]
      .filter(id => (id.startsWith('switch.') || id.startsWith('sensor.')) && id.split('.')[1].startsWith(prefix))
      .filter(id => this._hass.states[this._resolve(id)])
      .sort();
    // Steuerbarer Schalter (MQTT) hat Vorrang vor dem Nur-Anzeige-Sensor (REST)
    const byIdx = new Map();
    for (const id of ids) {
      const idx = id.split('_').pop();
      if (!byIdx.has(idx) || id.startsWith('switch.')) byIdx.set(idx, id);
    }
    if (byIdx.size === 0) return '';
    const rows = [...byIdx.values()].map(canon => {
      const id = this._resolve(canon);
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
    const icons = {
      incoming: ['↙', 'var(--fp-ok)'], incoming_active: ['↙', 'var(--fp-ok)'], missed: ['✕', 'var(--fp-bad)'],
      rejected: ['⊘', 'var(--fp-warn)'], outgoing: ['↗', 'var(--fp-accent)'], outgoing_active: ['↗', 'var(--fp-accent)'],
    };
    const last = this._st('sensor', 'last_call');
    const recent = last?.attributes?.recent_calls;
    const count = Math.max(1, parseInt(this._config.phone_count, 10) || 5);
    let rows = '';
    if (Array.isArray(recent) && recent.length) {
      rows = recent.slice(0, count).map(c => {
        const [icon, color] = icons[c.type] || ['•', 'var(--fp-text2)'];
        const nr = c.name && c.number ? `<span class="sub">${esc(c.number)}</span>` : '';
        const dur = c.duration_minutes ? ` · ${esc(c.duration_minutes)} min` : '';
        return `<div class="row" data-more="${esc(this._id('sensor', 'last_call'))}" style="cursor:pointer">
          <span style="color:${color};font-size:11px">${icon}</span>
          <span class="name">${esc(c.name || c.number || '—')}${nr}</span>
          <span class="right">${esc(c.date || '—')}${dur}</span></div>`;
      }).join('');
    } else {
      // Ältere Add-on-Versionen ohne recent_calls: die drei Einzelsensoren
      rows = [
        ['last_call', '☎', 'letzter'],
        ['last_missed_call', '✕', 'verpasst'],
        ['last_incoming_call', '↙', 'eingehend'],
      ].map(([suffix, icon, label]) => {
        const st = this._st('sensor', suffix);
        if (!st) return '';
        const a = st.attributes || {};
        const nr = a.number && a.number !== st.state ? `<span class="sub">${esc(a.number)}</span>` : '';
        const color = suffix === 'last_missed_call' ? 'var(--fp-bad)' : 'var(--fp-text2)';
        const dur = a.duration_minutes ? ` · ${esc(a.duration_minutes)} min` : '';
        return `<div class="row" data-more="${esc(this._id('sensor', suffix))}" style="cursor:pointer">
          <span style="color:${color};font-size:11px">${icon}</span>
          <span class="name">${esc(st.state === '-' ? '—' : st.state)}${nr}</span>
          <span class="right">${esc(label)} · ${esc(a.date || '—')}${dur}</span></div>`;
      }).join('');
    }
    if (!rows) return '';
    return this._sec('phone.calls', Array.isArray(recent) ? `${Math.min(count, recent.length)} / ${recent.length}` : '', `<div class="rows">${rows}</div>`);
  }

  // Traffic-Statistik wie auf der Traffic-Seite des Portals: Heute … Vormonat
  _renderTrafficStats() {
    const periods = [['today', 'Heute'], ['yesterday', 'Gestern'], ['week', 'Aktuelle Woche'], ['month', 'Aktueller Monat'], ['last_month', 'Vormonat']];
    // MQTT-Sensoren liefern MB, REST-Sensoren GB – einheitlich lesbar darstellen
    const fmt = (suffix) => {
      const st = this._st('sensor', suffix);
      const v = num(st?.state);
      if (v === null) return null;
      const unit = st.attributes?.unit_of_measurement || 'MB';
      const mb = unit === 'GB' ? v * 1024 : unit === 'KB' ? v / 1024 : v;
      return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(0)} MB`;
    };
    const rows = periods.map(([k, label]) => {
      const dn = fmt(`traffic_${k}_received`), up = fmt(`traffic_${k}_sent`);
      if (dn === null && up === null) return '';
      return `<tr data-more="${esc(this._id('sensor', `traffic_${k}_received`))}" style="cursor:pointer">
        <td>${esc(label)}</td><td class="dn">${esc(dn ?? '—')}</td><td class="up">${esc(up ?? '—')}</td></tr>`;
    }).join('');
    if (!rows) return '';
    return this._sec('traffic.stats', '', `<table class="stats"><thead><tr><th>Zeitraum</th><th>↓ Download</th><th>↑ Upload</th></tr></thead><tbody>${rows}</tbody></table>`);
  }

  // Smart-Home-Geräte, gruppiert nach FRITZ!Box-Gruppe (meist Räume) oder Gerätetyp
  _renderSmartHome() {
    const st = this._st('sensor', 'smarthome');
    const devs = st?.attributes?.devices;
    if (!Array.isArray(devs) || devs.length === 0) return '';
    const mode = this._config.smarthome_group || 'group';
    const keyOf = (d) => mode === 'category' ? (SMARTHOME_CATEGORY[d.category] || SMARTHOME_CATEGORY.other)
      : mode === 'group' ? (d.group || 'Ohne Gruppe') : '';
    const groups = new Map();
    for (const d of [...devs].sort((a, b) => String(a.name).localeCompare(String(b.name), 'de'))) {
      const k = keyOf(d);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(d);
    }
    // Benannte Gruppen alphabetisch, „Ohne Gruppe"/„Sonstige" zum Schluss
    const order = [...groups.keys()].sort((a, b) =>
      (a === 'Ohne Gruppe' || a === 'Sonstige') - (b === 'Ohne Gruppe' || b === 'Sonstige') || a.localeCompare(b, 'de'));
    const value = (d) => {
      const v = [];
      if (d.on === true || d.on === false) v.push(d.on ? 'an' : 'aus');
      if (d.power_w !== null && d.power_w !== undefined && d.on) v.push(`${d.power_w} W`);
      if (d.temperature !== null && d.temperature !== undefined) v.push(`${d.temperature} °C`);
      if (d.target !== null && d.target !== undefined) v.push(`→ ${d.target} °C`);
      if (d.humidity !== null && d.humidity !== undefined) v.push(`${d.humidity} %`);
      if (d.battery_low) v.push('🔋 schwach');
      return v.join(' · ') || '—';
    };
    const body = order.map(k => {
      const rows = groups.get(k).map(d => `<div class="row">
        <span class="dot ${!d.online || d.on === false ? 'off' : d.on === true ? 'wlan' : ''}"></span>
        <span class="name">${esc(d.name)}${d.product && d.product !== d.name ? `<span class="sub">${esc(d.product)}</span>` : ''}</span>
        <span class="right">${esc(value(d))}</span></div>`).join('');
      return `${k ? `<div class="grp">${esc(k)}</div>` : ''}<div class="rows">${rows}</div>`;
    }).join('');
    return this._sec('smarthome', `<span data-more="${esc(this._id('sensor', 'smarthome'))}" style="cursor:pointer">${esc(st.state)}/${esc(st.attributes.total || devs.length)} online</span>`, body);
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
    root.querySelectorAll('[data-tree]').forEach(el => el.addEventListener('click', () => {
      const open = this._ui.treeOpen;
      if (open.has(el.dataset.tree)) open.delete(el.dataset.tree); else open.add(el.dataset.tree);
      this._render();
    }));
    this._bindZoom(root);
    root.querySelectorAll('[data-topo]').forEach(el =>
      el.addEventListener('click', () => { this._ui.topo = el.dataset.topo; this._render(); }));
    root.querySelectorAll('[data-toggle]').forEach(el => el.addEventListener('click', () => {
      this._hass.callService('switch', 'toggle', { entity_id: el.dataset.toggle });
    }));
  }
}

// ── Visueller Editor ──
// Nutzt <ha-form> – dieselbe Komponente wie die eingebauten HA-Karten: native Schalter,
// Auswahllisten und Zahlenfelder, passend zum aktiven Theme.
const EDITOR_LABELS = {
  title: 'Titel',
  ha_style: 'Home-Assistant-Design verwenden (statt FRITZ!Portal-Terminal-Look)',
  theme: 'Hell/Dunkel (nur FRITZ!Portal-Design)',
  hosts_limit: 'Aktive Geräte: Anzahl im eingeklappten Zustand',
  hosts_sort: 'Aktive Geräte: Sortierung',
  phone_count: 'Anrufe: Anzahl der letzten Anrufe',
  smarthome_group: 'Smart Home: Gruppierung',
  topology_view: 'Netzwerk-Grafik: Ansicht beim Laden',
  topology_names: 'Netzwerk-Grafik: Gerätenamen anzeigen',
  topology_clients: 'Mesh-Baum: auch Endgeräte anzeigen',
  sections: '',
};

const EDITOR_SCHEMA = [
  { name: 'title', selector: { text: {} } },
  {
    type: 'expandable', name: 'grp_sections', title: 'Bereiche', flatten: true, expanded: true, icon: 'mdi:view-dashboard-outline',
    // Checkbox-Liste statt einzelner Schalter – deutlich kompakter
    schema: [{ name: 'sections', selector: { select: { multiple: true, mode: 'list',
      options: ALL_SECTIONS.map(k => ({ value: k, label: SECTION_LABELS[k] })) } } }],
  },
  {
    type: 'expandable', name: 'grp_style', title: 'Darstellung', flatten: true, icon: 'mdi:palette-outline',
    schema: [
      { name: 'ha_style', selector: { boolean: {} } },
      { name: 'theme', selector: { select: { mode: 'dropdown', options: [
        { value: 'auto', label: 'Automatisch (wie Home Assistant)' }, { value: 'dark', label: 'Dunkel' }, { value: 'light', label: 'Hell' }] } } },
    ],
  },
  {
    type: 'expandable', name: 'grp_options', title: 'Optionen', flatten: true, icon: 'mdi:tune-variant',
    schema: [
      // flatten: ohne würde ha-form die Werte unter „grp_counts" verschachteln
      { type: 'grid', name: 'grp_counts', flatten: true, schema: [
        { name: 'hosts_limit', selector: { number: { min: 1, max: 200, mode: 'box' } } },
        { name: 'phone_count', selector: { number: { min: 1, max: 20, mode: 'box' } } },
      ] },
      { name: 'hosts_sort', selector: { select: { mode: 'dropdown', options: [
        { value: 'activity', label: 'Zuletzt aktiv zuerst' }, { value: 'ip', label: 'IP-Adresse' }, { value: 'name', label: 'Name' }] } } },
      { name: 'smarthome_group', selector: { select: { mode: 'dropdown', options: [
        { value: 'group', label: 'Nach FRITZ!Box-Gruppe (Räume)' }, { value: 'category', label: 'Nach Gerätetyp' }, { value: 'none', label: 'Keine Gruppierung' }] } } },
      { name: 'topology_view', selector: { select: { mode: 'dropdown', options: [
        { value: 'network', label: 'Netzwerk (Cluster je Zugangspunkt)' }, { value: 'mesh', label: 'Mesh (Baum)' }] } } },
      { name: 'topology_names', selector: { boolean: {} } },
      { name: 'topology_clients', selector: { boolean: {} } },
    ],
  },
];

class FritzPortalCardEditor extends HTMLElement {
  setConfig(config) { this._config = { ...config }; this._update(); }
  set hass(hass) { this._hass = hass; this._update(); }

  // Konfig ↔ Formulardaten (Bereiche in fester Reihenfolge)
  _formData() {
    const c = this._config || {};
    const sections = c.sections || ALL_SECTIONS;
    return {
      title: c.title ?? 'FRITZ!Portal', ha_style: !!c.ha_style, theme: c.theme || 'auto',
      hosts_limit: c.hosts_limit ?? 8, phone_count: c.phone_count ?? 5,
      hosts_sort: c.hosts_sort || 'activity', smarthome_group: c.smarthome_group || 'group',
      topology_view: c.topology_view || 'network', topology_names: !!c.topology_names,
      topology_clients: c.topology_clients !== false,
      sections: ALL_SECTIONS.filter(k => sections.includes(k)),
    };
  }

  _update() {
    if (!this._config || !this._hass) return;
    if (!customElements.get('ha-form')) {
      // ha-form ist noch nicht geladen (z. B. frisches Dashboard): über den Editor einer
      // eingebauten Karte nachladen lassen – der übliche Weg für Custom-Card-Editoren
      if (!this._loading) {
        this._loading = (async () => {
          try {
            const helpers = await window.loadCardHelpers?.();
            const card = await helpers?.createCardElement({ type: 'entities', entities: [] });
            await card?.constructor?.getConfigElement?.();
          } catch { /* Fallback: YAML-Editor bleibt nutzbar */ }
          await customElements.whenDefined('ha-form');
          this._update();
        })();
      }
      return;
    }
    if (!this._form) {
      // ha-form wird von HA spätestens beim Öffnen eines Karten-Editors geladen
      this._form = document.createElement('ha-form');
      this._form.computeLabel = (s) => EDITOR_LABELS[s.name] ?? s.name;
      this._form.addEventListener('value-changed', (e) => {
        const v = e.detail.value;
        const config = { ...this._config };
        // Feste Reihenfolge, unabhängig von der Klick-Reihenfolge
        config.sections = ALL_SECTIONS.filter(k => (v.sections || []).includes(k));
        for (const key of ['title', 'ha_style', 'theme', 'hosts_limit', 'phone_count', 'hosts_sort', 'smarthome_group', 'topology_view', 'topology_names', 'topology_clients']) {
          if (v[key] !== undefined) config[key] = v[key];
        }
        this._config = config;
        this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = EDITOR_SCHEMA;
    this._form.data = this._formData();
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

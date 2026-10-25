# Changelog

## 1.4.7

- New (**Italian** 🇮🇹, PR #36 by [@Mistergatti](https://github.com/Mistergatti) – thank you!): Complete Italian UI, the language pill in the header cycles DE → EN → IT, on first visit the browser language is used (a previously chosen language is kept). Additionally, hard-coded German texts on the System and Traffic pages were made translatable (e.g. reboot message, MQTT note, traffic diagnostics). The Italian texts for the new v1.4.7 features were added. Not taken over: commenting out `image:` in `config.yaml` (the add-on would otherwise be built locally for every user).
- Fix (Traffic page): The "Diagnostics: check available endpoints" button called a non-existent endpoint (`/api/fritz/traffic-raw`) – now implemented; it shows whether `data.lua netCnt` or TR-064 `GetAddonInfos` returns counter values.
- New (**dashboard card for Home Assistant**): FRITZ!Portal ships its own Lovelace card `custom:fritz-portal-card` in the portal's terminal look – sections: system (CPU/RAM/temperature/devices/free IPs with utilisation bars), internet/WAN (status, access type, IPv4/IPv6, DSL sync, uptime), live traffic with 30-min history (from HA history), active devices (search, filters all/LAN/WLAN/guest, sort by activity/IP/name, IP opens the device's web UI), mesh devices (incl. "2/3 online"), WLAN switches and recent calls. Clicking tiles opens the HA more-info dialog; visual editor to show/hide sections; light/dark follows the HA theme. On add-on start the card is **automatically** copied to `/config/www/fritz-portal/` and registered as a Lovelace resource (storage mode; in YAML mode the resource URL is printed to the log). Can be disabled with the new option `dashboard_card: false`. New in `config.yaml` for this: `map: homeassistant_config:rw`.
- New (**mesh topology via the official FRITZ!Box mesh list**, issues #35, #37, #38, #39): The mesh view now primarily uses the TR-064 action `Hosts:1#X_AVM-DE_GetMeshListPath` – the same source as the mesh overview in the FRITZ!Box UI. Repeaters are recognised as real mesh nodes and clients hang under the repeater they are actually connected to (previously everything hung under the master: "FRITZ!Box injected as master (46 orphans connected)"). Each link shows band (2.4/5/6 GHz), link rate and signal strength (dBm); mesh devices additionally show firmware and an update hint; disconnected mesh repeaters are counted. Works without web login (data.lua); the previous web UI cascade stays as fallback for older firmwares. Without a web login the mesh view used to be completely empty – now at least the host list is shown.
- Fix (#37, infrastructure detection): With the official mesh list the mesh role decides instead of the device name – a socket named "Router Plug" no longer shows up as infrastructure. The name heuristic (now only for fallback data) ignores sockets/plugs/lamps.
- New (**host list in a single request**): `/api/fritz/hosts` uses the TR-064 action `X_AVM-DE_GetHostListPath` – the complete device list arrives as one XML file instead of one SOAP request per device (90 devices: 1 instead of 90 requests → noticeably less FRITZ!Box load). The list additionally provides guest, VPN, blocked and update flags plus port/speed. Without a web login the LAN/WLAN classification is now derived from this data (#37: WLAN devices were shown as LAN). Falls back to per-device queries on older firmwares.
- Fix (SOAP parser, affects several features): Response fields containing a hyphen (`NewX_AVM-DE_…`) were dropped by the internal XML parser. As a result, among others, the **6 GHz detection from v1.4.6 (#31) never kicked in**, and `LastActivity` ("last online") was never read from the box. Fixed.
- Fix (#39, WAN "Connecting" without IP on DSL boxes like 7530): PPPoE lines also expose an unused IP connection service that was queried first and reported "Connecting". The active service is now determined via `Layer3Forwarding#GetDefaultConnectionService`; additionally the service that is actually connected is always preferred.
- New (#33, **access type & DSL line values**): Network → WAN now shows the access type (DSL, fiber, cable, mobile/LTE, Ethernet), connection type (PPPoE/IP), external IPv6 address, uptime, line capacity and – for DSL – a dedicated table with sync rate, max. attainable rate, noise margin (colour-rated) and line attenuation. Previously upstream/downstream always showed "-".
- New (**HA sensors for internet, mesh and firmware**, #33 request "sensor DSL up/down for scripts"): `binary_sensor.fritzportal_wan_connected` (internet connection; attributes: status, access type, IPv4/IPv6, uptime), `sensor.fritzportal_wan_access_type`, `sensor.fritzportal_external_ip`, `sensor.fritzportal_dsl_downstream`/`_upstream` (sync rate in Mbit/s), `sensor.fritzportal_mesh_devices` (online mesh devices; attributes with list incl. model, firmware, link, client count) and `binary_sensor.fritzportal_firmware_update` (update available; attributes: installed/new version, release link). Entities are only registered once the box delivers data for them – cable/fiber customers don't get empty DSL sensors. The `active_hosts` attribute of `sensor.fritzportal_online_devices` additionally contains `mac`, `conn` and `guest`.
- New (**firmware update hint**): The System page shows whether a new FRITZ!OS version is available for the FRITZ!Box (incl. link to the release notes) – the box checks with AVM itself, we only read the result (`UserInterface:1#GetInfo`).
- New (**Wake-on-LAN**): "Wake up (WoL)" button in the device detail view – the FRITZ!Box sends the magic packet into the home network itself (`Hosts:1#X_AVM-DE_WakeOnLANByMACAddress`), so it also works from inside the HA container. The detail view additionally shows connection detail, guest/VPN flag, model and update hint.
- New (**device list**): Filter bar (all, online, offline, LAN, WLAN, guest, static IP), `GUEST` badge for devices in the guest network and CSV export of the current view (Excel compatible).
- Fix (#41, call duration too short): AVM delivers the duration as "h:mm" (hours:minutes) – "0:05" means 5 minutes but was read as 5 seconds. The call list now shows "5 min" or "1 h 5 min"; the telephony sensors have a new attribute `duration_minutes`.
- Fix (#34, DECT phones missing on 6690 Cable): Handsets with a custom name (e.g. "Kitchen") were filtered out as soon as the box had smart home devices but the data.lua handset list stayed empty. Entries that cannot be classified are now kept; actuators are additionally recognised by their model. Also, the manufacturer OUI was read as "model" – now the real model (`NewModel`, e.g. "C5") is used, shown as a new column incl. update hint.

### Aligned with the current AVM/FRITZ! interface documentation (2026)

- Fix (**web login per specification**, #31): The PBKDF2 login from v1.4.6 posted its response to `login_sid.lua` without `?version=2` – the box treats it as an MD5 response there and rejects it. GET and POST now both go to `?version=2` (verified against the test vectors in the AVM docs). Additionally: the MD5 fallback encodes characters outside ISO-8859-1 (e.g. "€" in the password) as "." as required, the box's `BlockTime` after failed attempts is respected (no more endless lockout from repeated attempts), and a valid session is reused instead of creating a new one every 5 minutes (AVM recommends one session per box).
- New (**Smart Home REST API**, FRITZ!OS 8.20+): The SmartHome page primarily uses the new official REST API (`/api/v0/smarthome/overview`) – it also knows **Zigbee devices**, battery level, humidity, firmware and update hints. Older firmwares automatically fall back to the AHA interface. The page now shows all readings (temperature, target temperature, humidity, switch state, power, energy), battery (with low-battery warning) and firmware – previously only temperature.
- Fix (**DECT per specification**): `GetDECTInfo` is not a TR-064 action (failed on every box), and `NewConnected`/`NewBatteryChargeStat` do not exist either. Handsets are now fetched in one request via `GetDectListPath`; the DECT id cleanly separates phones (1–6) from DECT ULE actuators (16+) – no name heuristics. Battery/call state are still added from the web UI. The never-populated "PIN" row was removed.
- Fix (**mobile access type**, #33): The specification names `X_AVM-DE_LTE`/`X_AVM-DE_UMTS` – an LTE backup was previously not recognised as mobile.
- New (**live traffic without web login**): The official TR-064 utilisation (`X_AVM-DE_DownstreamCurrentUtilization`) is used as second source after `netMon` – the dashboard live rate and history now work even when the data.lua login fails.
- New (**WAN**): Provider (`X_AVM-DE_GetActiveProvider`), sync and booked tariff rates for all access types (`X_AVM-DE_GetAddonInfos`) and for DSL the error counters (CRC, FEC, errored seconds). The provider is also an attribute of the internet sensor and shown in the card.
- New (**event log**): The System page shows the FRITZ!Box event log with the same filters as the box UI (all, system, internet, telephony, WLAN, USB) – `X_AVM-DE_GetDeviceLogPath`.
- New (**device detail view**): Real-time prioritisation on/off (`X_AVM-DE_SetPrioritizationByIP`), automatic Wake-on-LAN on access from the internet (`X_AVM-DE_Get/SetAutoWakeOnLANByMACAddress`) and the box's device class. The block button respects `X_AVM-DE_HostFilterEditHide` (the box doesn't allow blocking some devices).
- New (**mesh**): Repeaters in the mesh tree are clickable and open their web interface. With multiple links between two nodes (dual band; per AVM even loops are possible) the fastest one is chosen as parent link, powerline links are labelled "PLC" instead of "LAN".
- Improved: The call list is fetched with `max=250` (box default: 999 entries – fetched every minute with telephony sensors enabled).

### Further additions

- New (**HA events for automations**): `fritzportal_new_device` (a previously unknown device appears in the home network; data: `mac`, `ip`, `name`, `interface`, `guest`) and `fritzportal_external_ip_changed` (`old_ip`, `new_ip`). On the very first start only the existing device list is remembered.
- New: "Last online" now survives add-on restarts (the box's host list has no such timestamp – FRITZ!Portal keeps it itself in `/data`).
- New (**keyboard shortcuts**): `1`–`7` switches pages, `/` jumps to the device search, `Esc` goes back to the device list. The footer had been showing shortcuts for a while – they were never implemented.

### Network assignment, interactivity & dashboard

- New (**access point detection – your own routers/access points in the mesh**): The FRITZ!Box only sees devices behind third-party routers or access points (e.g. Xiaomi, TP-Link in AP mode) as LAN devices on the port the router is connected to. FRITZ!Portal now detects such access points automatically (name + several devices on the same LAN port of the box) and places the port's devices underneath – in the mesh tree, network view, device list and HA attributes. An automatically detected router keeps its port; access points marked manually on the same port count as downstream.
- New (**correct connection & assignment**, device details): Connection type (automatic/LAN/WLAN), "connected via" (box or access point) and "is an access point" can be set per device. On the access point itself you can define that its devices connect via WLAN – one setting instead of dozens of individual corrections. The settings live in `/data` and survive add-on updates; cycles (A → B → A) are detected and resolved.
- New (**access profiles / parental control**, device details): Show and change the device's access profile, see today's online time and grant **extra time ("ticket")** – via the TR-064 actions `GetFilterProfiles`, `GetHostEntryByIP`, `AddHostEntryToFilterProfile` and `AddTicketTimeToHostEntryByIP` introduced in 2025. The section only appears if the box supports it for the device.
- New (**network view with one circle per access point**): Instead of a single star, every access point (FRITZ!Box, FRITZ! repeater, own routers) forms its own circle with its devices; the circles arrange themselves around the box without overlapping. **Zoom with the mouse wheel** (around the cursor), pan by dragging, zoom buttons with reset; device names appear automatically when zooming in.
- New (**more interactivity**): HOSTS.ACTIVE entries on the dashboard and nodes in the mesh/network view open the device details (FRITZ! repeaters with a web UI open it); the model, hosts and IP pool tiles lead to the matching page; rows are keyboard-accessible.
- New (**dashboard panels**): "CALLS.RECENT" (latest calls with type, number, duration) and "SMARTHOME.STATUS" (smart home devices with state; on FRITZ!OS 8.20+ most recently active first). Both can be toggled individually under System → Dashboard.
- Improved (device details): The "permanently assign IPv4 address" field is prefilled with the current IP and the last octet is selected on click; the online dot sits right next to "Online"; LAN/WLAN colours now match the rest of the portal (were swapped).
- Fix (dashboard): Long connection texts ("WLAN · mi-routermutti") wrapped over several lines in the LINK column of HOSTS.ACTIVE – the list grew taller than the chart. Now single-line with tooltip.
- Fix (**build**): Old `.gitignore` entries (`src`, `server`, …) applied to all subfolders – new files in `fritz-portal/src` and `fritz-portal/server` would not have made it into the repository and thus not into the build.
- New (local testing/Docker): Credentials can be put in `fritz-portal/.data/options.json` instead of environment variables (same format as the add-on options, ignored by Git); an occupied port 3003 produces a clear message instead of a crash.

### Bug fixes & clean-up from the code review

- Fix (**HA sensors while the portal is closed**): "Devices online", the device-list attributes and "Free IP addresses" were only updated while the portal was open in a browser – the HA push only read caches filled by the browser. The push now fetches the data itself.
- Fix (**server cache**): A cache entry was deleted as soon as a caller with a shorter lifetime read it – e.g. the dashboard (10 s) deleted the device info that the firmware check and MQTT device data wanted to use for an hour; likewise the traffic counters of the HA push. Entries are now only cleaned up periodically.
- Fix (**version in header**): The header still showed "v1.4.5" in v1.4.6 – the version was hard-coded in three places. It is now taken from `package.json` at build time; `/api/fritz/version` always returned "1.1.2" in the Docker image due to a missing file.
- Fix (#40, **static IP in the detail view**): The action `GetSpecificStaticDHCPEntry` is not part of the AVM specification and fails on most boxes – the detail page therefore never showed "permanently assigned". Falls back to the reservation detection of the device list; the unsupported SOAP call is no longer retried after the first failure.
- Fix (detail view, English UI): Error messages were detected by the word "Fehler" – in English ("Error") they showed up green as success. Also added 40+ missing English translations (e.g. "Remove device", "Keep session alive permanently").
- Performance: Concurrent host-list fetches are merged (the devices page fetched it twice for `/hosts` and `/ip-stats`); `LANHostConfigManagement#GetInfo` is cached once for LAN, DHCP and IP statistics; blocking uses the cached IP instead of reloading the full device list; `/network-stats` queries `GetAddonInfos` only once; the background collector polls only one session per tick (previously duplicate history points with several sessions).
- Performance (card): Home Assistant reports every state change of any entity to every card – the FRITZ!Portal card now only re-renders when one of its own entities changes.
- Clean-up: merged the duplicated CPU/RAM parsing and duplicated live-traffic cascade into shared functions; removed dead files `Login.tsx`/`Sidebar.tsx` (called a non-existent endpoint), the unused endpoints `/device-stats` and `/logout`, the unused function `removeMqttDiscovery` and the never-reachable IP branch of `/device/update`.

## 1.4.6

- New (telephony sensors for Home Assistant, opt-in): Three new sensors push call-list highlights to HA – `sensor.fritzportal_last_call` (last call), `sensor.fritzportal_last_missed_call` (last missed call) and `sensor.fritzportal_last_incoming_call` (last accepted incoming call). The sensor value is the name of the remote party (fallback: phone number); details are available as attributes (`number`, `name`, `date`, `duration`, `type`, `device`, `from`, `to`) – perfect for building your own call card in HA. Delivery is dual-path as usual: **MQTT Discovery** (when a broker is reachable) and **REST API fallback** (when enabled). Since not everyone runs telephony through the FRITZ!Box, the sensors are **off by default** – new toggle "Telephony sensors" on the System page or add-on option `ha_phone_sensors`. When disabled, the MQTT discovery configs are removed so no orphaned entities remain in HA. The call list is fetched at most once per minute (shared 60 s cache with the Telephony page).
- New (devices page, offline devices always at the bottom): The device list now always shows all online devices first (sorted by the chosen criterion – name, IP, connection), followed by the offline devices (also sorted). Previously offline devices mixed in with active ones depending on the sort – the overview is much clearer now.
- Fix (#32, duplicate SmartHome devices): FRITZ!Smart Energy 250 (and other devices with sub-units) appeared twice in the SmartHome list because AVM exports the main device and its sub-unit with an AIN suffix ("…-1") as two entries. The dedup key now normalises to the base AIN, merging main device + sub-unit into one entry (readings are merged, generic "HAN-FUN" base names yield to the real unit name) – matching what the FRITZ!Box UI shows.
- Fix (#31/#33, FRITZ!OS 8 boxes like 5690 Pro / 7690 – web login via PBKDF2): The data.lua web login only used the old MD5 challenge scheme. Newer boxes require the PBKDF2 scheme (login version 2) – when the login failed, all data.lua-based values stayed empty: CPU/RAM/temperature 0 %, traffic counters empty, mesh only as host fallback, DHCP fallback dead. `getWebSid()` now requests `login_sid.lua?version=2` and supports both schemes (PBKDF2 challenge "2$…" and classic MD5 for older firmwares).
- Fix (#31, tri-band WLAN / 6 GHz): The WLAN overview assumed the band mapping strictly by index (1 = 2.4 GHz, 2 = 5 GHz, 3 = guest) – wrong on tri-band boxes (5690 Pro: 2.4/5/6 GHz + guest), and the 6 GHz band was missing entirely. The server now queries `X_AVM-DE_GetWLANExtInfo` per WLAN and returns the real frequency band (`_band`); the frontend labels accordingly (fallback: channel heuristic, then index). WLAN indices are also determined dynamically from the services discovered via `tr64desc.xml` instead of a fixed 1–4, and the enabled state is parsed robustly (including `true`/`UP` spellings – previously an active WLAN was sometimes shown as "Inactive").
- Fix (#33, WAN information missing): `/api/fritz/network/wan` now additionally tries the IGD variant `urn:schemas-upnp-org:service:WANIPConnection:1` as a last fallback (works without TR-064 authentication) – helps on boxes whose dslforum WAN services do not respond (7690, 5690 Pro).

## 1.4.5

- New (switch WLAN from Home Assistant): The WLAN toggles available in the portal since v1.4.3 (Network → WLAN, incl. guest access) are now also exposed as HA entities. For each WLAN/SSID a **controllable MQTT switch** `switch.fritzportal_wlan_<N>` is registered in the „FRITZ!Portal" device – letting you turn WLAN on/off straight from the HA dashboard, via automation or voice command. Technically the add-on now opens a **real MQTT broker connection** for the first time (credentials via Supervisor service discovery `GET /services/mqtt`, new dependency `mqtt`) and subscribes to `fritzportal/wlan/+/set`. The existing sensor publishes still run unchanged via the Supervisor proxy – the broker connection is used **only to receive** the switch commands (minimally invasive). Switching uses the already existing TR-064 `SetEnable` path (extracted into the helpers `setWlanEnable()`/`getWlanStates()`). For REST API users (without an MQTT broker) the state appears as a **read-only sensor** `sensor.fritzportal_wlan_<N>` – a controllable switch is technically not possible via the HA REST API. **Prerequisite for switching while the portal is closed:** `keep_session_alive: true` (otherwise there is no FRITZ!Box session) plus write access to „FRITZ!Box settings".
- New (dashboard chart filled instantly, no loading screen): When returning to the Ingress panel the iframe was reloaded; the chart history previously lived only in the browser tab's RAM (`window.__networkHistory`) and was lost → loading screen + half-empty chart. Two measures:
  1. **localStorage persistence (always on, default):** The API cache including the 30-min traffic history is mirrored to `localStorage` and hydrated on startup. The chart appears fully filled immediately on reload, without extra FritzBox load.
  2. **Server-side history, continuous (opt-in):** New option `traffic_history_server` (System page + add-on config, default off). When active, the background collector gathers the download/upload history **continuously** – even while the portal is closed and independently of `keep_session_alive` – so the 30-min history is guaranteed to be gap-free & fresh. For this `/api/fritz/network-stats` additionally returns `serverHistory` (points with real timestamps), which the frontend uses for an instant initial fill. Costs slightly more FritzBox load (only the lightweight traffic poll; the heavier eco/hosts part stays suspended while idle).
- New (device list as a sensor attribute): `sensor.fritzportal_online_devices` now carries the list of active devices in the **`active_hosts`** attribute (each entry has `name`, `ip`, `type` = LAN/WLAN, sorted by last activity) – the sensor value stays the count. This lets you put a device/IP table on the HA dashboard without a separate entity per device (e.g. via `flex-table-card` or a Markdown template). For MQTT via `json_attributes_topic`, for REST as a state attribute. Example YAML in the README.
- Docs (README DE + EN): New section „Using the dashboard features in Home Assistant" – explains the 6 live tiles with sparklines and the sortable `HOSTS.ACTIVE` list, including concrete YAML examples for mini-graph-card sparklines, embedding the active-devices/IP list via an Ingress `iframe` and `sensor.fritzportal_online_devices`, as well as the new WLAN switch (`switch.fritzportal_wlan_…`).

## 1.4.4

- New (HA Sensors, statistics-compatible): The REST-API sensors (`sensor.fritzportal_cpu`, `…_ram`, `…_temperature`, `…_online_devices`, `…_free_ips`, `…_download_speed`, `…_upload_speed` as well as all `…_traffic_<period>_received/sent`) were missing the `state_class`. HA displayed the values but did not include them in long-term statistics – they could not be used in the **Statistics Chart**. System/rate sensors now get `state_class: measurement`, traffic counters get `state_class: total` (matching the MQTT discovery sensors). Forum request (post from May 2026): Make volume sensors displayable as statistics charts.
- Fix (HA Sensors, stable unit for traffic): The REST-API traffic sensors switched dynamically between `MB` and `GB` depending on volume – but HA long-term statistics cannot handle unit changes over time (otherwise data points are discarded or statistics break). Sensors now publish consistently in **GB** (3 decimal places). Background: in statistics charts, the Y-axis unit cannot be changed, GB is the clearer choice for daily/weekly/monthly volumes.
- Fix (#?, Live down/upload stuck at 0 on cable/5G boxes like 6660/6690/**6860 5G**): Live rate on the dashboard (`Internet upstream/downstream`) remained permanently at 0 on some boxes because neither `data.lua?page=netMon → sync_groups` (DSL-specific, not populated on 5G/cable) nor `GetAddonInfos → NewByteReceiveRate/NewByteSendRate` (0 on some cable firmwares) provided anything. As a third level, we now derive the rate from the delta of the monotonically increasing `NewX_AVM_DE_TotalBytesReceived64`/`…Sent64` counter between two collector ticks (30 s); the logic exists both in the background collector and in the on-demand path `/api/fritz/network-stats`. Cache-read TTL for `network-stats` increased to 35 s (matching the collector interval), so browser polls in between don't hit the box again.
- Fix (Supervisor deprecation warning `arch uses deprecated values ['armhf']`): The HA Supervisor app validation has recently warned for every add-on that still lists `armhf` in `config.yaml` – the old 32-bit ARM hardfloat architecture (Raspberry Pi 1/Zero) is being phased out. We build the add-on in the GitHub workflow only for `linux/amd64,linux/arm64,linux/arm/v7` anyway, so we removed `armhf` from `config.yaml` and `build.yaml` and added `armv7` instead (modern 32-bit ARM, covers e.g. RPi 2/3 in 32-bit mode). The warning in the Supervisor log disappears without loss of functionality for real installations.

## 1.4.3

- New (Network → WLAN, guest access on/off): Each WLAN card now has a clickable toggle switch directly next to the `Active`/`Inactive` status. This allows the WLAN guest access (and if needed the main WLANs) to be switched on and off without detouring through the FRITZ!Box web UI. Backend uses TR-064 `WLANConfiguration:N#SetEnable`; the UI does an optimistic update and rolls back the switch on API error. Cache is invalidated so the next status query provides the real state of the box.
- Fix (#30, German translation "Verschlüsselung"): The WLAN page literally showed `Verschlüsselung` in the frontend because the label didn't go through i18n and the Unicode escape remained as a string. Now correctly output as `Verschlüsselung` via `t()`.
- Fix (Telefonie / SmartHome – strict separation of categories): DECT actuators (DECT 200, DECT 301, Comet DECT, RolloTron DECT …) continued to land on the Telefonie page, even though the AHA cross-reference filter from v1.4.2 was already active. Cause: name discrepancies between DECT and AHA lists plus HAN-FUN actuators that some firmwares don't even list in AHA slipped through.
  - New helper `fetchDectClassification(session)` pulls **data.lua?page=dect** and explicitly separates `handsets`/`mobiles` (= actual phones, whitelist) from `devices` (= DECT actuators, additional blacklist). Cached for 60 s.
  - `/api/fritz/dect` now combines three signals: (1) data.lua handsets whitelist (override), (2) AHA SmartHome names + data.lua actors blacklist, (3) `looksLikePhone()` heuristic. Result: on the Telefonie page a DECT entry is *only* displayed if it is explicitly classified as a phone.
  - Stricter name normalization `normDectName()`: lowercase + NFD accent stripping (`ä→a`, `ß→ss`) + alnum-only. So "Comet DECT-Bad" matches between DECT and AHA even if the user has spelled the name differently in one source.
  - `/api/fritz/smartHome` uses the same data.lua handsets whitelist in reverse – phones are removed from SmartHome display, even if `looksLikePhone()` misses them.
  - data.lua fallback in `/api/fritz/dect` no longer mixes `devices` with `handsets`/`mobiles`, but only takes handset lists as phones.
- Fix (#28, Special characters in call list): `&`, umlauts and other HTML entities (`&amp;`, `&auml;`, `&#252;` …) in `<Name>` / `<Caller>` / `<Called>` / `<Device>` from the FRITZ call XML were passed through to the frontend as-is. The `/api/fritz/calls` endpoint now applies the same `decodeXmlEntities` helper that WLAN values have been using since v1.4.1.
- Improved (#20, Mesh topology on 6690/6860 5G & other boxes): Phase-1 endpoints (`meshlist.lua` / `internet/meshlist.lua` / `net/mesh_overview.lua`) and phase-2 data.lua pages now share a common `extractMeshFromJson` parser that finds the topology under `data.topology.nodes`, `data.mesh.nodes`, `meshlist.nodes` etc. Previously `tryUrl()` only recognized `raw.meshlist.nodes` / `raw.nodes` and discarded JSON responses from `mesh_overview.lua` (which 6690/6860 deliver) as empty – the result was fallback to the plain host list instead of the real mesh topology. Additionally: With status 200 but no extractable topology, the set of top JSON keys is now written to the log (`Mesh: page=… extract empty (top=[…] data=[…])`) – this allows adding further box formats without sniffing.
- Documentation (README): Features table in `README.md` and `README_eng.md` supplemented with the areas added since v1.3.9.

## 1.4.2

- Fix (Telefonie / SmartHome – clean separation): DECT actuators (FRITZ!DECT 200 power outlets, DECT 301 heating controllers, Comet DECT, RolloTron DECT …) previously also appeared in the Telefonie tab because `Hosts:1#GetGenericDectEntry` simply returns **all** DECT-registered devices. The `/api/fritz/dect` endpoint now cross-checks the SOAP list against the AHA SmartHome list (authoritative source for smart home actuators) and filters out matching names – the Telefonie tab now truly only shows phones. Conversely, on the SmartHome page a defensive `looksLikePhone` heuristic is applied (productname `FRITZ!Fon …`, name token `Mobilteil`/`Handset`/`MT-D`/…, HAN-FUN bit only without smart home bits), in case a firmware data.lua fallback should deliver phones in the SmartHome list.
- Fix (HA Fritz!SmartHome integration relief): Users reported that the HA-internal **Fritz!Smarthome** integration no longer works once the FRITZ!Portal add-on is running. Cause: the add-on held the `AUTO_SID` session and polled `data.lua?page=netMon` every 30 s plus eco history – even when no one had the portal currently open in the browser. The HA integration reproducibly ran out of session/rate quota on the FRITZ!Box. Two measures:
  1. **Idle detection** in the 30 s background collector: Sessions whose last API call is > 5 min ago AND `keep_session_alive=false` (default) are skipped. An express middleware automatically updates `session.lastUsed` on every `/api` call. Result: once the browser tab is closed, the add-on stops polling the FRITZ!Box within ≤ 5 min – HA gets its slots back. On the next portal call, the first request bumps `lastUsed` and the collector is immediately active again.
  2. **Server cache for `/api/fritz/smartHome`**: 60 s TTL. Per AHA XML call to `homeautoswitch.lua?switchcmd=getdevicelistinfos`, max. 1× per minute now hits instead of at every page visit – this is exactly the endpoint that HA's Fritz!SmartHome integration also uses. The DECT filter (see above) uses the same cache, duplicate AHA hits are eliminated.
  Users who need permanent HA sensor updates can continue to enable `keep_session_alive` on the System page – then the add-on deliberately polls and must share slots with the Fritz integration.
- New (Remove devices): On the Devices page, offline devices can now be deleted directly from the FRITZ!Box host list – e.g. to get rid of old baggage from former guests or replaced devices. Two ways: small `×` to the right of each offline line in the list (for quick bulk cleanup) and a dedicated `Remove device` button at the end of the detail page. Online devices are deliberately grayed out or rejected because the FRITZ!Box refuses to delete them. Backend: new `DELETE /api/fritz/device` endpoint primarily uses TR-064 `Hosts:1#X_AVM-DE_DeleteHost` and falls back to `data.lua?page=netDev&dev=…&btn_del=` on unsupported firmwares. Hosts/netDev cache is immediately invalidated after successful deletion.
- Fix (Layout, footer at bottom of screen): The command hint bar (`$ ready / ↑↓ navigate …`) sat due to a hard `min-height: calc(100vh - 85px - 38px)` on `.main-content` slightly below the fold – you had to scroll 30–40 px to see it. Crutch removed; the `.app` flex layout (`min-height: 100vh`, `.main-content { flex: 1 }`) now automatically ensures that short pages dock the footer cleanly at the viewport bottom.
- New (Typography, TerminalPanel footer): `.tpanel-foot` increased from 11 px to **14 px** – the `MONTH ↓ … ── ↑ …` / `SAMPLE 30s ── N PTS` line at the bottom of the `TRAFFIC.LIVE` panel was barely readable in mono font.
- Fix (FritzBox CPU load): The background collector in the server process polled network throughput (`data.lua?page=netMon`) and eco history every **15 s** – this caused noticeably measurable CPU load on the FRITZ!Box (especially on the 7530). Tick increased to **30 s**; dashboard live polling was simultaneously stepped from 15 s to 30 s (chart footer now shows `SAMPLE 30s`). The 60-point window thus covers 30 min instead of 15 min of history – rather a plus.
- New (Mesh, cache-first): When switching between other pages and "Network", the mesh topology disappeared until the refresh (on some boxes 1–2 min) had run through. Now the last loaded mesh view remains directly visible (`getApiCache('network-mesh')`); the refresh runs transparently in the background and only overwrites when new data arrives. We only show spinners on first call, if any cache exists at all.
- Fix (StatusLine, LOAD removed → Footer): `LAST 0.49 / 0.49 / 0.49` in the status bar was cryptic. The values (1/5/15-min CPU average of the FRITZ!Box) are now right-aligned in the command hint bar as `CPU AVG 1m·5m·15m: …` with tooltip explanation. In return, the previous `theme: SLATE` slot is eliminated – the theme is now uniquely communicated via the `◐ DARK/LIGHT` toggle in the header.
- New (Header logo, larger): `header-logo` now **75 px** tall (previously 35 px), header height extended to 85 px accordingly; `main-content` min-height and sticky `top` of StatusLine adjusted. Mobile (< 768 px): 56 px logo at 70 px header.
- Fix (System page, "Keep session alive" default OFF): The toggle newly introduced in 1.4.2 defaulted to `true`. Since the option means additional background polling of the FRITZ!Box, it is now **disabled by default** – users who need continuous HA sensor updates deliberately enable it via toggle (or add-on config `keep_session_alive: true`). `config.yaml` and server default (`KEEP_SESSION_ALIVE === 'true'`) set accordingly.
- New (Dashboard): `THROUGHPUT.LIVE` panel renamed to **`TRAFFIC.LIVE`**. Function and footer (MONTH ↓/↑, SAMPLE 30 s) unchanged.
- New (Dashboard, HOSTS.ACTIVE): List now sorts by **last activity** (most recently seen first) – previously the order was arbitrary. The `↑↓ SORT` button on the right in the panel header is now a proper button and toggles cyclically between `BY ACTIVITY`, `BY IP` (numerically), and `BY NAME` (alphabetically); the selected mode is shown directly next to the arrows.
- Fix (DeviceDetail load time): Switching from the device list to the detail view took 5–10 s even though the data was cached. Three causes:
  1. Frontend was fetching `/api/fritz/hosts` synchronously even though the cache was warm from the just-left device list – the detail page now hangs directly off the in-memory cache (`getApiCache('hosts')`) and renders immediately.
  2. `/api/fritz/device/blockstate` internally called `getHostsViaSoap()`, which for 70+ devices generated ~70 SOAP requests in 8-device batches = ~5 s just to find the IP for a MAC. The endpoint now first reads the server cache (`getCached('hosts', 60s)`) and also accepts a `&ip=` query param; the frontend sends this directly from the already-known host dataset. The SOAP sweep remains as a fallback, but is practically never triggered in practice.
  3. Block status and DHCP reservation were loaded serially with `await` – now both run in parallel in the background and don't block the UI. Click on device → detail page is virtually instant.
- New (Header logo): The blue gradient `F!` box plus second `fritz!portal` wordmark in the header are replaced by the image logo `src/logo.png` (35 px tall, 30 px on mobile). The version chip to the right remains – the logo already contains the text.
- Fix (Page load time, cache-first on all main pages): Devices, Network, Telefonie and SmartHome now have the same cache-first path as the dashboard – when switching between pages, the last known state is rendered immediately, live data flows in the background. Dashboard spinner is hidden as soon as *any* cached value is available (previously required `device-info` *and* `hosts`); DeviceList calls `setLoading(false)` directly on cache hit, not just after fresh fetch.
- Fix (Telefonie performance): `/api/fritz/dect` and `/api/fritz/calls` now each have 60 s server cache. The SOAP sweep across all DECT handsets and the call list XML download (>5 s on some fritz!boxes) hit only on first visit per minute – subsequent navigations are virtually instant.
- Fix (BUG-05, DECT): Handsets were displayed as offline with gray dot despite registration as soon as the firmware returned neither `NewActive=1` nor a battery level (older 7530 don't deliver battery value in SOAP path). The status dot now depends solely on `registered` – once the handset is in the box configuration, the dot is green. Only actually unregistered devices show the offline dot. The label ("On call / Active / Standby / Unregistered") remains as in 1.4.0.
- Fix (StatusLine WAN): The field behind `WAN` in the sticky status bar below the header remained empty. `/api/fritz/device-info` provides `NewExternalIPAddress` practically never firmware-dependent; the `App.tsx` loader now additionally fetches `/api/fritz/network/wan` (every 120 s, parallel to the existing info poll) and takes the external IP from there.
- New (System page, keep-session-alive): New toggle **"Keep session alive"** in the HA sensors section (default: **on**). When enabled, the FRITZ!Box connection is established at add-on startup (instead of on first browser request to `/api/fritz/auto-session`) and is automatically restored every 60 s if lost. The 15-s background collector thus updates the `eco-stats`/`network-stats`/`hosts` caches and thus also all HA sensors *continuously*, without the portal ever needing to be open in the browser. Persists in `/data/fritz-portal.json`, mirrored to add-on configuration (`config.yaml` → new option `keep_session_alive: true`).
- Fix (System page version display): "FRITZ!Portal v1.4.0" in the system information table was hardcoded and wasn't updated on version change – now updated to 1.4.2.
- New (UI, Redesign): Complete visual refresh to the **TERMINAL.OS** design (Slate · Blue) – dense, technical CLI/hacker layout. Hard 1-px lines instead of soft shadows, almost square corners (3 px) instead of 12 px, 3-px corner ticks (`┌ ┐ └ ┘`) on each stat tile, ASCII ornaments (`┃`, `──`, `●`, `▰`) sparingly as structural aid.
- New (Typography): JetBrains Mono for all data/labels, Inter Tight for main navigation and headlines – included via `<link>` in `index.html` from Google Fonts; fallback to IBM Plex Mono / ui-monospace.
- New (Tokens, src/index.css): Both themes completely new (Dark `#171b22`/`#1a1f28` and Light `#f5f6f8`/`#ffffff`). Single blue accent (`#5aa6ff` dark / `#2b6fd9` light) derived from logo; muted status colors (success/warning/danger/info-cyan/info-pink). `--radius` 12 → 3 px, `--shadow` throughout `none`. Old inline hex values (`#3b82f6`, `#22c55e`, …) in `Network.tsx` and all pages switched to CSS variables.
- New (Header): `Header.tsx` rewritten – 28×28 gradient `F!` mark, wordmark `fritz!portal` (Inter Tight 600, with blue `!`) plus version suffix in mono, sans-serif navigation in mixed case (Dashboard, Devices, …), active tab as dim-accent pill. Theme toggle as `◐ DARK / ◐ LIGHT` pill in mono.
- New (StatusLine): new component `src/components/StatusLine.tsx` as second sticky bar directly under the header. Shows `● SID OK`, `UPTIME 14d 03:22`, `FW <Version>`, `LOAD … / … / …`, `WAN <IPv4>` and right a live clock `13.05.26  14:08:42 ● REC`. Above 900 px width LOAD/WAN/Clock are automatically hidden.
- New (LOAD display, backend): `/api/fritz/eco-stats` additionally provides `load1`, `load5`, `load15` – calculated from `ecoHistory.cpu` as 1/5/15-minute average CPU utilization, normalized to 0..1 (Linux loadavg style, e.g. `0.23 / 0.41 / 0.18`). The values build up automatically once enough data points are collected.
- New (Reusable primitives): `src/components/TerminalPanel.tsx` (box with `┃ TITLE ── subtitle` header + optional footer) and `src/components/StatTile.tsx` (tile with corner ticks, optional SVG sparkline and hint/progress slot).
- New (Dashboard): 6-column stat grid (MODEL / CPU / RAM / TEMP / HOSTS / IP POOL) with live-tracked SVG sparklines (60 points). TRAFFIC.LIVE panel (styled recharts: 1.6-px strokes, dashed grid lines `stroke-dasharray="2 5"`, gradient fills 18% → 0%, mono axes, no dot/animation) with DOWN/UP legend chips and MONTH/SAMPLE footer. HOSTS.ACTIVE panel as compact monospace list with IP tail (`.24`), LINK tag and status dot.
- New (Eco-history modal): rendered in the new `.modal-card` style (1-px border, no radius above 3 px, mono `[ ✕ ]` close); modal line charts adjusted to new axes and tooltip look.
- New (Login/Loading screen): redesigned as `AUTH ── fritz.box` panel – gradient `F!` logo, mono input fields, `$ login --user fritz` buttons, blinking terminal cursor `$ loading▮` replaces global spinner.
- New (Footer): persistent command hint bar at end of page with keyboard hints (`↑↓ navigate / enter open / / search`) and currently active theme.
- New (i18n): Dictionary in `src/lib/i18n.tsx` (from v1.3.9) supplemented with new redesign strings (status slots, dashboard tile labels, panel titles, command hint, modal texts). The DE/EN pill in the header remains functional and switches between languages.
- Fix (Spinner): all occurrences of the CSS spinner (dashboard, device list, device detail, network, traffic, telefonie, smart home, system) replaced by the blinking cursor – consistent loading state across all pages.
- Fix (Stat card migration): stat cards with decorative icons on device, traffic and dashboard pages replaced by `StatTile` with corner ticks and accent variables; the SVG icons of old stat cards are disabled via `display: none`.
- Fix (Tables): global style (`thead th`, `tbody td`) switched to mono, dashed header border, smaller padding (10 px / 9 px) and 12.5 px body font – consistent across all pages.
- Fix (Buttons/Forms): `.btn`, `.btn-primary`, `.btn-outline`, `.btn-danger`, `.form-group input/select/textarea` redefined – mono, 13 px, 3-px radius, focused input gets 1-px accent ring instead of 3-px RGB glow.
- Fix (Responsive): stat grid breaks to 3 columns at 1200 px, to 2 at 600 px; header collapsed below 768 px (smaller padding/font); StatusLine clips LOAD/WAN/Clock below 900 px.

## 1.4.1

- Fix (#25, Call list): Call types were swapped – type 2 is "Missed", type 3 is "Outgoing" (per AVM call XML). UI mapping, filter buttons, and legacy field `number` (caller/called selection) are corrected; additionally type 10 is shown as "Rejected".
- Fix (#17, WLAN): SSIDs with umlauts appeared corrupted. SOAP response values are now passed through an XML entity decoder (`&auml;`, `&#252;` etc.).
- Fix (#19, SmartHome): RolloTron DECT devices appeared twice on the SmartHome page. AHA device list is now deduplicated by `identifier` (AIN); sub-device fields are merged into the main dataset. Dedup also applies to the data.lua fallback.
- Fix (#16, Device list): Statically reserved IPs on 7530 firmware mostly weren't displayed as "FIXED". The reservation list is now additionally fetched from `data.lua?page=netSet/lanExpert` (or SOAP `GetGenericLANHostStaticDHCPEntry` as fallback) and cached for 15 s; devices are marked via MAC match.
- Fix (#21, Dashboard): CPU/RAM/temperature showed 0 on 7590 even though the history graph was correct. `/api/fritz/eco-stats` now reads the 15-s collector cache with 30 s TTL and – if the on-demand path also returns 0 – falls back to the last entry in the `ecoHistory` buffer.

## 1.4.0

- Fix (BUG-05, DECT): Status wording toned down. Some Fritz!Box firmwares report `NewActive=0` even for active handsets in deep sleep standby – the definitive "Switched off" was misleading. New labels: "On call" → "Active / Ready" → **"Standby / Off"** (instead of "Switched off") → "Unregistered". Additionally the status dot is considered green if the box returns a battery level > 0 – that's a reliable sign of life reported even in deep sleep.
- Fix (HA update): Progress display during add-on update stuck at 0%. Cause: without `image:` field in `config.yaml` the supervisor built the image locally from the Dockerfile – local builds have no granularly trackable pull layers. The add-on configuration now points to the multi-arch image pushed by the GitHub workflow to `ghcr.io/jayjojayson/fritz-portal/fritz-portal-addon`, so HA pulls it regularly and displays progress 0–100% correctly.

## 1.3.10

- Fix (BUG-04, Mesh): Mesh queries timed out in 1.3.9 ("Mesh: page=netDev error: timeout"). Cause was the interaction of stricter rate limits (2 parallel data.lua + 400 ms gap) with mesh `timeoutFetch`, whose abort timer started *before* the queue wait – the queue wait in the rate limiter consumed the timeout budget. `timeoutFetch` now first acquires the rate limiter slot via new helper `acquireDataLuaSlot()` and only then starts the abort timer, so the specified 8/15 s are actually available for the HTTP call.

## 1.3.9

- Fix (BUG-05, DECT): Switched-off handsets were incorrectly displayed as active. The status is now derived again from `NewActive`/`NewConnected`; the registration status (handset is in the box's entry list) is tracked separately as `registered`. UI states: "On call" → "Active / Ready" → "Switched off" → "Unregistered" (the latter only appears if the handset is no longer registered).
- New (Call list): Instead of a single "Number" column, **From** and **To** are now displayed separately (Caller/Called from the Fritz call XML), plus a new **Device** column with the DECT/landline port where the call came in or was made. Incoming numbers on missed calls and outgoing numbers on outgoing calls are now directly visible.
- Fix (BUG-02, SmartHome interop): Rate limiter significantly tightened to stabilize parallel use with the Fritz SmartHome integration in Home Assistant. data.lua: max. 2 parallel requests (previously 3), 400 ms minimum gap (previously 300 ms). New: SOAP requests (`:49000`) are limited to max. 6 parallel (previously unlimited). The parallel SOAP host query was reduced from BATCH=15 to BATCH=8 – avoids bursts that can tempt the Fritz!Box to session lock.
- New (Multilingual): The entire interface is now switchable between **German and English**. Top right in the header next to the theme toggle there is a new button (DE/EN) that switches the language and remembers it in `localStorage`. German strings serve as internal keys – if a translation is missing, the German text is displayed as a fallback, so the app remains stable in both languages.

## 1.3.8

- Fix (BUG-05, DECT): Registered DECT handsets were displayed as "Unregistered" despite active use. The SOAP entry `GetGenericDectEntry` lists only registered devices – the registration status is now derived from this instead of `NewActive` (which depending on firmware only reflects momentary reachability and returns 0 in standby mode). Reachability flows into the "Connected / Standby" status.
- Fix (BUG-05, DECT): "DECT active: No" even though handsets are registered. If `GetDECTInfo` fails with UPnPError 401 (e.g. 6690, 7590 AX), the base is now automatically considered active as soon as at least one handset is found.
- Fix (BUG-05, DECT): data.lua fallback recognizes registration status more robustly via broader field check (`state`, `registered`, `connected`, `connect`, `active`) – handsets are listed more reliably.
- Fix (BUG-04, Mesh): Mesh queries broke almost simultaneously with "This operation was aborted". Cause was the data.lua rate limiter (max 3 parallel, 300 ms gap from 1.3.7) – the per-request timers were already running while requests were still in queue. Mesh requests now use a timer that only starts after the rate limiter.
- Fix (BUG-04, Mesh): Per-request timeout increased from 5 s to 15 s (some Fritz!Boxes take significantly longer than 5 s to respond to `data.lua`) and data.lua pages now run serially with early exit (instead of 6× parallel) to avoid rate limiter congestion.
- New (BUG-04, Mesh): `data.lua?page=netDev&xhrId=cleanup` is now the primary source – exactly this page is used by the Fritz web interface itself for the mesh view (provides `data.active` with `mesh_role` and `parent.uid` per device). `normalizeMeshDevices` now also parses the netDev format (UID, ipv4.ip, parent.uid).
- New (BUG-04, Mesh): Additional endpoints `/internet/meshlist.lua?useajax=1`; speculative fallback pages (`meshTopo`, `netTopo`, `hostTopo`) get a shortened 6-s timeout, so unknown pages fail quickly instead of blocking the overall query.
- New (Mesh view): Real tree structure (tidy tree layout) instead of a single horizontal row – master at top, repeaters/satellites as infrastructure layer, clients branch underneath their actual parent. Subtrees are scaled bottom-up, long branches get horizontal scroll instead of overlapping labels.
- New (Mesh view): Nodes are now rounded rectangles with name + IP; color follows legend (master cyan, infrastructure orange, LAN client blue, WLAN client green).
- New (Mesh view): Connection lines run orthogonal (L-shape) in connection type color (LAN blue solid, WLAN green dashed). On hover the path child → parent is highlighted, all others dimmed.
- Fix (Mesh view): Legend in header now shows master, infrastructure, LAN client, WLAN client, LAN line, WLAN line – matching the colors actually drawn (previously master/satellite/client without infrastructure entry).
- Fix (Mesh view): FRITZ!Box is now always displayed as master. Some netDev responses don't include the box itself in `data.active`, so previously a random client (e.g. "Sonoff-NSPanel") was marked as master. If no master flag is found in the response, a master node is synthesized from FritzOS device info (`NewModelName`, host IP) and all orphan nodes are hung under it.
- Fix (Mesh view): Layout is now vertical (indented tree view) – master at top, infrastructure indented below, clients further indented. No more horizontal scrolling needed, even with many devices. Each node shows name + IP + LAN/WLAN badge on right.
- Fix (BUG-08, WLAN/LAN): WLAN detection significantly improved – instead of just `conn_type`, now checks `conn` ("wlan"/"lan"/"guest"), `master_wifi_uid`, `wlan_UIDs`, `rssi`, `wlan_show_rssi`, `port`/`port_name` and nested `wlan` object. Prevents WLAN clients from being incorrectly displayed as LAN devices.
- Fix (Mesh topology): Parent detection now also uses `master_wifi_uid` – WLAN clients are correctly sorted under their WLAN master (FritzBox or repeater) instead of as orphans at the root.
- Fix (BUG-08, Device list): WLAN/LAN labeling on the device page now matches mesh view. The TR-064 SOAP host list reports `Ethernet` for WLAN clients connected via repeater – /api/fritz/hosts now augments each row with netDev info (source: Fritz web interface itself). Both views now show the same number of WLAN and LAN devices.
- New (Device list + Mesh): Connection details are displayed – `LAN 2 → 1 Gbit/s`, `WLAN 2.4 GHz → 58 Mbit/s` etc. Source is the netDev field `conn_info`/`ipinfo` (pre-formatted by FritzOS); if not available, port/band + speed is reconstructed from `port_name`, `wlan_band`, `conn_speed`, `txrate`. In the mesh box the name length adapts dynamically to badge width so nothing overlaps.
- New (internal): Common helpers `deviceIsWlan()` and `formatConnDetail()` – mesh topology and device list now use exactly the same WLAN detection and connection text formatting (no divergence between views). netDev is cached for 15 s in `netdev-map` so hosts and mesh endpoints don't hit the Fritz!Box twice.
- Fix (Dashboard, download/upload): Live rates showed much lower values (e.g. 0.2 Mbit/s instead of actual 105.9 Mbit/s). The background collector previously fetched live values via SOAP `GetAddonInfos` 1-second snapshot, which missed bursts – now `data.lua?page=netMon` is tapped instead (exactly the source the Fritz web interface itself uses for the live graph). `GetAddonInfos` remains as fallback only for counters without netMon data.
- Fix (Dashboard/Traffic): Conversion to decimal Mbit/s (1 Mbit/s = 1,000,000 bit/s) instead of binary Mibit/s – now shows exactly the same numbers as the Fritz!Box UI instead of ~7% offset downward.
- Fix (Device list, FIXED marker): Statically reserved IPs are now recognized much more reliably. TR-064 reports `NewAddressSource = "DHCP"` despite static reservation; the FRITZ!Portal display now reads the flag from the netDev field `static_dhcp` (also `ipv4.static_dhcp`, `is_static`, `dhcp === '2'`) – covers all reservations visible in the Fritz web interface.

## 1.3.7

- Fix (BUG-01/02, Critical): Rate limiter for data.lua requests – maximum 3 parallel requests, 300 ms minimum gap. Prevents Fritz!Box UI blockades and SmartHome offline phases under high load (hopefully)
- Fix (BUG-03/10): Startup warning if Fritz!Box hostname is not resolvable via DNS – clear error message in add-on log instead of silent failure
- Fix (BUG-04): Mesh timeouts reduced from 10 s to 5 s – UI no longer blocks on slow mesh responses
- Fix (BUG-07/08): WLAN loop on network indices 1–4 extended (was 1–3) – guest network and 6 GHz band now queried correctly
- Fix (BUG-09): IP sorting in device list now numeric instead of alphabetical (192.168.1.10 comes after 192.168.1.9)
- Fix (BUG-13): Background timer increased from 10 s to 15 s – fewer parallel Fritz!Box requests, lower system load
- Fix (DECT): DECT handset status now based on `active` field (registered) instead of `connected` (DECT radio connection active) – devices in standby mode no longer shown as "Disconnected", but as "Active / Standby"
- New: Dashboard graph now shows last 15 minutes (60 points at 15 s each); history remains preserved on navigation between pages, not rebuilt
- New: Device list shows "FIXED" badge for statically assigned IP address; offline devices show time since last activity ("Last online") – server-side tracked as fallback if Fritz!Box firmware doesn't provide SOAP field
- New: IP addresses in device list are clickable and open device (web UI) in new browser tab
- New: SmartHome as standalone menu item in main menu; Telefonie shows only DECT and call list
- New: Debug logging mode – all API requests (data.lua, SOAP) are output to add-on log; can be enabled via `debug_logging: true` in add-on configuration or via new toggle in HA sensor settings
- New: `config.yaml` contains `debug_logging: false` as new option with schema definition

## 1.3.6

- New: GitHub Actions workflow – `fritz-portal` folder is automatically attached as ZIP asset on each release
- New: Workflow can also be triggered manually via GitHub Actions (workflow_dispatch)
- Fix: `plan.md` is excluded from repository per `.gitignore`

## 1.3.5

- Fix: MQTT discovery is now ALWAYS executed – the FRITZ!Portal device appears reliably in MQTT in Home Assistant, even if REST API fallback is active
- Fix: Sensor data is always sent via MQTT if broker is reachable – REST API sends additionally if enabled (instead of either/or)
- Fix: `removeMqttDiscovery()` is no longer called on startup – MQTT device remains permanently

## 1.3.4

- Fix: SUPERVISOR_TOKEN was not recognized – `run.sh` now uses `with-contenv` for HA base images (S6 overlay) so token is passed to Node.js
- Fix: Fallback to `HASSIO_TOKEN` for older HA versions
- Fix: `run.sh` automatically detects whether S6 (`with-contenv`) is available – works locally without HA

## 1.3.3

- Fix: REST API fallback toggle in GUI now works immediately – even if MQTT broker is reachable
- Fix: GUI settings are synced to add-on configuration (no restart needed)
- New: Clear mode separation – REST API takes precedence if enabled, else MQTT (prevents blocking by MQTT false positive)
- New: When switching to REST API, MQTT discovery configurations are automatically removed from HA
- New: MQTT discovery counts registered sensors and logs result (e.g. "17/17 sensors registered")
- New: MQTT publish errors now show HTTP response body as well for better diagnosis
- New: `hassio_api: true` – allows add-on to sync configuration via Supervisor API
- New: Hint in GUI that changes take effect immediately without restart

## 1.3.2

- New: MQTT discovery is now always active – sensors are sent to Home Assistant via MQTT by default (no separate switch needed)
- New: REST API fallback – optionally enabled in GUI or add-on configuration for users without MQTT broker
- New: REST API fallback is disabled by default – prevents duplicate entities if MQTT is active
- New: Status display shows if MQTT broker is reachable (green/orange indicator in GUI)
- Fix: MQTT discovery – device name and manufacturer changed to "FRITZ!Portal" (instead of "FRITZ!Box" / "AVM")
- Fix: REST API sensors get `unique_id` – sensors are editable in HA (name, icon, area etc.)
- Fix: MQTT publish and discovery with improved logging – shows in log if broker is reachable
- Fix: HA update progress display stuck at 0% – Dockerfile now uses `BUILD_FROM` (HA base image) for correct build tracking

## 1.3.1 (closed)

- New: MQTT switch (`ha_mqtt`) visible in add-on configuration (config.yaml schema)
- New: REST API sensors get `unique_id` – sensors now editable in HA (name, icon, area etc.)
- Fix: MQTT discovery toggle in GUI now located below interval settings (instead of between)
- Fix: MQTT discovery with improved logging – shows in log if broker is reachable and if sensors were registered
- Fix: MQTT publish errors now logged with HTTP status for better diagnosis

## 1.3.0 (closed)

- New: MQTT discovery as optional toggle on system page – creates a FRITZ!Portal device in HA device overview with editable sensors
- New: REST API and MQTT independently switchable – warning if both active warns of duplicates
- New: When MQTT is disabled, discovery configurations are automatically removed from HA
- Fix: MQTT discovery – device name and manufacturer changed to "FRITZ!Portal" (instead of double "FRITZ!Box" / "AVM")
- Fix: MQTT entity IDs use `fritzportal_*` prefix (via `object_id`)
- Fix: HA update progress display stuck at 0% – Dockerfile now uses `BUILD_FROM` (HA base image) for correct build tracking

## 1.2.9

- New: Color scheme for network view – master turquoise, LAN blue, WLAN green, infrastructure (router/repeater/fritz) orange
- New: Infrastructure detection – devices with "router", "repeater" or "fritz" in name automatically marked as infrastructure devices
- New: Legend and summary show infrastructure devices separately
- New: MQTT discovery – Fritz!Box is registered as separate device in HA device overview (requires MQTT broker) otherwise as before via REST API fallback via setState()
- New: All FRITZ!Portal sensors grouped under one Fritz!Box device (CPU, RAM, temperature, traffic etc.)
- Fix: WebSid timeout increased from 3s to 8s – improved compatibility with 6490 and other cable boxes

## 1.2.8

- New: "Names" button to show/hide device names under bubbles (max 12 characters)
- New: Fritz!Box name and IP displayed in master circle (small, readable) instead of outside up to max 80 devices
- Fix: Fritz!Box no longer appears twice as client device in network diagram

## 1.2.7

- New: Toggle switch "Mesh / Network" next to topology heading – allows switching between mesh view and network view (host fallback)
- New: Radial star layout for network view – Fritz!Box in center, devices arranged in concentric rings, automatically scales for 10–150+ devices
- New: LAN/WLAN connections correctly assigned from interface data – LAN blue solid, WLAN green dashed (instead of all blue)
- New: Hover highlight – hovering a device highlights only its connection line, all others dimmed
- New: WLAN devices get WLAN icon (radio waves), LAN devices monitor icon in node
- New: Summary above diagram shows number of devices online, LAN and WLAN
- New: Tooltip now also shows connection type (LAN/WLAN)
- New: "Names" button to show/hide device names under bubbles (max 12 characters)
- New: Fritz!Box name and IP displayed in master circle (small, readable)
- Fix: Fritz!Box no longer appears twice as client device in network diagram
- Fix: WLAN detection in host fallback now correctly recognizes `802.11` and `Ethernet` (SOAP values)
- Fix: Device limit in host fallback increased from 50 to unlimited

## 1.2.6

- Fix: Static DHCP assignment – data.lua fallback if SOAP returns `401 Invalid Action` (affects 6591, 6490 etc.)
- Fix: Static DHCP deletion – also data.lua fallback
- Fix: Mesh timeout increased from 4s to 10s – some Fritz!Box models respond slower
- New: Mesh logging now shows HTTP status and response length for better diagnosis
- New: Mesh additional pages (`meshSet`, `meshNet`) and `/net/mesh_overview.lua` as alternatives
- New: Mesh fallback from host list – shows Fritz!Box as master with all online clients as network diagram if no real mesh API available

## 1.2.5

- Fix: HA Supervisor warning – `armhf` in `config.yaml` replaced with `armv7` (old value reported as deprecated)
- Fix: HA sensors no longer jump to 0 – last known value retained if cache expires
- Fix: Fritz!Box 6490 – model detection now via `tr64desc.xml` (no login needed) and data.lua fallback
- Fix: Fritz!Box 6490 – IP statistics with data.lua fallback if SOAP returns `606 Action Not Authorized`
- Fix: WAN page – data.lua fallback for WAN IP if both SOAP services unavailable
- Fix: Dashboard tablet view – all 6 stat boxes now displayed in one row
- Fix: Dashboard mobile view – stat boxes in 2 columns (instead of 1), traffic boxes underneath each other

## 1.2.4

- New: All server logs in HA log now have timestamps (e.g. `[08:31:42] Auto-session: Created session`)
- New: README completely revised – logo, screenshot, feature table, step-by-step installation and Docker instructions

## 1.2.3

- Fix: Mesh queries now run in parallel instead of serially – wait time on first call reduced from ~20s to ~4s
- Fix: Negative result (no mesh) cached for 60s – prevents repeated timeouts on each page call

## 1.2.2

- New: Mesh topology visualization in "Overview" tab of network page
- New: SVG diagram shows Fritz!Box devices (master, satellite, clients) with connection lines (LAN/WLAN)
- New: Hover tooltip with IP, MAC and model of each node
- New: Backend endpoint `/api/fritz/mesh` with fallback through multiple `data.lua` pages and `/meshlist.lua`
- Fix: Mesh topology spinner spun endlessly – all fetch calls in `/api/fritz/mesh` endpoint now have 4s timeout (AbortController)
- Fix: Page `overview` removed from mesh search list (too large response, too slow)
- Fix: Frontend safety net: spinner breaks after 25s automatically
- New: Server logging for mesh endpoint (shows which page is tried and error messages)

## 1.2.1

- Change: HA traffic sensors (today/yesterday/week/month/previous month) now transferred in MB or GB – below 1 GiB as MB (2 decimal places), from 1 GiB as GB (3 decimal places)

## 1.2.0

- Fix: Traffic sensors for Home Assistant (today/yesterday/week/month/previous month) were never sent to HA as no background collector existed. `pushTrafficSensorsToHA()` now actively fetches data from FritzBox when cache expires.
- Change: HA sensors `download_speed` and `upload_speed` now transferred in MB/s instead of B/s (rounded to 3 decimal places)

## 1.1.30

- New: FRITZ!Portal logo in header instead of previous text lettering
- New: Add-on icon (`icon.png`) for Home Assistant add-on tile

## 1.1.29

- Fix: Light mode table hover was black-on-black – `--bg-hover` in light mode corrected to `#e8eaed`
- Fix: Fritz!Box 7530 (DSL/PPPoE) – WAN endpoint now tries `WANIPConnection:1` first, then `WANPPPConnection:1` as fallback
- Fix: Fritz!Box 7530 – LAN and DHCP endpoint fall back to `data.lua` if SOAP returns `401 Invalid Action`
- Fix: Eco-stats (CPU/RAM/temperature) – additional pages (`system`, `sysStat`) and field paths for 7530 firmware (`cpuUtil`, `ramUtil`, `memUsage`, `stat.*`)
- Fix: `WANPPPConnection:1` control URL added to discovery fallbacks

## 1.1.28

- Fix: HA sensor push transferred null values – background collector now writes eco-stats and network-stats to API cache
- Fix: pushFastSensorsToHA reads cache with 120s TTL – prevents null values if HA interval longer than standard cache TTL

## 1.1.27

- New: HA sensor settings directly configurable in GUI on system page
- New: Switch to enable/disable sensor push in GUI
- New: Interval for system sensors (CPU, RAM, temp, devices, IPs, download, upload) separately configurable (default: 60 sec)
- New: Interval for traffic sensors (today/yesterday/week/month/previous month) separately configurable (default: 300 sec)
- New: Settings stored in `/data/fritz-portal.json` and retained after restart
- New: Status display shows if HA supervisor is reachable
- Fix: HA sensor push split into two independent timers (system sensors / traffic) for reduced API load

## 1.1.26

- New: HA sensor push – Fritz!Box values automatically provided as Home Assistant sensors
- New: Sensors for CPU, RAM, CPU temperature, devices online, free IPs, live download, live upload
- New: Traffic sensors for today, yesterday, current week, current month and previous month (each download & upload)
- New: Add-on option `ha_sensors` (true/false) to enable/disable sensor push
- New: Add-on option `ha_sensors_interval` (seconds) for query interval (default: 30s)
- Fix: ip-stats endpoint now caches result server-side (30s TTL) – avoids redundant SOAP calls during sensor push

## 1.1.25

- Fix: Theme change (dark/light) no longer triggers page reload – CSS updated reactively per state

## 1.1.24

- Fix: Dashboard shows model, devices and IP stats immediately – eco-stats, traffic and chart load afterward without spinner in background
- Fix: WebSID pre-cached at session start – first eco-stats request no longer hits cold cache

## 1.1.23

- Fix: Dashboard live chart froze after first load – cause was useEffect cleanup bug that destroyed 10s interval prematurely
- Fix: Device list now fetched in parallel instead of sequentially via SOAP (up to 15 simultaneous requests) – load time reduced from ~7s to ~1s
- Fix: Hosts cache TTL increased to 60 seconds (was 10s) – faster page switching
- New: Eco-history period increased from 1h to 3h
- New: Modal title now correctly shows "last 3h"

## 1.1.22

- Fix: DECT SOAP error (401 Invalid Action) no longer blocks data.lua fallback
- New: CPU, RAM and temperature cards on dashboard now clickable
- New: Click opens modal with history graph of last 1 hour
- New: Server collects eco-stats (CPU/RAM/temp) server-side every 10 s for history

## 1.1.21

- Fix: DECT handsets – data.lua fallback now uses page `dect`/`dectReg` instead of `dectSet`; broader search for handset list paths
- Fix: DECT fallback uses cached WebSID (no redundant login anymore)
- New: SmartHome devices retrieved via official AHA HTTP XML interface (fallback: data.lua)
- Fix: WebSID cache – failed logins cached for only 30 s instead of 5 min; enables faster retry
- Fix: Eco-stats (CPU/RAM/temperature) – additional data.lua pages (`ecoStat`) and direct field paths as fallback for different models

## 1.1.20

- Fix: apiFetch - path concatenation for HA ingress and non-ingress corrected

## 1.1.19

- Fix: apiFetch - path concatenation corrected for HA ingress

## 1.1.18

- Fix: DeviceDetail - apiFetch instead of fetch for blockstate and static-dhcp

## 1.1.17

- Fix: Sorting by connection - error on empty interfaces fixed

## 1.1.15

- New: Sorting on device page by name, status, IP address or connection
- Click on column header sorts table ascending or descending

## 1.1.14

- Fix: Browser caching increased to 10 minutes for faster page navigation
- Fix: GitHub Actions updated to Node.js 24
- Fix: Server caching for API responses (10 seconds TTL)
- Fix: Removed double comma in server/package.json

## 1.1.13

- Fix: armv7 architecture added to config.yaml

## 1.1.12

- Fix: Browser caching implemented (30 seconds)
- Version hardcoded on system page (no longer dynamic from server)

## 1.1.11

- New: Browser caching for fast page navigation
- Fix: Server-side caching for all API responses

## 1.1.10

- Fix: Server cache TTL increased to 10 seconds

## 1.1.9

- New: Version hardcoded in frontend (system page)

## 1.1.8

- New: Fourth box "Free IPs" on device page
- Shows last 5 free IP addresses from DHCP range

## 1.1.7

- New: Screenshot added to DOCS.md

## 1.0.0

- First version of FRITZ!Portal Home Assistant add-on
- Dashboard with system overview (CPU, RAM, temperature)
- Device list with detail view
- Network settings (LAN, WAN, WLAN, DHCP)
- Traffic overview (day, week, month, previous month)
- Telefonie (call list, DECT phones)
- System information and restart function
- Automatic login via add-on configuration
- Home Assistant ingress support

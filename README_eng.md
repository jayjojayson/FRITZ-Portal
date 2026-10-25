<p align="center">
  <img src="fritz-portal/icon.png" alt="FRITZ!Portal Logo" width="140"/>
</p>

<p align="center">
  <strong>The modern Fritz!Box dashboard as a Home Assistant App</strong><br/>
  Real-time overview, network topology, HA sensors and more – all in one elegant interface. Easily rename devices, assign new IP addresses or block unwanted hosts directly from the app. Fully integrated into the Home Assistant UI via Ingress.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Home%20Assistant-App-41BDF5?logo=home-assistant&logoColor=white" alt="HA App"/>
  <img src="https://img.shields.io/badge/Version-1.4.9-blue" alt="Version"/>
  <img src="https://img.shields.io/badge/Architecture-amd64%20%7C%20aarch64%20%7C%20armhf-green" alt="Arch"/>
  <img src="https://img.shields.io/badge/License-MIT-lightgrey" alt="License"/>
  <img src="https://img.shields.io/badge/Downloads-25.8K-blue" alt="Downloads"/>
  <a href="README.md"><img src="https://img.shields.io/badge/README-De-lightblue" alt="Deutsch"/></a>
</p>
<p align="center">
If you like the App, I would appreciate a Star rating ⭐ from you. 🤗 
</p>

<div align="center">
  
[![Buy Me a Coffee](https://img.shields.io/badge/Ko--fi-Buy%20Me%20a%20Coffee-darkgreen?style=flat&logo=ko-fi&logoColor=white)](https://ko-fi.com/jayjojayson)
[![Support](https://img.shields.io/badge/%20-Support%20Me-darkgreen?style=flat&logo=paypal&logoColor=white)](https://www.paypal.me/quadFlyerFW)
</div>

<p align="center">
  <img src="fritz-portal/docs/images/screenshot-fritzportal-lite.png" alt="FRITZ!Portal Screenshot" width="800"/>  
  <img src="fritz-portal/docs/images/screenshot-fritzportal-dark.png" alt="FRITZ!Portal traffic" width="800"/> 
  <img src="fritz-portal/docs/images/fritzportal-devices.png" alt="FRITZ!Portal network" width="800"/>
  <img src="fritz-portal/docs/images/fritzportal-device.png" alt="FRITZ!Portal network" width="800"/>
  <img src="fritz-portal/docs/images/fritzportal-mesh.png" alt="FRITZ!Portal network" width="800"/>
  <img src="fritz-portal/docs/images/fritzportal-telefon.png" alt="FRITZ!Portal network" width="800"/>
  <img src="fritz-portal/docs/images/fritzportal-traffic.png" alt="FRITZ!Portal network" width="800"/>
</p>

---

## ✨ Features

| Area | What's included |
|---|---|
| **Dashboard** | 6 live tiles (model, CPU, RAM, temp, hosts, IP pool) with sparklines; `TRAFFIC.LIVE` chart and sortable `HOSTS.ACTIVE` list (by activity / IP / name) |
| **Device List** | All connected hosts with status, IP, MAC, connection type, sorting, search, internet blocking + **delete function for offline devices** |
| **Device Detail** | Rename device (with umlaut sanitiser), reserve a fixed DHCP IP, block/unblock internet, remove device from the FRITZ!Box list |
| **Network** | LAN, WAN, WLAN, DHCP – details at a glance; **Mesh topology visualisation** with mesh and radial network view; **WLAN on/off per SSID** (e.g. guest access); WLAN password editable inline |
| **Traffic** | Live download/upload chart (30 s tick, 30 min history) + statistics for Today, Yesterday, Week, Month, Last Month |
| **Telephony** | Call list (caller/called/device separated, type filter) and DECT handsets – **clean separation from SmartHome** (DECT actors like FRITZ!DECT 200/301 only appear under SmartHome) |
| **SmartHome** | All smart home devices incl. **Zigbee** (FRITZ!OS 8.20+ via the new Smart Home REST API, otherwise AHA) with temperature, target temperature, humidity, switch state, power, energy, battery and firmware |
| **System** | Fritz!Box model, firmware, uptime, serial number, reboot function; HA sensor configuration, debug logging, „keep session alive" and „collect traffic history on the server" toggles |
| **Dashboard card** | Own Lovelace card `custom:fritz-portal-card` in the portal look (system, internet, traffic with history, active devices with search/filter, mesh, WLAN switches, calls) – installed automatically |
| **HA Sensors** | CPU, RAM, temp, devices, free IPs, download, upload, traffic counters – automatically pushed as sensors to Home Assistant (with `state_class` → usable in statistics graphs) |
| **WLAN switches in HA** | Each WLAN/SSID (incl. guest access) is registered as a **controllable switch** (`switch.fritzportal_wlan_…`, via MQTT) or read-only sensor (REST) in HA – turn WLAN on/off straight from the HA dashboard |
| **MQTT Discovery** | Default transfer method: all sensors are registered via MQTT as a grouped „FRITZ!Portal" device in the HA device overview |
| **REST API Fallback** | Optionally enabled for users without an MQTT broker – sensors then appear as individual entities |
| **Languages** | **German / English / Italian** – switchable via the language pill in the header (DE → EN → IT), selection is persisted; on first visit the browser language is used |
| **Dark / Light Mode** | Reactive theme (TERMINAL.OS Slate · Blue) without page reload |
| **Ingress** | Full integration into the Home Assistant interface, no port forwarding required |

---

## 🚀 Installation in Home Assistant

### 1. Add the repository

1. In HA: **Settings → Apps → App Store**
2. Click **⋮ → Custom repositories** in the top right
3. Enter the URL:
   ```
   https://github.com/jayjojayson/FRITZ-Portal
   ```
4. Click **Add** → reload the page

### 2. Install the app

1. Search for **FRITZ!Portal** in the store and open it
2. Click **Install** (the build may take a few minutes)
3. Switch to **Configuration** and enter your credentials:

| Option | Description | Default |
|---|---|---|
| `fritzbox_host` | Hostname or IP of the Fritz!Box | `fritz.box` |
| `fritzbox_user` | Fritz!Box username | – |
| `fritzbox_password` | Fritz!Box password | – |
| `ha_sensors` | Enable REST API fallback (only needed without MQTT broker) | `false` |
| `ha_sensors_interval` | System sensor interval (seconds) | `60` |
| `ha_sensors_traffic_interval` | Traffic sensor interval (seconds) | `300` |
| `ha_phone_sensors` | Enable telephony sensors: last call, last missed call and last incoming call (with number & name) as HA sensors – only useful if telephony runs through the FRITZ!Box | `false` |
| `keep_session_alive` | Keep the FRITZ!Box session permanently open – required for continuous HA sensor updates even when the portal is not actively opened. **Increases load on the FRITZ!Box and can compete with HA's built-in Fritz!SmartHome integration** – only enable when the sensors really must be updated 24/7. **Also required to switch WLAN from HA while the portal is not open.** | `false` |
| `traffic_history_server` | Continuously collect the download/upload history (last 30 min) on the server so the dashboard chart is fully filled immediately when you return – regardless of whether the portal was open. Costs slightly more FRITZ!Box load. Without this option the history is stored in the browser (localStorage) only. | `false` |
| `debug_logging` | Log all API requests (TR-064, data.lua) to the protocol – useful for troubleshooting, otherwise leave off | `false` |
| `dashboard_card` | Copy the dashboard card to `/config/www/fritz-portal/` on start and register it as a Lovelace resource | `true` |

4. **Save → Start**
5. Open via **Web UI** or directly at `http://<ha-ip>:3003`

> **Note:** The app automatically logs in to the Fritz!Box with the configured credentials on startup – no manual login required.

> **Fritz!Box Permissions:** The Fritz!Box user you configure needs the following permissions, otherwise individual sections of the app will not work. Configurable in the **FRITZ!Box UI → System → FRITZ!Box Users → [Edit user]**:
>
> | Permission | Required for |
> |---|---|
> | **FRITZ!Box settings** | Model/firmware, CPU/RAM/temperature, reboot, WLAN configuration (incl. guest access on/off), DHCP reservations, deleting devices from the host list, internet blocking |
> | **Voicemail, fax messages, FRITZ!App Fon and call list** | Call list on the telephony page |
> | **Smart Home** | SmartHome devices (sockets, thermostats, sensors, blinds) |
> | **VPN** | optional, only if the box is reachable via VPN |
>
> Additionally the option **"Allow access for applications"** must be enabled under **Home Network → Network → Network Settings** – otherwise TR-064 requests are rejected with `401 Invalid Action`.

> **MQTT Discovery:** FRITZ!Portal **always sends sensor data via MQTT** to Home Assistant automatically. All sensors are registered as a single **„FRITZ!Portal"** device in the HA device overview, where they can be individually renamed, categorised and used on dashboards.
>
> **No MQTT broker available?** Enable the **REST API fallback** in the app configuration (`ha_sensors: true`) or directly in the FRITZ!Portal GUI. Sensors will then appear as individual entities under *Settings → Entities*. To avoid duplicate entities, only one method should be active at a time.
>
---

## 📊 Using the dashboard features in Home Assistant

The FRITZ!Portal dashboard shows **6 live tiles** (model, CPU, RAM, temperature, hosts, IP pool) with
**sparklines** (small 60-point trend curves right inside the tile), the `TRAFFIC.LIVE` chart below them
and the sortable `HOSTS.ACTIVE` list (switchable **by activity / IP / name** via the `↑↓` button in the
top-right of the panel). This rich view lives inside the portal itself – via **Ingress** it is embedded
directly in the HA interface without any port forwarding.

### FRITZ!Portal dashboard card (v1.4.7+)

FRITZ!Portal ships its own card for your HA dashboards – in the same terminal look as the portal. It is
**installed automatically** when the add-on starts (file copied to `/config/www/fritz-portal/`, registered as a
Lovelace resource). Then pick **"Add card" → "FRITZ!Portal"** in your dashboard or use YAML:

```yaml
type: custom:fritz-portal-card
title: FRITZ!Box                 # optional
sections: [system, wan, traffic, traffic_stats, hosts, mesh, wlan, phone, smarthome]   # optional, fixed order
hosts_limit: 8                   # devices shown while collapsed
hosts_sort: activity             # activity | ip | name
phone_count: 5                   # number of recent calls (1–20, v1.4.8+)
smarthome_group: group           # group (FRITZ!Box groups/rooms) | category (device type) | none
ha_style: false                  # true = Home Assistant's standard design instead of the terminal look
theme: auto                      # auto | dark | light
```

All options can also be set in the card's **visual editor** (native HA controls).

| Section | Content |
|---|---|
| `system` | CPU, RAM, temperature, devices online, free IPs – with utilisation bars, click opens the HA more-info dialog |
| `wan` | Internet status, access type, IPv4/IPv6, DSL sync, uptime |
| `traffic` | Live download/upload in Mbit/s, today's volume and 30-min history from HA history |
| `traffic_stats` | Traffic statistics table: today, yesterday, current week, current month, last month (received/sent) |
| `hosts` | Active devices with search, filter (all/LAN/WLAN/guest) and sorting (activity/IP/name); clicking the IP opens the device's web UI |
| `mesh` | FRITZ!Box and repeaters with model, firmware, link and client count ("2/3 online") |
| `wlan` | WLAN switches (controllable with MQTT, otherwise read-only) |
| `phone` | The most recent calls, count set via `phone_count` (requires `ha_phone_sensors`) |
| `smarthome` | Smart home devices grouped by FRITZ!Box groups (rooms) or device type, with switch state, temperature, power and battery |

Sections without data are hidden automatically. Lovelace in **YAML mode**? Then add the resource yourself:
`url: /local/fritz-portal/fritz-portal-card.js`, `type: module`.

### Embedding sparkline tiles & traffic into your own HA dashboards

The values behind the tiles are available as HA sensors (`sensor.fritzportal_cpu`, `…_ram`,
`…_temperature`, `…_online_devices`, `…_free_ips`, `…_download_speed`, `…_upload_speed`). Since they
carry a `state_class` (as of v1.4.4), they can be used directly in **statistics graphs** and in HA's
**mini-graph / sparkline cards**. Example for a trend tile like in the portal:

```yaml
# requires the HACS card "mini-graph-card"
type: custom:mini-graph-card
name: CPU
entities:
  - sensor.fritzportal_cpu
hours_to_show: 0.5      # 30 min, like the portal sparkline
points_per_hour: 120
line_width: 2
```

### Getting an IP list of active devices onto the HA dashboard

The full `HOSTS.ACTIVE` list (hostname · IP · LAN/WLAN, sortable) is a portal-internal view. Two ways to
surface it in HA:

1. **Embed the Ingress panel (recommended, shows the list 1:1 including sorting):** add an `iframe` card to
   an HA dashboard pointing at the FRITZ!Portal Ingress panel:
   ```yaml
   type: iframe
   url: /hassio_ingress/<YOUR-INGRESS-SLUG>   # take the URL from the opened FRITZ!Portal sidebar entry
   aspect_ratio: 75%
   ```
2. **Count + device list as a sensor:** `sensor.fritzportal_online_devices` provides the number of active
   devices as its **value** (statistics-capable, e.g. for a „devices online over the day" trend) and carries
   the full list of active devices – sorted by last activity – in the **`active_hosts` attribute** (each
   entry has `name`, `ip`, `type` = LAN/WLAN). No separate entity per device needed. Example table from the
   attribute (using the HACS card `flex-table-card`):
   ```yaml
   type: custom:flex-table-card
   title: Active devices
   entities:
     include: sensor.fritzportal_online_devices
   columns:
     - name: Name
       data: active_hosts
       modify: x.name
     - name: IP
       data: active_hosts
       modify: x.ip
     - name: Type
       data: active_hosts
       modify: x.type
   ```
   Or simply as a markdown list without an extra card:
   ```yaml
   type: markdown
   content: >
     {% for h in state_attr('sensor.fritzportal_online_devices','active_hosts') %}
     - **{{ h.name }}** · {{ h.ip }} · {{ h.type }}
     {% endfor %}
   ```

> For the 1:1 view incl. switchable sorting (activity/IP/name) the embedded Ingress view remains the direct
> route; the `active_hosts` attribute is the lightweight way to build your own card without Ingress.

### Switching WLAN from Home Assistant

Each WLAN/SSID (2.4 GHz, 5 GHz, 6 GHz, **guest access**) is registered as a controllable switch
`switch.fritzportal_wlan_<N>` inside the „FRITZ!Portal" device – provided an MQTT broker is set up. This
lets you toggle e.g. the guest network via button, automation or voice command. Without an MQTT broker the
state appears as a read-only sensor `sensor.fritzportal_wlan_<N>` (no switching possible).

> **Prerequisite:** switching requires an active FRITZ!Box session. When the portal is **not** currently
> open in a browser, the switch command is only executed if `keep_session_alive: true` is set. The
> FRITZ!Box user also needs write access to **„FRITZ!Box settings"**.

### Internet, mesh & firmware sensors (v1.4.7+)

| Entity | Content |
|---|---|
| `binary_sensor.fritzportal_wan_connected` | Internet connection on/off – ideal for outage automations; attributes: status, access type, IPv4/IPv6, uptime |
| `sensor.fritzportal_wan_access_type` | Access type: DSL, fiber, cable, mobile (LTE/5G), Ethernet |
| `sensor.fritzportal_external_ip` | External IPv4 address |
| `sensor.fritzportal_dsl_downstream` / `_upstream` | DSL sync rate in Mbit/s (DSL lines only) |
| `sensor.fritzportal_mesh_devices` | Number of connected mesh devices; attribute `devices` with model, firmware, link, clients; `total` incl. disconnected ones |
| `sensor.fritzportal_smarthome` | Number of reachable smart home devices; attribute `devices` with name, group/room, type, switch state, power, energy, temperature, battery (v1.4.8+) |
| `binary_sensor.fritzportal_firmware_update` | FRITZ!OS update available; attributes: installed/new version, release notes link |

Entities only appear once the FRITZ!Box delivers the respective data (e.g. no DSL sensors on cable/fiber).

### Events for automations (v1.4.7+)

| Event | When | Data |
|---|---|---|
| `fritzportal_new_device` | A previously unknown device appears in the home network | `mac`, `ip`, `name`, `interface`, `guest` |
| `fritzportal_external_ip_changed` | The external IPv4 address changed | `old_ip`, `new_ip` |

Example – push notification for a new device:

```yaml
automation:
  - alias: New device on the WLAN
    trigger:
      - platform: event
        event_type: fritzportal_new_device
    action:
      - service: notify.mobile_app_my_phone
        data:
          message: "New device: {{ trigger.event.data.name }} ({{ trigger.event.data.ip }})"
```

On the very first start FRITZ!Portal only remembers the existing devices – events are fired for devices appearing afterwards.

### Telephony sensors: recent calls in Home Assistant (v1.4.6+)

With the **"Telephony sensors"** option (System page or `ha_phone_sensors: true`) FRITZ!Portal pushes
three sensors to Home Assistant – via MQTT Discovery and/or the REST API fallback:

| Sensor | Content |
|---|---|
| `sensor.fritzportal_last_call` | Last call (incoming or outgoing); attribute `recent_calls` with the last 20 calls (v1.4.8+) |
| `sensor.fritzportal_last_missed_call` | Last missed call |
| `sensor.fritzportal_last_incoming_call` | Last accepted incoming call |

The **sensor value** is the name of the remote party (from the FRITZ!Box phone book, fallback: phone
number). Details are available as **attributes**: `number`, `name`, `date`, `duration`, `type`, `device`,
`from`, `to`. Example of a small call card:

```yaml
type: markdown
title: Phone
content: >
  📞 **Last call:** {{ states('sensor.fritzportal_last_call') }}
  ({{ state_attr('sensor.fritzportal_last_call','number') }})
  – {{ state_attr('sensor.fritzportal_last_call','date') }}

  📵 **Missed:** {{ states('sensor.fritzportal_last_missed_call') }}
  ({{ state_attr('sensor.fritzportal_last_missed_call','number') }})
  – {{ state_attr('sensor.fritzportal_last_missed_call','date') }}
```

> The sensors are **disabled by default** since not everyone runs telephony through the FRITZ!Box.
> When disabled, the MQTT entities are automatically removed from HA again. The FRITZ!Box user needs the
> **"Voice messages, fax messages, FRITZ!App Fon and call list"** permission.

---

## 🖥️ Compatible FRITZ!Box Models

FRITZ!Portal works in principle with all FRITZ!Box models that support TR-064 and `data.lua`.
The following models have been tested by users and work well:

| Model | Status | Notes |
|---|---|---|
| FRITZ!Box 7590 | ✅ Good | Fully supported |
| FRITZ!Box 7590 AX | ✅ Good | DECT fix since v1.3.8 |
| FRITZ!Box 7530 | ✅ Good | DSL/PPPoE; mesh view limited (Issue #5) |
| FRITZ!Box 6690 Cable | ✅ Good | DECT fix since v1.3.8 |
| FRITZ!Box 6591 Cable | ✅ Good | Fully supported since DHCP fallback via data.lua since v1.2.6 |
| FRITZ!Box 6490 Cable | ✅ Good | Model detection and IP stats via fallback since v1.2.5 |
| FRITZ!Box 6860 5G | ✅ Good | Problem Download/Upload fix since v1.4.4 |
| FRITZ!Box XXXX | ✅ Good | try your model |

> **Note:** Models not listed here may also work – they simply haven't been explicitly tested yet.

---

## 🐳 Build & test locally with Docker

For development and testing without Home Assistant:

```bash
# Clone the repository
git clone https://github.com/jayjojayson/FRITZ-Portal.git
cd FRITZ-Portal/fritz-portal

# Build the Docker image
docker build -t fritz-portal-app .

# Start the container (auto-login via environment variables)
docker run --rm -p 3003:3003 \
  -e FRITZBOX_HOST=fritz.box \
  -e FRITZBOX_USER=admin \
  -e FRITZBOX_PASSWORD=secret \
  fritz-portal-app
```

Then open in your browser: **http://localhost:3003**

### Frontend development only (Vite Dev Server)

```bash
cd fritz-portal
npm install
npm run dev
```

The dev server runs at **http://localhost:5173** and proxies API requests automatically to the running Express server.

---

## 📋 Changelog

The full version history can be found in [CHANGELOG.md](fritz-portal/CHANGELOG.md).


---

## 🤝 Contributors

| | Contribution |
|---|---|
| [@jayjojayson](https://github.com/jayjojayson) | Development & maintenance |
| [@Mistergatti](https://github.com/Mistergatti) | Italian translation ([#36](https://github.com/jayjojayson/FRITZ-Portal/pull/36)) |

Thanks also to everyone who helped with bug reports and debug logs in the [issues](https://github.com/jayjojayson/FRITZ-Portal/issues). Contributions are welcome – just open a pull request.
---

<p align="center">
  Made with ❤️ for the Home Assistant community
</p>

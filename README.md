<p align="center">
  <img src="fritz-portal/icon.png" alt="FRITZ!Portal Logo" width="140"/>
</p>
<p align="center">
  <strong>Das moderne Fritz!Box Dashboard als Home Assistant App</strong><br/>
  Echtzeit-Übersicht, Netzwerktopologie, HA-Sensoren und mehr – alles in einer eleganten Oberfläche. Ändere bequem Gerätenamen, vergebe neue IP Adressen oder blockiere unerwünschte Hosts direkt aus der App heraus. Vollständig integriert in die Home Assistant Benutzeroberfläche dank Ingress.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Home%20Assistant-App-41BDF5?logo=home-assistant&logoColor=white" alt="HA App"/>
  <img src="https://img.shields.io/badge/Version-1.4.6-blue" alt="Version"/>
  <img src="https://img.shields.io/badge/Architektur-amd64%20%7C%20aarch64%20%7C%20armv7-green" alt="Arch"/>
  <img src="https://img.shields.io/badge/Lizenz-MIT-lightgrey" alt="Lizenz"/>  
  <img src="https://img.shields.io/badge/Downloads-21.7K-blue" alt="Downloads"/>
  <a href="README_eng.md"><img src="https://img.shields.io/badge/README-Eng-lightblue" alt="English"/></a>
</p>
<p align="center">
Wenn euch die App gefällt, würde ich mich über eine Sternebewertung ⭐ freuen. 🤗  
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

| Bereich | Was ist enthalten |
|---|---|
| **Dashboard** | 6 Live-Tiles (Modell, CPU, RAM, Temp, Hosts, IP-Pool) mit Sparklines; `TRAFFIC.LIVE`-Chart und sortierbare `HOSTS.ACTIVE`-Liste (nach Aktivität / IP / Name) |
| **Geräteliste** | Alle verbundenen Hosts mit Status, IP, MAC, Verbindungstyp, Sortierung, Suche, Internet-Sperre + **Lösch-Funktion für Offline-Geräte** |
| **Geräte-Detail** | Name umbenennen (mit Umlaut-Sanitizer), DHCP-IP fest reservieren, Internet sperren/freigeben, Gerät aus FRITZ!Box-Liste entfernen |
| **Netzwerk** | LAN, WAN, WLAN, DHCP – Details auf einen Blick; **Mesh-Topologie-Visualisierung** mit Mesh- und radialer Netzwerk-Ansicht; **WLAN ein/aus pro SSID** (z. B. Gastzugang); WLAN-Passwort direkt änderbar |
| **Traffic** | Download/Upload-Chart live (30 s Takt, 30 min Verlauf) + Statistiken für Heute, Gestern, Woche, Monat, Vormonat |
| **Telefonie** | Anrufliste (Von/An/Gerät getrennt, Typ-Filter) und DECT-Handsets – **saubere Trennung zu SmartHome** (DECT-Aktoren wie FRITZ!DECT 200/301 landen nur noch in SmartHome) |
| **SmartHome** | Übersicht aller AHA-Geräte (Steckdosen, Thermostate, Sensoren, RolloTron) mit Temperatur, Schalter-Status und Leistung |
| **System** | Fritz!Box Modell, Firmware, Uptime, Seriennummer, Neustart-Funktion; HA-Sensoren-Konfiguration, Debug-Logging, „Sitzung dauerhaft halten", „Traffic-Verlauf serverseitig sammeln" |
| **HA-Sensoren** | CPU, RAM, Temp, Geräte, freie IPs, Download, Upload, Traffic-Counter – automatisch als Sensoren in Home Assistant (mit `state_class` → in Statistik-Diagrammen nutzbar) |
| **WLAN-Schalter in HA** | Jede WLAN/SSID (inkl. Gastzugang) wird als **steuerbarer Schalter** (`switch.fritzportal_wlan_…`, via MQTT) bzw. Nur-Anzeige-Sensor (REST) in HA registriert – WLAN direkt vom HA-Dashboard ein-/ausschalten |
| **MQTT Discovery** | Standard-Übertragungsweg: Alle Sensoren werden via MQTT als gruppiertes „FRITZ!Portal"-Gerät in HA registriert |
| **REST-API Fallback** | Optional aktivierbar für Nutzer ohne MQTT-Broker – Sensoren erscheinen dann als einzelne Entitäten |
| **Sprache** | **Vollständig deutsch / englisch** umschaltbar über DE/EN-Pille im Header, Auswahl bleibt persistent |
| **Dark / Light Mode** | Reaktives Theme (TERMINAL.OS Slate · Blue) ohne Reload |
| **Ingress** | Vollständige Integration in die Home Assistant Oberfläche, kein Port-Forwarding nötig |

---

## 🚀 Installation in Home Assistant

### 1. Repository hinzufügen

1. In HA: **Einstellungen → Apps → App Store**
2. Rechts oben auf **⋮ → Benutzerdefinierte Repositories** klicken
3. URL eintragen:
   ```
   https://github.com/jayjojayson/FRITZ-Portal
   ```
4. **Hinzufügen** klicken → Seite neu laden

### 2. App installieren

1. **FRITZ!Portal** im Store suchen und öffnen
2. **Installieren** klicken (Build dauert einige Minuten)
3. Wechsel zu **Konfiguration** und Zugangsdaten eintragen:

| Option | Beschreibung | Standard |
|---|---|---|
| `fritzbox_host` | Hostname oder IP der Fritz!Box | `fritz.box` |
| `fritzbox_user` | Fritz!Box-Benutzername | – |
| `fritzbox_password` | Fritz!Box-Passwort | – |
| `ha_sensors` | REST-API Fallback aktivieren (nur ohne MQTT-Broker nötig) | `false` |
| `ha_sensors_interval` | Intervall Systemsensoren (Sek.) | `60` |
| `ha_sensors_traffic_interval` | Intervall Traffic-Sensoren (Sek.) | `300` |
| `ha_phone_sensors` | Telefonie-Sensoren aktivieren: letzter Anruf, letzter verpasster und letzter eingehender Anruf (mit Nummer & Name) als HA-Sensoren – nur sinnvoll, wenn Telefonie über die FRITZ!Box läuft | `false` |
| `keep_session_alive` | FRITZ!Box-Session permanent offen halten – nötig für kontinuierliche HA-Sensor-Updates auch wenn das Portal nicht aktiv geöffnet ist. **Erhöht die FRITZ!Box-Last und kann mit der HA-eigenen Fritz!SmartHome-Integration konkurrieren** – nur einschalten wenn die Sensoren wirklich rund um die Uhr aktualisiert werden müssen. **Auch Voraussetzung, um WLAN aus HA zu schalten, wenn das Portal nicht geöffnet ist.** | `false` |
| `traffic_history_server` | Den Download-/Upload-Verlauf (letzte 30 min) serverseitig durchgehend sammeln, damit das Dashboard-Chart beim Zurückkehren sofort lückenlos gefüllt ist – unabhängig davon ob das Portal offen war. Kostet etwas mehr FRITZ!Box-Last. Ohne diese Option wird der Verlauf nur im Browser (localStorage) gespeichert. | `false` |
| `debug_logging` | Alle API-Anfragen (TR-064, data.lua) im Protokoll ausgeben – hilfreich zur Fehlerdiagnose, ansonsten ausgeschaltet lassen | `false` |

4. **Speichern → Starten**
5. Via **Benutzeroberfläche** öffnen oder direkt unter `http://<ha-ip>:3003`

> **Hinweis:** Die App meldet sich beim Start automatisch mit den konfigurierten Zugangsdaten an der Fritz!Box an – kein manuelles Login nötig.

> **Fritz!Box Berechtigungen:** Der verwendete Fritz!Box-Benutzer braucht folgende Berechtigungen, sonst funktionieren einzelne Bereiche der App nicht. Einstellbar in der **FRITZ!Box-Oberfläche → System → FRITZ!Box-Benutzer → [Benutzer bearbeiten]**:
>
> | Berechtigung | Wird benötigt für |
> |---|---|
> | **FRITZ!Box-Einstellungen** | Modell/Firmware, CPU/RAM/Temperatur, Neustart, WLAN-Konfiguration (inkl. Gastzugang ein/aus), DHCP-Reservierungen, Geräteliste löschen, Internet-Sperre |
> | **Sprachnachrichten, Faxnachrichten, FRITZ!App Fon und Anrufliste** | Anrufliste auf der Telefonie-Seite |
> | **Smart Home** | SmartHome-Geräte (Steckdosen, Thermostate, Sensoren, Rolladen) |
> | **VPN** | optional, nur falls die Box per VPN erreichbar ist |
>
> Zusätzlich muss unter **Heimnetz → Netzwerk → Netzwerkeinstellungen** die Option **„Zugriff für Anwendungen zulassen"** aktiviert sein – sonst werden TR-064-Anfragen mit `401 Invalid Action` abgelehnt.

> **MQTT Discovery:** FRITZ!Portal sendet Sensordaten **immer automatisch via MQTT** an Home Assistant. Alle Sensoren werden dabei als ein gemeinsames **„FRITZ!Portal"**-Gerät in der HA-Geräteübersicht registriert und lassen sich dort individuell benennen, kategorisieren und auf Dashboards verwenden.
>
> **Kein MQTT-Broker vorhanden?** Den **REST-API Fallback** in der App-Konfiguration (`ha_sensors: true`) oder direkt in der FRITZ!Portal-GUI aktivieren. Die Sensoren erscheinen dann als einzelne Entitäten unter *Einstellungen → Entitäten*. Um doppelte Entitäten zu vermeiden, sollte immer nur eine Methode aktiv sein.
>
---

## 📊 Dashboard-Features in Home Assistant nutzen

Das FRITZ!Portal-Dashboard zeigt **6 Live-Tiles** (Modell, CPU, RAM, Temperatur, Hosts, IP-Pool) mit
**Sparklines** (kleine 60-Punkte-Verlaufskurven direkt in der Kachel), darunter das `TRAFFIC.LIVE`-Chart
und die sortierbare `HOSTS.ACTIVE`-Liste (umschaltbar **nach Aktivität / IP / Name** über den `↑↓`-Button
oben rechts im Panel). Diese reichhaltige Ansicht lebt im Portal selbst – über **Ingress** ist sie ohne
Port-Freigabe direkt in der HA-Oberfläche eingebettet.

### Sparkline-Tiles & Traffic in eigene HA-Dashboards einbinden

Die Werte hinter den Tiles stehen als HA-Sensoren zur Verfügung (`sensor.fritzportal_cpu`,
`…_ram`, `…_temperature`, `…_online_devices`, `…_free_ips`, `…_download_speed`, `…_upload_speed`).
Da sie seit v1.4.4 eine `state_class` tragen, lassen sie sich direkt in **Statistik-Diagramme** und in die
**Mini-Graph-/Sparkline-Karten** von HA ziehen. Beispiel für eine Verlaufskachel wie im Portal:

```yaml
# benötigt die HACS-Karte "mini-graph-card"
type: custom:mini-graph-card
name: CPU
entities:
  - sensor.fritzportal_cpu
hours_to_show: 0.5      # 30 min, wie die Portal-Sparkline
points_per_hour: 120
line_width: 2
```

### IP-Liste der aktiven Geräte aufs HA-Dashboard holen

Die volle `HOSTS.ACTIVE`-Liste (Hostname · IP · LAN/WLAN, sortierbar) ist eine Portal-interne Ansicht.
Zwei Wege, sie in HA sichtbar zu machen:

1. **Ingress-Panel einbetten (empfohlen, zeigt die Liste 1:1 inkl. Sortierung):** eine `iframe`-Karte auf
   ein HA-Dashboard legen, die auf das FRITZ!Portal-Ingress-Panel zeigt:
   ```yaml
   type: iframe
   url: /hassio_ingress/<DEIN-INGRESS-SLUG>   # URL aus der geöffneten FRITZ!Portal-Seitenleiste übernehmen
   aspect_ratio: 75%
   ```
2. **Anzahl + Geräteliste als Sensor:** `sensor.fritzportal_online_devices` liefert als **Wert** die
   Anzahl aktiver Geräte (statistikfähig, z. B. für eine Verlaufskurve „Geräte online über den Tag") und
   trägt die komplette Liste der aktiven Geräte – nach letzter Aktivität sortiert – im **Attribut
   `active_hosts`** (je Eintrag `name`, `ip`, `type` = LAN/WLAN). So braucht es keine eigene Entität pro
   Gerät. Beispiel für eine Tabelle aus dem Attribut (mit der HACS-Karte `flex-table-card`):
   ```yaml
   type: custom:flex-table-card
   title: Aktive Geräte
   entities:
     include: sensor.fritzportal_online_devices
   columns:
     - name: Name
       data: active_hosts
       modify: x.name
     - name: IP
       data: active_hosts
       modify: x.ip
     - name: Typ
       data: active_hosts
       modify: x.type
   ```
   Oder schlicht als Markdown-Liste ohne Zusatzkarte:
   ```yaml
   type: markdown
   content: >
     {% for h in state_attr('sensor.fritzportal_online_devices','active_hosts') %}
     - **{{ h.name }}** · {{ h.ip }} · {{ h.type }}
     {% endfor %}
   ```

> Für die 1:1-Ansicht inkl. umschaltbarer Sortierung (Aktivität/IP/Name) ist die eingebettete
> Ingress-Ansicht weiterhin der direkte Weg; das `active_hosts`-Attribut ist der schlanke Weg für eine
> eigene Karte ohne Ingress.

### WLAN aus Home Assistant schalten

Jede WLAN/SSID (2,4 GHz, 5 GHz, 6 GHz, **Gastzugang**) wird – sofern ein MQTT-Broker eingerichtet ist –
als steuerbarer Schalter `switch.fritzportal_wlan_<N>` im „FRITZ!Portal"-Gerät registriert. Damit lässt
sich z. B. der Gastzugang per Knopf, Automation oder Sprachbefehl ein-/ausschalten. Ohne MQTT-Broker
erscheint der Status als Nur-Anzeige-Sensor `sensor.fritzportal_wlan_<N>` (kein Schalten möglich).

> **Voraussetzung:** Zum Schalten muss eine FRITZ!Box-Session bestehen. Wenn das Portal gerade **nicht**
> im Browser geöffnet ist, wird der Schaltbefehl nur ausgeführt, wenn `keep_session_alive: true` gesetzt
> ist. Außerdem braucht der FRITZ!Box-Benutzer Schreibrecht auf **„FRITZ!Box-Einstellungen"**.

### Telefonie-Sensoren: letzte Anrufe in Home Assistant (ab v1.4.6)

Mit der Option **„Telefonie-Sensoren"** (System-Seite bzw. `ha_phone_sensors: true`) überträgt
FRITZ!Portal drei Sensoren an Home Assistant – via MQTT Discovery und/oder REST-API-Fallback:

| Sensor | Inhalt |
|---|---|
| `sensor.fritzportal_last_call` | Letzter Anruf (egal ob ein-/ausgehend) |
| `sensor.fritzportal_last_missed_call` | Letzter verpasster Anruf |
| `sensor.fritzportal_last_incoming_call` | Letzter angenommener eingehender Anruf |

Der **Sensor-Wert** ist der Name der Gegenstelle (aus dem FRITZ!Box-Telefonbuch, Fallback: Rufnummer).
Details stehen als **Attribute** bereit: `number`, `name`, `date`, `duration`, `type`, `device`, `from`, `to`.
Damit lässt sich z. B. eine kleine Anruf-Card bauen:

```yaml
type: markdown
title: Telefon
content: >
  📞 **Letzter Anruf:** {{ states('sensor.fritzportal_last_call') }}
  ({{ state_attr('sensor.fritzportal_last_call','number') }})
  – {{ state_attr('sensor.fritzportal_last_call','date') }}

  📵 **Verpasst:** {{ states('sensor.fritzportal_last_missed_call') }}
  ({{ state_attr('sensor.fritzportal_last_missed_call','number') }})
  – {{ state_attr('sensor.fritzportal_last_missed_call','date') }}
```

> Die Sensoren sind **standardmäßig deaktiviert**, da nicht jeder Telefonie über die FRITZ!Box nutzt.
> Beim Deaktivieren werden die MQTT-Entitäten automatisch wieder aus HA entfernt. Der FRITZ!Box-Benutzer
> braucht die Berechtigung **„Sprachnachrichten, Faxnachrichten, FRITZ!App Fon und Anrufliste"**.

---

FRITZ!Portal funktioniert grundsätzlich mit allen Fritz!Box-Modellen, die TR-064 und `data.lua` unterstützen.
Die folgenden Modelle wurden von Nutzern getestet und laufen gut:

| Modell | Status | Anmerkungen |
|---|---|---|
| FRITZ!Box 7590 | ✅ Gut | Vollständig unterstützt |
| FRITZ!Box 7590 AX | ✅ Gut | DECT-Fix seit v1.3.8 |
| FRITZ!Box 7530 | ✅ Gut | DSL/PPPoE; Mesh-Ansicht eingeschränkt (Issue #5) |
| FRITZ!Box 6690 Cable | ✅ Gut | DECT-Fix seit v1.3.8 |
| FRITZ!Box 6591 Cable | ✅ Gut | Vollständig unterstützt seit DHCP-Fallback via data.lua seit v1.2.6 |
| FRITZ!Box 6490 Cable | ✅ Gut | Modell-Ermittlung und IP-Stats via Fallback seit v1.2.5 |
| FRITZ!Box 6860 5G | ✅ Gut | Probleme Download/Upload fix seit v1.4.4 |
| FRITZ!Box XXXX | ✅ Good | teste einfach dein Modell |

> **Hinweis:** Modelle, die nicht in dieser Liste stehen, funktionieren möglicherweise ebenfalls – sie wurden nur noch nicht explizit getestet.

---

## 🐳 Lokal mit Docker bauen & testen

Für Entwicklung und Tests ohne Home Assistant:

```bash
# Repository klonen
git clone https://github.com/jayjojayson/FRITZ-Portal.git
cd FRITZ-Portal/fritz-portal

# Docker Image bauen
docker build -t fritz-portal-app .

# Container starten (Auto-Login via Umgebungsvariablen)
docker run --rm -p 3003:3003 \
  -e FRITZBOX_HOST=fritz.box \
  -e FRITZBOX_USER=admin \
  -e FRITZBOX_PASSWORD=geheim \
  fritz-portal-app
```

Danach im Browser öffnen: **http://localhost:3003**

### Nur Frontend entwickeln (Vite Dev Server)

```bash
cd fritz-portal
npm install
npm run dev
```

Der Dev-Server läuft auf **http://localhost:5173** und proxyt API-Anfragen automatisch an den laufenden Express-Server.

---

## 📋 Changelog

Die vollständige Versionshistorie ist in [CHANGELOG.md](fritz-portal/CHANGELOG.md) zu finden.

---

<p align="center">
  Made with ❤️ for the Home Assistant community
</p>

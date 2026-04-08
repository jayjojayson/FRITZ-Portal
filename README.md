<p align="center">
  <img src="fritz-portal/icon.png" alt="FRITZ!Portal Logo" width="140"/>
</p>

<h1 align="center">FRITZ!Portal</h1>

<p align="center">
  <strong>Das moderne Fritz!Box Dashboard als Home Assistant Add-on</strong><br/>
  Echtzeit-Übersicht, Netzwerktopologie, HA-Sensoren und mehr – alles in einer eleganten Oberfläche. Ändere bequem Gerätenamen, vergebe neue IP Adressen oder blockiere unerwünschte Hosts direkt aus dem Add-on heraus. Vollständig integriert in die Home Assistant Benutzeroberfläche dank Ingress.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Home%20Assistant-Add--on-41BDF5?logo=home-assistant&logoColor=white" alt="HA Add-on"/>
  <img src="https://img.shields.io/badge/Version-1.2.3-blue" alt="Version"/>
  <img src="https://img.shields.io/badge/Architektur-amd64%20%7C%20aarch64%20%7C%20armv7-green" alt="Arch"/>
  <img src="https://img.shields.io/badge/Lizenz-MIT-lightgrey" alt="Lizenz"/>
</p>

<p align="center">
  <img src="fritz-portal/docs/images/screenshot.png" alt="FRITZ!Portal Screenshot" width="800"/>
</p>

---

## ✨ Features

| Bereich | Was ist enthalten |
|---|---|
| **Dashboard** | Live-Anzeige von CPU, RAM, Temperatur mit Verlaufsgraph (3h) |
| **Geräteliste** | Alle verbundenen Hosts mit Status, IP, MAC, Verbindungstyp und Blockier-Funktion |
| **Netzwerk** | LAN, WAN, WLAN, DHCP – Details auf einen Blick; Mesh-Topologie-Visualisierung |
| **Traffic** | Download/Upload-Chart live + Statistiken für Heute, Gestern, Woche, Monat, Vormonat |
| **Telefonie** | Anrufliste und DECT-Handsets |
| **System** | Fritz!Box Modell, Firmware, Uptime, Neustart-Funktion |
| **HA-Sensoren** | Automatischer Push von CPU, RAM, Temp, Geräte, IPs, Download, Upload, Traffic in Home Assistant |
| **Dark / Light Mode** | Reaktives Theme ohne Reload |
| **Ingress** | Vollständige Integration in die Home Assistant Oberfläche |

---

## 🚀 Installation in Home Assistant

### 1. Repository hinzufügen

1. In HA: **Einstellungen → Add-ons → Add-on Store**
2. Rechts oben auf **⋮ → Benutzerdefinierte Repositories** klicken
3. URL eintragen:
   ```
   https://github.com/jayjojayson/FRITZ-Portal
   ```
4. **Hinzufügen** klicken → Seite neu laden

### 2. Add-on installieren

1. **FRITZ!Portal** im Store suchen und öffnen
2. **Installieren** klicken (Build dauert einige Minuten)
3. Wechsel zu **Konfiguration** und Zugangsdaten eintragen:

| Option | Beschreibung | Standard |
|---|---|---|
| `fritzbox_host` | Hostname oder IP der Fritz!Box | `fritz.box` |
| `fritzbox_user` | Fritz!Box-Benutzername | – |
| `fritzbox_password` | Fritz!Box-Passwort | – |
| `ha_sensors` | HA-Sensor-Push aktivieren | `true` |
| `ha_sensors_interval` | Intervall Systemsensoren (Sek.) | `60` |
| `ha_sensors_traffic_interval` | Intervall Traffic-Sensoren (Sek.) | `300` |

4. **Speichern → Starten**
5. Via **Benutzeroberfläche** öffnen oder direkt unter `http://<ha-ip>:3003`

> **Hinweis:** Das Add-on meldet sich beim Start automatisch mit den konfigurierten Zugangsdaten an der Fritz!Box an – kein manuelles Login nötig.

---

## 🐳 Lokal mit Docker bauen & testen

Für Entwicklung und Tests ohne Home Assistant:

```bash
# Repository klonen
git clone https://github.com/jayjojayson/FRITZ-Portal.git
cd FRITZ-Portal/fritz-portal

# Docker Image bauen
docker build -t fritz-portal-addon .

# Container starten (Auto-Login via Umgebungsvariablen)
docker run --rm -p 3003:3003 \
  -e FRITZBOX_HOST=fritz.box \
  -e FRITZBOX_USER=admin \
  -e FRITZBOX_PASSWORD=geheim \
  fritz-portal-addon
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

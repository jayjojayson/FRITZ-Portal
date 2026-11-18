# FRITZ!Portal

[![GitHub Stars](https://img.shields.io/github/stars/jayjojayson/FRITZ-Portal?style=flat&logo=github&label=Stars&color=yellow)](https://github.com/jayjojayson/FRITZ-Portal/stargazers)
[![Version](https://img.shields.io/badge/dynamic/yaml?url=https%3A%2F%2Fraw.githubusercontent.com%2Fjayjojayson%2FFRITZ-Portal%2Fmain%2Ffritz-portal%2Fconfig.yaml&query=%24.version&label=Version&color=blue)](https://github.com/jayjojayson/FRITZ-Portal/blob/main/fritz-portal/CHANGELOG_de.md)
[![README Deutsch](https://img.shields.io/badge/README-Deutsch-orange)](https://github.com/jayjojayson/FRITZ-Portal)
[![README English](https://img.shields.io/badge/README-English-orange)](https://github.com/jayjojayson/FRITZ-Portal/blob/main/README_eng.md)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Buy%20Me%20a%20Coffee-darkgreen?style=flat&logo=ko-fi&logoColor=white)](https://ko-fi.com/jayjojayson)

**Das moderne FRITZ!Box-Dashboard für Home Assistant.** FRITZ!Portal zeigt dir alles Wichtige deiner FRITZ!Box auf einen Blick – Auslastung, Traffic, Geräte, Mesh, Anrufe und Smart Home – und bringt die Werte als Sensoren, Schalter und Events nach Home Assistant. Gerätenamen ändern, feste IP-Adressen vergeben oder einem Gerät das Internet sperren geht direkt aus der Oberfläche, ohne die FRITZ!Box-Seite zu öffnen. Dank Ingress läuft alles in der Seitenleiste von Home Assistant, ohne Portfreigabe.

*🇬🇧 A modern FRITZ!Box dashboard for Home Assistant – live status, devices, mesh, traffic, calls and smart home, plus sensors, switches and events for your automations. German, English and Italian.*

![FRITZ!Portal Dashboard](https://raw.githubusercontent.com/jayjojayson/FRITZ-Portal/main/fritz-portal/docs/images/screenshot-fritzportal-dark.png)

## Was FRITZ!Portal kann

- 📊 **Dashboard** – CPU, RAM, Temperatur, Geräte und IP-Pool mit Verlauf, Live-Traffic, aktive Geräte, letzte Anrufe und Smart-Home-Status
- 💻 **Geräte** – alle Geräte mit Suche und Filter; umbenennen, IPv4 fest zuweisen, Zugangsprofil wählen, Internet sperren
- 🕸️ **Netzwerk** – Mesh-Topologie als Baum oder Netzwerk-Grafik, WLAN je Funknetz ein/aus (z. B. Gastzugang), LAN, WAN und DHCP
- 📈 **Traffic** – Online-Zähler (Heute bis Vormonat) und Online-Monitor wie in der FRITZ!Box
- ☎️ **Telefonie & 🏠 SmartHome** – Anrufliste, DECT-Telefone und alle Smart-Home-Geräte inkl. Zigbee
- 🧩 **Dashboard-Card** – eigene Lovelace-Karte im Portal-Look oder im HA-Design, wird automatisch installiert
- 🔌 **Home-Assistant-Integration** – Sensoren per MQTT, WLAN-Schalter, Internetzugang und Wake-on-LAN je Gerät, Telefonie-Sensoren, Events bei neuen Geräten oder neuer externer IP
- 🎨 **Zwei Designs** – Terminal-Look oder Home-Assistant-Design, jeweils hell und dunkel; Deutsch, Englisch, Italienisch

## Eindrücke

![Geräteliste](https://raw.githubusercontent.com/jayjojayson/FRITZ-Portal/main/fritz-portal/docs/images/fritzportal-devices.png)

![Mesh-Topologie](https://raw.githubusercontent.com/jayjojayson/FRITZ-Portal/main/fritz-portal/docs/images/fritzportal-mesh.png)

![Dashboard-Card](https://raw.githubusercontent.com/jayjojayson/FRITZ-Portal/main/fritz-portal/docs/images/fritzportal-card-dark.png)

## In drei Schritten loslegen

1. Unter **Konfiguration** Adresse, Benutzer und Passwort der FRITZ!Box eintragen.
2. App **starten**.
3. Über die **Seitenleiste** oder „Benutzeroberfläche öffnen" aufrufen.

Welche Rechte der FRITZ!Box-Benutzer braucht, was die Optionen bedeuten und wie du die Card und die Sensoren nutzt, steht im Reiter **Dokumentation**.

---

Gefällt dir FRITZ!Portal? Dann freue ich mich über einen ⭐ auf [GitHub](https://github.com/jayjojayson/FRITZ-Portal). Fragen, Ideen und Fehler gern als [Issue](https://github.com/jayjojayson/FRITZ-Portal/issues).

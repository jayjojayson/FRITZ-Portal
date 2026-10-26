# FRITZ!Portal — Home Assistant Add-on

Dashboard für Ihre FRITZ!Box, direkt in Home Assistant integriert.

<img width="80%" height="auto" alt="FRITZ!Portal" src="https://github.com/jayjojayson/FRITZ-Portal/blob/main/fritz-portal/docs/images/screenshot.png" />

## Funktionen

- **Dashboard**: Übersicht über FRITZ!Box-Status, CPU, RAM, Temperatur, aktueller Traffic
- **Geräte**: Alle verbundenen Geräte anzeigen und verwalten, inkl. freie IP-Adressen
- **Netzwerk**: LAN, WAN, WLAN-Einstellungen einsehen und ändern
- **Traffic**: Datenverbrauch (Tag, Woche, Monat, Vormonat)
- **Telefonie**: Anrufliste und DECT-Telefonie
- **System**: FRITZ!Box-Informationen, Neustart, FRITZ!Portal Version

## Installation

1. Dieses Repository als Custom Repository in Home Assistant einbinden:
   - Einstellungen → Add-ons → Add-on Store → ⋮ → Benutzerdefinierte Repositories
   - URL: `https://github.com/jayjojayson/FRITZ-Portal`
2. **FRITZ!Portal** im Store finden und installieren
3. Konfiguration ausfüllen (siehe unten)
4. Add-on starten und über die Seitenleiste öffnen

## Konfiguration

| Option | Typ | Beschreibung | Beispiel |
|--------|-----|-------------|----------|
| `fritzbox_host` | string | Hostname oder IP der FRITZ!Box | `fritz.box` oder `192.168.178.1` |
| `fritzbox_user` | string | Benutzername für die FRITZ!Box | `Admin` |
| `fritzbox_password` | string | Passwort des Benutzers | `Geheim` |

### FRITZ!Box Benutzer einrichten

1. FRITZ!Box-Oberfläche öffnen (`http://fritz.box`)
2. **System → FRITZ!Box-Benutzer** → Neuen Benutzer anlegen
3. Berechtigungen: **Zugriff auf NAS-Inhalte**, **Sprachnachrichten**, **Smart Home**, **FRITZ!App-Anmeldung**
4. Benutzername und Passwort im Add-on eintragen

## So werden die Daten abgerufen

- FRITZ!Portal nutzt zuerst die **offizielle Schnittstelle TR-064**. Die **Weboberfläche** der Box ergänzt nur, was TR-064 nicht liefert (z. B. CPU/RAM/Temperatur, Traffic-Zähler, feste IP-Adressen) – gedrosselt auf höchstens 2 gleichzeitige Abfragen.
- Daten werden kurz zwischengespeichert (15–60 s); das Panel zeigt beim Öffnen sofort die zuletzt geladene Ansicht und aktualisiert im Hintergrund.
- HA-Sensoren: System alle 60 s, Traffic alle 300 s; Mesh, Firmware und die Netzwerk-Grafik der Card erstmals ca. 45 s nach dem Start.
- **Feste IP-Adressen erscheinen nach und nach:** Aktuelle FRITZ!OS-Versionen melden sie nur pro Gerät. FRITZ!Portal fragt das im Hintergrund ab (ab ca. 60 s nach dem Start, nur wenn sonst nichts ansteht), speichert das Ergebnis dauerhaft und frischt es alle 12 h auf. Die Gerätedetails fragen immer frisch ab; Zuweisen/Entfernen im Panel wirkt sofort.
- Mit **„Sitzung dauerhaft aktiv halten"** laufen Sensoren und Hintergrund-Abgleich auch ohne geöffnetes Panel.

Ausführlich: [README – So holt FRITZ!Portal die Daten](https://github.com/jayjojayson/FRITZ-Portal#-so-holt-fritzportal-die-daten-von-der-fritzbox)

## Support

Bei Problemen: https://github.com/jayjojayson/FRITZ-Portal/issues

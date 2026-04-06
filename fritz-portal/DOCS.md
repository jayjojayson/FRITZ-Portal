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
| `fritzbox_user` | string | Benutzername für die FRITZ!Box | `admin` |
| `fritzbox_password` | string | Passwort des Benutzers | `geheim` |

### FRITZ!Box Benutzer einrichten

1. FRITZ!Box-Oberfläche öffnen (`http://fritz.box`)
2. **System → FRITZ!Box-Benutzer** → Neuen Benutzer anlegen
3. Berechtigungen: **Zugriff auf NAS-Inhalte**, **Sprachnachrichten**, **Smart Home**, **FRITZ!App-Anmeldung**
4. Benutzername und Passwort im Add-on eintragen

## Support

Bei Problemen: https://github.com/jayjojayson/FRITZ-Portal/issues

# FRITZ!Portal

Home Assistant Add-on für die Verwaltung und Überwachung von FRITZ!Box-Geräten.

## Installation

1. Öffne Home Assistant und navigiere zu **Settings** → **Add-ons** → **Add-on Store**
2. Klicke auf das **⋮ (Menü)**-Symbol oben rechts und wähle **Repositories**
3. Füge diese URL hinzu: `https://github.com/jayjojayson/FRITZ-Portal`
4. Speichere und aktualisiere
5. Das Add-on **FRITZ!Portal** sollte jetzt verfügbar sein
6. Klicke darauf und installiere es

## Konfiguration

Nach der Installation musst du folgende Parameter einstellen:

- **FRITZ!Box Host**: Die IP oder der Hostname deiner FRITZ!Box (Standard: `fritz.box`)
- **Benutzer**: Der Admin-Benutzer der FRITZ!Box (Standard: `admin`)
- **Passwort**: Das Passwort für deinen FRITZ!Box-Admin-Benutzer

## Zugriff

Das Add-on ist über das Home Assistant Dashboard über **Ingress** (ohne extra Port) erreichbar.

Alternativ kannst du es auch direkt aufrufen: `http://homeassistant.local:3003`

## Unterstützte Architekturen

- aarch64
- amd64
- armv7
- armhf
- i386

## Lizenz

Siehe LICENSE

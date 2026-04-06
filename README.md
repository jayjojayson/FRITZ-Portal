# FRITZ!Portal — Home Assistant Add-on Repository

Dieses Verzeichnis enthält die **korrigierte** Home Assistant Add-on Infrastruktur für **FRITZ!Portal**.

## Inhaltsverzeichnis

```
ha-addon-fixed/
  README.md               ← Diese Datei
  fritz-portal/
    config.yaml           ← Add-on Metadaten & Konfigurationsoptionen
    build.yaml            ← Multi-Architektur Build-Bases
    Dockerfile            ← Multi-Stage Build (Frontend + Server)
    run.sh                ← Container-Startskript
    DOCS.md               ← Dokumentation (wird in HA-UI angezeigt)
    CHANGELOG.md          ← Versionshistorie
    server/
      index.js            ← Express Proxy Server
      package.json        ← Server Dependencies
    package.json          ← Frontend Dependencies
    vite.config.ts        ← Vite Konfiguration
    tsconfig.json         ← TypeScript Konfiguration
    index.html            ← Frontend Entry Point
    src/                  ← React Frontend Source
```

## Behobene Probleme (vs. ursprüngliches ha-addon/)

1. **`AUTO_SID` nicht definiert** — Der logout handler referenzierte eine nicht existierende Variable
2. **Doppelter `/api/fritz/logout` endpoint** — Zwei Definitionen desselben Endpoints
3. **Server lauschte nur auf `localhost`** — Muss auf `0.0.0.0` hören für Docker/HA
4. **Fehlende HA Add-on Dateien** — Dockerfile, config.yaml, run.sh, build.yaml, DOCS.md, CHANGELOG.md

## Lokal bauen & testen

```bash
cd ha-addon-fixed/fritz-portal
docker build -t fritz-portal-addon .

# Testen (Auto-Login via Env-Vars):
docker run --rm -p 3003:3003 \
  -e FRITZBOX_HOST=fritz.box \
  -e FRITZBOX_USER=admin \
  -e FRITZBOX_PASSWORD=geheim \
  fritz-portal-addon

# Browser öffnen: http://localhost:3003
```

## Als Custom Repository in Home Assistant einbinden

1. Dieses Verzeichnis (`ha-addon-fixed/`) in ein **eigenes GitHub-Repository** kopieren
2. In HA: **Einstellungen → Add-ons → Store → ⋮ → Benutzerdefinierte Repositories**
3. URL des neuen Repos einfügen
4. Add-on "FRITZ!Portal" erscheint im Store → Installieren → Konfigurieren → Starten

## Konfiguration

Nach der Installation in den Add-on-Optionen eintragen:

| Option | Beschreibung |
|--------|-------------|
| `fritzbox_host` | Hostname/IP der Fritz!Box (Standard: `fritz.box`) |
| `fritzbox_user` | Fritz!Box-Benutzername |
| `fritzbox_password` | Fritz!Box-Passwort |

Das Add-on meldet sich beim Start automatisch an der Fritz!Box an.

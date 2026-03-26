# Changelog — FRITZ!Portal Add-on

## 1.0.0 (2026-03-26)

### Neu
- Initiale Veröffentlichung als Home Assistant Add-on
- **Auto-Login**: Fritz!Box-Zugangsdaten aus Add-on-Optionen (`/data/options.json`) werden beim Start automatisch eingelesen — kein manuelles Einloggen nötig
- **HA Ingress-Unterstützung**: Vollständige Integration ins HA-Dashboard über den Ingress-Proxy; der Basispfad (`X-Ingress-Path`) wird als `window.__INGRESS_PATH__` ins Frontend injiziert
- Dockerfile mit Multi-Stage-Build: Frontend (Vite/React) und Server (Express) werden in einem einzigen `docker build`-Aufruf erzeugt
- `build.yaml` für Multi-Architektur-Support (amd64, aarch64, armv7, armhf, i386) via `node:20-alpine`
- Cable-Modell-Patch (`patch-fritzbox.mjs`) wird automatisch beim Image-Build angewendet

### Basiert auf FRITZ!Portal
Alle Features des FRITZ!Portal-Projekts sind enthalten:
- Dashboard mit Live-Netzwerkauslastung und Monatsverbrauch
- Geräteliste mit IP-Statistik, LAN/WLAN-Erkennung
- Gerätedetail: Hostname, feste IP, Internet sperren
- Netzwerk: WLAN-Passwort, DHCP-Konfiguration
- Telefonie: Anrufliste, DECT-Handsets, VoIP
- System: Geräteinformationen, Neustart

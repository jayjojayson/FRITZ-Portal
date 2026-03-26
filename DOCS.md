# FRITZ!Portal — Home Assistant Add-on

## Beschreibung

FRITZ!Portal ist eine moderne Web-Oberfläche für die FRITZ!Box, direkt in Home Assistant integriert.

**Funktionen:**
- Dashboard: Live-Netzwerkauslastung, Monatsverbrauch, CPU/RAM/Temperatur
- Geräteliste: Alle Netzwerkgeräte (LAN/WLAN), IP-Statistiken
- Gerätedetail: Hostnamen ändern, IP fixieren, Internet sperren/freigeben
- Netzwerk: WLAN-Einstellungen & Passwort, DHCP-Konfiguration
- Traffic: Tages-/Monats-/Jahresverbrauch (Sende- und Empfangsbytes)
- Telefonie: Anrufliste mit Filter, DECT-Handsets und VoIP-Telefone
- System: Geräteinformationen, Neustart-Funktion

---

## Konfiguration

| Option | Beschreibung | Standard |
|--------|-------------|---------|
| `fritzbox_host` | Hostname oder IP der Fritz!Box | `fritz.box` |
| `fritzbox_user` | Fritz!Box-Benutzername | `admin` |
| `fritzbox_password` | Fritz!Box-Passwort | *(leer)* |

Nach dem Speichern der Konfiguration startet das Add-on automatisch neu und meldet sich selbstständig an der Fritz!Box an (Auto-Login). Das manuelle Einloggen in der Web-Oberfläche entfällt.

---

## Zugriff

### Über HA Ingress (empfohlen)
Das Add-on ist über das Home Assistant Dashboard unter **Einstellungen → Add-ons → FRITZ!Portal → Öffnen** erreichbar. Kein separater Port nötig.

### Direktzugriff
Optional kann Port `3003` freigegeben werden. Dann ist das Portal unter `http://homeassistant.local:3003` erreichbar.

---

## Fritz!Box-Voraussetzungen

- TR-064 muss aktiviert sein: FRITZ!Box → Heimnetz → Netzwerk → Heimnetzfreigaben → "Statuspabfragen über UPnP zulassen"
- Empfohlen: Einen dedizierten Benutzer in der Fritz!Box anlegen (Heimnetz → Benutzerverwaltung)

---

## Bekannte Eigenheiten (Cable-Modelle)

Das Add-on enthält automatische Patches für Fritz!Box Cable-Modelle (z.B. 6591 Vodafone):
- Korrektur für `serviceList.service` als Objekt statt Array in tr64desc.xml
- IP-basierte Internet-Sperre (statt MAC-basiert) über `X_AVM-DE_HostFilter:1`
- Monatsverbrauch aus `igddesc.xml` (WANCommonInterfaceConfig)

---

## Lokaler Docker-Build (für Entwicklung)

```bash
# aus dem Repo-Wurzelverzeichnis (fritz-api-ui/)
docker build \
  -f ha-addon/fritz-portal/Dockerfile \
  -t fritz-portal-addon \
  .

# Mit eigener Fritz!Box testen (ohne HA)
docker run --rm -p 3003:3003 \
  -e FRITZBOX_HOST=fritz.box \
  -e FRITZBOX_USER=admin \
  -e FRITZBOX_PASSWORD=geheim \
  fritz-portal-addon
```

## Als eigenständiges Add-on-Repository veröffentlichen

Um das Add-on als Custom Repository in HA einzubinden, benötigst du ein eigenes GitHub-Repository mit folgender Struktur:

```
mein-addon-repo/          ← GitHub-Repo-Root
  repository.yaml         ← aus ha-addon/repository.yaml
  README.md
  fritz-portal/           ← aus ha-addon/fritz-portal/
    config.yaml
    Dockerfile
    run.sh
    build.yaml
    DOCS.md
    CHANGELOG.md
    patch-fritzbox.mjs
    # + alle Quelldateien (src/, server/, package.json, ...)
```

Dann in HA: **Einstellungen → Add-ons → Store → ⋮ → Benutzerdefinierte Repositories** → URL deines Repos einfügen.

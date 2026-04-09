# Changelog

## 1.2.6

- Fix: Statische DHCP-Vergabe – data.lua Fallback wenn SOAP `401 Invalid Action` liefert (betrifft 6591, 6490 u. a.)
- Fix: Statische DHCP-Löschung – ebenfalls data.lua Fallback
- Fix: Mesh-Timeout von 4s auf 10s erhöht – manche Fritz!Box-Modelle antworten langsamer
- Neu: Mesh-Logging zeigt jetzt HTTP-Status und Antwort-Länge für bessere Diagnose- Neu: Mesh zusätzliche Seiten (`meshSet`, `meshNet`) und `/net/mesh_overview.lua` als Alternativen
- Neu: Mesh Fallback aus Host-Liste – zeigt Fritz!Box als Master mit allen online Clients als Netzwerkdiagramm wenn keine echte Mesh-API verfügbar ist

## 1.2.5

- Fix: HA Supervisor Warning – `armv7` in `config.yaml` durch `armhf` ersetzt (alter Wert wurde als deprecated gemeldet)
- Fix: HA-Sensoren springen nicht mehr auf 0 – letzter bekannter Wert wird beibehalten wenn Cache abgelaufen ist
- Fix: Fritz!Box 6490 – Modell-Ermittlung jetzt via `tr64desc.xml` (kein Login nötig) und data.lua Fallback
- Fix: Fritz!Box 6490 – IP-Statistiken mit data.lua Fallback wenn SOAP `606 Action Not Authorized` liefert
- Fix: WAN-Seite – data.lua Fallback für WAN-IP wenn beide SOAP-Dienste nicht erreichbar sind
- Fix: Dashboard Tablet-Ansicht – alle 6 Stat-Boxen werden jetzt in einer Zeile dargestellt
- Fix: Dashboard Mobil-Ansicht – Stat-Boxen in 2 Spalten (statt 1), Traffic-Boxen untereinander

## 1.2.4

- Neu: Alle Server-Logs im HA-Protokoll haben jetzt Zeitstempel (z.B. `[08:31:42] Auto-session: Created session`)
- Neu: README komplett überarbeitet – Logo, Screenshot, Feature-Tabelle, Schritt-für-Schritt-Installation und Docker-Anleitung

## 1.2.3

- Fix: Mesh-Abfragen laufen jetzt parallel statt seriell – Wartezeit beim ersten Aufruf von ~20s auf ~4s reduziert
- Fix: Negatives Ergebnis (kein Mesh) wird 60s gecacht – verhindert wiederholte Timeouts bei jedem Seitenaufruf

## 1.2.2

- Neu: Mesh-Topologie-Visualisierung im Tab "Übersicht" der Netzwerk-Seite
- Neu: SVG-Diagramm zeigt Fritz!Box-Geräte (Master, Satellite, Clients) mit Verbindungslinien (LAN/WLAN)
- Neu: Hover-Tooltip mit IP, MAC und Modell des jeweiligen Knotens
- Neu: Backend-Endpunkt `/api/fritz/mesh` mit Fallback durch mehrere `data.lua`-Seiten und `/meshlist.lua`
- Fix: Mesh-Topologie-Spinner drehte sich endlos – alle fetch-Aufrufe im `/api/fritz/mesh`-Endpunkt haben jetzt 4s Timeout (AbortController)
- Fix: Seite `overview` aus der Mesh-Suchliste entfernt (zu große Antwort, zu langsam)
- Fix: Frontend-Sicherheitsnetz: Spinner bricht nach 25s automatisch ab
- Neu: Server-Logging für Mesh-Endpunkt (zeigt welche Seite versucht wird und Fehlermeldungen)

## 1.2.1

- Änderung: HA Traffic-Sensoren (Heute/Gestern/Woche/Monat/Vormonat) werden jetzt in MB oder GB übertragen – unter 1 GiB als MB (2 Nachkommastellen), ab 1 GiB als GB (3 Nachkommastellen)

## 1.2.0

- Fix: Traffic-Sensoren für Home Assistant (Heute/Gestern/Woche/Monat/Vormonat) wurden nie an HA gesendet, da kein Background-Collector existierte. `pushTrafficSensorsToHA()` holt jetzt aktiv Daten von der FritzBox wenn der Cache abgelaufen ist.
- Änderung: HA-Sensoren `download_speed` und `upload_speed` werden jetzt in MB/s statt B/s übertragen (auf 3 Nachkommastellen gerundet)

## 1.1.30

- Neu: FRITZ!Portal Logo im Header anstelle der bisherigen Text-Schriftzug
- Neu: Add-on Icon (`icon.png`) für die Home Assistant Add-on-Kachel

## 1.1.29

- Fix: Light-Mode Tabellen-Hover war schwarz-auf-schwarz – `--bg-hover` im Light-Mode auf `#e8eaed` korrigiert
- Fix: Fritz!Box 7530 (DSL/PPPoä) – WAN-Endpunkt versucht jetzt zuerst `WANIPConnection:1`, dann `WANPPPConnection:1` als Fallback
- Fix: Fritz!Box 7530 – LAN- und DHCP-Endpunkt fallen auf `data.lua` zurück wenn SOAP `401 Invalid Action` liefert
- Fix: Eco-Stats (CPU/RAM/Temperatur) – zusätzliche Seiten (`system`, `sysStat`) und Feldpfade für 7530-Firmware (`cpuUtil`, `ramUtil`, `memUsage`, `stat.*`)
- Fix: `WANPPPConnection:1` Control-URL in Discovery-Fallbacks ergänzt

## 1.1.28

- Fix: HA Sensor Push übertrug Nullwerte – Background-Collector schreibt eco-stats und network-stats jetzt in den API-Cache
- Fix: pushFastSensorsToHA liest Cache mit 120s TTL – verhindert Nullwerte wenn HA-Intervall länger als Standard-Cache-TTL ist

## 1.1.27

- Neu: HA-Sensor-Einstellungen direkt in der GUI auf der Systemseite konfigurierbar
- Neu: Schalter zum Aktivieren/Deaktivieren des Sensor-Push in der GUI
- Neu: Intervall für Systemsensoren (CPU, RAM, Temp, Geräte, IPs, Download, Upload) separat einstellbar (Standard: 60 Sek.)
- Neu: Intervall für Traffic-Sensoren (Heute/Gestern/Woche/Monat/Vormonat) separat einstellbar (Standard: 300 Sek.)
- Neu: Einstellungen werden in `/data/fritz-portal.json` gespeichert und nach Neustart beibehalten
- Neu: Status-Anzeige in der GUI zeigt ob HA Supervisor erreichbar ist
- Fix: HA Sensor Push in zwei unabhängige Timer aufgeteilt (Systemsensoren / Traffic) für reduzierte API-Last

## 1.1.26

- Neu: HA Sensor Push – Fritz!Box-Werte werden automatisch als Home Assistant Sensoren bereitgestellt
- Neu: Sensoren für CPU, RAM, CPU-Temperatur, Geräte online, freie IPs, Live-Download, Live-Upload
- Neu: Traffic-Sensoren für Heute, Gestern, Aktuelle Woche, Aktueller Monat und Vormonat (jeweils Download & Upload)
- Neu: Add-on-Option `ha_sensors` (true/false) zum Aktivieren/Deaktivieren des Sensor-Push
- Neu: Add-on-Option `ha_sensors_interval` (Sekunden) für das Abfrageintervall (Standard: 30s)
- Fix: ip-stats Endpunkt cached Ergebnis jetzt serverseitig (30s TTL) – vermeidet redundante SOAP-Aufrufe beim Sensor-Push

## 1.1.25

- Fix: Theme-Wechsel (Dark/Light) löst kein Seiten-Reload mehr aus – CSS wird reaktiv per State aktualisiert

## 1.1.24

- Fix: Dashboard zeigt Modell, Geräte und IP-Stats sofort an – eco-stats, traffic und chart laden danach ohne Spinner im Hintergrund nach
- Fix: WebSID wird beim Session-Start vorab gecacht – erster eco-stats-Request trifft keinen Cold-Cache mehr

## 1.1.23

- Fix: Dashboard Live-Chart fror nach dem ersten Laden ein – Ursache war ein useEffect-Cleanup-Bug der das 10s-Interval vorzeitig zerstörte
- Fix: Geräteliste wird jetzt parallel statt sequentiell per SOAP abgerufen (bis zu 15 gleichzeitige Requests) – Ladezeit von ~7s auf ~1s reduziert
- Fix: Hosts-Cache-TTL auf 60 Sekunden erhöht (war 10s) – schnelleres Wechseln zwischen Seiten
- Neu: eco-History Zeitraum von 1h auf 3h erhöht
- Neu: Modal-Titel zeigt jetzt korrekt "letzte 3h"

## 1.1.22

- Fix: DECT SOAP-Fehler (401 Invalid Action) blockiert nicht mehr den data.lua-Fallback
- Neu: CPU-, RAM- und Temperatur-Karten auf dem Dashboard sind jetzt klickbar
- Neu: Klick öffnet ein Modal mit dem Verlaufsgraphen der letzten 1 Stunde
- Neu: Server sammelt eco-Stats (CPU/RAM/Temp) server-seitig alle 10 s für den Verlauf

## 1.1.21

- Fix: DECT-Handsets – data.lua-Fallback nutzt jetzt Seite `dect`/`dectReg` statt `dectSet`; breitere Suche nach Handset-Listen-Pfaden
- Fix: DECT-Fallback verwendet gecachte WebSID (kein redundanter Login mehr)
- Neu: SmartHome-Geräte werden über das offizielle AHA-HTTP XML-Interface abgerufen (Fallback: data.lua)
- Fix: WebSID-Cache – fehlgeschlagene Logins werden nur 30 s gecacht statt 5 min; ermöglicht schnelleren Retry
- Fix: Eco-Stats (CPU/RAM/Temperatur) – zusätzliche data.lua-Seiten (`ecoStat`) und direkte Feldpfade als Fallback für verschiedene Modelle

## 1.1.20

- Fix: apiFetch - Pfad-Konkatenierung fürHA Ingress und Nicht-Ingress korrigiert

## 1.1.19

- Fix: apiFetch - Pfad-Konkatenierung korrigiert für HA Ingress

## 1.1.18

- Fix: DeviceDetail - apiFetch statt fetch für blockstate und static-dhcp

## 1.1.17

- Fix: Sortierung nach Verbindung - Fehler bei leeren Interfaces behoben

## 1.1.15

- Neu: Sortierung auf der Geräteseite nach Name, Status, IP-Adresse oder Verbindung
- Klick auf die Spaltenüberschrift sortiert die Tabelle auf- oder absteigend

## 1.1.14

- Fix: Browser-Caching auf 10 Minuten erhöht für schnellere Seitennavigation
- Fix: GitHub Actions auf Node.js 24 aktualisiert
- Fix: Server-Caching für API-Antworten (10 Sekunden TTL)
- Fix: Doppeltes Komma in server/package.json entfernt

## 1.1.13

- Fix: armv7 Architektur zur config.yaml hinzugefügt

## 1.1.12

- Fix: Browser-Caching implementiert (30 Sekunden)
- Version auf Systemseite fest eingebaut (nicht mehr dynamisch vom Server)

## 1.1.11

- Neu: Browser-Caching für schnelle Seitennavigation
- Fix: Server-seitiges Caching für alle API-Antworten

## 1.1.10

- Fix: Server-Cache TTL auf 10 Sekunden erhöht

## 1.1.9

- Neu: Version wird fest im Frontend eingebaut (Systemseite)

## 1.1.8

- Neu: Vierte Box "Freie IPs" auf der Geräteseite
- Zeigt die letzten 5 freien IP-Adressen aus dem DHCP-Bereich

## 1.1.7

- Neu: Screenshot in DOCS.md eingefügt

## 1.0.0

- Erste Version des FRITZ!Portal Home Assistant Add-ons
- Dashboard mit Systemübersicht (CPU, RAM, Temperatur)
- Geräteliste mit Detailansicht
- Netzwerk-Einstellungen (LAN, WAN, WLAN, DHCP)
- Traffic-Übersicht (Tag, Woche, Monat, Vormonat)
- Telefonie (Anrufliste, DECT-Telefone)
- System-Informationen und Neustart-Funktion
- Automatische Anmeldung über Add-on-Konfiguration
- Home Assistant Ingress-Support

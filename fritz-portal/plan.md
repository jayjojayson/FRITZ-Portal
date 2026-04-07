# FRITZ!Portal Plan
die plan.md Datei enthält den Entwicklungsplan und die Struktur für das FRITZ!Portal Home Assistant Add-on Repository. Hier werden die Schritte zur Entwicklung, zum Testen und zur Veröffentlichung des Add-ons durch den User als Vorgabe dokumentiert, um eine klare Übersicht über den Prozess zu gewährleisten.

## Abruf der API Daten:
Die FRITZ!Box bietet zwei wesentliche Schnittstellen, um Daten automatisiert abzurufen: TR-064 (für allgemeine Router-Informationen und Netzwerkstatus) und die AHA-HTTP-Schnittstelle (speziell für Smart-Home-Geräte).

Die zwei Schnittstellen im Vergleich
TR-064 (SOAP-basiert): Das ist der Standard für Router-Funktionen. Fast alles, was du in der Weboberfläche siehst, lässt sich hierüber via XML/SOAP abfragen. Bibliotheken wie fritzconnection (Python) vereinfachen den Zugriff enorm.

AHA-HTTP-Interface: Speziell für DECT-Geräte (Heizkörperregler, Steckdosen). Der Zugriff erfolgt über einfache HTTP-Requests an http://fritz.box/webservices/homeautoswitch.lua.

## Ablauf bei jeder Änderung:
1. Version in config.yaml erhöhen (z.B. 1.1.13 → 1.1.14)
2. package.json: Version erhöhen
3. server/package.json: Version erhöhen
4. System.tsx: Version in GUI erhöhen
5. GitHub Actions baut automatisch das Docker Image → pusht nach ghcr.io
6. Home Assistant zeigt Update-Benachrichtigung und kann installieren

## GitHub Ordner Struktur wenn der User nach comitt oder push fragt:
Nach dieser Struktur ist das Repository organisiert, um eine klare Trennung zwischen der Add-on Infrastruktur, dem Server-Code und dem Frontend zu gewährleisten. Alle relevanten Dateien und Verzeichnisse sind übersichtlich angeordnet, um die Entwicklung und Wartung zu erleichtern.
Sturktur:
- .github/workflows
- fritz-portal/
  - docs/images/
  - server/
  - src/
  - CHANGELOG.md, DOCS.md, Dockerfile, build.yaml, config.yaml, index.html, package.json, run.sh, tsconfig.json, vite.config.ts
- .gitignore
- LICENSE
- README.md
- repository.yaml

## für den lokalen Test 
Für den lokalen Test baue ich eine Server aus dem Verzeichnis /fritz-portal und kann dann lokel testen. So wie es auch in der README beschrieben ist. Auf die Weise kann ich lokale Änderungen schnell testen, ohne jedes Mal das ganze Add-on in Home Assistant installieren zu müssen. Sobald alles lokal funktioniert, kann ich die Änderungen commiten und pushen, damit sie automatisch in Home Assistant verfügbar sind.

### Changelog.md
Alle Änderungen werden im Changelog dokumentiert, damit die Nutzer immer wissen, was neu ist und welche Fehler behoben wurden. So bleibt alles transparent und nachvollziehbar.

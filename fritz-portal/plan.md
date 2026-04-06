# FRITZ!Portal Plan

## Ablauf bei jeder Änderung:
1. Version in config.yaml erhöhen (z.B. 1.1.11 → 1.1.12)
2. GUI: Systemseite zeigt Version aus GitHub (muss im Frontend eingebaut werden)
3. Commit zu GitHub mit Message v1.1.12 
4. GitHub Actions baut automatisch das Docker Image → pusht nach ghcr.io
5. Home Assistant zeigt Update-Benachrichtigung und kann installieren

## GitHub Ordner Struktur:
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

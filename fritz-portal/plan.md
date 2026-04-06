# FRITZ!Portal Plan

## Ablauf bei jeder Änderung:
1. Version in config.yaml erhöhen (z.B. 1.1.13 → 1.1.14)
2. package.json: Version erhöhen
3. server/package.json: Version erhöhen
4. System.tsx: Version in GUI erhöhen
5. GitHub Actions baut automatisch das Docker Image → pusht nach ghcr.io
6. Home Assistant zeigt Update-Benachrichtigung und kann installieren

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

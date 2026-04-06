Das ist dein Plan an den du dich bei jedem Upload zu github hälst.

Der Plan ist klar:
Ablauf bei jeder Änderung:
1. Version in config.yaml erhöhen (z.B. 1.1.8 → 1.1.9)
2. GUI: Systemseite zeigt Version aus GitHub (muss im Frontend eingebaut werden)
3. Commit zu GitHub mit Message v1.1.8 
zur info:
4. GitHub Actions baut automatisch das Docker Image → pusht nach ghcr.io
5. Home Assistant zeigt Update-Benachrichtigung und kann installieren


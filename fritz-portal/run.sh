#!/bin/sh
# FRITZ!Portal — Home Assistant Add-on Startskript
#
# Die Fritz!Box-Zugangsdaten werden vom Express-Server selbst aus
# /data/options.json gelesen (kein bashio nötig).
# Env-Vars FRITZBOX_HOST / FRITZBOX_USER / FRITZBOX_PASSWORD können
# alternativ direkt gesetzt werden und haben Vorrang.

exec node /app/server/index.js

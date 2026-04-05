#!/usr/bin/with-contenv bashio

# HA Add-on options in /data/options.json lesen und als Env-Vars exportieren
FRITZBOX_HOST=$(bashio::config 'fritzbox_host')
FRITZBOX_USER=$(bashio::config 'fritzbox_user')
FRITZBOX_PASSWORD=$(bashio::config 'fritzbox_password')

export FRITZBOX_HOST
export FRITZBOX_USER
export FRITZBOX_PASSWORD

bashio::log.info "Starting FRITZ!Portal Add-on..."
bashio::log.info "Host: ${FRITZBOX_HOST}"
bashio::log.info "User: ${FRITZBOX_USER}"

# Server starten
exec node /app/server/index.js

#!/bin/sh
echo "Starting FRITZ!Portal Add-on..."

# HA Base Images nutzen S6 Overlay – with-contenv stellt SUPERVISOR_TOKEN bereit
if command -v with-contenv > /dev/null 2>&1; then
  exec with-contenv node /app/server/index.js
else
  exec node /app/server/index.js
fi

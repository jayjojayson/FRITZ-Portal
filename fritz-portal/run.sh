#!/bin/bash
# FRITZ!Portal Home Assistant Add-on startup script

set -e

echo "Starting FRITZ!Portal..."
cd /app
exec node server/index.js

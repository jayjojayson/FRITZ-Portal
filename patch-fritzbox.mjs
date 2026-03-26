/**
 * FRITZ!Portal — Cable-Modell-Patch für @lukesthl/fritzbox
 *
 * Fritz!Box Cable-Modelle (z.B. 6591 Vodafone) liefern in tr64desc.xml
 * manchmal nur einen Service statt eines Arrays. Der XML-Parser gibt
 * dann ein Objekt zurück, kein Array → .forEach() schlägt fehl.
 *
 * Dieser Patch wraps den Zugriff mit Array.isArray()-Prüfung.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Pfad im Docker-Container (Stage 2: WORKDIR /app)
const libPath = join('/app/server', 'node_modules', '@lukesthl', 'fritzbox', 'dist', 'index.js');

try {
  let content = readFileSync(libPath, 'utf-8');

  // Fix 1: serviceList.service ist ggf. kein Array (Cable-Modell)
  content = content.replace(
    /e\.serviceList\.service\.forEach/g,
    '(Array.isArray(e.serviceList.service)?e.serviceList.service:[e.serviceList.service]).forEach'
  );

  // Fix 2: deviceList.device ist ggf. kein Array (Cable-Modell)
  content = content.replace(
    /\(i=s\.device\.deviceList\)==null\|\|i\.device\.forEach/g,
    '(i=s.device.deviceList)==null||i.device==null||(Array.isArray(i.device)?i.device:[i.device]).forEach'
  );

  writeFileSync(libPath, content);
  console.log('patch-fritzbox: Patch erfolgreich angewendet ->', libPath);
} catch (err) {
  console.warn('patch-fritzbox: Konnte Bibliothek nicht patchen:', err.message);
}

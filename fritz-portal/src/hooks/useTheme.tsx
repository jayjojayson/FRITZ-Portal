import { useState, useEffect, createContext, useContext } from 'react';

type Theme = 'light' | 'dark';
// Design: FRITZ!Portal-Terminal-Look oder Home-Assistant-Design (wie `ha_style` der Card)
export type UiStyle = 'portal' | 'ha';

interface ThemeContextType {
  theme: Theme;              // tatsächlich angezeigtes Hell/Dunkel
  toggleTheme: () => void;
  uiStyle: UiStyle;
  toggleUiStyle: () => void;
  // true, wenn Farben und Hell/Dunkel aus dem aktiven HA-Theme kommen (nur im HA-Design
  // innerhalb von Home Assistant) – der Hell/Dunkel-Schalter ist dann ohne Wirkung
  followsHa: boolean;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}

// HA-Theme-Variablen → eigene --hax-*-Variablen (Zuordnung im CSS unter [data-ui="ha"])
const HA_VARS: [string, string[]][] = [
  ['--hax-bg',      ['--primary-background-color']],
  ['--hax-bg2',     ['--secondary-background-color']],
  ['--hax-card',    ['--ha-card-background', '--card-background-color']],
  ['--hax-text',    ['--primary-text-color']],
  ['--hax-text2',   ['--secondary-text-color']],
  ['--hax-divider', ['--divider-color']],
  ['--hax-primary', ['--primary-color']],
  ['--hax-success', ['--success-color']],
  ['--hax-warning', ['--warning-color']],
  ['--hax-error',   ['--error-color']],
  ['--hax-font',    ['--ha-font-family-body', '--paper-font-body1_-_font-family']],
];

// Helligkeit einer beliebigen CSS-Farbe (0 = schwarz … 1 = weiß)
function luminance(color: string): number | null {
  const el = document.createElement('span');
  el.style.color = color;
  document.body.appendChild(el);
  const m = getComputedStyle(el).color.match(/[\d.]+/g);
  el.remove();
  if (!m || m.length < 3) return null;
  const [r, g, b] = m.slice(0, 3).map(Number);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// Aktives HA-Theme aus dem umgebenden HA-Fenster lesen. Das Panel läuft per Ingress im
// selben Ursprung wie Home Assistant, daher ist das erlaubt; außerhalb von HA (lokal,
// Docker) oder bei gesperrtem Zugriff → null, dann gelten die HA-Standardfarben.
function readHaTheme(): { dark: boolean; vars: Record<string, string> } | null {
  try {
    if (window.parent === window) return null;
    const doc = window.parent.document;
    const cs = window.parent.getComputedStyle(doc.documentElement);
    const get = (names: string[]) => names.map(n => cs.getPropertyValue(n).trim()).find(Boolean) || '';
    const vars: Record<string, string> = {};
    for (const [own, names] of HA_VARS) vars[own] = get(names);
    if (!vars['--hax-bg'] || !vars['--hax-text']) return null;
    const darkMode = (doc.querySelector('home-assistant') as any)?.hass?.themes?.darkMode;
    const dark = typeof darkMode === 'boolean' ? darkMode : (luminance(vars['--hax-bg']) ?? 1) < 0.5;
    return { dark, vars };
  } catch {
    return null;
  }
}

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, v: string) => { try { localStorage.setItem(key, v); } catch { /* privat */ } };

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (read('theme') as Theme) || 'dark');
  const [uiStyle, setUiStyle] = useState<UiStyle>(() => (read('ui_style') === 'ha' ? 'ha' : 'portal'));
  const [haTheme, setHaTheme] = useState<ReturnType<typeof readHaTheme>>(null);

  // Im HA-Design das HA-Theme übernehmen und Änderungen (z. B. Dunkelmodus in HA) verfolgen
  useEffect(() => {
    if (uiStyle !== 'ha') { setHaTheme(null); return; }
    let last = '';
    const sync = () => {
      const next = readHaTheme();
      const key = JSON.stringify(next);
      if (key !== last) { last = key; setHaTheme(next); }
    };
    sync();
    let observer: MutationObserver | null = null;
    try {
      if (window.parent !== window) {
        observer = new MutationObserver(() => sync());
        observer.observe(window.parent.document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
        observer.observe(window.parent.document.head, { childList: true });
      }
    } catch { /* kein Zugriff aufs HA-Fenster */ }
    const onFocus = () => sync();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      observer?.disconnect();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [uiStyle]);

  const followsHa = uiStyle === 'ha' && !!haTheme;
  const shown: Theme = followsHa ? (haTheme!.dark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', shown);
    root.setAttribute('data-ui', uiStyle);
    for (const [own] of HA_VARS) {
      const v = followsHa ? haTheme!.vars[own] : '';
      if (v) root.style.setProperty(own, v); else root.style.removeProperty(own);
    }
  }, [shown, uiStyle, followsHa, haTheme]);

  useEffect(() => { write('theme', theme); }, [theme]);
  useEffect(() => { write('ui_style', uiStyle); }, [uiStyle]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');
  const toggleUiStyle = () => setUiStyle(s => s === 'ha' ? 'portal' : 'ha');

  return (
    <ThemeContext.Provider value={{ theme: shown, toggleTheme, uiStyle, toggleUiStyle, followsHa }}>
      {children}
    </ThemeContext.Provider>
  );
}

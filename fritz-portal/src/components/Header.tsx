import { useTheme } from '../hooks/useTheme';
import { useI18n, type Lang } from '../lib/i18n';
import logoUrl from '../logo.png';

type Page = 'dashboard' | 'devices' | 'device-detail' | 'network' | 'traffic' | 'telefonie' | 'smarthome' | 'system';

interface HeaderProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const navItems: { page: Page; label: string }[] = [
  { page: 'dashboard', label: 'Dashboard' },
  { page: 'devices',   label: 'Geräte' },
  { page: 'network',   label: 'Netzwerk' },
  { page: 'traffic',   label: 'Traffic' },
  { page: 'telefonie', label: 'Telefonie' },
  { page: 'smarthome', label: 'SmartHome' },
  { page: 'system',    label: 'System' },
];

// Sprachwechsel reihum DE → EN → IT (Italienisch von @Mistergatti, PR #36)
const NEXT_LANG: Record<Lang, Lang> = { de: 'en', en: 'it', it: 'de' };

export default function Header({ currentPage, onNavigate }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const { lang, setLang, t } = useI18n();
  const isDark = theme === 'dark';

  return (
    <header className="header">
      <div className="header-brand">
        <img src={logoUrl} alt="FRITZ!Portal" className="header-logo" />
        <span className="header-version">v{__APP_VERSION__}</span>
      </div>

      <nav className="header-nav">
        {navItems.map(item => {
          const active = currentPage === item.page || (item.page === 'devices' && currentPage === 'device-detail');
          return (
            <button
              key={item.page}
              className={`header-nav-item ${active ? 'active' : ''}`}
              onClick={() => onNavigate(item.page)}
            >
              {t(item.label)}
            </button>
          );
        })}
      </nav>

      <div className="header-actions">
        <button
          className="header-pill"
          onClick={() => setLang(NEXT_LANG[lang] ?? 'de')}
          title={t('Sprache')}
        >
          {lang.toUpperCase()}
        </button>
        <button
          className="header-theme-toggle"
          onClick={toggleTheme}
          title={isDark ? t('Light Mode') : t('Dark Mode')}
        >
          ◐ {isDark ? 'DARK' : 'LIGHT'}
        </button>
      </div>
    </header>
  );
}

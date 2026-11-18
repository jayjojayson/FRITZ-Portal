import { ReactNode, CSSProperties } from 'react';
import { useTheme } from '../hooks/useTheme';
import { useT } from '../lib/i18n';

// Im Home-Assistant-Design lesbare Überschriften statt der Terminal-Titel
const HA_TITLES: Record<string, string> = {
  'TRAFFIC.LIVE': 'Traffic live',
  'HOSTS.ACTIVE': 'Aktive Geräte',
  'CALLS.RECENT': 'Letzte Anrufe',
  'SMARTHOME.STATUS': 'SmartHome',
};

interface TerminalPanelProps {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  footer?: ReactNode;
  bodyPadding?: number | string;
  flex?: boolean;
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}

export default function TerminalPanel({
  title,
  subtitle,
  right,
  footer,
  bodyPadding,
  flex = false,
  style,
  className = '',
  children,
}: TerminalPanelProps) {
  const ha = useTheme().uiStyle === 'ha';
  const t = useT();
  return (
    <div className={`tpanel ${className}`} style={{ ...(flex ? { flex: 1, minHeight: 0 } : {}), ...style }}>
      <div className="tpanel-head">
        <span>
          <span className="title">{ha && HA_TITLES[title] ? t(HA_TITLES[title]) : title}</span>
          {subtitle && <span className="sub" style={{ marginLeft: 10 }}>{ha ? '· ' : '── '}{subtitle}</span>}
        </span>
        {right && <span>{right}</span>}
      </div>
      <div
        className="tpanel-body"
        style={{
          padding: bodyPadding,
          ...(flex ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : {}),
        }}
      >
        {children}
      </div>
      {footer && <div className="tpanel-foot">{footer}</div>}
    </div>
  );
}

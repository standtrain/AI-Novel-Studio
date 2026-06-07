import type { ReactNode } from 'react';

interface PageShellProps {
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  compact?: boolean;
  toolMode?: boolean;
}

const cx = (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(' ');

const PageShell = ({
  title,
  subtitle,
  icon,
  actions,
  children,
  className,
  contentClassName,
  compact,
  toolMode,
}: PageShellProps) => (
  <div className={cx('unified-page-shell', compact && 'unified-page-shell-compact', toolMode && 'unified-page-shell-tool', className)}>
    <div className="unified-page-header">
      <div className="unified-page-heading">
        {icon && <div className="unified-page-icon" aria-hidden="true">{icon}</div>}
        <div className="unified-page-heading-text">
          <h1 className="unified-page-title">{title}</h1>
          {subtitle && <div className="unified-page-subtitle">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="unified-page-actions">{actions}</div>}
    </div>
    <div className={cx('unified-page-content', contentClassName)}>{children}</div>
  </div>
);

export default PageShell;

import type { HTMLAttributes, ReactNode } from 'react';

export type SeasonBadgeTone = 'navy' | 'blue' | 'muted' | 'success' | 'warning' | 'danger';

type SeasonBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  tone?: SeasonBadgeTone;
};

export default function SeasonBadge({ children, className = '', tone = 'navy', ...props }: SeasonBadgeProps) {
  return (
    <span className={`season-badge season-badge--${tone}${className ? ` ${className}` : ''}`} {...props}>
      {children}
    </span>
  );
}

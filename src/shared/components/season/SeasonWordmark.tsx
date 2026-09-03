import type { HTMLAttributes } from 'react';

type SeasonWordmarkProps = HTMLAttributes<HTMLSpanElement> & {
  compact?: boolean;
};

export default function SeasonWordmark({ className = '', compact = false, ...props }: SeasonWordmarkProps) {
  return (
    <span className={`season-wordmark${compact ? ' season-wordmark--compact' : ''}${className ? ` ${className}` : ''}`} {...props}>
      <span className="season-wordmark__league">AUBL</span>
      <span className="season-wordmark__season">2026 SEASON</span>
    </span>
  );
}

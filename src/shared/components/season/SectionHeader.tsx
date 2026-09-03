import type { ReactNode } from 'react';

interface SectionHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  headingId?: string;
}

export default function SectionHeader({ eyebrow, title, description, action, headingId }: SectionHeaderProps) {
  return (
    <header className="season-section-header">
      <div>
        {eyebrow ? <p className="season-section-header__eyebrow">{eyebrow}</p> : null}
        <h2 id={headingId}>{title}</h2>
        {description ? <div className="season-section-header__description">{description}</div> : null}
      </div>
      {action ? <div className="season-section-header__action">{action}</div> : null}
    </header>
  );
}

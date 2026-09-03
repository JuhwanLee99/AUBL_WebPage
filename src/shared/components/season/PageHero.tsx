import type { ReactNode } from 'react';

interface PageHeroProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  className?: string;
}

export default function PageHero({ eyebrow, title, description, actions, aside, className = '' }: PageHeroProps) {
  return (
    <section className={`season-page-hero${className ? ` ${className}` : ''}`}>
      <div className="season-page-hero__copy">
        {eyebrow ? <p className="season-page-hero__eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <div className="season-page-hero__description">{description}</div> : null}
        {actions ? <div className="season-page-hero__actions">{actions}</div> : null}
      </div>
      {aside ? <div className="season-page-hero__aside">{aside}</div> : null}
    </section>
  );
}

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

export type SeasonActionVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type SeasonActionSize = 'default' | 'compact';

type SharedActionProps = {
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
  size?: SeasonActionSize;
  variant?: SeasonActionVariant;
};

type SeasonButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & SharedActionProps;

const actionClassName = ({
  className = '',
  fullWidth = false,
  size = 'default',
  variant = 'primary',
}: Omit<SharedActionProps, 'children'>) =>
  [
    'season-action',
    `season-action--${variant}`,
    `season-action--${size}`,
    fullWidth ? 'season-action--full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

export const SeasonButton = forwardRef<HTMLButtonElement, SeasonButtonProps>(function SeasonButton(
  { children, className, fullWidth, size, type = 'button', variant, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={actionClassName({ className, fullWidth, size, variant })}
      {...props}
    >
      {children}
    </button>
  );
});

type SeasonLinkButtonProps = Omit<LinkProps, 'className'> & SharedActionProps;

export function SeasonLinkButton({
  children,
  className,
  fullWidth,
  size,
  variant,
  ...props
}: SeasonLinkButtonProps) {
  return (
    <Link className={actionClassName({ className, fullWidth, size, variant })} {...props}>
      {children}
    </Link>
  );
}

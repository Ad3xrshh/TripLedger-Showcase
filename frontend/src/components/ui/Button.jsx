import './Button.css';

/**
 * variant: 'primary' | 'secondary' | 'danger' | 'ghost'
 * size: 'md' (default) | 'sm'
 * isLoading: shows an inline spinner and disables the button, without
 *   changing its label/layout - pages that currently swap the label text
 *   themselves (e.g. "Approving…") can keep doing that, this is additive.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  className,
  children,
  ...buttonProps
}) {
  const classes = ['btn', `btn--${variant}`, size === 'sm' && 'btn--sm', isLoading && 'btn--loading', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={classes} disabled={disabled || isLoading} aria-busy={isLoading || undefined} {...buttonProps}>
      {isLoading && <span className="btn__spinner" aria-hidden="true" />}
      <span className="btn__label">{children}</span>
    </button>
  );
}

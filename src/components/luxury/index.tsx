import { ReactNode, HTMLAttributes, ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

/* ─────────────── LuxuryShell ─────────────── */
export const LuxuryShell = ({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'min-h-screen relative overflow-x-hidden bg-background text-foreground',
      className,
    )}
    {...rest}
  >
    {/* Ambient gradient layer */}
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
      style={{
        background:
          'radial-gradient(ellipse 80% 50% at 50% -10%, hsl(var(--gold) / 0.10), transparent 60%),' +
          'radial-gradient(ellipse 60% 50% at 100% 100%, hsl(var(--teal) / 0.08), transparent 70%),' +
          'radial-gradient(ellipse 60% 50% at 0% 80%, hsl(var(--emerald) / 0.06), transparent 70%)',
      }}
    />
    {children}
  </div>
);

/* ─────────────── LuxurySection ─────────────── */
interface LuxurySectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  eyebrow?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}
export const LuxurySection = ({
  eyebrow, title, subtitle, action, children, className, ...rest
}: LuxurySectionProps) => (
  <section className={cn('space-y-4', className)} {...rest}>
    {(eyebrow || title || action) && (
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <p className="font-body text-[10px] tracking-[0.28em] uppercase text-gold/80 mb-1">
              {eyebrow}
            </p>
          )}
          {title && (
            <h2 className="font-serif-display text-2xl sm:text-3xl text-foreground leading-tight">
              {title}
            </h2>
          )}
          {subtitle && (
            <p className="font-body text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    )}
    {children}
  </section>
);

/* ─────────────── LuxuryCard ─────────────── */
export const LuxuryCard = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        'relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl',
        'shadow-[0_10px_40px_-20px_hsl(220_40%_2%_/_0.6)] luxury-shadow',
        'transition-colors',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  ),
);
LuxuryCard.displayName = 'LuxuryCard';

/* ─────────────── LuxuryStatCard ─────────────── */
interface StatProps {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  delta?: string;
  tone?: 'gold' | 'emerald' | 'teal' | 'rose' | 'neutral';
  glow?: boolean;
  className?: string;
}
const toneMap: Record<NonNullable<StatProps['tone']>, string> = {
  gold:    'text-gold border-gold/30 bg-gold/5',
  emerald: 'text-emerald border-emerald/30 bg-emerald/5',
  teal:    'text-teal border-teal/30 bg-teal/5',
  rose:    'text-destructive border-destructive/30 bg-destructive/5',
  neutral: 'text-foreground border-border/60 bg-card/60',
};
const glowMap: Record<NonNullable<StatProps['tone']>, string> = {
  gold:    'luxury-stat-glow-gold border-gold/50',
  emerald: 'luxury-stat-glow-emerald border-emerald/50',
  teal:    'luxury-stat-glow-teal border-teal/50',
  rose:    'luxury-stat-glow-rose border-destructive/50',
  neutral: '',
};
const valueToneMap: Record<NonNullable<StatProps['tone']>, string> = {
  gold:    'text-gold',
  emerald: 'text-emerald',
  teal:    'text-teal',
  rose:    'text-destructive',
  neutral: 'text-foreground',
};
export const LuxuryStatCard = ({
  icon, label, value, delta, tone = 'neutral', glow = false, className,
}: StatProps) => (
  <LuxuryCard className={cn('p-4 sm:p-5 overflow-hidden', glow && glowMap[tone], className)}>
    <div className="flex items-start justify-between gap-3 mb-3">
      <p className="font-body text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
        {label}
      </p>
      {icon && (
        <span className={cn(
          'inline-flex w-9 h-9 items-center justify-center rounded-full border',
          toneMap[tone],
        )}>
          {icon}
        </span>
      )}
    </div>
    <p className={cn(
      'font-serif-display text-3xl sm:text-4xl leading-none tabular-nums',
      glow ? valueToneMap[tone] : 'text-foreground',
    )}>
      {value}
    </p>
    {delta && (
      <p className="font-body text-xs text-emerald mt-2 tabular-nums">{delta}</p>
    )}
  </LuxuryCard>
);

/* ─────────────── LuxuryHeader ─────────────── */
interface LuxuryHeaderProps {
  eyebrow?: string;
  greeting: ReactNode;
  meta?: ReactNode;
  right?: ReactNode;
  className?: string;
}
export const LuxuryHeader = ({ eyebrow, greeting, meta, right, className }: LuxuryHeaderProps) => (
  <header className={cn('flex items-start justify-between gap-4 py-2', className)}>
    <div className="min-w-0">
      {eyebrow && (
        <p className="font-body text-[10px] tracking-[0.3em] uppercase text-gold/80 mb-1">
          {eyebrow}
        </p>
      )}
      <h1 className="font-serif-display text-3xl sm:text-4xl text-foreground leading-tight">
        {greeting}
      </h1>
      {meta && (
        <p className="font-body text-sm text-muted-foreground mt-1.5">{meta}</p>
      )}
    </div>
    {right && <div className="shrink-0">{right}</div>}
  </header>
);

/* ─────────────── LuxuryButton variants (additive, does not replace shadcn) ─────────────── */
export const luxuryButtonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-display tracking-[0.15em] uppercase text-xs transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]',
  {
    variants: {
      variant: {
        gold:  'bg-gradient-gold text-background hover:brightness-110 luxury-glow-gold',
        glass: 'luxury-glass text-foreground hover:border-gold/40',
        ghost: 'text-muted-foreground hover:text-foreground hover:bg-card/40',
        outline: 'border border-border/60 text-foreground hover:border-gold/40 hover:bg-card/40',
      },
      size: {
        sm: 'h-9 px-4',
        md: 'h-11 px-5',
        lg: 'h-14 px-7 text-sm',
      },
    },
    defaultVariants: { variant: 'glass', size: 'md' },
  },
);
interface LuxuryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof luxuryButtonVariants> {}
export const LuxuryButton = forwardRef<HTMLButtonElement, LuxuryButtonProps>(
  ({ className, variant, size, ...rest }, ref) => (
    <button
      ref={ref}
      className={cn(luxuryButtonVariants({ variant, size }), className)}
      {...rest}
    />
  ),
);
LuxuryButton.displayName = 'LuxuryButton';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cx } from "@/lib/format";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "brass";
type Size = "sm" | "md";

const base = "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const variants: Record<Variant, string> = {
  primary: "bg-navy text-navy-fg hover:bg-navy/90",
  secondary: "border border-line bg-surface text-ink hover:bg-sunken",
  ghost: "text-ink2 hover:bg-sunken hover:text-ink",
  danger: "border border-bad/40 bg-surface text-bad hover:bg-bad/10",
  brass: "bg-brass text-white hover:bg-brass/90",
};
const sizes: Record<Size, string> = { sm: "h-8 px-2.5 text-[13px]", md: "h-9 px-3.5 text-sm" };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, loading, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cx(base, variants[variant], sizes[size], className)} disabled={disabled || loading} {...rest}>
      {loading ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icon}
      {children}
    </button>
  );
});

/** 링크처럼 이동하는 버튼 */
export function LinkButton({ to, variant = "secondary", size = "md", icon, className, children }: { to: string; variant?: Variant; size?: Size; icon?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <Link to={to} className={cx(base, variants[variant], sizes[size], className)}>
      {icon}
      {children}
    </Link>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx("inline-flex size-8 items-center justify-center rounded text-ink2 hover:bg-sunken hover:text-ink disabled:opacity-40", className)} {...rest}>
      {children}
    </button>
  );
}

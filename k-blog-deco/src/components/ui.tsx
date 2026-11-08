import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "accent";
  size?: "sm" | "md" | "lg";
};

export function Button({ variant = "secondary", size = "md", className, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-[15px]",
        variant === "primary" && "bg-ink text-white hover:bg-black",
        variant === "accent" && "bg-accent text-white hover:bg-accent-ink",
        variant === "secondary" && "border border-line-2 bg-card text-ink hover:bg-paper-2",
        variant === "ghost" && "text-ink-2 hover:bg-paper-2 hover:text-ink",
        variant === "danger" && "border border-line-2 bg-card text-danger hover:bg-accent-soft",
        className,
      )}
    />
  );
}

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...p}
      className={cx(
        "h-10 w-full rounded-lg border border-line-2 bg-card px-3 text-sm text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none",
        className,
      )}
    />
  );
}

export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...p}
      className={cx(
        "w-full rounded-lg border border-line-2 bg-card px-3 py-2.5 text-sm leading-relaxed text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none",
        className,
      )}
    />
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-ink-3">{hint}</span>}
    </label>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-2xl border border-line bg-card", className)}>{children}</div>;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
    />
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "ok"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cx(
        "rounded-lg border px-3.5 py-2.5 text-sm leading-relaxed",
        tone === "info" && "border-line bg-paper-2 text-ink-2",
        tone === "error" && "border-accent/30 bg-accent-soft text-accent-ink",
        tone === "ok" && "border-ok/25 bg-[#e8f5ed] text-ok",
      )}
    >
      {children}
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-extrabold tracking-tight", className)}>
      <span className="grid size-7 place-items-center rounded-md bg-accent text-[15px] font-black text-white">K</span>
      <span>블로그 꾸미기</span>
    </span>
  );
}

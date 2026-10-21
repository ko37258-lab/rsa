import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx } from "@/lib/format";

/** 이름표 + 입력칸 + 도움말 */
export function Field({ label, htmlFor, hint, error, children, className }: { label: ReactNode; htmlFor?: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-ink2">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-bad">{error}</p> : hint ? <p className="text-xs text-ink3">{hint}</p> : null}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("field", className)} {...rest} />;
}

export function Textarea({ className, rows = 4, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={cx("field", className)} {...rest} />;
}

export function Select({ className, options, placeholder, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { options: Array<{ value: string; label: string }>; placeholder?: string }) {
  return (
    <select className={cx("field pr-8", className)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** 금액 입력: 쉼표를 붙여 보여주고 숫자로 돌려준다 */
export function MoneyInput({ value, onChange, id, placeholder }: { value: number | null; onChange: (v: number | null) => void; id?: string; placeholder?: string }) {
  return (
    <div className="relative">
      <input
        id={id}
        inputMode="numeric"
        className="field num pr-8 text-right"
        placeholder={placeholder}
        value={value === null ? "" : value.toLocaleString("ko-KR")}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d-]/g, "");
          onChange(digits === "" || digits === "-" ? null : Number(digits));
        }}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink3">원</span>
    </div>
  );
}

/** 두세 칸씩 놓는 입력 격자. 좁으면 한 줄 */
export function FormGrid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
  return <div className={cx("grid grid-cols-1 gap-3", cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}>{children}</div>;
}

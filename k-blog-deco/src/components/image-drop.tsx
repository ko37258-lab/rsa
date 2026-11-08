"use client";

import { useRef, useState } from "react";
import { cx } from "./ui";

/** 드래그 앤 드롭 + 클릭 업로드 영역 */
export function ImageDrop({
  accept = "image/png,image/jpeg,image/webp,image/gif",
  multiple = true,
  onFiles,
  title,
  hint,
  disabled,
}: {
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  title: string;
  hint?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      onClick={() => !disabled && ref.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !disabled && ref.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) onFiles(Array.from(e.dataTransfer.files));
      }}
      className={cx(
        "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-7 text-center transition",
        over ? "border-accent bg-accent-soft" : "border-line-2 bg-paper hover:border-ink-3",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <p className="text-sm font-bold text-ink">{title}</p>
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}

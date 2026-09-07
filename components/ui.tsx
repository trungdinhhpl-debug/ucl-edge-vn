import * as React from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

import type { SortDir } from "@/lib/sort";
import { cn } from "@/lib/utils";

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)}
      {...p}
    />
  );
}

export function CardHeader({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-4 pb-2", className)} {...p} />;
}

export function CardTitle({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("font-semibold leading-tight tracking-tight", className)} {...p} />
  );
}

export function CardContent({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 pt-2", className)} {...p} />;
}

export function Button({
  className,
  variant = "default",
  size = "md",
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "danger" | "accent";
  size?: "sm" | "md";
}) {
  const variants = {
    default: "bg-primary text-primary-foreground hover:opacity-90",
    accent: "bg-accent text-accent-foreground hover:opacity-90",
    outline: "border border-border bg-transparent hover:bg-muted",
    ghost: "bg-transparent hover:bg-muted",
    danger: "bg-danger text-white hover:opacity-90",
  };
  const sizes = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm" };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...p}
    />
  );
}

export function Badge({ className, ...p }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        className,
      )}
      {...p}
    />
  );
}

export function Input({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40",
        className,
      )}
      {...p}
    />
  );
}

export function Select({ className, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring/40",
        className,
      )}
      {...p}
    />
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "positive" | "caution" | "danger";
  className?: string;
}) {
  const toneCls =
    tone === "positive"
      ? "text-positive"
      : tone === "caution"
        ? "text-caution"
        : tone === "danger"
          ? "text-danger"
          : "";
  return (
    <div className={cn("rounded-md bg-muted/50 p-3", className)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-xl font-bold tabular-nums", toneCls)}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      {label ?? "Đang tải dữ liệu…"}
    </div>
  );
}

export function ErrorBox({ error }: { error: string }) {
  return (
    <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
      Không tải được dữ liệu: {error}
    </div>
  );
}

/** Ô độ khó 1–5 dùng chung cho bảng lịch thi đấu. */
export function DifficultyCell({
  value,
  children,
  className,
}: {
  value: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-[3.6rem] items-center justify-center rounded px-1.5 py-1 text-[11px] font-semibold",
        `fdr-${Math.min(5, Math.max(1, Math.round(value)))}`,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SectionTitle({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

/** Nhãn cảnh báo dùng lại ở bảng cầu thủ và trang đội hình. */
export function RiskBadge({ text, tone }: { text: string; tone: "ok" | "warn" | "bad" }) {
  const cls =
    tone === "bad"
      ? "bg-danger/15 text-danger"
      : tone === "warn"
        ? "bg-caution/20 text-caution"
        : "bg-positive/15 text-positive";
  return <Badge className={cls}>{text}</Badge>;
}


/** Tiêu đề cột bấm được để sắp xếp, kèm mũi tên chỉ chiều đang áp dụng. */
export function SortableTh<K extends string>({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  defaultDir = "desc",
  align = "left",
  title,
  className,
}: {
  label: React.ReactNode;
  sortKey: K;
  activeKey: K;
  dir: SortDir;
  onSort: (key: K, defaultDir: SortDir) => void;
  defaultDir?: SortDir;
  align?: "left" | "right" | "center";
  title?: string;
  className?: string;
}) {
  const active = activeKey === sortKey;
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown;

  return (
    <th
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        "p-0 font-medium",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey, defaultDir)}
        title={title ?? "Bấm để sắp xếp"}
        className={cn(
          "flex w-full items-center gap-1 px-2.5 py-2.5 transition hover:text-foreground",
          active && "text-primary",
          align === "right" && "flex-row-reverse",
          align === "center" && "justify-center",
        )}
      >
        <span>{label}</span>
        <Icon
          className={cn(
            "h-3 w-3 shrink-0",
            active ? "opacity-100" : "opacity-30",
          )}
        />
      </button>
    </th>
  );
}

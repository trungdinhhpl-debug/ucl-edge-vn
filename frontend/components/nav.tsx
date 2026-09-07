"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  BookOpen,
  CalendarCheck2,
  CalendarRange,
  Crown,
  LayoutDashboard,
  Menu,
  Moon,
  Route,
  Search,
  Shield,
  Sun,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/squad", label: "Chọn đội hình", icon: Shield },
  { href: "/planner", label: "Kế hoạch", icon: Route },
  { href: "/chips", label: "Chip", icon: CalendarCheck2 },
  { href: "/players", label: "Cầu thủ", icon: Search },
  { href: "/captaincy", label: "Đội trưởng", icon: Crown },
  { href: "/fixtures", label: "Lịch thi đấu", icon: CalendarRange },
  { href: "/methodology", label: "Phương pháp", icon: BookOpen },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="h-8 w-8" />;
  return (
    <button
      type="button"
      aria-label="Đổi giao diện sáng/tối"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-bold">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-sm text-primary-foreground">
            ★
          </span>
          <span className="hidden sm:inline">UCL Edge VN</span>
        </Link>

        <nav className="ml-2 hidden flex-1 items-center gap-0.5 lg:flex">
          {items.map((it) => {
            const active = path === it.href;
            return (
              <Link
                key={it.href}
                href={it.href}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-sm font-medium transition",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {it.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <button
            type="button"
            aria-label="Mở menu"
            className="rounded-md p-2 text-muted-foreground hover:bg-muted lg:hidden"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t px-3 py-2 lg:hidden">
          {items.map((it) => {
            const Icon = it.icon;
            const active = path === it.href;
            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {it.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}

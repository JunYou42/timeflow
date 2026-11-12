"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  CheckSquare,
  FolderKanban,
  LayoutDashboard,
  Settings,
  Timer,
} from "lucide-react";

import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, description: "Today at a glance" },
  { href: "/tasks", label: "Tasks", icon: CheckSquare, description: "Plan and organise work" },
  { href: "/projects", label: "Projects", icon: FolderKanban, description: "Roadmap on a timeline" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, description: "Schedule your time" },
  { href: "/time-logs", label: "Time Logs", icon: Timer, description: "Review tracked time" },
  { href: "/analytics", label: "Analytics", icon: BarChart3, description: "Where the hours go" },
  { href: "/settings", label: "Settings", icon: Settings, description: "Profile and data" },
];

export function TimeFlowLogo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Timer className="size-4" />
      </div>
      {!collapsed ? (
        <span className="text-sm font-semibold tracking-tight">TimeFlow</span>
      ) : null}
    </div>
  );
}

interface SidebarNavProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function SidebarNav({ collapsed = false, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 px-2" aria-label="Main">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              collapsed && "justify-center px-0",
              active
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            {!collapsed ? <span className="truncate">{item.label}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

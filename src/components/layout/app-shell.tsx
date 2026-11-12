"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, RefreshCw } from "lucide-react";

import { FullPageLoading, ErrorState } from "@/components/layout/states";
import { NAV_ITEMS, SidebarNav, TimeFlowLogo } from "@/components/layout/sidebar";
import { AuthGate } from "@/components/auth/auth-gate";
import { TimerWidget } from "@/components/timer/timer-widget";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAppStore } from "@/store/use-app-store";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const status = useAppStore((state) => state.status);
  const error = useAppStore((state) => state.error);
  const mode = useAppStore((state) => state.mode);
  const user = useAppStore((state) => state.user);
  const profile = useAppStore((state) => state.profile);
  const signOutUser = useAppStore((state) => state.signOutUser);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const current = NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );

  const initial = (profile?.display_name ?? user?.email ?? "T").trim().charAt(0).toUpperCase();

  if (status === "idle" || status === "loading") {
    return <FullPageLoading />;
  }

  if (status === "error") {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <ErrorState
          title="Could not load your data"
          description={error ?? undefined}
          action={
            <Button size="sm" onClick={() => void useAppStore.getState().initialize()}>
              <RefreshCw className="size-4" />
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  // Supabase is configured but nobody is signed in yet.
  if (mode === "supabase" && !user) {
    return <AuthGate />;
  }

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Desktop sidebar ------------------------------------------------ */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-background lg:flex">
        <div className="flex h-14 items-center px-4">
          <Link href="/dashboard" className="focus-visible:outline-none">
            <TimeFlowLogo />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <SidebarNav />
        </div>
        {mode === "local" ? (
          <div className="border-t p-3">
            <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] leading-tight text-amber-900">
              Local Mode — data lives in this browser. Add Supabase keys to sync.
            </p>
          </div>
        ) : null}
      </aside>

      {/* Main ------------------------------------------------------------ */}
      <div className="flex min-h-screen w-full flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex h-14 items-center px-4">
                <TimeFlowLogo />
              </div>
              <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{current?.label ?? "TimeFlow"}</p>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              {current?.description ?? "Personal time management"}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <TimerWidget variant="compact" className="hidden sm:flex" />
            {mode === "supabase" ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    aria-label="Account menu"
                  >
                    <Avatar className="size-8">
                      <AvatarFallback className="text-xs">{initial}</AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                    {profile?.display_name ?? user?.email ?? "Signed in"}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void signOutUser()}>Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Avatar className="size-8">
                <AvatarFallback className="text-xs">{initial}</AvatarFallback>
              </Avatar>
            )}
          </div>
        </header>

        <main className="flex-1">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">{children}</div>
        </main>

        <footer className="border-t px-4 py-3 text-center text-xs text-muted-foreground sm:px-6">
          TimeFlow · {mode === "supabase" ? "Connected to Supabase" : "Local Mode"}
        </footer>
      </div>
    </div>
  );
}

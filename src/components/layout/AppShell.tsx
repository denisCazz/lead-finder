"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";
  const isDashboard = pathname === "/";

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {!isDashboard && (
        <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Bitora.it</p>
              <p className="text-sm font-medium text-[var(--foreground)]">Centro operativo lead automation</p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-[var(--primary)]/40 hover:text-[var(--primary)]"
            >
              Torna alla dashboard
            </Link>
          </div>
        </header>
      )}
      <main className="mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}

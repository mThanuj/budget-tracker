import { Suspense } from "react";
import { Brand } from "@/components/app/brand";
import { BottomNav, MobileMenu, SidebarNav } from "@/components/app/nav-links";
import { UserMenu, UserMenuSkeleton } from "@/components/app/user-menu";
import { AddEntryButton } from "@/components/transactions/add-entry-button";
import { EntryDialogProvider } from "@/components/transactions/entry-dialog";

// The shell reads no user data, so it renders without waiting; anything that
// reads the session streams in behind its own Suspense boundary (every page
// renders per request for its CSP nonce, D-027).
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <EntryDialogProvider>
      {/* The sidebar starts at lg (1024px). Below that (phones, tablets in
          portrait) the top bar and bottom bar navigate and the content gets the
          full width: at 768px a sidebar left only ~450px, which cramped cards. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:ring-3 focus:ring-ring/50 focus:outline-none"
      >
        Skip to content
      </a>
      <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
        {/* The column carries the background for the full page height; the
            contents stay pinned to the viewport while the page scrolls. */}
        <div className="hidden border-r border-sidebar-border bg-sidebar lg:block">
          <aside className="sticky top-0 flex h-dvh flex-col gap-6 px-3 py-5">
            <Brand href="/dashboard" className="px-2" />
            <AddEntryButton className="h-9 w-full" />
            <SidebarNav />
            <div className="mt-auto">
              <Suspense fallback={<UserMenuSkeleton />}>
                <UserMenu />
              </Suspense>
            </div>
          </aside>
        </div>

        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
            <Brand href="/dashboard" />
            <div className="flex items-center gap-1">
              <MobileMenu />
              <Suspense fallback={<UserMenuSkeleton compact />}>
                <UserMenu compact />
              </Suspense>
            </div>
          </header>
          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 outline-none sm:px-6 lg:px-10 lg:py-10"
          >
            {children}
          </main>
        </div>

        <BottomNav />
      </div>
    </EntryDialogProvider>
  );
}

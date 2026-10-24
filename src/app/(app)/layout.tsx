import { Suspense } from "react";
import { Brand } from "@/components/app/brand";
import { BottomNav, MobileMenu, SidebarNav } from "@/components/app/nav-links";
import { UserMenu, UserMenuSkeleton } from "@/components/app/user-menu";
import { AddEntryButton } from "@/components/transactions/add-entry-button";
import { EntryDialogProvider } from "@/components/transactions/entry-dialog";

// The shell is static and renders instantly; anything that reads the
// session streams in behind its own Suspense boundary.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <EntryDialogProvider>
      <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
        {/* The column carries the background for the full page height; the
            contents stay pinned to the viewport while the page scrolls. */}
        <div className="hidden border-r border-sidebar-border bg-sidebar md:block">
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
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur md:hidden">
            <Brand href="/dashboard" />
            <div className="flex items-center gap-1">
              <MobileMenu />
              <Suspense fallback={<UserMenuSkeleton compact />}>
                <UserMenu compact />
              </Suspense>
            </div>
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 sm:px-6 md:px-10 md:py-10">
            {children}
          </main>
        </div>

        <BottomNav />
      </div>
    </EntryDialogProvider>
  );
}

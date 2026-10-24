import { Skeleton } from "@/components/ui/skeleton";
import { billingEnabled } from "@/config/features";
import { isAdmin } from "@/server/admin";
import { getSession } from "@/server/session";
import { UserMenuDropdown } from "./user-menu-dropdown";

export async function UserMenu({ compact = false }: { compact?: boolean }) {
  const session = await getSession();
  if (!session) return null;
  const { name, email, image } = session.user;
  return <UserMenuDropdown name={name} email={email} image={image ?? null} compact={compact} admin={isAdmin(session.user)} billing={billingEnabled()} />;
}

export function UserMenuSkeleton({ compact = false }: { compact?: boolean }) {
  if (compact) return <Skeleton className="size-9 rounded-full" />;
  return (
    <div className="flex items-center gap-3 p-2">
      <Skeleton className="size-8 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  );
}

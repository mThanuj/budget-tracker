import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { CategoriesManager } from "@/components/categories/categories-manager";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/server/db";
import { listCategories } from "@/server/services/categories";
import { requireUser } from "@/server/session";

export const metadata = { title: "Categories" };

export default function CategoriesPage() {
  return (
    <>
      <PageHeader title="Categories" description="Group your entries so budgets and reports make sense." />
      <Suspense fallback={<CategoriesSkeleton />}>
        <CategoriesContent />
      </Suspense>
    </>
  );
}

async function CategoriesContent() {
  const user = await requireUser();
  const categories = await listCategories(db, user.id, { includeArchived: true });
  return (
    <CategoriesManager
      categories={categories.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        icon: c.icon,
        color: c.color,
        usage: c.usage,
        archived: c.archivedAt !== null,
      }))}
    />
  );
}

function CategoriesSkeleton() {
  return (
    <div className="grid gap-6">
      <Skeleton className="h-9 w-56 rounded-xl" />
      <Skeleton className="h-96 w-full rounded-2xl" />
    </div>
  );
}

"use client";

import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui-extra/confirm-dialog";
import { FormField, fieldAria } from "@/components/ui-extra/form-field";
import { ColorPicker, IconPicker } from "@/components/ui-extra/pickers";
import { Segmented } from "@/components/ui-extra/segmented";
import { SWATCHES } from "@/lib/category-icons";
import { categoryAction, saveCategory } from "@/server/actions/categories";
import { CategoryIcon } from "./category-icon";
import { callAction, NOT_SENT, NOT_SENT_MESSAGE } from "@/lib/call-action";

type Kind = "expense" | "income";

export type CategoryItem = {
  id: string;
  name: string;
  kind: Kind;
  icon: string;
  color: string;
  usage: number;
  archived: boolean;
};

function CategoryForm({ category, kind, onDone }: { category?: CategoryItem; kind: Kind; onDone: () => void }) {
  const [icon, setIcon] = useState(category?.icon ?? "tag");
  const [color, setColor] = useState<string>(category?.color ?? SWATCHES[0]);
  const [state, formAction, pending] = useActionState(async (prev: Parameters<typeof saveCategory>[0], fd: FormData) => {
    // A failed send keeps the form as typed and says so inline.
    const result = await callAction(() => saveCategory(prev, fd), { notify: false });
    if (result === NOT_SENT) return { ok: false as const, error: NOT_SENT_MESSAGE };
    if (result?.ok) {
      toast.success(category ? "Changes saved" : "Category added");
      onDone();
    }
    return result;
  }, undefined);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className="grid gap-5">
      {category && <input type="hidden" name="id" value={category.id} />}
      <input type="hidden" name="kind" value={category?.kind ?? kind} />
      <input type="hidden" name="icon" value={icon} />
      <input type="hidden" name="color" value={color} />

      <div className="flex items-end gap-3">
        <CategoryIcon icon={icon} color={color} size="lg" />
        <FormField id="category-name" label="Name" error={errors.name} className="flex-1">
          <Input
            {...fieldAria("category-name", errors.name)}
            name="name"
            autoFocus
            autoComplete="off"
            maxLength={40}
            placeholder={kind === "income" ? "Side project" : "Pets"}
            defaultValue={category?.name ?? ""}
            className="h-10"
          />
        </FormField>
      </div>

      <IconPicker value={icon} onChange={setIcon} />
      {errors.icon && <p role="alert" className="-mt-3 text-sm text-destructive">{errors.icon}</p>}
      <ColorPicker value={color} onChange={setColor} />

      {state && !state.ok && state.error && (
        <p role="alert" className="text-sm text-destructive">{state.error}</p>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending} className="px-5">
          {pending ? "Saving…" : category ? "Save changes" : "Add category"}
        </Button>
      </div>
    </form>
  );
}

function CategoryDialog({
  open,
  onOpenChange,
  category,
  kind,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: CategoryItem;
  kind: Kind;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            {category ? "Edit category" : kind === "income" ? "New income category" : "New spending category"}
          </DialogTitle>
          <DialogDescription className="sr-only">Choose a name, icon and color.</DialogDescription>
        </DialogHeader>
        {open && <CategoryForm category={category} kind={kind} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

async function run(op: Parameters<typeof categoryAction>[0], id: string, success: string) {
  const result = await callAction(() => categoryAction(op, id));
  if (result === NOT_SENT) return false;
  if (result?.ok) {
    toast.success(success);
    return true;
  }
  toast.error(result?.error ?? "Something went wrong. Try again.");
  return false;
}

function CategoryRow({ category }: { category: CategoryItem }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <li className={cn("flex items-center gap-3 px-4 py-3 sm:px-5", category.archived && "opacity-70")}>
      <CategoryIcon icon={category.icon} color={category.color} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="truncate">{category.name}</span>
          {category.archived && <Badge variant="outline">Archived</Badge>}
        </p>
        <p className="text-xs text-muted-foreground">
          {category.usage === 0 ? "Not used yet" : `${category.usage} ${category.usage === 1 ? "entry" : "entries"}`}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Actions for ${category.name}`}
          className="grid size-8 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <MoreHorizontalIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => setEditing(true)}>Edit</DropdownMenuItem>
          {category.usage > 0 && (
            <DropdownMenuItem render={<Link href={`/transactions?category=${category.id}`} />}>View entries</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {category.archived ? (
            <DropdownMenuItem onClick={() => run("restore", category.id, "Category restored")}>Restore</DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => run("archive", category.id, "Category archived")}>Archive</DropdownMenuItem>
          )}
          {category.usage === 0 && (
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <CategoryDialog open={editing} onOpenChange={setEditing} category={category} kind={category.kind} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete “${category.name}”?`}
        description="No entries use it, so nothing else changes. This can't be undone."
        confirmLabel="Delete category"
        pendingLabel="Deleting…"
        destructive
        onConfirm={() => run("delete", category.id, "Category deleted")}
      />
    </li>
  );
}

export function CategoriesManager({ categories }: { categories: CategoryItem[] }) {
  const [kind, setKind] = useState<Kind>("expense");
  const [adding, setAdding] = useState(false);
  const ofKind = categories.filter((c) => c.kind === kind);
  const active = ofKind.filter((c) => !c.archived);
  const archived = ofKind.filter((c) => c.archived);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Category type"
          value={kind}
          onChange={setKind}
          options={[
            { value: "expense", label: "Spending" },
            { value: "income", label: "Income" },
          ]}
        />
        <Button onClick={() => setAdding(true)}>
          <PlusIcon aria-hidden />
          Add category
        </Button>
      </div>

      <ul className="divide-y divide-dashed divide-border overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
        {active.map((c) => (
          <CategoryRow key={c.id} category={c} />
        ))}
        {active.length === 0 && (
          <li className="px-5 py-10 text-center text-muted-foreground">No {kind === "income" ? "income" : "spending"} categories yet.</li>
        )}
      </ul>

      {archived.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground select-none hover:text-foreground">
            Archived ({archived.length})
          </summary>
          <ul className="mt-4 divide-y divide-dashed divide-border overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
            {archived.map((c) => (
              <CategoryRow key={c.id} category={c} />
            ))}
          </ul>
        </details>
      )}

      <CategoryDialog open={adding} onOpenChange={setAdding} kind={kind} />
    </div>
  );
}

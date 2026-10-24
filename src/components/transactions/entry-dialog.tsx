"use client";

import { createContext, type ReactNode, use, useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { type EntryFormData, getEntryFormData } from "@/server/actions/entry-form";
import { type EditableEntry, type EntryPreset, TransactionForm } from "./transaction-form";

type Opening = { mode: "new"; preset?: EntryPreset } | { mode: "edit"; entry: EditableEntry };

type EntryDialogApi = {
  openNew: (preset?: EntryPreset) => void;
  openEdit: (entry: EditableEntry) => void;
};

const EntryDialogContext = createContext<EntryDialogApi | null>(null);

export function useEntryDialog() {
  const api = use(EntryDialogContext);
  if (!api) throw new Error("useEntryDialog must be used inside <EntryDialogProvider>");
  return api;
}

/** One entry dialog for the whole app; anything can open it for a new or existing entry. */
export function EntryDialogProvider({ children }: { children: ReactNode }) {
  const [opening, setOpening] = useState<Opening | null>(null);
  const [data, setData] = useState<EntryFormData | null>(null);
  const [formKey, setFormKey] = useState(0);
  const request = useRef(0);

  const open = useCallback((next: Opening) => {
    const id = ++request.current;
    setOpening(next);
    setData(null);
    setFormKey((k) => k + 1);
    getEntryFormData()
      .then((d) => request.current === id && setData(d))
      .catch(() => {
        if (request.current !== id) return;
        toast.error("Couldn't load your wallets. Check your connection and try again.");
        setOpening(null);
      });
  }, []);

  const api = useMemo<EntryDialogApi>(
    () => ({
      openNew: (preset) => open({ mode: "new", preset }),
      openEdit: (entry) => open({ mode: "edit", entry }),
    }),
    [open],
  );

  const editing = opening?.mode === "edit";

  return (
    <EntryDialogContext value={api}>
      {children}
      <Dialog open={opening !== null} onOpenChange={(o) => !o && setOpening(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-5 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">{editing ? "Edit entry" : "New entry"}</DialogTitle>
            <DialogDescription className="sr-only">
              {editing ? "Change or delete this entry." : "Record money you spent, received or moved between wallets."}
            </DialogDescription>
          </DialogHeader>
          {data && opening ? (
            <TransactionForm
              key={formKey}
              data={data}
              entry={opening.mode === "edit" ? opening.entry : undefined}
              preset={opening.mode === "new" ? opening.preset : undefined}
              onDone={() => setOpening(null)}
            />
          ) : (
            <div className="grid gap-5" aria-busy="true" aria-label="Loading">
              <Skeleton className="h-9 w-full rounded-xl" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </EntryDialogContext>
  );
}

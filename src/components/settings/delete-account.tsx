"use client";

import { useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteAccount } from "@/server/actions/account";
import { callAction, NOT_SENT, NOT_SENT_MESSAGE } from "@/lib/call-action";

export function DeleteAccount({ pro }: { pro: boolean }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button variant="outline" className="text-destructive" onClick={() => setOpen(true)}>
        Delete account
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(o) => {
          if (pending) return;
          setOpen(o);
          setTyped("");
          setError(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes your wallets, entries, budgets, goals, recurring items and reports. It can&rsquo;t be undone.
              {pro && " Your Pro renewal is cancelled now, and the rest of the paid period isn't refunded."} Download your entries
              first if you want a copy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form
            id="delete-account"
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const result = await callAction(() => deleteAccount(typed), { notify: false });
                // On success the server redirects, so only failures come back.
                if (result === NOT_SENT) setError(NOT_SENT_MESSAGE);
                else if (result && !result.ok) setError(result.error);
              });
            }}
          >
            <Label htmlFor="delete-confirm">Type DELETE to confirm</Label>
            <Input id="delete-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" disabled={pending} />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </form>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep my account</AlertDialogCancel>
            <Button type="submit" form="delete-account" variant="destructive" disabled={pending || typed.trim().toUpperCase() !== "DELETE"}>
              {pending ? "Deleting…" : "Delete everything"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

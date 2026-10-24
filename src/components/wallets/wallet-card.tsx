"use client";

import { ArrowLeftRightIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { useEntryDialog } from "@/components/transactions/entry-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui-extra/confirm-dialog";
import { describeBalance, WALLET_KIND_LABEL, type WalletKind } from "@/lib/wallets";
import { walletAction } from "@/server/actions/wallets";
import { type EditableWallet, WalletFormDialog } from "./wallet-form";
import { WalletIcon } from "./wallet-icon";

export type WalletCardData = EditableWallet & {
  kind: WalletKind;
  balanceMinor: number;
  entryCount: number;
  archived: boolean;
  isDefault: boolean;
};

export function AddWalletButton({ currency, variant = "default" }: { currency: string; variant?: "default" | "outline" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <PlusIcon aria-hidden />
        Add wallet
      </Button>
      <WalletFormDialog open={open} onOpenChange={setOpen} currency={currency} />
    </>
  );
}

export function MoveMoneyButton() {
  const { openNew } = useEntryDialog();
  return (
    <Button variant="outline" onClick={() => openNew({ type: "transfer" })}>
      <ArrowLeftRightIcon aria-hidden />
      Move money
    </Button>
  );
}

async function run(op: Parameters<typeof walletAction>[0], id: string, success: string) {
  const result = await walletAction(op, id);
  if (result?.ok) {
    toast.success(success);
    return true;
  }
  toast.error(result?.error ?? "Something went wrong. Try again.");
  return false;
}

export function WalletCard({ wallet, currency }: { wallet: WalletCardData; currency: string }) {
  const { openNew } = useEntryDialog();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  const balance = describeBalance(wallet.kind, wallet.balanceMinor, currency);

  return (
    <article
      className={cn(
        "flex flex-col gap-5 rounded-2xl bg-card p-5 ring-1 ring-foreground/10",
        wallet.archived && "opacity-70",
      )}
    >
      <div className="flex items-start gap-3">
        <WalletIcon kind={wallet.kind} color={wallet.color} />
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 font-medium">
            <span className="truncate">{wallet.name}</span>
            {wallet.isDefault && <Badge variant="secondary">Default</Badge>}
            {wallet.archived && <Badge variant="outline">Archived</Badge>}
          </h3>
          <p className="text-sm text-muted-foreground">{WALLET_KIND_LABEL[wallet.kind]}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Actions for ${wallet.name}`}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <MoreHorizontalIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {wallet.archived ? (
              <DropdownMenuItem onClick={() => run("restore", wallet.id, "Wallet restored")}>Restore</DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem onClick={() => setEditing(true)}>Edit</DropdownMenuItem>
                {!wallet.isDefault && (
                  <DropdownMenuItem onClick={() => run("makeDefault", wallet.id, `${wallet.name} is now your default`)}>
                    Make default
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => openNew({ type: "transfer", walletId: wallet.id })}>
                  Move money from here
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem render={<Link href={`/transactions?wallet=${wallet.id}`} />}>View entries</DropdownMenuItem>
            <DropdownMenuSeparator />
            {!wallet.archived && <DropdownMenuItem onClick={() => setConfirm("archive")}>Archive</DropdownMenuItem>}
            {wallet.entryCount === 0 && (
              <DropdownMenuItem variant="destructive" onClick={() => setConfirm("delete")}>
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div>
        <p className="text-sm text-muted-foreground">{balance.label}</p>
        <p className={cn("tabular mt-0.5 text-2xl", balance.tone === "owed" && "text-warning")}>{balance.amount}</p>
      </div>

      <p className="text-sm text-muted-foreground">
        {wallet.entryCount === 0 ? "No entries yet" : `${wallet.entryCount} ${wallet.entryCount === 1 ? "entry" : "entries"}`}
      </p>

      <WalletFormDialog open={editing} onOpenChange={setEditing} wallet={wallet} currency={currency} />
      <ConfirmDialog
        open={confirm === "archive"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Archive ${wallet.name}?`}
        description="It disappears from wallet pickers and your total, but its entries and history stay. You can restore it any time."
        confirmLabel="Archive wallet"
        pendingLabel="Archiving…"
        onConfirm={() => run("archive", wallet.id, "Wallet archived")}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Delete ${wallet.name}?`}
        description="This wallet has no entries, so nothing else changes. This can't be undone."
        confirmLabel="Delete wallet"
        pendingLabel="Deleting…"
        destructive
        onConfirm={() => run("delete", wallet.id, "Wallet deleted")}
      />
    </article>
  );
}

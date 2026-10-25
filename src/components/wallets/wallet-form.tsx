"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField, fieldAria } from "@/components/ui-extra/form-field";
import { ColorPicker } from "@/components/ui-extra/pickers";
import { minorToInput } from "@/lib/money";
import { DEFAULT_WALLET_COLOR, WALLET_KINDS, type WalletKind } from "@/lib/wallets";
import { saveWallet } from "@/server/actions/wallets";
import { WALLET_KIND_ICON } from "./wallet-icon";

export type EditableWallet = {
  id: string;
  name: string;
  kind: WalletKind;
  color: string;
  openingBalanceMinor: number;
};

function WalletForm({ wallet, currency, onDone }: { wallet?: EditableWallet; currency: string; onDone: () => void }) {
  const [kind, setKind] = useState<WalletKind>(wallet?.kind ?? "bank");
  const [color, setColor] = useState<string | null>(wallet?.color ?? null);
  const effectiveColor = color ?? DEFAULT_WALLET_COLOR[kind];
  const isCard = kind === "credit_card";
  // A card's opening balance is stored negative (owed) but entered as a positive amount.
  const opening = wallet ? Math.abs(wallet.openingBalanceMinor) : 0;

  const [state, formAction, pending] = useActionState(async (prev: Parameters<typeof saveWallet>[0], fd: FormData) => {
    const result = await saveWallet(prev, fd);
    if (result?.ok) {
      toast.success(wallet ? "Changes saved" : "Wallet added");
      onDone();
    }
    return result;
  }, undefined);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className="grid gap-5">
      {wallet && <input type="hidden" name="id" value={wallet.id} />}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="color" value={effectiveColor} />

      <FormField id="wallet-name" label="Name" error={errors.name}>
        <Input
          {...fieldAria("wallet-name", errors.name)}
          name="name"
          autoFocus
          autoComplete="off"
          maxLength={40}
          placeholder="SBI Debit"
          defaultValue={wallet?.name ?? ""}
          className="h-10"
        />
      </FormField>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Type</legend>
        <div role="radiogroup" aria-label="Wallet type" className="grid grid-cols-2 gap-2">
          {WALLET_KINDS.map((k) => {
            const Icon = WALLET_KIND_ICON[k.value];
            const selected = kind === k.value;
            return (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setKind(k.value)}
                className={cn(
                  "grid gap-0.5 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  selected ? "border-primary bg-accent" : "border-border hover:bg-muted",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Icon className="size-4" aria-hidden />
                  {k.label}
                </span>
                <span className="text-xs text-muted-foreground">{k.hint}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <FormField
        id="openingBalance"
        label={
          wallet
            ? isCard ? "Amount owed before your first entry" : "Balance before your first entry"
            : isCard ? "How much do you owe on it right now?" : "How much is in it right now?"
        }
        hint={wallet ? "Changing this shifts the current balance by the same amount." : "You can leave this at 0 and adjust later."}
        error={errors.openingBalance}
      >
        <Input
          {...fieldAria("openingBalance", errors.openingBalance, true)}
          name="openingBalance"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          defaultValue={opening ? minorToInput(opening, currency) : ""}
          className="tabular h-10"
        />
      </FormField>

      <ColorPicker value={effectiveColor} onChange={setColor} />

      {state && !state.ok && state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending} className="px-5">
          {pending ? "Saving…" : wallet ? "Save changes" : "Add wallet"}
        </Button>
      </div>
    </form>
  );
}

export function WalletFormDialog({
  open,
  onOpenChange,
  wallet,
  currency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet?: EditableWallet;
  currency: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{wallet ? "Edit wallet" : "Add a wallet"}</DialogTitle>
          <DialogDescription>
            {wallet ? "Rename it, change its type or fix its starting balance." : "A bank account, card, cash, or anywhere else you keep money."}
          </DialogDescription>
        </DialogHeader>
        {open && <WalletForm wallet={wallet} currency={currency} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

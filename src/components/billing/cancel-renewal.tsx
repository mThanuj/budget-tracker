"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui-extra/confirm-dialog";
import { Button } from "@/components/ui/button";
import { cancelPro } from "@/server/actions/billing";

export function CancelRenewal({ until }: { until: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Cancel renewal
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Cancel Pro?"
        description={`You keep Pro until ${until} and won't be charged again. After that you're on Free; nothing you've recorded is lost.`}
        confirmLabel="Cancel renewal"
        pendingLabel="Cancelling…"
        destructive
        onConfirm={async () => {
          const result = await cancelPro();
          if (!result.ok) {
            toast.error(result.error);
            return false;
          }
          toast.success(`Cancelled. Pro stays on until ${until}.`);
          return true;
        }}
      />
    </>
  );
}

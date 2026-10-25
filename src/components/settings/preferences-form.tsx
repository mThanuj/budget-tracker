"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { detectTimeZone, timeZoneLabel, type Option } from "@/lib/preferences-options";
import {
  completeWelcome,
  savePreferences,
  type PreferencesState,
} from "@/server/actions/settings";
import { callAction, NOT_SENT, NOT_SENT_MESSAGE } from "@/lib/call-action";

const noopSubscribe = () => () => {};

export function PreferencesForm({
  mode,
  currency,
  timezone,
  currencies,
  timeZones,
}: {
  mode: "welcome" | "settings";
  currency: string;
  timezone: string;
  currencies: { common: Option[]; all: Option[] };
  timeZones: Option[];
}) {
  // On first setup, suggest the browser's time zone instead of the default.
  const detected = useSyncExternalStore(noopSubscribe, detectTimeZone, () => null);
  const [chosenZone, setChosenZone] = useState<string | null>(null);
  const zone = chosenZone ?? (mode === "welcome" && detected ? detected : timezone);
  const zoneOptions =
    timeZones.some((o) => o.value === zone) ? timeZones : [{ value: zone, label: timeZoneLabel(zone) }, ...timeZones];

  const [state, formAction, pending] = useActionState(
    async (prev: PreferencesState, formData: FormData) => {
      const result = await callAction(
        () => (mode === "welcome" ? completeWelcome(prev, formData) : savePreferences(prev, formData)),
        { notify: false },
      );
      if (result === NOT_SENT) return { error: NOT_SENT_MESSAGE };
      if (result && "ok" in result) toast.success("Changes saved");
      return result;
    },
    undefined,
  );

  return (
    <form action={formAction} className="grid gap-6">
      <div className="grid gap-2">
        <Label htmlFor="currency">Currency</Label>
        <NativeSelect id="currency" name="currency" defaultValue={currency} className="w-full">
          <NativeSelectOptGroup label="Common">
            {currencies.common.map((o) => (
              <NativeSelectOption key={o.value} value={o.value}>
                {o.label}
              </NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
          <NativeSelectOptGroup label="All currencies">
            {currencies.all.map((o) => (
              <NativeSelectOption key={o.value} value={o.value}>
                {o.label}
              </NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
        </NativeSelect>
        <p className="text-sm text-muted-foreground">
          {mode === "welcome"
            ? "All your amounts are shown in this currency."
            : "Changing this relabels your existing amounts. It doesn't convert them."}
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="timezone">Time zone</Label>
        <NativeSelect
          id="timezone"
          name="timezone"
          value={zone}
          onChange={(e) => setChosenZone(e.target.value)}
          className="w-full"
        >
          {zoneOptions.map((o) => (
            <NativeSelectOption key={o.value} value={o.value}>
              {o.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <p className="text-sm text-muted-foreground">
          Decides what counts as &ldquo;today&rdquo; and when each month starts.
        </p>
      </div>

      {state && "error" in state && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {mode === "welcome"
            ? pending
              ? "Saving…"
              : "Save and continue"
            : pending
              ? "Saving…"
              : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import {
  CUSTOM_INDUSTRY_MAX,
  INDUSTRY_GROUPS,
  OTHER_INDUSTRY,
  customIndustryError,
  customIndustryInput,
} from "@/lib/industries";

export const SELECT_CLASS =
  "flex h-10 w-full rounded-lg border border-border bg-background px-3 py-1 text-base shadow-xs transition-all focus-visible:border-gold/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

type Props = {
  /** A listed industry, or OTHER_INDUSTRY. "" = nothing picked yet. */
  selected: string;
  onSelected: (value: string) => void;
  custom: string;
  onCustom: (value: string) => void;
};

/**
 * "What kind of business is it?" — a grouped dropdown (the phone's own picker,
 * easy for anyone) covering a wide range of trades, with "Other" opening a box
 * to describe it in a few words.
 */
export function IndustryPicker({ selected, onSelected, custom, onCustom }: Props) {
  return (
    <div className="space-y-2">
      <Label htmlFor="shop-industry">Kind of business</Label>
      <select
        id="shop-industry"
        className={SELECT_CLASS}
        value={selected}
        onChange={(e) => onSelected(e.target.value)}
      >
        <option value="" disabled>
          Choose what you sell or do
        </option>
        {INDUSTRY_GROUPS.map((g) => (
          <optgroup key={g.group} label={g.group}>
            {g.items.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={OTHER_INDUSTRY}>Other — not in this list</option>
      </select>
      {selected === OTHER_INDUSTRY && (
        <>
          <Input
            value={custom}
            maxLength={CUSTOM_INDUSTRY_MAX}
            onChange={(e) => onCustom(customIndustryInput(e.target.value))}
            placeholder="Describe your business in a few words"
            aria-label="Describe your business"
            autoFocus
          />
          <FieldError message={customIndustryError(custom)} />
        </>
      )}
    </div>
  );
}

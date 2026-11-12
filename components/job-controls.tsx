"use client";

import { useId, type ReactNode } from "react";
import { Icon } from "./ui";

/** A big, plain choice. The selected one is filled and ticked, so colour is never the only cue. */
export function Chip({ selected, icon, children, onClick }: { selected: boolean; icon?: string; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="chip" aria-pressed={selected} onClick={onClick}>
      {selected ? <Icon name="check" size={20} /> : icon ? <Icon name={icon} size={20} /> : null}
      <span>{children}</span>
    </button>
  );
}

export function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="chip-group">
      <p className="control-label" id={id}>{label}</p>
      <div className="chip-row" role="group" aria-labelledby={id}>{children}</div>
    </div>
  );
}

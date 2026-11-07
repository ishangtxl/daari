"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
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

/** A bottom sheet on phones. Uses the native dialog, so focus, Escape and the backdrop just work. */
export function Sheet({ open, onClose, title, closeLabel, children }: { open: boolean; onClose: () => void; title: string; closeLabel: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} className="sheet" aria-labelledby={titleId} onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="sheet-body">
        <div className="sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="sheet-close" aria-label={closeLabel} onClick={onClose}><Icon name="close" size={26} /></button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

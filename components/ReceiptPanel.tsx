import type { ActionReceipt } from "@/lib/types";
import type { RefObject } from "react";

export interface ReceiptPanelProps {
  receipt: ActionReceipt;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  onReset?: () => void;
  resetLabel?: string;
  className?: string;
}

export function ReceiptPanel({
  receipt,
  headingRef,
  onReset,
  resetLabel = "Start again",
  className = "",
}: ReceiptPanelProps) {
  const complete = receipt.status === "completed";
  const classes = [
    "receipt",
    "receipt-panel",
    complete ? "receipt-complete" : "receipt-stopped",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      data-receipt-source={receipt.source}
      data-receipt-status={receipt.status}
      role="status"
    >
      <div className="receipt-mark" aria-hidden="true">
        {complete ? "✓" : "–"}
      </div>
      <p className="receipt-label">
        {complete ? "Action complete" : "No action confirmed"}
      </p>
      <h3 ref={headingRef} tabIndex={-1}>
        {receipt.title}
      </h3>
      <p className="receipt-detail">{receipt.detail}</p>
      <p className="receipt-reference">{receipt.reference}</p>
      {onReset ? (
        <button type="button" className="start-again" onClick={onReset}>
          {resetLabel}
        </button>
      ) : null}
    </div>
  );
}

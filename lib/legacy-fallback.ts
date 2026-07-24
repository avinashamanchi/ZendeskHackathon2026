// Deterministic legacy-agent replies. Client-safe (no SDK imports) so the
// browser can fall back to these even if the API route itself is unreachable.

/**
 * The hard-coded golden-path reply. It is about returns; Maria's actual
 * problem is a duplicate charge. The demo is that gap.
 */
export const LEGACY_GOLDEN =
  "Happy to help with your return! You can start a return within 30 days of " +
  "delivery from the Orders page. Once we receive the item, refunds are " +
  "processed in 5–7 business days.";

// Canned confident-wrong replies for offline judge input, chosen
// deterministically so repeated runs are identical.
const LEGACY_CANNED = [
  "Thanks for reaching out! You can track any order from the Orders page under My Account. Tracking updates can take up to 24 hours to appear.",
  "Great question! To update your payment method, head to Settings → Billing and select your preferred card. Changes apply from your next billing cycle.",
  "Happy to help! Our Help Center covers common topics like shipping, returns, and account settings. Most questions are answered in under two minutes.",
  LEGACY_GOLDEN,
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function legacyFallback(fragment: string): string {
  const normalized = fragment.toLowerCase().trim();
  if (normalized === "") {
    return "Hi there! Let us know how we can help. In the meantime, our Help Center covers shipping, returns, and account questions.";
  }
  if (normalized.includes("wrong") || normalized.includes("order")) {
    return LEGACY_GOLDEN;
  }
  if (normalized.includes("boily") || normalized.includes("broke")) {
    return "Sorry to hear about a damaged item! Please photograph the packaging and upload it via the Damaged Items form. Claims are reviewed within 3–5 business days.";
  }
  return LEGACY_CANNED[hashString(normalized) % LEGACY_CANNED.length];
}

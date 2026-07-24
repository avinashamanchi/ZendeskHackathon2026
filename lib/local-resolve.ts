import type { ResolveResponse } from "./types";
import { fixtureFor } from "./fixtures";
import { hypothesesFor } from "./engine";
import { rank } from "./rank";
import { legacyFallback } from "./legacy-fallback";

/**
 * The client's last parachute: a full resolve computed in the browser from
 * fixtures, used only if the same-origin API route somehow fails or times
 * out. The person never sees an error, an unresolving spinner, or an empty
 * screen — not even if the dev server dies mid-demo.
 */
export async function localResolve(
  fragment: string,
  email: string
): Promise<ResolveResponse> {
  const state = fixtureFor(email);
  const { candidates, matchedBy } = await rank(hypothesesFor(state), fragment, true);
  return {
    candidates,
    legacy: legacyFallback(fragment),
    matchedBy,
    customer: { email: state.email, name: state.name },
  };
}

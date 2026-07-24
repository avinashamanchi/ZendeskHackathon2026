import type { TimedEvent } from "./types";
import { fixtureFor } from "./fixtures";
import { hypothesesFor } from "./engine";
import { rank } from "./rank";
import { legacyFallback } from "./legacy-fallback";
import { buildPipelineEvents } from "./pipeline";

/**
 * The client's last parachute: the full pipeline computed in the browser from
 * fixtures, used only if the same-origin SSE route somehow fails. The person
 * never sees an error, an unresolving spinner, or an empty screen — not even
 * if the dev server dies mid-demo.
 */
export async function localPipelineEvents(
  fragment: string,
  email: string
): Promise<TimedEvent[]> {
  const state = fixtureFor(email);
  const hypotheses = hypothesesFor(state);
  const { candidates, matchedBy } = await rank(hypotheses, fragment, true);
  return buildPipelineEvents({
    state,
    fragment,
    candidates,
    hypotheses,
    legacy: legacyFallback(fragment),
    matchedBy,
    sim: true,
  });
}

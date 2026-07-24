import { createClientFixtureResponse } from "@/lib/demo";
import {
  FIXTURE_EMAILS,
  isFixtureEmail,
  type FixtureEmail,
} from "@/lib/fixtures";
import { streamResolution } from "@/lib/pipeline";
import type { PipelineEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function cleanFragment(value: unknown): string {
  if (typeof value !== "string") return "";
  return Array.from(
    value
      .normalize("NFKC")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ""),
  )
    .slice(0, 280)
    .join("");
}

function encodeEvent(event: PipelineEvent): Uint8Array {
  return encoder.encode(
    `event: ${event.t}\ndata: ${JSON.stringify(event)}\n\n`,
  );
}

export async function POST(request: Request): Promise<Response> {
  let email: FixtureEmail = FIXTURE_EMAILS[0];
  let fragment = "";
  let requestedDemoMode = true;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.email === "string" && isFixtureEmail(body.email)) {
      email = body.email;
    }
    fragment = cleanFragment(body.fragment);
    requestedDemoMode = body.demoMode !== false;
  } catch {
    // A malformed request still receives the complete Maria fixture stream.
  }

  const pipelineController = new AbortController();
  let cancelled = false;
  const abortPipeline = () => pipelineController.abort();
  if (request.signal.aborted) pipelineController.abort();
  request.signal.addEventListener("abort", abortPipeline, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of streamResolution({
          email,
          fragment,
          requestedDemoMode,
          signal: pipelineController.signal,
        })) {
          if (cancelled || pipelineController.signal.aborted) return;
          controller.enqueue(encodeEvent(event));
        }
      } catch (error) {
        if (cancelled || pipelineController.signal.aborted) return;
        console.info("[Wordless] resolve stream recovered with fixtures", error);
        const response = createClientFixtureResponse(email, fragment);
        controller.enqueue(
          encodeEvent({
            t: "error",
            tool: "codex",
            recovered: true,
            source: "fallback",
            state: "fallback",
          }),
        );
        controller.enqueue(
          encodeEvent({
            t: "candidates",
            cards: response.candidates,
            response,
          }),
        );
      } finally {
        request.signal.removeEventListener("abort", abortPipeline);
        if (!cancelled) controller.close();
      }
    },
    cancel() {
      cancelled = true;
      pipelineController.abort();
      request.signal.removeEventListener("abort", abortPipeline);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

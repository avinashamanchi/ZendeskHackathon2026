import { notCompletedReceipt } from "@/lib/composio";
import { actOnToken } from "@/lib/resolve";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      return Response.json(notCompletedReceipt(false), { status: 403 });
    }
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > 16_384) {
      return Response.json(notCompletedReceipt(false), { status: 413 });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const actionToken =
      typeof body.actionToken === "string" && body.actionToken.length <= 4_096
        ? body.actionToken
        : "";
    const receipt = await actOnToken(actionToken);
    return Response.json(receipt, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.info("[Wordless] action route fallback", error);
    return Response.json(notCompletedReceipt(false), {
      headers: { "Cache-Control": "no-store" },
    });
  }
}

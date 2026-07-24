interface ActionTokenPayload {
  version: 1;
  requestId: string;
  candidateId: string;
  email: string;
  mode: "demo" | "live";
  expiresAt: number;
}

const encoder = new TextEncoder();
const DEMO_SIGNING_SECRET =
  "wordless-fixture-only-signing-key-not-valid-for-live-actions";

function signingSecret(): string {
  const configured = process.env.WORDLESS_ACTION_SIGNING_SECRET;
  if (configured) return configured;
  if (process.env.WORDLESS_ALLOW_LIVE_WRITES === "true") {
    throw new Error("WORDLESS_ACTION_SIGNING_SECRET is required for live writes.");
  }
  return DEMO_SIGNING_SECRET;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const bytes = base64UrlToBytes(value);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signActionToken(
  payload: Omit<ActionTokenPayload, "version" | "expiresAt">,
): Promise<string> {
  const complete: ActionTokenPayload = {
    ...payload,
    version: 1,
    expiresAt: Date.now() + 10 * 60_000,
  };
  const encodedPayload = bytesToBase64Url(
    encoder.encode(JSON.stringify(complete)),
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(encodedPayload)),
  );
  return `${encodedPayload}.${bytesToBase64Url(signature)}`;
}

export async function verifyActionToken(
  token: string,
): Promise<ActionTokenPayload | null> {
  try {
    const [encodedPayload, encodedSignature, extra] = token.split(".");
    if (!encodedPayload || !encodedSignature || extra) return null;
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      base64UrlToArrayBuffer(encodedSignature),
      encoder.encode(encodedPayload),
    );
    if (!valid) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(encodedPayload)),
    ) as ActionTokenPayload;
    if (
      payload.version !== 1 ||
      !payload.requestId ||
      !payload.candidateId ||
      !payload.email ||
      !["demo", "live"].includes(payload.mode) ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt < Date.now()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

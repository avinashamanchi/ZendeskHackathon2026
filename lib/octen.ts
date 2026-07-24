import type { Hypothesis } from "./types";

type OctenInputType = "query" | "document";

interface OctenEmbeddingResponse {
  code: number;
  msg: string;
  data?: {
    results?: Array<{ index: number; embedding: number[] }>;
    model?: string;
  };
}

const DEFAULT_OCTEN_ENDPOINT = "https://api.octen.ai/embedding";
const documentCache = new Map<string, number[][]>();
const MODEL_MAX_DIMENSION: Record<string, number> = {
  "octen-embedding-0.6b": 1_024,
  "octen-embedding-4b": 2_560,
  "octen-embedding-8b": 4_096,
};

function timeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

function embeddingModel(): string {
  return process.env.OCTEN_EMBEDDING_MODEL ?? "octen-embedding-4b";
}

function parseDimension(model = embeddingModel()): number {
  const requested = Number(process.env.OCTEN_EMBEDDING_DIMENSION ?? "256");
  const dimension = Number.isInteger(requested) && requested > 0 ? requested : 256;
  const maximum = MODEL_MAX_DIMENSION[model];
  if (maximum && dimension > maximum) {
    throw new Error(`${model} supports at most ${maximum} embedding dimensions.`);
  }
  return dimension;
}

function configuredTimeout(): number {
  const value = Number(process.env.OCTEN_TIMEOUT_MS ?? "5000");
  return Number.isFinite(value) && value >= 500 && value <= 30_000
    ? Math.round(value)
    : 5_000;
}

function validateVectors(
  response: OctenEmbeddingResponse,
  expectedCount: number,
): number[][] {
  if (response.code !== 0 || !response.data?.results) {
    throw new Error(`Octen rejected the embedding request: ${response.msg}`);
  }

  const ordered = [...response.data.results].sort((a, b) => a.index - b.index);
  if (ordered.length !== expectedCount) {
    throw new Error("Octen returned an unexpected vector count.");
  }

  const dimension = ordered[0]?.embedding.length ?? 0;
  if (dimension === 0) {
    throw new Error("Octen returned an empty vector.");
  }

  const vectors = ordered.map(({ embedding }, index) => {
    if (
      ordered[index]?.index !== index ||
      embedding.length !== dimension ||
      embedding.some((value) => !Number.isFinite(value))
    ) {
      throw new Error("Octen returned a malformed vector.");
    }
    return embedding;
  });

  return vectors;
}

async function requestEmbeddings(
  input: string[],
  inputType: OctenInputType,
  timeoutMs: number,
): Promise<number[][]> {
  const apiKey = process.env.OCTEN_API_KEY;
  if (!apiKey) {
    throw new Error("OCTEN_API_KEY is not configured.");
  }

  const response = await fetch(
    process.env.OCTEN_API_URL ?? DEFAULT_OCTEN_ENDPOINT,
    {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      input,
      model: embeddingModel(),
      dimension: parseDimension(),
      input_type: inputType,
    }),
      signal: timeoutSignal(timeoutMs),
    },
  );

  if (!response.ok) {
    throw new Error(`Octen returned HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as OctenEmbeddingResponse;
  return validateVectors(payload, input.length);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function hypothesisDocument(hypothesis: Hypothesis): string {
  return [hypothesis.title, hypothesis.detail, ...hypothesis.variants].join(". ");
}

async function embedDocuments(
  documents: string[],
  timeoutMs: number,
): Promise<number[][]> {
  const model = embeddingModel();
  const cacheKey = JSON.stringify([model, parseDimension(), documents]);
  const cached = documentCache.get(cacheKey);
  if (cached) return cached;

  const vectors = await requestEmbeddings(documents, "document", timeoutMs);
  documentCache.set(cacheKey, vectors);
  return vectors;
}

export async function getOctenSimilarityScores(
  fragment: string,
  hypotheses: Hypothesis[],
  timeoutMs = configuredTimeout(),
): Promise<Record<string, number>> {
  if (!fragment.trim() || hypotheses.length === 0) return {};

  const documents = hypotheses.map(hypothesisDocument);
  const [queryVectors, documentVectors] = await Promise.all([
    requestEmbeddings([fragment], "query", timeoutMs),
    embedDocuments(documents, timeoutMs),
  ]);

  const queryVector = queryVectors[0];
  return Object.fromEntries(
    hypotheses.map((hypothesis, index) => [
      hypothesis.id,
      Math.max(0, Math.min(1, cosineSimilarity(queryVector, documentVectors[index]))),
    ]),
  );
}

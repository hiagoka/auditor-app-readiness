import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;

export const MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1";

export const openai = new OpenAI({ apiKey });

export function assertApiKey(): void {
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY não definido — copie .env.example para .env e preencha antes de rodar.",
    );
  }
}

/** Modelos de raciocínio (o1, o3, o4...) não aceitam `temperature` != 1. */
function supportsTemperature(): boolean {
  return !/^o\d/.test(MODEL);
}

export interface AskJsonOptions {
  system: string;
  user: string;
  /** liga a tool de busca web nativa (Responses API). Só o agente Guidelines usa. */
  webSearch?: boolean;
  /** default 0 — mantém a avaliação reprodutível. */
  temperature?: number;
}

export interface AskJsonResult<T> {
  data: T;
  tokensUsed: number;
  raw: unknown;
}

/** Extrai o primeiro objeto/array JSON de um texto, tolerando cercas markdown e prosa em volta. */
export function extractJson(text: string): unknown {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.search(/[[{]/);
    const end = Math.max(stripped.lastIndexOf("}"), stripped.lastIndexOf("]"));
    if (start >= 0 && end > start) {
      return JSON.parse(stripped.slice(start, end + 1));
    }
    throw new Error(`resposta do modelo não é JSON válido:\n${text.slice(0, 800)}`);
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Reexecuta em 429 de throttle (respeitando o header de reset), até `attempts` vezes.
 * Falha na hora quando a requisição é grande demais para o limite da org — esperar não resolve.
 */
async function withRetry<R>(fn: () => Promise<R>, attempts = 4): Promise<R> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const e = err as { status?: number; message?: string; headers?: Record<string, string> };
      const is429 = e.status === 429;
      const tooLarge = /request too large/i.test(e.message ?? "");
      if (!is429 || tooLarge || i >= attempts) {
        if (tooLarge) {
          throw new Error(
            `${e.message}\n> a org tem um limite de tokens/min baixo; reduza maxTotalChars em collectBundle ou use um modelo com TPM maior (ex.: gpt-4.1-mini).`,
          );
        }
        throw err;
      }
      const resetHeader = e.headers?.["x-ratelimit-reset-tokens"] ?? "";
      const waitSec = Number.parseFloat(resetHeader) || 2 ** i;
      const waitMs = Math.min(Math.ceil(waitSec * 1000) + 500, 60_000);
      console.error(`[openai] 429 throttle — tentativa ${i}/${attempts}, aguardando ${waitMs}ms`);
      await sleep(waitMs);
    }
  }
}

/**
 * Ponto único de chamada ao modelo. Força resposta JSON.
 *  - webSearch=false: Chat Completions com response_format json_object.
 *  - webSearch=true : Responses API com a tool web_search.
 */
export async function askJson<T>(opts: AskJsonOptions): Promise<AskJsonResult<T>> {
  assertApiKey();
  const temperature = opts.temperature ?? 0;

  if (opts.webSearch) {
    const resp = await withRetry(() =>
      openai.responses.create({
        model: MODEL,
        ...(supportsTemperature() ? { temperature } : {}),
        tools: [{ type: "web_search_preview" }],
        input: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }),
    );
    return {
      data: extractJson(resp.output_text ?? "") as T,
      tokensUsed: resp.usage?.total_tokens ?? 0,
      raw: resp,
    };
  }

  const resp = await withRetry(() =>
    openai.chat.completions.create({
      model: MODEL,
      ...(supportsTemperature() ? { temperature } : {}),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
  );
  return {
    data: extractJson(resp.choices[0]?.message?.content ?? "") as T,
    tokensUsed: resp.usage?.total_tokens ?? 0,
    raw: resp,
  };
}

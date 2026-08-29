import type { AgentResult } from "../lib/types";

export interface GuidelinesAgentInput {
  repoPath: string;
  /** achados dos agentes anteriores, para focar a checagem. */
  upstream: AgentResult[];
}

/**
 * Agente de Guidelines (stretch) — único com busca web ativa.
 *
 * Passos (TODO iteração 3):
 *  1. Coletar metadados do app (nome, categoria, uso de rede/tracking/IAP) + achados upstream.
 *  2. askJson({ webSearch: true }) — o modelo consulta as App Store Review Guidelines vigentes
 *     em vez de confiar só no conhecimento estático.
 *  3. Cada violação -> Finding com `reference` = "Guideline X.Y.Z" e link para a seção oficial.
 */
export async function runGuidelinesAgent(input: GuidelinesAgentInput): Promise<AgentResult> {
  const start = Date.now();

  // TODO: coleta de metadados + chamada de modelo com web_search.
  void input;

  return {
    agent: "guidelines",
    findings: [],
    tokensUsed: 0,
    durationMs: Date.now() - start,
    inspected: [],
  };
}

import type { AgentResult } from "../lib/types";

export interface PermissionsAgentInput {
  repoPath: string;
}

/**
 * Agente de Permissões — pergunta: "isso é realmente usado?"
 *
 * Passos (TODO iteração 1):
 *  1. Ler as chaves `NS*UsageDescription` do `Info.plist` (permissões declaradas).
 *  2. Varrer o código-fonte (JS/TS/ObjC/Swift) por uso de cada capability correspondente.
 *  3. Prompt especializado -> askJson: tabela permissão -> declarada? -> usada? -> risco.
 *  4. "Permissão fantasma" (declarada, não usada) => Finding severidade recomendado/blocker.
 */
export async function runPermissionsAgent(input: PermissionsAgentInput): Promise<AgentResult> {
  const start = Date.now();
  const inspected: string[] = [];

  // TODO: leitura de arquivos + chamada de modelo.
  void input;

  return {
    agent: "permissions",
    findings: [],
    tokensUsed: 0,
    durationMs: Date.now() - start,
    inspected,
  };
}

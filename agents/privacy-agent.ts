import type { AgentResult } from "../lib/types";

export interface PrivacyAgentInput {
  repoPath: string;
}

/**
 * Agente de Privacidade — pergunta: "isso está declarado?"
 *
 * Passos (TODO iteração 1):
 *  1. Localizar e ler `**\/Info.plist`, `**\/PrivacyInfo.xcprivacy`, `package.json`, `Podfile`/`Podfile.lock`.
 *  2. Extrair: SDKs/pods usados, tipos de dado coletados declarados, required-reason APIs declaradas.
 *  3. Prompt especializado -> askJson: SDKs sem declaração + campos de manifest faltando.
 *  4. Mapear a resposta para Finding[] (severidade blocker quando o manifest exigido não existe).
 */
export async function runPrivacyAgent(input: PrivacyAgentInput): Promise<AgentResult> {
  const start = Date.now();
  const inspected: string[] = [];

  // TODO: leitura de arquivos + chamada de modelo.
  void input;

  return {
    agent: "privacy",
    findings: [],
    tokensUsed: 0,
    durationMs: Date.now() - start,
    inspected,
  };
}

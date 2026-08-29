import type { AgentResult, AuditReport, Finding, Severity } from "../lib/types";

export interface OrchestrateInput {
  repoPath: string;
  agentResults: AgentResult[];
}

const SEVERITY_ORDER: Record<Severity, number> = {
  blocker: 0,
  recomendado: 1,
  opcional: 2,
};

/** Dedupe determinístico (código puro): mesmo `id` => mantém o primeiro. */
function dedupe(findings: Finding[]): Finding[] {
  const seen = new Map<string, Finding>();
  for (const f of findings) {
    if (!seen.has(f.id)) seen.set(f.id, f);
  }
  return [...seen.values()];
}

/**
 * TODO(iteração 2): 1 chamada de IA só quando dois agentes discordam da severidade do
 * mesmo problema, ou quando um achado de um agente contextualiza o de outro. Fora isso,
 * a priorização é a ordenação determinística abaixo.
 */
export async function orchestrate(input: OrchestrateInput): Promise<AuditReport> {
  const all = input.agentResults.flatMap((r) => r.findings);
  const deduped = dedupe(all).sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  const summary: Record<Severity, number> = {
    blocker: deduped.filter((f) => f.severity === "blocker").length,
    recomendado: deduped.filter((f) => f.severity === "recomendado").length,
    opcional: deduped.filter((f) => f.severity === "opcional").length,
  };

  return {
    repoPath: input.repoPath,
    generatedAt: new Date().toISOString(),
    summary,
    findings: deduped,
    agentResults: input.agentResults,
  };
}

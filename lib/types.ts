export type Severity = "blocker" | "recomendado" | "opcional";

export type AgentName =
  | "privacy"
  | "permissions"
  | "guidelines"
  | "accessibility"
  | "baseline";

export interface Finding {
  /** id estável = `${agent}:${file}:${line}:${slug(title)}` — usado no dedupe. */
  id: string;
  agent: AgentName;
  severity: Severity;
  title: string;
  detail: string;
  file?: string;
  line?: number;
  /** trecho de código ou linha de manifesto que comprova o achado. */
  evidence?: string;
  /** o que declarar / remover para resolver. */
  suggestion?: string;
  /** ex.: "3B52.1", "CA92.1", "Guideline 5.1.1". */
  reference?: string;
}

export interface AgentResult {
  agent: AgentName;
  findings: Finding[];
  /** resposta crua do modelo, para a trajetória do agente. */
  rawModelResponse?: unknown;
  tokensUsed: number;
  durationMs: number;
  /** o que o agente leu, para a trajetória. */
  inspected: string[];
}

export interface OrchestrationTrace {
  /** true quando a chamada de IA rodou e foi aplicada; false = só o merge determinístico. */
  aiApplied: boolean;
  /** notas de agrupamento/severidade, uma por decisão — para a trajetória. */
  rationale: string[];
  tokensUsed: number;
  rawModelResponse?: unknown;
  error?: string;
}

export interface AuditReport {
  repoPath: string;
  generatedAt: string;
  summary: Record<Severity, number>;
  findings: Finding[];
  agentResults: AgentResult[];
  orchestration: OrchestrationTrace;
}

export function makeFindingId(f: Pick<Finding, "agent" | "file" | "line" | "title">): string {
  const slug = f.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${f.agent}:${f.file ?? "-"}:${f.line ?? "-"}:${slug}`;
}

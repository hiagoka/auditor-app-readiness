import { askJson } from "../lib/openai";
import type {
  AgentResult,
  AuditReport,
  Finding,
  OrchestrationTrace,
  Severity,
} from "../lib/types";

export interface OrchestrateInput {
  repoPath: string;
  agentResults: AgentResult[];
}

const SEVERITY_ORDER: Record<Severity, number> = {
  blocker: 0,
  recomendado: 1,
  opcional: 2,
};

const higher = (a: Severity, b: Severity): Severity =>
  SEVERITY_ORDER[a] <= SEVERITY_ORDER[b] ? a : b;

const isSeverity = (s: unknown): s is Severity =>
  s === "blocker" || s === "recomendado" || s === "opcional";

/** Dedupe determinístico (código puro): mesmo `id` => mantém o primeiro. */
function dedupe(findings: Finding[]): Finding[] {
  const seen = new Map<string, Finding>();
  for (const f of findings) {
    if (!seen.has(f.id)) seen.set(f.id, f);
  }
  return [...seen.values()];
}

interface OrchestrationPlan {
  groups?: { keep?: string; absorbs?: string[]; severity?: string; rationale?: string }[];
  order?: string[];
}

const SYSTEM = `Você é o Orquestrador de um auditor de prontidão para publicação na App Store (iOS).
Recebe os achados JÁ deduplicados dos agentes (Privacidade, Permissões), cada um com um id curto
(F1, F2, ...).

Você NÃO cria achados novos, NÃO altera file/line/evidence/title. Só pode:
(a) AGRUPAR achados que são o mesmo problema de raiz — ex.: "PrivacyInfo.xcprivacy ausente" +
    "usar o wrapper X" apontando o mesmo arquivo; "descrição vazia" + "permissão não usada" para
    a mesma chave NS*UsageDescription. Escolha um como principal ("keep") e liste os outros em
    "absorbs".
(b) Definir a severidade final do grupo: a MAIS ALTA entre os membros, a menos que haja motivo
    claro para baixar (explique no rationale).
(c) ORDENAR por prioridade de rejeição: blockers primeiro; entre blockers, manifesto ausente e
    required-reason API não declarada antes de detalhes de string de permissão.

Todo Fn tem que aparecer em exatamente um "keep" ou um "absorbs". Achados independentes viram um
grupo só deles (keep sem absorbs).

Responda SOMENTE JSON:
{"groups":[{"keep":"F1","absorbs":["F2"],"severity":"blocker","rationale":"F2 é a mesma causa de F1"}],"order":["F1","F3"]}
"order" lista só os "keep", na ordem final.`;

/** Aplica o plano da IA sobre os findings; retorna null se o plano for inutilizável. */
function applyPlan(refById: Map<string, Finding>, plan: OrchestrationPlan): {
  findings: Finding[];
  rationale: string[];
} | null {
  if (!Array.isArray(plan.groups)) return null;

  const groupByKeep = new Map<string, NonNullable<OrchestrationPlan["groups"]>[number]>();
  for (const g of plan.groups) {
    if (g && typeof g.keep === "string") groupByKeep.set(g.keep, g);
  }

  const used = new Set<string>();
  const rationale: string[] = [];
  const emit = (keepRef: string): Finding | null => {
    const base = refById.get(keepRef);
    if (!base || used.has(keepRef)) return null;
    used.add(keepRef);
    const g = groupByKeep.get(keepRef);
    const absorbed = (g?.absorbs ?? [])
      .filter((r) => typeof r === "string" && refById.has(r) && !used.has(r))
      .map((r) => {
        used.add(r);
        return refById.get(r)!;
      });
    const members = [base, ...absorbed];
    const sev = isSeverity(g?.severity)
      ? g.severity
      : members.reduce<Severity>((s, f) => higher(s, f.severity), "opcional");
    if (absorbed.length) {
      const list = absorbed
        .map((a) => `${a.title}${a.file ? ` (${a.file}:${a.line ?? "?"})` : ""}`)
        .join("; ");
      rationale.push(
        `${keepRef} agrupa [${g?.absorbs?.join(", ")}]: ${g?.rationale ?? "mesmo problema de raiz"}`,
      );
      return {
        ...base,
        severity: sev,
        detail: `${base.detail}${base.detail ? " " : ""}[Orquestrador agrupou: ${list}]`.trim(),
      };
    }
    if (sev !== base.severity) {
      rationale.push(`${keepRef} severidade ${base.severity} -> ${sev}: ${g?.rationale ?? ""}`.trim());
    }
    return sev === base.severity ? base : { ...base, severity: sev };
  };

  const out: Finding[] = [];
  for (const ref of Array.isArray(plan.order) ? plan.order : []) {
    const f = typeof ref === "string" ? emit(ref) : null;
    if (f) out.push(f);
  }
  // achados que a IA esqueceu no "order" — entram no fim, sem perder nada
  for (const ref of refById.keys()) {
    if (!used.has(ref)) {
      const f = emit(ref);
      if (f) out.push(f);
    }
  }
  return out.length ? { findings: out, rationale } : null;
}

/**
 * Junta os achados dos agentes: dedupe determinístico (sempre) + 1 chamada de IA que agrupa
 * achados do mesmo problema-raiz, reconcilia severidade e prioriza. A IA planeja; o código
 * aplica. Se a chamada falhar, cai no resultado determinístico.
 */
export async function orchestrate(input: OrchestrateInput): Promise<AuditReport> {
  const deduped = dedupe(input.agentResults.flatMap((r) => r.findings));

  let findings = [...deduped].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
  const orchestration: OrchestrationTrace = { aiApplied: false, rationale: [], tokensUsed: 0 };

  if (deduped.length >= 2) {
    const refById = new Map<string, Finding>();
    deduped.forEach((f, i) => refById.set(`F${i + 1}`, f));
    const list = [...refById.entries()]
      .map(
        ([ref, f]) =>
          `${ref} [${f.agent}/${f.severity}] ${f.title} — ${f.file ?? "-"}:${f.line ?? "-"} — ref: ${f.reference ?? "-"}\n     ${(f.detail || f.evidence || "").slice(0, 300)}`,
      )
      .join("\n");

    try {
      const { data, tokensUsed, raw } = await askJson<OrchestrationPlan>({
        system: SYSTEM,
        user: `Repositório: ${input.repoPath}\n\nAchados deduplicados:\n${list}`,
      });
      orchestration.tokensUsed = tokensUsed;
      orchestration.rawModelResponse = raw;
      const applied = applyPlan(refById, data);
      if (applied) {
        findings = applied.findings;
        orchestration.aiApplied = true;
        orchestration.rationale = applied.rationale;
      } else {
        orchestration.error = "plano da IA inutilizável — usando merge determinístico";
      }
    } catch (err) {
      orchestration.error = (err as Error).message;
    }
  }

  const summary: Record<Severity, number> = {
    blocker: findings.filter((f) => f.severity === "blocker").length,
    recomendado: findings.filter((f) => f.severity === "recomendado").length,
    opcional: findings.filter((f) => f.severity === "opcional").length,
  };

  return {
    repoPath: input.repoPath,
    generatedAt: new Date().toISOString(),
    summary,
    findings,
    agentResults: input.agentResults,
    orchestration,
  };
}

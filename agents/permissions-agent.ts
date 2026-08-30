import type { AgentResult, Finding, Severity } from "../lib/types";
import { makeFindingId } from "../lib/types";
import { askJson } from "../lib/openai";
import {
  byFile,
  codeFiles,
  declaredPermissions,
  type Hit,
  infoPlists,
  PERMISSION_FAMILIES,
  scanGroups,
} from "../lib/scan";

export interface PermissionsAgentInput {
  repoPath: string;
}

interface RawFinding {
  severity?: string;
  title?: string;
  detail?: string;
  file?: string | null;
  line?: number | null;
  evidence?: string | null;
  suggestion?: string | null;
  reference?: string | null;
}

const SYSTEM = `Você é o Agente de Permissões de um auditor de prontidão para publicação na App Store (iOS).
Pergunta central: cada permissão declarada (chave NS*UsageDescription no Info.plist) é realmente
usada pelo app?

Você recebe dados já apurados por scanner (não invente nada além deles):
1. cada permissão declarada, com valor da string, arquivo e linha;
2. por família de permissão: se está declarada, quantas ocorrências de uso o scanner achou no
   código, exemplos file:line, e (quando existir) uma nota sobre uso indireto plausível.

Regras de decisão:
- Declarada, 0 ocorrências de uso e SEM "NOTA (uso indireto)" nos dados => "permissão fantasma"
  => "blocker": recomendar remoção da chave. NÃO invente uso indireto: só considere uso indireto
  quando os dados trazem explicitamente uma "NOTA (uso indireto)" para aquela família.
- Declarada com string de descrição VAZIA => "blocker" separado: a Apple rejeita descrição vazia
  (mesmo que a permissão seja legítima). Este achado é independente do de permissão fantasma.
- USADA (>=1 ocorrência) mas "declarada: não" => "blocker": falta a chave NS*UsageDescription no
  Info.plist para uma capability efetivamente usada — o app quebra em runtime ao acessar a API.
  Use como \`file\`/\`line\` o do primeiro exemplo de uso listado.
- 0 ocorrências diretas MAS existe "NOTA (uso indireto)" para a família => NÃO é fantasma; no
  máximo "recomendado": confirmar que a permissão é necessária e ajustar a descrição.
- Uso real e direto (>=1 ocorrência) e já declarada => não relatar.
- Para os casos de fantasma/descrição vazia, cite o file:line da declaração no Info.plist.

Responda SOMENTE JSON:
{"findings":[{"severity":"blocker|recomendado|opcional","title":"...","detail":"...","file":"...","line":<n|null>,"evidence":"...","suggestion":"...","reference":"<ex: Guideline 5.1.1, ou null>"}]}
Nada a relatar => {"findings":[]}.`;

function sev(s?: string): Severity {
  return s === "blocker" || s === "recomendado" || s === "opcional" ? s : "recomendado";
}

export interface AgentDigest {
  system: string;
  user: string;
  inspected: string[];
}

/**
 * Monta exatamente o que o agente de Permissões envia ao modelo (system + user) e o que ele
 * varreu (`inspected`). Só usa `lib/scan.ts` — determinístico, sem IA. Exportado para que
 * `scripts/gen-trajectories.ts` possa reconstruir o digest, que não é persistido no solution.json.
 */
export function buildPermissionsDigest(repoPath: string): AgentDigest {
  const plists = infoPlists(repoPath);
  const declared = declaredPermissions(repoPath, plists);
  const code = codeFiles(repoPath);

  // Uma passada de varredura para todas as famílias.
  const hitsByFamily = new Map<string, Hit[]>();
  for (const h of scanGroups(
    repoPath,
    code,
    PERMISSION_FAMILIES.map((f) => ({ key: f.name, needles: f.usageNeedles })),
  )) {
    const arr = hitsByFamily.get(h.key);
    if (arr) arr.push(h);
    else hitsByFamily.set(h.key, [h]);
  }

  const families = PERMISSION_FAMILIES.map((fam) => {
    const isDeclared = declared.some((d) => fam.keys.includes(d.key));
    const hits = byFile(hitsByFamily.get(fam.name) ?? []);
    return { fam, isDeclared, hits, total: hits.reduce((s, h) => s + h.count, 0) };
  }).filter((f) => f.isDeclared || f.total > 0);

  const declaredBlock = declared.length
    ? declared
        .map(
          (d) =>
            `  ${d.key} = ${JSON.stringify(d.value)}${d.value === "" ? "  [DESCRIÇÃO VAZIA]" : ""}  (${d.file}:${d.line})`,
        )
        .join("\n")
    : "  (nenhuma chave NS*UsageDescription encontrada em Info.plist)";

  const usageBlock = families
    .map((f) => {
      const head = `  ${f.fam.name} — declarada: ${f.isDeclared ? "sim" : "não"} — ocorrências de uso: ${f.total}`;
      const ex = f.hits
        .slice(0, 4)
        .map((h) => `       ${h.file}:${h.line} (${h.count}x) ${h.text}`)
        .join("\n");
      const note = f.fam.indirectNote ? `\n     NOTA (uso indireto): ${f.fam.indirectNote}` : "";
      return [head, ex, note].filter(Boolean).join("\n");
    })
    .join("\n");

  const user = `Projeto: ${repoPath}
Info.plist analisados: ${plists.length ? plists.join(", ") : "nenhum"}

Permissões declaradas (${declared.length}):
${declaredBlock}

Uso por família de permissão:
${usageBlock || "  (nenhuma família relevante)"}`;

  return {
    system: SYSTEM,
    user,
    inspected: [
      ...plists,
      ...[...new Set(families.flatMap((f) => f.hits.map((h) => h.file)))].slice(0, 30),
    ],
  };
}

export async function runPermissionsAgent(input: PermissionsAgentInput): Promise<AgentResult> {
  const start = Date.now();
  const { system, user, inspected } = buildPermissionsDigest(input.repoPath);

  const { data, tokensUsed, raw } = await askJson<{ findings: RawFinding[] }>({ system, user });

  const rawFindings = Array.isArray(data.findings) ? data.findings : [];
  const findings: Finding[] = rawFindings.map((rf) => {
    const core = {
      agent: "permissions" as const,
      severity: sev(rf.severity),
      title: rf.title?.trim() || "(sem título)",
      file: rf.file ?? undefined,
      line: rf.line ?? undefined,
    };
    return {
      id: makeFindingId(core),
      ...core,
      detail: rf.detail?.trim() ?? "",
      evidence: rf.evidence ?? undefined,
      suggestion: rf.suggestion ?? undefined,
      reference: rf.reference ?? undefined,
    };
  });

  return {
    agent: "permissions",
    findings,
    rawModelResponse: raw,
    tokensUsed,
    durationMs: Date.now() - start,
    inspected,
  };
}

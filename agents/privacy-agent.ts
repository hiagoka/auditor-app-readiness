import type { AgentResult, Finding, Severity } from "../lib/types";
import { makeFindingId } from "../lib/types";
import { askJson } from "../lib/openai";
import {
  byFile,
  declaredPrivacyCategories,
  hasPodspec,
  type Hit,
  nearestManifest,
  REQUIRED_REASON_APIS,
  scanGroups,
  shippedCodeFiles,
  shippedManifests,
  userDefaultsIdentifiers,
} from "../lib/scan";

export interface PrivacyAgentInput {
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

const SYSTEM = `Você é o Agente de Privacidade de um auditor de prontidão para publicação na App Store (iOS).
Pergunta central: cada uso de "required reason API" está DECLARADO num PrivacyInfo.xcprivacy que
se aplica ao mesmo target/módulo? E o app/SDK tem manifesto quando é obrigatório?

Você recebe dados já apurados por scanner (não invente nada além deles):
1. os manifests .xcprivacy publicados do repo (ignora example/demo/test) e o que cada um declara;
2. usos de required-reason API em código publicado, com file:line, contagem, o manifest ancestral
   e se ele já declara a categoria ("coberto"). Se "manifest ancestral: nenhum", não há manifesto
   que se aplique àquele arquivo;
3. "candidatos a wrapper": arquivos que usam UserDefaults/NSUserDefaults cru enquanto o repo tem
   um wrapper próprio (ex.: GULUserDefaults);
4. um flag dizendo se o repo NÃO tem NENHUM .xcprivacy publicado, e se ele distribui biblioteca.

Regras de decisão:
- "coberto: não" ou "manifest ancestral: nenhum" => "blocker": categoria não declarada num
  manifesto aplicável. Cite o file:line real.
- Repo sem NENHUM .xcprivacy publicado, distribuindo biblioteca ou com uso de required-reason API
  => UM "blocker" único: "PrivacyInfo.xcprivacy ausente" (obrigatório desde iOS 17). Não repita
  isso por arquivo. Mas o campo "evidence" DESSE achado tem que ENUMERAR cada required-reason API
  detectada com um file:line de exemplo (ex.: "creationDate em ios/ImagePickerManager.mm:208 ->
  NSPrivacyAccessedAPICategoryFileTimestamp (3B52.1); NSUserDefaults em .../Foo.m:12 -> ...
  UserDefaults (CA92.1)"), e "reference" deve listar todos os códigos de motivo aplicáveis.
- Candidato a wrapper => "recomendado": trocar UserDefaults cru pelo wrapper do projeto, que já
  carrega o motivo declarado. (Isso vale mesmo que o módulo tenha manifesto.)
- Item "coberto: sim" e não-wrapper => NÃO é achado.
- Não relate arquivo de teste nem arquivo fora dos dados.
- Agrupamento: 1 achado por MÓDULO/TARGET distinto sem cobertura (ex.: cada app de um monorepo,
  cada target watchOS/tvOS, cada Swift package). Não colapse targets diferentes num só achado, e
  não gere um achado por arquivo dentro do mesmo target — cite um arquivo:linha de exemplo e
  mencione os demais em "detail".

Responda SOMENTE JSON:
{"findings":[{"severity":"blocker|recomendado|opcional","title":"...","detail":"...","file":"...","line":<n|null>,"evidence":"...","suggestion":"...","reference":"<código de motivo, ex CA92.1, ou null>"}]}
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
 * Monta exatamente o que o agente de Privacidade envia ao modelo (system + user) e o que ele
 * varreu (`inspected`). Só usa `lib/scan.ts` — determinístico, sem IA. Exportado para que
 * `scripts/gen-trajectories.ts` possa reconstruir o digest, que não é persistido no solution.json.
 */
export function buildPrivacyDigest(repoPath: string): AgentDigest {
  const manifests = shippedManifests(repoPath);
  const code = shippedCodeFiles(repoPath);
  const declared = declaredPrivacyCategories(repoPath, manifests);
  const udIdents = userDefaultsIdentifiers(repoPath, code);
  const wrappers = udIdents.filter((id) => id !== "UserDefaults" && id !== "NSUserDefaults");

  // Uma passada de varredura para todas as categorias.
  const hitsByCategory = new Map<string, Hit[]>();
  for (const h of scanGroups(
    repoPath,
    code,
    REQUIRED_REASON_APIS.map((a) => ({ key: a.category, needles: a.needles })),
  )) {
    const arr = hitsByCategory.get(h.key);
    if (arr) arr.push(h);
    else hitsByCategory.set(h.key, [h]);
  }

  // Uma linha por (arquivo, categoria), com resolução de cobertura pelo manifesto ancestral.
  const rows = REQUIRED_REASON_APIS.flatMap((api) =>
    byFile(hitsByCategory.get(api.category) ?? []).map((r) => {
      const man = nearestManifest(r.file, manifests);
      const decl = declared.find((d) => d.file === man);
      return {
        category: api.category,
        reason: api.reasonCodes,
        file: r.file,
        line: r.line,
        text: r.text,
        count: r.count,
        manifest: man,
        covered: !!decl && decl.categories.includes(api.category),
        isUserDefaults: api.category === "NSPrivacyAccessedAPICategoryUserDefaults",
      };
    }),
  );

  const uncovered = rows.filter((r) => !r.covered);
  const coveredCount = rows.length - uncovered.length;
  const noManifests = manifests.length === 0;

  // candidatos a wrapper: UserDefaults cru + existe wrapper no repo (independente de cobertura)
  const wrapperCandidates = wrappers.length
    ? rows.filter((r) => r.isUserDefaults).slice(0, 20)
    : [];

  const manifestBlock = manifests.length
    ? declared
        .map(
          (d) =>
            `  ${d.file}\n     categorias: [${d.categories.join(", ") || "—"}]\n     coleta: [${d.collected.join(", ") || "—"}]`,
        )
        .join("\n")
    : "  NENHUM .xcprivacy publicado no repositório.";

  const uncoveredShown = uncovered.slice(0, 40);
  const rowsBlock = uncoveredShown.length
    ? uncoveredShown
        .map(
          (r) =>
            `  [${r.category} / ${r.reason}] ${r.file}:${r.line} (${r.count}x) — manifest ancestral: ${r.manifest ?? "nenhum"} — coberto: não\n     ex.: ${r.text}`,
        )
        .join("\n")
    : "  (nenhum uso de required-reason API sem cobertura)";

  const wrapperBlock = wrapperCandidates.length
    ? wrapperCandidates.map((r) => `  ${r.file}:${r.line} — ${r.text}`).join("\n")
    : "  (nenhum)";

  const user = `Projeto: ${repoPath}
Repo sem NENHUM .xcprivacy publicado: ${noManifests ? "SIM" : "não"}
Distribui biblioteca (tem .podspec): ${hasPodspec(repoPath) ? "sim" : "não"}
Wrappers *UserDefaults do projeto: [${wrappers.join(", ") || "nenhum"}]

Manifests de privacidade publicados (${manifests.length}):
${manifestBlock}

Usos de required-reason API SEM cobertura (${uncovered.length}${uncovered.length > 40 ? ", mostrando 40" : ""}); ${coveredCount} outros usos já cobertos:
${rowsBlock}

Candidatos a troca por wrapper (UserDefaults cru, wrapper existe no repo):
${wrapperBlock}`;

  return {
    system: SYSTEM,
    user,
    inspected: [...manifests, ...[...new Set(uncoveredShown.map((r) => r.file))].slice(0, 40)],
  };
}

export async function runPrivacyAgent(input: PrivacyAgentInput): Promise<AgentResult> {
  const start = Date.now();
  const { system, user, inspected } = buildPrivacyDigest(input.repoPath);

  const { data, tokensUsed, raw } = await askJson<{ findings: RawFinding[] }>({ system, user });

  const rawFindings = Array.isArray(data.findings) ? data.findings : [];
  const findings: Finding[] = rawFindings.map((rf) => {
    const core = {
      agent: "privacy" as const,
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
    agent: "privacy",
    findings,
    rawModelResponse: raw,
    tokensUsed,
    durationMs: Date.now() - start,
    inspected,
  };
}

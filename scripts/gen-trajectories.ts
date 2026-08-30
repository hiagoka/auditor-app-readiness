/**
 * Gera a região <!-- GEN:TRAJ --> de TRAJETORIAS.md a partir de dados REAIS:
 *  - evaluation/out/solution.json, run #2 (inspected, tokensUsed, durationMs, rawModelResponse,
 *    findings, orchestration.rationale)
 *  - os `SYSTEM` prompts em agents/*.ts
 *  - o digest (user message) RECONSTRUÍDO pelo mesmo código de coleta (buildPrivacyDigest /
 *    buildPermissionsDigest), rodando sobre o repo clonado. Não foi capturado na execução
 *    original; é rotulado como reconstrução. Só é incluído se o `inspected` reconstruído bater
 *    com o do solution.json (prova de que a coleta não mudou).
 *
 * As seções narrativas de TRAJETORIAS.md (checkpoints humanos etc.) são escritas à mão e ficam
 * FORA da região GEN — regenerar não as apaga. Mesmo padrão do results.md.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildPrivacyDigest } from "../agents/privacy-agent";
import { buildPermissionsDigest } from "../agents/permissions-agent";

const ROOT = resolve(import.meta.dirname, "..");
const p = (rel: string): string => resolve(ROOT, rel);

interface Finding {
  severity?: string;
  title?: string;
  detail?: string;
  file?: string;
  line?: number;
  evidence?: string;
  suggestion?: string;
  reference?: string;
}
interface AgentResult {
  agent: string;
  findings: Finding[];
  inspected: string[];
  tokensUsed: number;
  durationMs: number;
  rawModelResponse?: { choices?: { message?: { content?: string } }[] };
}
interface Run {
  id: number;
  repo: string;
  slug: string;
  summary: Record<string, number>;
  findings: Finding[];
  agentResults: AgentResult[];
  orchestration: {
    aiApplied: boolean;
    rationale: string[];
    tokensUsed: number;
    rawModelResponse?: { choices?: { message?: { content?: string } }[] };
  };
}

/** Extrai o template literal `const SYSTEM = \`...\`` de um arquivo de agente. */
function systemPrompt(agentFile: string): string {
  const src = readFileSync(p(agentFile), "utf8");
  const m = src.match(/const SYSTEM =\s*`([\s\S]*?)`;/);
  if (!m) throw new Error(`SYSTEM não encontrado em ${agentFile}`);
  // desescapa as crases que o template literal do source carrega (\` -> `)
  return m[1]!.replace(/\\`/g, "`").trim();
}

function rawContent(r: { choices?: { message?: { content?: string } }[] } | undefined): string {
  const c = r?.choices?.[0]?.message?.content;
  if (!c) return "(sem choices[0].message.content no JSON)";
  try {
    return JSON.stringify(JSON.parse(c), null, 2);
  } catch {
    return c;
  }
}

function findingLine(f: Finding): string {
  const loc = f.file ? ` \`${f.file}${f.line != null ? `:${f.line}` : ""}\`` : "";
  const ref = f.reference ? ` · ${f.reference}` : "";
  return `- **[${f.severity}]** ${f.title}${loc}${ref}`;
}

function agentBlock(
  a: AgentResult,
  agentFile: string,
  reconstructed: { user: string; inspectedMatches: boolean } | null,
): string {
  const label = a.agent === "privacy" ? "Privacidade" : a.agent === "permissions" ? "Permissões" : a.agent;
  const digestPart = reconstructed
    ? [
        "**Digest enviado ao modelo** (a *user message*) — **reconstruído deterministicamente** " +
          `pelo mesmo código de coleta (\`build${a.agent === "privacy" ? "Privacy" : "Permissions"}Digest\` ` +
          `em \`${agentFile}\`, só \`lib/scan.ts\`, sem IA), **não capturado na execução original**. ` +
          `O \`inspected\` reconstruído ${reconstructed.inspectedMatches ? "bate" : "NÃO bate"} com o do ` +
          "`solution.json`" +
          (reconstructed.inspectedMatches ? " — a coleta é idêntica à da execução." : "."),
        "",
        "```text",
        reconstructed.user,
        "```",
      ]
    : [
        "> O digest (a *user message*) não é persistido no `solution.json` e o repo clonado não " +
          `está presente para reconstruí-lo. A lógica que o monta está em \`build${a.agent === "privacy" ? "Privacy" : "Permissions"}Digest\` de \`${agentFile}\`.`,
      ];
  return [
    `### Agente de ${label}`,
    "",
    `**Instrução** — \`${agentFile}\`, constante \`SYSTEM\` (íntegra):`,
    "",
    "```text",
    systemPrompt(agentFile),
    "```",
    "",
    `**Ferramentas / o que varreu** (\`inspected\`, ${a.inspected.length} arquivo(s)):`,
    "",
    a.inspected.map((f) => `- \`${f}\``).join("\n"),
    "",
    ...digestPart,
    "",
    "**Resposta crua do modelo** (`rawModelResponse.choices[0].message.content`):",
    "",
    "```json",
    rawContent(a.rawModelResponse),
    "```",
    "",
    `**Findings estruturados** (${a.findings.length}) · **${a.tokensUsed} tokens** · **${a.durationMs} ms**:`,
    "",
    a.findings.map(findingLine).join("\n"),
  ].join("\n");
}

const sameSet = (x: string[], y: string[]): boolean =>
  x.length === y.length && [...x].sort().join("\0") === [...y].sort().join("\0");

function main(): void {
  const sol = JSON.parse(readFileSync(p("evaluation/out/solution.json"), "utf8")) as {
    runs: Run[];
  };
  const run = sol.runs.find((r) => r.id === 2);
  if (!run) throw new Error("run #2 não encontrado em solution.json");

  const orch = run.orchestration;
  const inputFindings = run.agentResults.flatMap((a) => a.findings);

  // Digest reconstruído — só se o repo clonado existir.
  const repoDir = p(`test-repos/${run.slug}`);
  const privA = run.agentResults.find((a) => a.agent === "privacy")!;
  const permA = run.agentResults.find((a) => a.agent === "permissions")!;
  let privRecon: { user: string; inspectedMatches: boolean } | null = null;
  let permRecon: { user: string; inspectedMatches: boolean } | null = null;
  if (existsSync(repoDir)) {
    const pd = buildPrivacyDigest(repoDir);
    const md = buildPermissionsDigest(repoDir);
    privRecon = { user: pd.user, inspectedMatches: sameSet(pd.inspected, privA.inspected) };
    permRecon = { user: md.user, inspectedMatches: sameSet(md.inspected, permA.inspected) };
    if (!privRecon.inspectedMatches || !permRecon.inspectedMatches) {
      console.warn(
        "[gen-trajectories] AVISO: inspected reconstruído difere do solution.json — " +
          "lib/scan.ts pode ter mudado desde a geração. O digest é rotulado, mas confira.",
      );
    }
  } else {
    console.warn(`[gen-trajectories] ${repoDir} ausente — digest fica como ponteiro (rode "npm run clone-repos").`);
  }

  const body = [
    `_Gerado de \`evaluation/out/solution.json\` (run #${run.id}, \`${run.slug}\`) por ` +
      `\`npm run gen-trajectories\`. Não editar à mão — a narrativa fica fora desta região._`,
    "",
    `Repositório: \`${run.repo}\` · sumário final: ` +
      Object.entries(run.summary)
        .map(([k, v]) => `${v} ${k}`)
        .join(" / "),
    "",
    "---",
    "",
    agentBlock(privA, "agents/privacy-agent.ts", privRecon),
    "",
    "---",
    "",
    agentBlock(permA, "agents/permissions-agent.ts", permRecon),
    "",
    "---",
    "",
    "### Orquestrador",
    "",
    "**Instrução** — `agents/orchestrator.ts`, constante `SYSTEM` (íntegra):",
    "",
    "```text",
    systemPrompt("agents/orchestrator.ts"),
    "```",
    "",
    `**Entrada** — ${inputFindings.length} achados deduplicados dos agentes (rótulos F1, F2, …):`,
    "",
    inputFindings.map((f, i) => `- **F${i + 1}** ${findingLine(f).slice(2)}`).join("\n"),
    "",
    "**Plano da IA** (`orchestration.rawModelResponse.choices[0].message.content`):",
    "",
    "```json",
    rawContent(orch.rawModelResponse),
    "```",
    "",
    `**Decisões aplicadas** (\`orchestration.rationale\`, \`aiApplied: ${orch.aiApplied}\`, ` +
      `${orch.tokensUsed} tokens):`,
    "",
    orch.rationale.length ? orch.rationale.map((r) => `- ${r}`).join("\n") : "- (nenhuma)",
    "",
    `**Achados finais** (${run.findings.length}):`,
    "",
    run.findings.map(findingLine).join("\n"),
    "",
    "**Custo total do run** (agentes + orquestrador): " +
      `${run.agentResults.reduce((s, a) => s + a.tokensUsed, 0) + orch.tokensUsed} tokens · ` +
      `${run.agentResults.reduce((s, a) => s + a.durationMs, 0)} ms de agentes` +
      " (o orquestrador não é cronometrado no JSON).",
  ].join("\n");

  const md = readFileSync(p("TRAJETORIAS.md"), "utf8");
  const re = /(<!-- GEN:TRAJ:START -->)[\s\S]*?(<!-- GEN:TRAJ:END -->)/;
  if (!re.test(md)) throw new Error("região GEN:TRAJ não encontrada em TRAJETORIAS.md");
  writeFileSync(p("TRAJETORIAS.md"), md.replace(re, `$1\n${body}\n$2`));
  console.log("[gen-trajectories] TRAJETORIAS.md atualizado (não commitado).");
}

main();

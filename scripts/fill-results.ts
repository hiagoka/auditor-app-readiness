/**
 * Preenche as métricas de avaliação em evaluation/results.md e nas células da tabela de
 * iterações do CHANGELOG.md. DETERMINÍSTICO — sem IA.
 *
 * Entradas:  evaluation/out/baseline.json, evaluation/out/solution.json, evaluation/test-repos.json
 *
 * Recall — por CASO (`cases` em test-repos.json), não por repositório. Cada caso tem uma
 *   `expectativa`:
 *   - "reportar": HIT se existe um Finding cujo caminho (campo `file` OU texto de
 *     title/detail/evidence) casa por sufixo com um `target.files`, OU cujo texto contém uma
 *     `target.keys`, E o texto cita algum motivo em `reason`.
 *   - "nao-reportar" (armadilha): HIT se NENHUM Finding de severidade `blocker` aponta o alvo.
 *   Recall = casos acertados / total de casos.
 *
 * Precisão — agregada, sobre blockers (inalterada). FP = `blocker` cujo caminho não casa com
 *   `groundTruth.files`, `phantom_permissions[].file` nem `accepted_extra_findings[].file`.
 *   Precisão = 1 − FP / total de blockers.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const p = (rel: string): string => resolve(ROOT, rel);

interface Finding {
  severity?: string;
  title?: string;
  detail?: string;
  file?: string;
  evidence?: string;
  suggestion?: string;
  reference?: string;
}
interface Run {
  id: number;
  findings?: Finding[];
  tokensUsed?: number;
  durationMs?: number;
  agentResults?: { tokensUsed?: number; durationMs?: number }[];
  orchestration?: { tokensUsed?: number };
}
interface TestCase {
  id: string;
  tipo: string;
  expectativa: "reportar" | "nao-reportar";
  target: { files?: string[]; lines?: number[]; keys?: string[] };
  reason: string[];
  descricao?: string;
}
interface TestRepo {
  id: number;
  repo: string;
  cases?: TestCase[];
  accepted_extra_findings?: { file: string; why: string }[];
  groundTruth: {
    category?: string;
    files?: string[];
    phantom_permissions?: { key: string; file: string }[];
  };
}

const FILE_RE = /[A-Za-z0-9_./+-]+\.(?:xcprivacy|plist|swift|mm|m|h|kt|java|tsx|ts|jsx|js)\b/g;

function pathsIn(f: Finding): string[] {
  const out = new Set<string>();
  if (f.file) out.add(f.file.replace(/:\d+$/, ""));
  for (const t of [f.title, f.detail, f.evidence, f.suggestion]) {
    if (!t) continue;
    for (const m of t.matchAll(FILE_RE)) out.add(m[0].replace(/:\d+$/, ""));
  }
  return [...out];
}

function suffixMatch(cand: string, gt: string, allowBasename: boolean): boolean {
  if (cand === gt) return true;
  if (cand.endsWith(`/${gt}`)) return true;
  if (cand.includes("/") && gt.endsWith(`/${cand}`)) return true;
  if (allowBasename && !cand.includes("/") && gt.split("/").pop() === cand) return true;
  return false;
}

function fileMatchesAny(f: Finding, targets: string[], allowBasename: boolean): boolean {
  const paths = pathsIn(f);
  // basename solto só vale quando o achado NÃO tem `file` estruturado — senão um blocker com
  // `file` alucinado escaparia do check só por mencionar o manifesto no texto.
  const bare = allowBasename && !f.file;
  return targets.some((t) => paths.some((c) => suffixMatch(c, t, bare)));
}

function hay(f: Finding): string {
  return [f.title, f.detail, f.evidence, f.reference].filter(Boolean).join(" ");
}

function textCites(f: Finding, reasons: string[]): boolean {
  const h = hay(f).toLowerCase();
  return reasons.some((r) => r && h.includes(r.toLowerCase()));
}

/** o achado "aponta" o alvo do caso — por caminho ou por chave de permissão. */
function findingHitsTarget(f: Finding, c: TestCase, allowBasename: boolean): boolean {
  const files = c.target.files ?? [];
  const keys = c.target.keys ?? [];
  const byFile = files.length > 0 && fileMatchesAny(f, files, allowBasename);
  const byKey = keys.length > 0 && keys.some((k) => hay(f).includes(k));
  return byFile || byKey;
}

function caseHit(findings: Finding[], c: TestCase): boolean {
  if (c.expectativa === "nao-reportar") {
    // "reportou" = um blocker nomeia a coisa específica. Para um caso por chave (ex.: o
    // microfone do #2), olhamos SÓ a chave — o arquivo é compartilhado com outros achados
    // legítimos (a permissão fantasma NSLocation mora no mesmo Info.plist).
    const keys = c.target.keys ?? [];
    const reported = findings.some((f) => {
      if (f.severity !== "blocker") return false;
      return keys.length > 0
        ? keys.some((k) => hay(f).includes(k))
        : findingHitsTarget(f, c, false);
    });
    return !reported;
  }
  const bareOk = c.tipo === "privacy-manifest-missing" && (c.target.files?.length ?? 0) === 1;
  return findings.some((f) => findingHitsTarget(f, c, bareOk) && textCites(f, c.reason));
}

interface CaseScore {
  id: string;
  repo: number;
  expectativa: string;
  hit: boolean;
}
interface RepoBlockers {
  id: number;
  blockers: number;
  falsePositives: { file: string; title: string }[];
}
interface Scored {
  perCase: CaseScore[];
  perRepoBlockers: RepoBlockers[];
  hits: number;
  totalCases: number;
  blockerTotal: number;
  fpTotal: number;
  precision: number;
  tokens: number;
  ms: number;
}

function runTokens(r: Run): number {
  if (typeof r.tokensUsed === "number") return r.tokensUsed;
  const ag = (r.agentResults ?? []).reduce((s, a) => s + (a.tokensUsed ?? 0), 0);
  return ag + (r.orchestration?.tokensUsed ?? 0);
}
function runMs(r: Run): number {
  if (typeof r.durationMs === "number") return r.durationMs;
  return (r.agentResults ?? []).reduce((s, a) => s + (a.durationMs ?? 0), 0);
}

function score(runsPath: string, repos: TestRepo[]): Scored {
  const { runs } = JSON.parse(readFileSync(runsPath, "utf8")) as { runs: Run[] };
  const perCase: CaseScore[] = [];
  const perRepoBlockers: RepoBlockers[] = [];
  let tokens = 0;
  let ms = 0;

  for (const tr of repos) {
    const run = runs.find((r) => r.id === tr.id);
    const findings = run?.findings ?? [];
    if (run) {
      tokens += runTokens(run);
      ms += runMs(run);
    }

    for (const c of tr.cases ?? []) {
      perCase.push({ id: c.id, repo: tr.id, expectativa: c.expectativa, hit: caseHit(findings, c) });
    }

    const gtFiles = [
      ...(tr.groundTruth.files ?? []),
      ...(tr.groundTruth.phantom_permissions ?? []).map((pp) => pp.file),
      ...(tr.accepted_extra_findings ?? []).map((a) => a.file),
    ];
    const bareOk =
      tr.groundTruth.category === "privacy-manifest-missing" &&
      (tr.groundTruth.files?.length ?? 0) === 1;
    const blockers = findings.filter((f) => f.severity === "blocker");
    const falsePositives = blockers
      .filter((f) => !fileMatchesAny(f, gtFiles, bareOk))
      .map((f) => ({ file: pathsIn(f)[0] ?? "(sem arquivo)", title: f.title ?? "" }));
    perRepoBlockers.push({ id: tr.id, blockers: blockers.length, falsePositives });
  }

  const blockerTotal = perRepoBlockers.reduce((s, r) => s + r.blockers, 0);
  const fpTotal = perRepoBlockers.reduce((s, r) => s + r.falsePositives.length, 0);
  return {
    perCase,
    perRepoBlockers,
    hits: perCase.filter((c) => c.hit).length,
    totalCases: perCase.length,
    blockerTotal,
    fpTotal,
    precision: blockerTotal === 0 ? 1 : 1 - fpTotal / blockerTotal,
    tokens,
    ms,
  };
}

// ── formatação ────────────────────────────────────────────────────────

const pct = (x: number): string => x.toFixed(2);
const ktok = (t: number): string => `${(t / 1000).toFixed(1)}k`;
const secs = (m: number): string => `${(m / 1000).toFixed(0)}s`;

/** Substitui células de uma linha de tabela markdown por índice (split em "|"). */
function fillRow(text: string, startsWith: string, cells: Record<number, string>): string {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => l.trimStart().startsWith(startsWith));
  if (i < 0) throw new Error(`linha não encontrada: ${startsWith}`);
  const parts = lines[i]!.split("|");
  for (const [idx, val] of Object.entries(cells)) parts[Number(idx)] = ` ${val} `;
  lines[i] = parts.join("|");
  return lines.join("\n");
}

/** Substitui o miolo entre <!-- GEN:TAG:START --> e <!-- GEN:TAG:END -->. */
function replaceRegion(text: string, tag: string, body: string): string {
  const re = new RegExp(`(<!-- GEN:${tag}:START -->)[\\s\\S]*?(<!-- GEN:${tag}:END -->)`);
  if (!re.test(text)) throw new Error(`região GEN:${tag} não encontrada`);
  return text.replace(re, `$1\n${body}\n$2`);
}

function main(): void {
  const testRepos = JSON.parse(readFileSync(p("evaluation/test-repos.json"), "utf8")) as TestRepo[];
  const cases = testRepos.flatMap((r) => (r.cases ?? []).map((c) => ({ ...c, repo: r.id })));

  const base = score(p("evaluation/out/baseline.json"), testRepos);
  const sol = score(p("evaluation/out/solution.json"), testRepos);

  const recallStr = (s: Scored): string => `${s.hits}/${s.totalCases} (${pct(s.hits / s.totalCases)})`;
  const precStr = (s: Scored): string => `${pct(s.precision)} (${s.fpTotal}/${s.blockerTotal} FP)`;

  // ── evaluation/results.md ──
  let md = readFileSync(p("evaluation/results.md"), "utf8");
  md = fillRow(md, "| Recall", {
    2: recallStr(base),
    3: recallStr(sol),
    4: `${sol.hits - base.hits >= 0 ? "+" : ""}${sol.hits - base.hits} caso`,
  });
  md = fillRow(md, "| Precisão", {
    2: precStr(base),
    3: precStr(sol),
    4: `${sol.precision - base.precision >= 0 ? "+" : ""}${pct(sol.precision - base.precision)}`,
  });
  md = fillRow(md, "| Tempo de execução", {
    2: secs(base.ms),
    3: secs(sol.ms),
    4: `${sol.ms - base.ms >= 0 ? "+" : ""}${secs(sol.ms - base.ms)}`,
  });
  md = fillRow(md, "| Custo em tokens", {
    2: `${ktok(base.tokens)} tok`,
    3: `${ktok(sol.tokens)} tok`,
    4: `${((sol.tokens / base.tokens - 1) * 100).toFixed(0)}% (${(base.tokens / sol.tokens).toFixed(1)}x)`,
  });

  const yn = (b: boolean): string => (b ? "sim" : "não");
  const casesTable = [
    "| caso | repo | expectativa | baseline | solução |",
    "|---|---|---|---|---|",
    ...cases.map((c) => {
      const b = base.perCase.find((x) => x.id === c.id)!;
      const s = sol.perCase.find((x) => x.id === c.id)!;
      return `| \`${c.id}\` | #${c.repo} | ${c.expectativa} | ${yn(b.hit)} | ${yn(s.hit)} |`;
    }),
  ].join("\n");
  md = replaceRegion(md, "CASES", casesTable);

  const fpLines: string[] = [];
  for (const [label, s] of [
    ["Baseline", base],
    ["Solução", sol],
  ] as const) {
    const items = s.perRepoBlockers.flatMap((r) =>
      r.falsePositives.map((fp) => `  - #${r.id} \`${fp.file}\` — ${fp.title}`),
    );
    fpLines.push(`**${label}** — ${s.fpTotal} FP em ${s.blockerTotal} blockers${items.length ? ":" : "."}`);
    fpLines.push(...items);
  }
  md = replaceRegion(md, "FP", fpLines.join("\n"));
  writeFileSync(p("evaluation/results.md"), md);

  // ── CHANGELOG.md: Recall (idx 5) + Precisão (idx 6) das linhas 0 e 2 ──
  let cl = readFileSync(p("CHANGELOG.md"), "utf8");
  cl = fillRow(cl, "| 0 | Baseline", { 5: `**${base.hits}/${base.totalCases}**`, 6: precStr(base) });
  cl = fillRow(cl, "| 2 | + Orquestrador", {
    5: `**${sol.hits}/${sol.totalCases}**`,
    6: precStr(sol),
  });
  writeFileSync(p("CHANGELOG.md"), cl);

  // ── resumo p/ revisão humana ──
  console.log(`=== RECALL (por caso) ===\nbaseline: ${recallStr(base)}   solução: ${recallStr(sol)}`);
  for (const c of cases) {
    const b = base.perCase.find((x) => x.id === c.id)!;
    const s = sol.perCase.find((x) => x.id === c.id)!;
    console.log(
      `  ${c.id} (#${c.repo}, ${c.expectativa}): baseline ${b.hit ? "HIT" : "miss"} | solução ${s.hit ? "HIT" : "miss"}`,
    );
  }
  console.log(`\n=== PRECISÃO ===\nbaseline: ${precStr(base)}   solução: ${precStr(sol)}`);
  for (const [label, s] of [
    ["baseline", base],
    ["solução", sol],
  ] as const) {
    console.log(`  ${label}:`);
    for (const r of s.perRepoBlockers)
      for (const fp of r.falsePositives) console.log(`    #${r.id} FP: ${fp.file} — ${fp.title}`);
  }
  console.log(`\n=== CUSTO / TEMPO ===`);
  console.log(`baseline: ${ktok(base.tokens)} tok, ${secs(base.ms)}`);
  console.log(`solução : ${ktok(sol.tokens)} tok, ${secs(sol.ms)}`);
  console.log("\n[fill-results] results.md e CHANGELOG.md atualizados (não commitado).");
}

main();

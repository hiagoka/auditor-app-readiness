/**
 * Preenche as métricas de avaliação em evaluation/results.md e nas células da tabela de
 * iterações do CHANGELOG.md. DETERMINÍSTICO — sem IA.
 *
 * Entradas:  evaluation/out/baseline.json, evaluation/out/solution.json, evaluation/test-repos.json
 *
 * Recall (por repo, binário): o repo é HIT se existe pelo menos um Finding cujo caminho (campo
 *   `file` OU um caminho extraído de title/detail/evidence) bate por sufixo com algum arquivo-
 *   alvo do ground truth, E o texto do Finding cita o motivo esperado (groundTruth.reference /
 *   groundTruth.expected) ou, para permissão fantasma, a chave em phantom_permissions[].key.
 *   Recall = HITs / 6.
 *
 * Precisão: FP = Finding de severidade "blocker" cujo caminho não bate com nenhum arquivo do
 *   ground truth NEM com `accepted_extra_findings` (lista curada à mão em test-repos.json).
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
interface PhantomPerm {
  key: string;
  file: string;
}
interface TestRepo {
  id: number;
  repo: string;
  accepted_extra_findings?: { file: string; why: string }[];
  groundTruth: {
    category?: string;
    files?: string[];
    reference?: string;
    expected?: string[];
    phantom_permissions?: PhantomPerm[];
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

/**
 * Match por sufixo de segmento. `cand` (extraído do achado) casa com `gt` (arquivo do ground
 * truth) se: são iguais; `cand` é um caminho mais longo terminando em `/gt`; `cand` é um
 * sub-caminho real de `gt` (tem "/"). Um basename SOLTO (sem "/", ex.: "PrivacyInfo.xcprivacy"
 * citado em prosa) só casa quando `allowBasename` — reservado para o caso "o repo não tem
 * NENHUM manifesto" (privacy-manifest-missing com 1 alvo), onde o achado não tem caminho a citar.
 */
function suffixMatch(cand: string, gt: string, allowBasename: boolean): boolean {
  if (cand === gt) return true;
  if (cand.endsWith(`/${gt}`)) return true;
  if (cand.includes("/") && gt.endsWith(`/${cand}`)) return true;
  if (allowBasename && !cand.includes("/") && gt.split("/").pop() === cand) return true;
  return false;
}

function fileMatchesAny(f: Finding, targets: string[], allowBasename: boolean): boolean {
  const paths = pathsIn(f);
  // basename solto ("PrivacyInfo.xcprivacy" citado em prosa) só vale quando o achado NÃO tem
  // um `file` estruturado — senão um blocker com `file` alucinado escaparia do check só por
  // mencionar o manifesto no texto.
  const bare = allowBasename && !f.file;
  return targets.some((t) => paths.some((c) => suffixMatch(c, t, bare)));
}

function textCites(f: Finding, reasons: string[]): boolean {
  const hay = [f.title, f.detail, f.evidence, f.reference]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return reasons.some((r) => r && hay.includes(r.toLowerCase()));
}

function repoHit(findings: Finding[], tr: TestRepo): boolean {
  const gt = tr.groundTruth;
  // basename solto só vale quando o alvo é "o único manifesto do repo, que não existe"
  const bareOk =
    gt.category === "privacy-manifest-missing" && (gt.files?.length ?? 0) === 1;
  const targets: { files: string[]; reasons: string[]; bareOk: boolean }[] = [
    {
      files: gt.files ?? [],
      reasons: [gt.reference, ...(gt.expected ?? [])].filter((x): x is string => Boolean(x)),
      bareOk,
    },
    ...(gt.phantom_permissions ?? []).map((pp) => ({
      files: [pp.file],
      reasons: [pp.key],
      bareOk: false,
    })),
  ];
  return findings.some((f) =>
    targets.some(
      (t) => t.files.length > 0 && fileMatchesAny(f, t.files, t.bareOk) && textCites(f, t.reasons),
    ),
  );
}

interface RepoScore {
  id: number;
  hit: boolean;
  blockers: number;
  falsePositives: { file: string; title: string }[];
}
interface Scored {
  perRepo: RepoScore[];
  hits: number;
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
  const perRepo: RepoScore[] = [];
  let tokens = 0;
  let ms = 0;

  for (const tr of repos) {
    const run = runs.find((r) => r.id === tr.id);
    const findings = run?.findings ?? [];
    if (run) {
      tokens += runTokens(run);
      ms += runMs(run);
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
    perRepo.push({ id: tr.id, hit: repoHit(findings, tr), blockers: blockers.length, falsePositives });
  }

  const blockerTotal = perRepo.reduce((s, r) => s + r.blockers, 0);
  const fpTotal = perRepo.reduce((s, r) => s + r.falsePositives.length, 0);
  return {
    perRepo,
    hits: perRepo.filter((r) => r.hit).length,
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

function main(): void {
  const testRepos = JSON.parse(readFileSync(p("evaluation/test-repos.json"), "utf8")) as TestRepo[];
  const total = testRepos.length;

  const base = score(p("evaluation/out/baseline.json"), testRepos);
  const sol = score(p("evaluation/out/solution.json"), testRepos);

  const recallStr = (s: Scored): string => `${s.hits}/${total} (${pct(s.hits / total)})`;
  const precStr = (s: Scored): string => `${pct(s.precision)} (${s.fpTotal}/${s.blockerTotal} FP)`;

  // ── evaluation/results.md ──
  let md = readFileSync(p("evaluation/results.md"), "utf8");
  md = fillRow(md, "| Recall", {
    2: recallStr(base),
    3: recallStr(sol),
    4: `${sol.hits - base.hits >= 0 ? "+" : ""}${sol.hits - base.hits} HIT`,
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
  for (const tr of testRepos) {
    const b = base.perRepo.find((r) => r.id === tr.id)!;
    const s = sol.perRepo.find((r) => r.id === tr.id)!;
    md = fillRow(md, `| ${tr.id} |`, {
      3: b.hit ? "sim" : "não",
      4: s.hit ? "sim" : "não",
      5: String(b.falsePositives.length),
      6: String(s.falsePositives.length),
    });
  }
  writeFileSync(p("evaluation/results.md"), md);

  // ── CHANGELOG.md: só a célula Precisão das linhas com dados (0 = baseline, 2 = solução atual) ──
  let cl = readFileSync(p("CHANGELOG.md"), "utf8");
  cl = fillRow(cl, "| 0 | Baseline", { 6: precStr(base) });
  cl = fillRow(cl, "| 2 | + Orquestrador", { 6: precStr(sol) });
  writeFileSync(p("CHANGELOG.md"), cl);

  // ── resumo no stdout p/ revisão humana ──
  console.log("=== RECALL ===");
  console.log(`baseline: ${recallStr(base)}   solução: ${recallStr(sol)}`);
  for (const tr of testRepos) {
    const b = base.perRepo.find((r) => r.id === tr.id)!;
    const s = sol.perRepo.find((r) => r.id === tr.id)!;
    console.log(`  #${tr.id} ${tr.repo}: baseline ${b.hit ? "HIT" : "miss"} | solução ${s.hit ? "HIT" : "miss"}`);
  }
  console.log("\n=== PRECISÃO ===");
  console.log(`baseline: ${precStr(base)}   solução: ${precStr(sol)}`);
  for (const s of [
    ["baseline", base],
    ["solução", sol],
  ] as const) {
    console.log(`  ${s[0]}:`);
    for (const r of s[1].perRepo) {
      if (r.falsePositives.length === 0) continue;
      for (const fp of r.falsePositives) console.log(`    #${r.id} FP: ${fp.file} — ${fp.title}`);
    }
  }
  console.log("\n=== CUSTO / TEMPO ===");
  console.log(`baseline: ${ktok(base.tokens)} tok, ${secs(base.ms)}`);
  console.log(`solução : ${ktok(sol.tokens)} tok, ${secs(sol.ms)}`);
  console.log("\n[fill-results] results.md e CHANGELOG.md atualizados (não commitado).");
}

main();

import type { AgentName, AuditReport, Finding, Severity } from "../lib/types";

const SEVERITY_LABEL: Record<Severity, string> = {
  blocker: "Blocker",
  recomendado: "Recomendado",
  opcional: "Opcional",
};

const SEVERITY_ORDER: Record<Severity, number> = { blocker: 0, recomendado: 1, opcional: 2 };

const AGENT_LABEL: Record<AgentName, string> = {
  privacy: "Privacidade",
  permissions: "Permissões",
  guidelines: "Guidelines",
  accessibility: "Acessibilidade",
  baseline: "Baseline",
};

/** Penaliza por severidade; piso em 0. Heurística, documentada no rodapé. */
function readinessScore(s: Record<Severity, number>): number {
  return Math.max(0, 100 - 30 * s.blocker - 10 * s.recomendado - 4 * s.opcional);
}

/** Qualquer blocker = não está pronto = vermelho, independente do número. */
function scoreColorVar(score: number, blockers: number): string {
  if (blockers > 0) return "var(--bad)";
  if (score >= 80) return "var(--ok)";
  if (score >= 50) return "var(--warn)";
  return "var(--bad)";
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Localização do achado: `file:line` quando há; senão o 1º caminho citado no evidence. */
function locationOf(f: Finding): string {
  if (f.file) return `${f.file}${f.line != null ? `:${f.line}` : ""}`;
  const fromEvidence = (f.evidence ?? "").match(
    /[A-Za-z0-9_./+-]+\.(?:xcprivacy|plist|swift|mm|m|h|kt|java|tsx|ts|jsx|js)(?::\d+)?/,
  );
  return fromEvidence ? `${fromEvidence[0]} (do evidence)` : "";
}

function findingCard(f: Finding): string {
  const loc = locationOf(f);
  return `
      <article class="finding sev-${f.severity}">
        <div class="finding-head">
          <span class="badge sev-${f.severity}">${SEVERITY_LABEL[f.severity]}</span>
          ${f.reference ? `<span class="ref">${esc(f.reference)}</span>` : ""}
        </div>
        <h3>${esc(f.title)}</h3>
        ${loc ? `<p class="loc"><code>${esc(loc)}</code></p>` : ""}
        ${f.detail ? `<p class="detail">${esc(f.detail)}</p>` : ""}
        ${f.evidence ? `<pre class="evidence"><code>${esc(f.evidence)}</code></pre>` : ""}
        ${f.suggestion ? `<p class="fix"><span>Correção</span> ${esc(f.suggestion)}</p>` : ""}
      </article>`;
}

function agentGroup(agent: AgentName, findings: Finding[]): string {
  const sorted = [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
  const counts = (["blocker", "recomendado", "opcional"] as Severity[])
    .map((s) => ({ s, n: sorted.filter((f) => f.severity === s).length }))
    .filter((x) => x.n > 0)
    .map((x) => `<span class="dot sev-${x.s}"></span>${x.n}`)
    .join(" ");
  return `
    <details class="group" open>
      <summary>
        <span class="chev" aria-hidden="true"></span>
        <span class="group-name">${AGENT_LABEL[agent] ?? esc(agent)}</span>
        <span class="group-count">${counts}</span>
      </summary>
      ${sorted.map(findingCard).join("\n")}
    </details>`;
}

/** Template fixo — sem chamada de API. Recebe o AuditReport já pronto do orquestrador. */
export function generateHtml(report: AuditReport): string {
  const { summary } = report;
  const score = readinessScore(summary);
  const repoName = report.repoPath.split("/").filter(Boolean).pop() ?? report.repoPath;
  const total = report.findings.length;

  // agrupa por agente, na ordem privacy → permissions → resto
  const order: AgentName[] = ["privacy", "permissions", "guidelines", "accessibility", "baseline"];
  const byAgent = new Map<AgentName, Finding[]>();
  for (const f of report.findings) {
    const arr = byAgent.get(f.agent) ?? [];
    arr.push(f);
    byAgent.set(f.agent, arr);
  }
  const groups = order
    .filter((a) => byAgent.has(a))
    .map((a) => agentGroup(a, byAgent.get(a)!))
    .join("\n");

  const R = 52;
  const C = 2 * Math.PI * R;
  const dash = (score / 100) * C;

  const orch = report.orchestration;
  const orchNote =
    orch?.aiApplied && orch.rationale.length
      ? `<details class="group"><summary><span class="chev" aria-hidden="true"></span><span class="group-name">Orquestração</span><span class="group-count">${orch.rationale.length} decisão(ões)</span></summary>
        <ul class="rationale">${orch.rationale.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
      </details>`
      : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prontidão · ${esc(repoName)}</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f4f5f7; --panel: #ffffff; --ink: #1a1d21; --muted: #6b7280; --line: #e3e6ea;
    --ok: #1f8a4c; --warn: #c77700; --bad: #c0392b;
    --sev-blocker: #c0392b; --sev-recomendado: #c77700; --sev-opcional: #64748b;
    --code-bg: #0f1116; --code-ink: #e6e6e6;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f1115; --panel: #191c22; --ink: #e7e9ec; --muted: #9aa1ab; --line: #2b2f37;
      --ok: #37c26b; --warn: #e5a13a; --bad: #e5615b;
      --sev-blocker: #e5615b; --sev-recomendado: #e5a13a; --sev-opcional: #93a0b0;
      --code-bg: #0b0d11; --code-ink: #d7dbe0;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  .wrap { max-width: 860px; margin: 0 auto; padding: 32px 20px 64px; }

  header { display: flex; gap: 24px; align-items: center; background: var(--panel);
    border: 1px solid var(--line); border-radius: 16px; padding: 24px; }
  .gauge { flex: 0 0 128px; position: relative; }
  .gauge svg { display: block; transform: rotate(-90deg); }
  .gauge .val { position: absolute; inset: 0; display: grid; place-items: center;
    font-size: 30px; font-weight: 700; }
  header .meta h1 { margin: 0 0 2px; font-size: 17px; letter-spacing: -0.01em; }
  header .meta .path { color: var(--muted); font-size: 12px; word-break: break-all;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  header .meta .when { color: var(--muted); font-size: 12px; margin-top: 8px; }
  .tally { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
  .pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px;
    border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px; color: var(--muted); }
  .pill b { color: var(--ink); font-variant-numeric: tabular-nums; }
  .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .dot.sev-blocker { background: var(--sev-blocker); }
  .dot.sev-recomendado { background: var(--sev-recomendado); }
  .dot.sev-opcional { background: var(--sev-opcional); }

  .toolbar { display: flex; justify-content: flex-end; margin: 20px 0 8px; }
  .toolbar button { font: inherit; font-size: 12px; color: var(--muted); background: none;
    border: 1px solid var(--line); border-radius: 8px; padding: 5px 10px; cursor: pointer; }
  .toolbar button:hover { color: var(--ink); }

  details.group { background: var(--panel); border: 1px solid var(--line);
    border-radius: 14px; margin: 12px 0; overflow: hidden; }
  details.group > summary { list-style: none; cursor: pointer; display: flex; align-items: center;
    gap: 10px; padding: 14px 18px; font-weight: 600; }
  details.group > summary::-webkit-details-marker { display: none; }
  .chev { width: 8px; height: 8px; border-right: 2px solid var(--muted);
    border-bottom: 2px solid var(--muted); transform: rotate(-45deg); transition: transform .15s; }
  details[open] > summary .chev { transform: rotate(45deg); }
  .group-name { flex: 1; }
  .group-count { display: flex; align-items: center; gap: 4px; color: var(--muted);
    font-weight: 500; font-size: 13px; font-variant-numeric: tabular-nums; }

  .finding { border-top: 1px solid var(--line); padding: 16px 18px 18px; }
  .finding-head { display: flex; align-items: center; gap: 8px; }
  .badge { font-size: 11px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase;
    color: #fff; padding: 2px 8px; border-radius: 5px; }
  .badge.sev-blocker { background: var(--sev-blocker); }
  .badge.sev-recomendado { background: var(--sev-recomendado); }
  .badge.sev-opcional { background: var(--sev-opcional); }
  .ref { margin-left: auto; color: var(--muted); font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .finding h3 { margin: 8px 0 6px; font-size: 15px; letter-spacing: -0.01em; }
  .loc code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px;
    color: var(--muted); }
  .detail { margin: 6px 0; }
  .evidence { margin: 10px 0 0; background: var(--code-bg); color: var(--code-ink);
    border-radius: 8px; padding: 12px 14px; overflow-x: auto; }
  .evidence code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px;
    white-space: pre-wrap; word-break: break-word; }
  .fix { margin: 10px 0 0; font-size: 13.5px; }
  .fix span { display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .04em; color: var(--ok); margin-right: 6px; }
  .rationale { margin: 0; padding: 0 18px 16px 34px; color: var(--muted); font-size: 13px; }
  .rationale li { margin: 4px 0; }

  .empty { background: var(--panel); border: 1px solid var(--line); border-radius: 14px;
    padding: 28px; text-align: center; color: var(--muted); }
  footer { margin-top: 28px; color: var(--muted); font-size: 12px; text-align: center; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="gauge">
      <svg width="128" height="128" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r="${R}" fill="none" stroke="var(--line)" stroke-width="12"/>
        <circle cx="64" cy="64" r="${R}" fill="none" stroke="${scoreColorVar(score, summary.blocker)}" stroke-width="12"
          stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${(C - dash).toFixed(1)}"/>
      </svg>
      <div class="val" style="color:${scoreColorVar(score, summary.blocker)}">${score}</div>
    </div>
    <div class="meta">
      <h1>Prontidão para publicação (iOS)</h1>
      <div class="path">${esc(report.repoPath)}</div>
      <div class="when">${esc(report.generatedAt)}</div>
      <div class="tally">
        <span class="pill"><span class="dot sev-blocker"></span><b>${summary.blocker}</b> blocker</span>
        <span class="pill"><span class="dot sev-recomendado"></span><b>${summary.recomendado}</b> recomendado</span>
        <span class="pill"><span class="dot sev-opcional"></span><b>${summary.opcional}</b> opcional</span>
      </div>
    </div>
  </header>

  ${total === 0
    ? `<div class="empty">Nenhum achado. O app parece pronto para envio — revise mesmo assim antes de submeter.</div>`
    : `<div class="toolbar"><button id="toggle-all" type="button">Recolher tudo</button></div>
  ${groups}
  ${orchNote}`}

  <footer>
    Gerado por <strong>auditor-app-readiness</strong> · ferramenta consultiva — um humano decide o envio.<br>
    Score = 100 − 30·blocker − 10·recomendado − 4·opcional (piso 0), heurística.
  </footer>
</div>
<script>
  (function () {
    var btn = document.getElementById("toggle-all");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var groups = document.querySelectorAll("details.group");
      var anyOpen = Array.prototype.some.call(groups, function (g) { return g.open; });
      Array.prototype.forEach.call(groups, function (g) { g.open = !anyOpen; });
      btn.textContent = anyOpen ? "Expandir tudo" : "Recolher tudo";
    });
  })();
</script>
</body>
</html>`;
}

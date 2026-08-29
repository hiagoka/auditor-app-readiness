import type { AuditReport, Finding, Severity } from "../lib/types";

const SEVERITY_LABEL: Record<Severity, string> = {
  blocker: "Blocker",
  recomendado: "Recomendado",
  opcional: "Opcional",
};

const SEVERITY_COLOR: Record<Severity, string> = {
  blocker: "#c0392b",
  recomendado: "#d68910",
  opcional: "#7f8c8d",
};

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function findingCard(f: Finding): string {
  const loc = f.file ? `${esc(f.file)}${f.line ? `:${f.line}` : ""}` : "";
  return `
    <article class="finding" style="border-left-color:${SEVERITY_COLOR[f.severity]}">
      <header>
        <span class="badge" style="background:${SEVERITY_COLOR[f.severity]}">${SEVERITY_LABEL[f.severity]}</span>
        <span class="agent">${esc(f.agent)}</span>
        ${f.reference ? `<span class="ref">${esc(f.reference)}</span>` : ""}
      </header>
      <h3>${esc(f.title)}</h3>
      ${loc ? `<p class="loc"><code>${loc}</code></p>` : ""}
      <p>${esc(f.detail)}</p>
      ${f.evidence ? `<pre class="evidence">${esc(f.evidence)}</pre>` : ""}
      ${f.suggestion ? `<p class="suggestion"><strong>Correção:</strong> ${esc(f.suggestion)}</p>` : ""}
    </article>`;
}

/** Template fixo — sem chamada de API. Recebe o JSON já pronto do orquestrador. */
export function generateHtml(report: AuditReport): string {
  const { summary } = report;
  const cards = report.findings.map(findingCard).join("\n");
  const empty = report.findings.length === 0
    ? `<p class="empty">Nenhum achado. (Agentes ainda são stubs — implemente <code>askJson</code>.)</p>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Auditoria de Prontidão — ${esc(report.repoPath)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 -apple-system, system-ui, sans-serif; margin: 0; background: #f5f6f8; color: #1a1a1a; }
  @media (prefers-color-scheme: dark) { body { background: #16181d; color: #e6e6e6; } .finding { background: #1f2229; } }
  header.top { padding: 24px 32px; background: #111; color: #fff; }
  header.top h1 { margin: 0 0 4px; font-size: 18px; }
  header.top p { margin: 0; opacity: .7; font-size: 13px; }
  .scores { display: flex; gap: 16px; padding: 24px 32px; }
  .score { flex: 1; padding: 16px; border-radius: 10px; background: #fff; text-align: center; }
  @media (prefers-color-scheme: dark) { .score { background: #1f2229; } }
  .score .n { font-size: 32px; font-weight: 700; }
  .score .l { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; opacity: .6; }
  main { padding: 0 32px 48px; max-width: 900px; }
  .finding { background: #fff; border-left: 4px solid #ccc; border-radius: 8px; padding: 16px 20px; margin: 12px 0; }
  .finding header { display: flex; gap: 8px; align-items: center; font-size: 12px; margin-bottom: 6px; }
  .badge { color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
  .agent { opacity: .6; text-transform: uppercase; letter-spacing: .04em; }
  .ref { margin-left: auto; opacity: .6; font-family: ui-monospace, monospace; }
  .finding h3 { margin: 4px 0; font-size: 15px; }
  .loc code, .evidence { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; }
  .evidence { background: #0d0d0d; color: #d6d6d6; padding: 10px 12px; border-radius: 6px; overflow-x: auto; }
  .suggestion { font-size: 13px; }
  .empty { opacity: .6; padding: 24px 0; }
  footer { padding: 24px 32px; font-size: 12px; opacity: .5; }
</style>
</head>
<body>
<header class="top">
  <h1>Auditoria de Prontidão para Publicação (iOS)</h1>
  <p>${esc(report.repoPath)} · ${esc(report.generatedAt)}</p>
</header>
<section class="scores">
  <div class="score"><div class="n" style="color:${SEVERITY_COLOR.blocker}">${summary.blocker}</div><div class="l">Blocker</div></div>
  <div class="score"><div class="n" style="color:${SEVERITY_COLOR.recomendado}">${summary.recomendado}</div><div class="l">Recomendado</div></div>
  <div class="score"><div class="n" style="color:${SEVERITY_COLOR.opcional}">${summary.opcional}</div><div class="l">Opcional</div></div>
</section>
<main>
  ${empty}
  ${cards}
</main>
<footer>Gerado por auditor-app-readiness — template fixo, sem chamada de IA nesta etapa.</footer>
</body>
</html>`;
}

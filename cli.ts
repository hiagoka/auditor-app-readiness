import "dotenv/config";
import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { runPrivacyAgent } from "./agents/privacy-agent";
import { runPermissionsAgent } from "./agents/permissions-agent";
import { orchestrate } from "./agents/orchestrator";
import { generateHtml } from "./report/generate-html";
import type { AgentResult, AuditReport } from "./lib/types";

const USAGE = "uso: npm run audit -- --repo ./caminho/do/app [--out output]";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      repo: { type: "string" },
      out: { type: "string", default: "output" },
    },
  });

  if (!values.repo) {
    console.error(USAGE);
    process.exit(1);
  }

  const repoPath = resolve(values.repo);
  console.error(`[auditor] analisando ${repoPath}`);

  // Agentes entregues: Privacidade e Permissões. Guidelines e Acessibilidade estão previstos
  // na arquitetura (agents/guidelines-agent.ts, agents/accessibility-agent.ts) mas são esqueletos
  // não implementados — não entram no pipeline.
  const agentResults: AgentResult[] = [
    await runPrivacyAgent({ repoPath }),
    await runPermissionsAgent({ repoPath }),
  ];

  const report: AuditReport = await orchestrate({ repoPath, agentResults });

  const outDir = resolve(values.out);
  await mkdir(outDir, { recursive: true });
  await writeFile(`${outDir}/resultado.json`, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(`${outDir}/relatorio.html`, generateHtml(report));

  const { blocker, recomendado, opcional } = report.summary;
  console.error(`[auditor] ${blocker} blocker / ${recomendado} recomendado / ${opcional} opcional`);
  console.error(`[auditor] escrito em ${outDir}/resultado.json e ${outDir}/relatorio.html`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

import { runPrivacyAgent } from "../agents/privacy-agent";
import { runPermissionsAgent } from "../agents/permissions-agent";
import { runGuidelinesAgent } from "../agents/guidelines-agent";
import { orchestrate } from "../agents/orchestrator";
import type { AgentResult } from "../lib/types";
import testRepos from "./test-repos.json" with { type: "json" };

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "evaluation/out");
const WITH_GUIDELINES = process.argv.includes("--guidelines");

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const runs = [];

  for (const spec of testRepos) {
    const slug = `${spec.id}-${spec.repo.split("/")[1]}`;
    const repoPath = resolve(ROOT, "test-repos", slug);
    if (!existsSync(repoPath)) {
      console.error(`[solution] pulando ${slug} — rode "npm run clone-repos" primeiro`);
      continue;
    }
    console.error(`[solution] ${slug}`);

    const agentResults: AgentResult[] = [
      await runPrivacyAgent({ repoPath }),
      await runPermissionsAgent({ repoPath }),
    ];
    if (WITH_GUIDELINES) {
      agentResults.push(await runGuidelinesAgent({ repoPath, upstream: agentResults }));
    }

    const report = await orchestrate({ repoPath, agentResults });
    runs.push({ id: spec.id, repo: spec.repo, slug, ...report });
  }

  const path = resolve(OUT, "solution.json");
  await writeFile(path, `${JSON.stringify({ generatedAt: new Date().toISOString(), runs }, null, 2)}\n`);
  console.error(`[solution] escrito em ${path}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

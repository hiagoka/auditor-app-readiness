import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

import { runBaseline } from "../baseline/single-prompt";
import testRepos from "./test-repos.json" with { type: "json" };

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "evaluation/out");

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const runs = [];

  for (const spec of testRepos) {
    const slug = `${spec.id}-${spec.repo.split("/")[1]}`;
    const repoPath = resolve(ROOT, "test-repos", slug);
    if (!existsSync(repoPath)) {
      console.error(`[baseline] pulando ${slug} — rode "npm run clone-repos" primeiro`);
      continue;
    }
    console.error(`[baseline] ${slug}`);
    try {
      const result = await runBaseline(repoPath);
      runs.push({ id: spec.id, repo: spec.repo, slug, ...result });
      console.error(`[baseline] ${slug} -> ${result.findings.length} achados, ${result.tokensUsed} tokens`);
    } catch (err) {
      console.error(`[baseline] ${slug} FALHOU: ${(err as Error).message}`);
      runs.push({ id: spec.id, repo: spec.repo, slug, error: (err as Error).message });
    }
  }

  const totalTokens = runs.reduce((s, r) => s + ("tokensUsed" in r ? r.tokensUsed : 0), 0);
  console.error(`[baseline] total: ${totalTokens} tokens em ${runs.filter((r) => !("error" in r)).length}/${runs.length} repos`);

  const path = resolve(OUT, "baseline.json");
  await writeFile(path, `${JSON.stringify({ generatedAt: new Date().toISOString(), runs }, null, 2)}\n`);
  console.error(`[baseline] escrito em ${path}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

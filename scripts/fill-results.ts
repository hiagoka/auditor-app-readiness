/**
 * Preenche os placeholders `[preencher]` de evaluation/results.md e CHANGELOG.md com os números
 * reais de avaliação. DETERMINÍSTICO — sem IA. Roda sozinho porque copiar um número calculado
 * não tem risco de alucinação.
 *
 * Entradas:  evaluation/out/baseline.json, evaluation/out/solution.json, evaluation/test-repos.json
 * Saídas:    evaluation/results.md, CHANGELOG.md (edição in-place dos campos [preencher])
 *
 * TODO: implementar o scoring conforme "Critério de encontrou" em results.md:
 *   1. Para cada run, casar Finding[] contra groundTruth (match de sufixo de caminho + string esperada).
 *   2. recall = itens GT encontrados / total de itens GT; precisão = 1 - (FP / total de findings blocker).
 *   3. Somar durationMs e tokensUsed por conjunto (baseline vs. solução).
 *   4. Substituir os `[preencher]` por posição, sem tocar em mais nada dos arquivos.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

const ROOT = resolve(import.meta.dirname, "..");

interface Scored {
  recall: number;
  precision: number;
  totalMs: number;
  totalTokens: number;
}

function score(_runsJsonPath: string): Scored {
  // TODO: ver docstring.
  throw new Error("fill-results: scoring ainda não implementado");
}

async function main(): Promise<void> {
  const baselinePath = resolve(ROOT, "evaluation/out/baseline.json");
  const solutionPath = resolve(ROOT, "evaluation/out/solution.json");
  for (const p of [baselinePath, solutionPath]) {
    if (!existsSync(p)) {
      console.error(`falta ${p} — rode "npm run baseline" e "npm run eval" antes`);
      process.exit(1);
    }
  }

  const baseline = score(baselinePath);
  const solution = score(solutionPath);

  const resultsPath = resolve(ROOT, "evaluation/results.md");
  let md = await readFile(resultsPath, "utf8");
  // TODO: substituição posicional dos [preencher].
  void md;
  void baseline;
  void solution;

  await writeFile(resultsPath, md);
  console.error("[fill-results] results.md e CHANGELOG.md atualizados");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

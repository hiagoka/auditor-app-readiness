/**
 * AGENTE DE DESENVOLVIMENTO — não faz parte do produto entregue.
 *
 * Lê o histórico de execuções de cada iteração (evaluation/out/*.json + notas soltas) e rascunha
 * entradas para CHANGELOG.md e a seção de Hot Take do README.
 *
 * A saída é SEMPRE revisada antes do commit — nunca aceitar direto. A Regra 9 do hackathon exige
 * que toda afirmação seja rastreável até a evidência, e um agente pode "florear" a narrativa.
 *
 * Uso:
 *   tsx agents-dev/changelog-writer.ts > /tmp/changelog-draft.md
 *   # revisar à mão, então colar o que se sustenta no CHANGELOG.md
 */
import "dotenv/config";
import { askJson } from "../lib/openai";

async function main(): Promise<void> {
  // TODO: montar contexto com os JSONs de resultado das iterações e pedir um rascunho.
  const draft = await askJson<{ changelogRows: string[]; hotTake: string }>({
    system:
      "Você rascunha changelog técnico. Cada linha deve citar o número da métrica que a sustenta. " +
      "Não invente causa; se o dado não mostra, escreva 'sem sinal claro'.",
    user: "TODO: colar aqui o resumo das execuções.",
  });
  console.log(JSON.stringify(draft.data, null, 2));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

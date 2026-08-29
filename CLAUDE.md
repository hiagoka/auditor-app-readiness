# CLAUDE.md

Contexto para agentes trabalhando neste repositório.

## O que é

CLI (Node + TypeScript, sem build — roda via `tsx`) que audita um projeto React Native/iOS antes
do envio para a App Store, usando um pipeline de agentes de IA. Entrega de hackathon. Detalhes de
produto no `README.md`; plano de iterações no `CHANGELOG.md`; dataset e reprodução em
`REPRODUCAO.md`.

## Comandos

```bash
npm run audit -- --repo ./app [--guidelines] [--accessibility] [--out output]
npm run typecheck        # tsc --noEmit — rode antes de considerar qualquer mudança pronta
npm run clone-repos      # clona evaluation/test-repos.json em test-repos/ no commitBefore
npm run baseline         # roda o 1-prompt contra os repos -> evaluation/out/baseline.json
npm run eval             # roda o pipeline -> evaluation/out/solution.json
npm run fill-results     # preenche [preencher] em results.md/CHANGELOG (determinístico, sem IA)
```

## Arquitetura

Fluxo: `cli.ts` → agentes em `agents/` → `agents/orchestrator.ts` → `report/generate-html.ts` →
`output/resultado.json` + `output/relatorio.html`.

- **Toda chamada ao modelo passa por `askJson()` em `lib/openai.ts`.** Não chamar o SDK da OpenAI
  direto de um agente. `webSearch: true` só no agente de Guidelines.
- **Provedor de IA: OpenAI** (a seção 12 do plano original menciona Anthropic por engano — ignore).
- Cada agente segue o mesmo padrão: lê/prepara arquivos → monta prompt especializado → `askJson`
  → mapeia a resposta para `Finding[]`. Retorna `AgentResult` com `inspected` (o que leu) e
  `tokensUsed` preenchidos — isso alimenta a trajetória do agente e as métricas.
- **O orquestrador faz dedupe e priorização em código puro.** Só a resolução de *conflito de
  severidade* entre agentes pode custar 1 chamada de IA. `report/generate-html.ts` nunca chama IA.
- Tipos compartilhados em `lib/types.ts`. IDs de achado via `makeFindingId()`.
- ESM (`"type": "module"`), `moduleResolution: "Bundler"` → imports relativos **sem** extensão.
  `import "dotenv/config"` no topo de todo entrypoint.

## Prioridade dos agentes

MVP: Privacidade, Permissões, Orquestrador. Stretch: Guidelines (busca web), depois
Acessibilidade. Não investir em stretch antes do MVP fechar com números no `CHANGELOG.md`.

## Convenções do projeto

- **Não commitar sem o Hiago pedir.** Repo em branch `main`, sem commits ainda.
- `agents-dev/` é ferramenta de desenvolvimento, **não faz parte do produto entregue**.
- Regra 9 do hackathon: toda afirmação no README/CHANGELOG tem que ser rastreável até uma
  evidência (um número de `evaluation/`, um log). Rascunho de IA para changelog é sempre revisado
  à mão antes do commit.
- Avaliação sempre contra o `commitBefore` dos repos de teste — é onde o problema ainda existe.
- `output/`, `test-repos/`, `.env`, `node_modules/` são gitignored.

# Auditor de Prontidão para Publicação Mobile (iOS)

*Hackathon de Workflows Agênticos — micro1*

Ferramenta de linha de comando que audita um projeto React Native/iOS **antes** do envio para a
App Store, usando agentes de IA especializados para detectar os motivos mais comuns de rejeição —
privacidade e permissões no núcleo, com guidelines e acessibilidade como extensões — e devolve um
relatório priorizado (JSON + HTML) com o que corrigir.

## O problema (usuário real)

Sou dev mobile solo do **Prepara+** (app de estudos para o ENEM, React Native/Expo). Construo o
app do início ao fim e não tenho um time de QA de compliance revisando antes do release. Os
motivos de rejeição da App Store que mais custam tempo não são bugs — são declarações faltando:
um SDK que coleta dado sem constar no Privacy Manifest, uma permissão declarada e nunca usada,
uma API de "required reason" chamada sem justificativa. Um `eslint` não pega nada disso.

Essa ferramenta roda esse checklist por mim.

## Por que agentes, e não um prompt único

Um prompt único mistura critérios que exigem **tipos de leitura diferentes**: "isso está
declarado?" (ler manifestos) é uma pergunta; "isso é realmente usado?" (ler código-fonte) é
outra. Separar em agentes especializados e reconciliar no orquestrador é o motivo técnico da
orquestração — não decoração. O `CHANGELOG.md` mede isso: baseline (1 prompt) vs. pipeline.

## Escopo

**iOS apenas** nesta versão. Decisão consciente: o Privacy Manifest é obrigatório desde o iOS 17,
é mais recente e tem penalidade mais dura que o equivalente Android; generalizar exigiria dobrar a
lógica de cada agente sem ganho de aprendizado proporcional no prazo.

| Agente | Status | Lê | Pergunta que responde |
|---|---|---|---|
| Privacidade | MVP | `Info.plist`, `PrivacyInfo.xcprivacy`, `package.json`/`Podfile` | isso está declarado? |
| Permissões | MVP | manifesto de permissões + código-fonte | isso é realmente usado? |
| Orquestrador | MVP | saídas dos agentes | dedupe + severidade + relatório único |
| Guidelines | stretch | metadados do app + achados | viola guideline vigente? (com busca web) |
| Acessibilidade | stretch | árvore de componentes JSX | interativo sem `accessibilityLabel`? |

## Uso

```bash
npm install
cp .env.example .env      # preencha OPENAI_API_KEY
npm run audit -- --repo ./caminho/do/app
```

Saída (mesma execução gera os dois):

```
output/
├── resultado.json   ← dado estruturado, consumido pela avaliação
└── relatorio.html   ← visualização humana, tipo Lighthouse
```

Flags: `--guidelines` e `--accessibility` ligam os agentes de stretch. `--out <dir>` muda a pasta
de saída.

## Estrutura

```
auditor-app-readiness/
├── cli.ts                        ← entrada; orquestra o pipeline
├── agents/
│   ├── privacy-agent.ts
│   ├── permissions-agent.ts
│   ├── guidelines-agent.ts       ← stretch
│   ├── accessibility-agent.ts    ← stretch
│   └── orchestrator.ts
├── baseline/single-prompt.ts     ← 1 prompt, sem estrutura de agentes
├── report/generate-html.ts       ← template HTML a partir do JSON (sem IA)
├── lib/                          ← cliente OpenAI + tipos compartilhados
├── evaluation/
│   ├── test-repos.json           ← 6 repos reais + commit hash + ground truth
│   ├── run-baseline.ts
│   ├── run-solution.ts
│   └── results.md
├── scripts/
│   ├── clone-test-repos.sh
│   └── fill-results.ts           ← preenche métricas (determinístico, sem IA)
└── agents-dev/changelog-writer.ts ← rascunha changelog (IA, saída sempre revisada)
```

## Reprodução

Ver [`REPRODUCAO.md`](./REPRODUCAO.md).

## Hot take

Um prompt único tende a misturar critérios que pedem tipos de leitura diferentes (declaração vs.
uso real) — esse é o motivo técnico real para orquestrar, não estética. Construí a própria
ferramenta usando um workflow de agentes orquestrados (Maestri), o que deu intuição direta de
quando dividir responsabilidades ajuda e quando só adiciona complexidade.

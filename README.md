# Auditor de Prontidão para Publicação Mobile (iOS)

*Hackathon de Workflows Agênticos — micro1*

Ferramenta de linha de comando que audita um projeto React Native/iOS **antes** do envio para a
App Store, usando agentes de IA especializados para detectar os motivos mais comuns de rejeição —
**privacidade e permissões** — e devolve um relatório priorizado (JSON + HTML) com o que corrigir.

A ferramenta **aponta**; um humano decide o envio. Ela não aprova nem reprova uma submissão —
gera um relatório consultivo para o dev revisar.

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
| Privacidade | **entregue** | `Info.plist`, `PrivacyInfo.xcprivacy`, `package.json`/`Podfile` | isso está declarado? |
| Permissões | **entregue** | `Info.plist` + código-fonte | isso é realmente usado? |
| Orquestrador | **entregue** | saídas dos agentes | dedupe + severidade + relatório único |
| Guidelines | esqueleto, **não implementado** | — | — |
| Acessibilidade | esqueleto, **não implementado** | — | — |

`agents/guidelines-agent.ts` e `agents/accessibility-agent.ts` estão no repo para mostrar a
arquitetura prevista, mas **retornam vazio** e não entram no pipeline. Não são funcionalidade
entregue.

O agente de Permissões cobre duas direções: **declarada e não usada** (permissão fantasma) e
**usada e não declarada** (chave `NS*UsageDescription` faltando para uma capability que o código
usa). A primeira tem caso pontuado no dataset (`image-picker-phantom-location`); a segunda está
**implementada mas sem caso dedicado** — os achados que ela produziu (fotos no Wootric e no
Firebase) entram como `accepted_extra_findings`, não como caso de recall.

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

`--out <dir>` muda a pasta de saída.

## Estrutura

```
auditor-app-readiness/
├── cli.ts                        ← entrada; orquestra o pipeline
├── agents/
│   ├── privacy-agent.ts
│   ├── permissions-agent.ts
│   ├── guidelines-agent.ts       ← esqueleto, não implementado
│   ├── accessibility-agent.ts    ← esqueleto, não implementado
│   └── orchestrator.ts
├── baseline/single-prompt.ts     ← 1 prompt, sem estrutura de agentes
├── report/generate-html.ts       ← template HTML a partir do JSON (sem IA)
├── lib/                          ← cliente OpenAI + scanners + tipos
├── evaluation/
│   ├── test-repos.json           ← 6 repos reais + 9 casos + ground truth
│   ├── run-baseline.ts
│   ├── run-solution.ts
│   └── results.md
├── scripts/
│   ├── clone-test-repos.sh
│   └── fill-results.ts           ← scorer determinístico, sem IA
└── agents-dev/changelog-writer.ts ← rascunha changelog (IA, saída sempre revisada)
```

## Reprodução

Ver [`REPRODUCAO.md`](./REPRODUCAO.md).

## O que já existia antes do hackathon

- **Maestri** e o **CLI multiagente pessoal** usados para *construir* este projeto (dividir
  trabalho entre um agente que escreve o changelog, um que faz commits, etc.). É ferramenta de
  desenvolvimento — **não faz parte do entregável** e não é executada pela ferramenta.
- **SDK da OpenAI** e os **6 repositórios de teste** (código de terceiros, usados só como
  entrada de avaliação).

Feito nesta janela — o produto inteiro: agentes de Privacidade e Permissões, orquestrador com
chamada de IA, `baseline/` (1 prompt para comparação), harness de avaliação (`run-baseline`,
`run-solution`), scorer determinístico (`fill-results`), e o relatório HTML.

## Hot take

O prompt único **não deixa de ver** os problemas de conformidade — ele os produz **com ruído**.
Na avaliação: 8 falsos positivos em 12 blockers (arquivo alucinado, "manifesto ausente" sem
apontar arquivo, blockers fora do escopo). O ganho da orquestração é limpar esse ruído
(**precisão 0.33 → 1.00**) por **1/3 do custo** (77k → 23k tokens). O recall quase não move —
5/9 → 6/9, um caso a mais (o fantasma `NSLocation`, que o prompt único hedgeava em vez de
afirmar). A lição: quando as leituras são de tipos diferentes ("está declarado?" vs. "cobre
este uso?"), separar em agentes não faz o modelo *achar mais*, faz ele *errar menos e mais
barato*. Construí a própria ferramenta com um workflow de agentes orquestrados (Maestri), o que
deu intuição direta de quando dividir responsabilidades ajuda e quando só adiciona complexidade.

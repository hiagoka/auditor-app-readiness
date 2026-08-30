# Resultados da avaliação

Fonte: `evaluation/out/baseline.json` e `evaluation/out/solution.json`, comparados contra o
ground truth de `evaluation/test-repos.json`. Preenchido por `npm run fill-results`
(determinístico, sem IA).

## Métricas agregadas

| Métrica | Baseline | Solução | Mudança |
|---|---|---|---|
| Recall (achou os problemas conhecidos) | 4/6 (0.67) | 4/6 (0.67) | +0 HIT |
| Precisão (não gerou falso positivo) | 0.33 (8/12 FP) | 1.00 (0/11 FP) | +0.67 |
| Tempo de execução (total) | 44s | 53s | +8s |
| Custo em tokens (total) | 77.2k tok | 23.3k tok | -70% (3.3x) |

## Por repositório

| # | Repositório | GT encontrado (baseline) | GT encontrado (solução) | Falsos positivos (baseline) | Falsos positivos (solução) |
|---|---|---|---|---|---|
| 1 | auth0/react-native-auth0 | sim | sim | 2 | 0 |
| 2 | react-native-image-picker | sim | sim | 2 | 0 |
| 3 | Wootric/WootricSDK-iOS | sim | sim | 0 | 0 |
| 4 | firebase/firebase-ios-sdk | não | não | 3 | 0 |
| 5 | cascadiacollections/shoutkit | não | não | 0 | 0 |
| 6 | rnmapbox/maps (negativo) | sim | sim | 1 | 0 |

## Critério (implementado em `scripts/fill-results.ts`)

**Recall — por repo, binário.** Um repo conta como HIT quando existe pelo menos um `Finding` tal
que:

1. algum caminho do achado — o campo `file` **ou** um caminho extraído do texto de
   `title`/`detail`/`evidence`/`suggestion` — casa por **sufixo de segmento** com um arquivo de
   `groundTruth.files` ou de `phantom_permissions[].file`; **e**
2. o texto do achado (`title` + `detail` + `evidence` + `reference`) cita `groundTruth.reference`
   ou uma string de `groundTruth.expected` ou, para o alvo de permissão fantasma, a chave em
   `phantom_permissions[].key`.

Sufixo de segmento: `a === b`, ou `a` termina em `/b`, ou `a` (contendo `/`) é sub-caminho de
`b`. Um **basename solto** (sem `/`, ex.: `PrivacyInfo.xcprivacy` citado em prosa) só casa
quando (i) o alvo é o único manifesto do repo — `category` `privacy-manifest-missing` com um
único arquivo em `files` — **e** (ii) o achado **não** tem campo `file` estruturado. Isso cobre
o caso "o repo não tem manifesto nenhum" sem dar passe livre a um blocker com `file` alucinado.
`Recall = HITs / 6`.

**Precisão — agregada nos 6 repos.** Falso positivo = `Finding` de severidade `blocker` cujo
caminho não casa (mesma regra de sufixo) com nenhum arquivo de `groundTruth.files`,
`phantom_permissions[].file` **nem** `accepted_extra_findings[].file`. `Precisão = 1 − FP / total
de blockers`.

`accepted_extra_findings` (campo em `test-repos.json`) é uma lista **curada à mão** dos achados
que caem fora do ground truth documentado mas são aceitos como reais (ex.: acesso a fotos no
Wootric/Firebase). Ela foi montada **depois** de observar as saídas dos agentes — ver a nota
"Sobre a precisão 1.00" no `CHANGELOG.md` sobre a circularidade que isso introduz.

**Tempo / custo:** somados por conjunto. Tokens do baseline vêm de `run.tokensUsed`; da solução,
de `run.agentResults[].tokensUsed` + `run.orchestration.tokensUsed`.

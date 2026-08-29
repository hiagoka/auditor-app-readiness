# Resultados da avaliação

Fonte: `evaluation/out/baseline.json` e `evaluation/out/solution.json`, comparados contra o
ground truth de `evaluation/test-repos.json`. Preenchido por `npm run fill-results`
(determinístico, sem IA).

## Métricas agregadas

| Métrica | Baseline | Solução | Mudança |
|---|---|---|---|
| Recall (achou os problemas conhecidos) | `[preencher]` | `[preencher]` | `[preencher]` |
| Precisão (não gerou falso positivo) | `[preencher]` | `[preencher]` | `[preencher]` |
| Tempo de execução (total) | `[preencher]` | `[preencher]` | `[preencher]` |
| Custo em tokens (total) | `[preencher]` | `[preencher]` | `[preencher]` |

## Por repositório

| # | Repositório | GT encontrado (baseline) | GT encontrado (solução) | Falsos positivos (baseline) | Falsos positivos (solução) |
|---|---|---|---|---|---|
| 1 | auth0/react-native-auth0 | `[preencher]` | `[preencher]` | `[preencher]` | `[preencher]` |
| 2 | react-native-image-picker | `[preencher]` | `[preencher]` | `[preencher]` | `[preencher]` |
| 3 | Wootric/WootricSDK-iOS | `[preencher]` | `[preencher]` | `[preencher]` | `[preencher]` |
| 4 | firebase/firebase-ios-sdk | `[preencher]` | `[preencher]` | `[preencher]` | `[preencher]` |
| 5 | cascadiacollections/shoutkit | `[preencher]` | `[preencher]` | `[preencher]` | `[preencher]` |
| 6 | rnmapbox/maps (negativo) | `[preencher]` | `[preencher]` | `[preencher]` | `[preencher]` |

## Critério de "encontrou"

Um item do ground truth conta como encontrado quando um Finding aponta o mesmo arquivo (match de
sufixo de caminho) **e** cita pelo menos uma das strings em `groundTruth.expected` no título,
detalhe, `evidence` ou `reference`. Falso positivo = Finding de severidade `blocker` que não
corresponde a nenhum item do ground truth do repo.

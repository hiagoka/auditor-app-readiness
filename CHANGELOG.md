# Changelog

Cada iteração roda contra os mesmos repositórios de `evaluation/test-repos.json`, sempre no
`commitBefore`, com o mesmo ground truth. Números em `evaluation/results.md`.

| # | Iteração | Mudança | Hipótese | Recall | Precisão | Tempo | Custo |
|---|---|---|---|---|---|---|---|
| 0 | Baseline | 1 prompt único: "revise esse código de app mobile e aponte problemas de conformidade" (`gpt-4.1-mini`) | referência | **3/6** | a medir | a medir | ~US$ 0,03 (77k tokens) |
| 1 | Privacidade + Permissões | separa em dois agentes especializados | recall sobe; pode surgir falso positivo por falta de contexto cruzado | `[preencher]` | `[preencher]` | `[preencher]` | `[preencher]` |
| 2 | + Orquestrador | dedupe determinístico + 1 chamada de IA para severidade/conflito | precisão sobe | `[preencher]` | `[preencher]` | `[preencher]` | `[preencher]` |
| 3 | + Guidelines (busca web) | agente com `web_search` checando as App Store Review Guidelines vigentes | pega mudança recente de política que um prompt estático perderia | `[preencher]` | `[preencher]` | `[preencher]` | `[preencher]` |

## Experimentos removidos

- `[preencher]` — ex.: fundir Privacidade + Permissões num único prompt / few-shot de exemplos
  problemáticos. Registrar o que foi testado e por que não entrou.

## Notas por iteração

### 0 — Baseline

Modelo `gpt-4.1-mini` (trocado de `gpt-4.1` por limite de TPM da conta). Os 6 repositórios
rodaram (6/6), 77k tokens no total (~US$ 0,03). Precisão e tempo ainda não medidos — ficam para
`npm run fill-results`. Recall 3/6 — e o dado que importa para o argumento do projeto é que os
3 erros **não são do mesmo tipo**:

- **Acerto limpo (3/6):** `auth0/react-native-auth0`, `rnmapbox/maps` e
  `react-native-image-picker` — todos casos de manifesto de privacidade obviamente ausente,
  achados corretamente.
- **Erro conceitual — `firebase/firebase-ios-sdk`:** o repositório já tem vários
  `PrivacyInfo.xcprivacy` (de outros módulos). O modelo não distinguiu "existe manifesto em
  algum lugar do repo" de "este uso específico de `UserDefaults` em `SettingsCacheClient.swift`
  está coberto por um manifesto". Não entendeu que a correção real troca o `UserDefaults` puro
  pelo wrapper `GULUserDefaults`.
- **Erro de escopo — `cascadiacollections/shoutkit`:** apontou o manifesto do app iOS principal
  e não percebeu que watchOS e tvOS são bundles separados, cada um precisando do próprio
  `PrivacyInfo.xcprivacy`.
- **Erro de formato, não de raciocínio — `Wootric/WootricSDK-iOS`:** o modelo acertou o
  diagnóstico inteiro — categoria `NSPrivacyAccessedAPICategoryUserDefaults`, motivo `CA92.1`,
  "nenhum `.xcprivacy` no repo" — mas o campo estruturado `file` ficou vazio (o caminho só
  aparece solto no texto de `detail`), citou apenas `WTRDefaults.m` e ignorou `WTRApiClient.m`
  (o ground truth lista os dois), e sem número de linha. Pelo critério estrito de
  `evaluation/results.md` conta como miss, mas é uma falha diferente das outras duas: aqui o
  modelo "sabia a resposta" e não a entregou no contrato estruturado.

Achado fora do alvo (ruído de escopo, não alucinação): no Wootric o baseline também sinalizou
`NSAllowsArbitraryLoads` no `Info.plist` do app de **demo** (`WootricSDK-Demo`) — observação
tecnicamente válida, mas fora do ground truth e sobre código de exemplo, não da SDK. No uso
real da ferramenta (auditar o próprio app) esse tipo de achado é o alvo principal; aqui é ruído
só porque o alvo do teste é o repositório da SDK.

Hipótese para a iteração 1: separar "isso está declarado?" (ler manifestos) de "essa declaração
cobre este uso / este bundle?" (ler código) deve subir o recall em #3 e #4.

### 1 — Privacidade + Permissões
`[preencher]`

### 2 — Orquestrador
`[preencher]`

### 3 — Guidelines
`[preencher]`

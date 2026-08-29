# Changelog

Cada iteração roda contra os mesmos repositórios de `evaluation/test-repos.json`, sempre no
`commitBefore`, com o mesmo ground truth. Números em `evaluation/results.md`.

| # | Iteração | Mudança | Hipótese | Recall | Precisão | Tempo | Custo |
|---|---|---|---|---|---|---|---|
| 0 | Baseline | 1 prompt único: "revise esse código de app mobile e aponte problemas de conformidade" (`gpt-4.1-mini`) | referência | **3/6** | a medir | a medir | ~US$ 0,03 (77k tokens) |
| 1 | Privacidade + Permissões | separa em dois agentes especializados | recall sobe; pode surgir falso positivo por falta de contexto cruzado | **4/6** | a medir | ~55s (6 repos) | ~20k tokens |
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

Hipótese para a iteração 1: separar 'isso está declarado?' de 'essa declaração cobre este uso/bundle?' deve subir o recall no caso firebase (#4) e no shoutkit (#5). O Wootric (#3) exige correção adicional, fora do escopo da especialização: reforçar o contrato estruturado (campo `file` obrigatório, validado) — sem isso o mesmo erro deve se repetir mesmo com agente dedicado.

Cobertura de avaliação para permissão fantasma: até 2026-08-29 os 6 casos de `evaluation/test-repos.json` tinham ground truth só de privacidade — nenhum caso de permissão fantasma, ou seja, o agente de Permissões entrava na iteração 1 sem nenhum caso que o exercitasse. Isso mudou hoje: o repo #2 (`react-native-image-picker`), no mesmo `commitBefore` (1257423) que já estava no dataset e sem nenhuma injeção sintética, ganhou cobertura real de permissão fantasma — `NSLocationWhenInUseUsageDescription` declarada com `<string></string>` vazia em `example/ios/example/Info.plist`, e grep de `CLLocation`/`CoreLocation`/`Geolocation`/`requestWhenInUse`/`locationManager`/`navigator.geolocation` em `example/ios`, `example/src`, `src` e `ios` sem nenhum uso (lib de foto/câmera não acessa localização). Com isso o #2 passa a exercitar os dois agentes numa única execução: Privacidade em `ios/ImagePickerManager.mm` (`phAsset.creationDate`, motivo 3B52.1) e Permissões no `Info.plist` (`NSLocationWhenInUseUsageDescription`). O ground truth do #2 também registra um near-miss deliberado: `NSMicrophoneUsageDescription`, com uso indireto plausível (o app grava vídeo, e a captura de vídeo via `UIImagePickerController` grava áudio sem o app chamar `AVAudioSession` direto), que por isso NÃO é marcada como fantasma — caso-armadilha para grep ingênuo.

### 1 — Privacidade + Permissões

Modelo ainda `gpt-4.1-mini`. O prompt único do baseline foi separado em dois agentes
especializados — **Privacidade** e **Permissões**. Cada agente faz a própria varredura e envia
ao pipeline um digest estruturado (tabela de manifests e usos), não o dump dos arquivos. O
Orquestrador continua 100% determinístico nesta iteração (dedupe + ordenação por severidade); a
chamada de IA dele fica para a iteração 2. Também foi corrigido o marcador de truncação do
bundle em `lib/collect.ts`: o trecho recortado agora carrega número de linha real.

**Recall: 3/6 → 4/6.** HITs:

- **#1 `auth0/react-native-auth0`** — `PrivacyInfo.xcprivacy` ausente.
- **#2 `react-native-image-picker`** — os dois eixos numa execução: privacidade
  (`creationDate` / motivo 3B52.1 em `ImagePickerManager.mm`) e permissões (fantasma
  `NSLocationWhenInUseUsageDescription`).
- **#3 `Wootric/WootricSDK-iOS`** — `WTRApiClient.m:529` e `WTRDefaults.m:33`, motivo `CA92.1`.
- **#6 `rnmapbox/maps`** — `RNMBXModule.swift:120`, motivo `CA92.1`.

Casos que ainda não fecham:

- **#5 `cascadiacollections/shoutkit` — PARCIAL.** Acha a classe certa de problema (código com
  required-reason API sem manifest aplicável), mas nomeia `Packages/FeatureFlags` em vez dos
  targets watchOS/tvOS que o ground truth aponta.
- **#4 `firebase/firebase-ios-sdk` — MISS.** Acha 1 gap real de manifesto
  (`FirebaseAppCheck/Sources/Core/FIRAppCheck.m:95`), mais 1 achado de wrapper e 1 de permissão
  de fotos não declarada — nenhum é o `SettingsCacheClient.swift` do PR de referência.

**Custo: 77k → ~20k tokens no total (4x mais barato).** **Tempo:** ~5–9 s por repo, `firebase`
~18 s, ~55 s nos 6. **Precisão:** ainda não medida pelo scorer determinístico — a medir.

`file:line`: no baseline eram alucinados (ex.: `NativeBridge.swift:40`, a partir de um offset
de caractere 5790); na iteração 1 são todos reais.

Novidade do agente de Permissões, que o baseline não fazia:

- **Permissão fantasma** — `NSLocationWhenInUseUsageDescription` com descrição vazia e sem uso
  de API de localização: sinalizada em #1, #2 e #6.
- **Permissão usada mas não declarada** — acesso a fotos sem a chave de uso correspondente: em
  #3 e #4.

Achados fora do ground truth (app de exemplo em auth0/maps; acesso a fotos em Wootric/Firebase)
são plausivelmente reais — incompletude do ground truth, não alucinação. Para o uso real da
ferramenta (auditar o próprio app antes do envio) esse é justamente o tipo de achado que se
quer.

**Decisão: MANTIDO.** Separar as duas leituras subiu o recall (3 → 4/6) e cortou o custo 4x. O
#4 segue como o caso duro: o manifesto existe e está quase certo, mas um arquivo bypassa o
wrapper `GULUserDefaults` — a especialização sozinha não resolve. Precisa de ranqueamento do
que se mostra ao modelo (hoje o agente de Privacidade corta a lista de usos em 40 arquivos por
ordem alfabética) e/ou do contexto do PR. Fica para a iteração 2, junto com a chamada de IA do Orquestrador.

### 2 — Orquestrador
`[preencher]`

### 3 — Guidelines
`[preencher]`

# Changelog

Cada iteração roda contra os mesmos repositórios de `evaluation/test-repos.json`, sempre no
`commitBefore`, com o mesmo ground truth. Números em `evaluation/results.md`.

| # | Iteração | Mudança | Hipótese | Recall | Precisão | Tempo | Custo |
|---|---|---|---|---|---|---|---|
| 0 | Baseline | 1 prompt único: "revise esse código de app mobile e aponte problemas de conformidade" (`gpt-4.1-mini`) | referência | **4/6**¹ | 0.33 (8/12 FP) | 44s (6 repos) | ~US$ 0,03 (77k tokens) |
| 1 | Privacidade + Permissões | separa em dois agentes especializados | recall sobe; pode surgir falso positivo por falta de contexto cruzado | **4/6** | n/d² | ~55s (6 repos) | ~20k tokens |
| 2 | + Orquestrador | dedupe determinístico + 1 chamada de IA para severidade/conflito | precisão sobe | **4/6** | 1.00 (0/11 FP) | ~1 min (6 repos) | ~23k tokens |
| 3 | + Guidelines (busca web) | agente com `web_search` checando as App Store Review Guidelines vigentes | pega mudança recente de política que um prompt estático perderia | `[preencher]` | `[preencher]` | `[preencher]` | `[preencher]` |

## Notas de avaliação

Recall e precisão vêm do scorer determinístico versionado (`scripts/fill-results.ts`), rodado
contra `evaluation/out/baseline.json` + `evaluation/out/solution.json`. Critério de match em
`evaluation/results.md`.

**¹ Correção (2026-08-30).** A linha do Baseline mudou de Recall 3/6 para 4/6. O 3/6 era uma
avaliação manual mais rígida — contava como miss um achado com `file: null` mesmo quando o
`detail` nomeava o arquivo certo (caso do #3 Wootric). O 4/6 vem do scorer determinístico
versionado, pelo critério de match documentado em `evaluation/results.md`: o texto de
`detail`/`evidence` conta para o match de arquivo. Sob esse critério o baseline acerta
#1/#2/#3/#6 e erra #4/#5 — o mesmo conjunto da solução. **O recall, medido assim, é 4/6 no
baseline e 4/6 no pipeline final: não muda.** A melhoria medível está na precisão e no custo.

**² Precisão da iteração 1 não medida:** o JSON daquela execução foi sobrescrito pelo da
iteração 2. O scorer só mede o baseline e o pipeline atual (= iteração 2).

**Sobre a precisão 1.00.** A precisão é medida contra `groundTruth` + `accepted_extra_findings`
(campo em `test-repos.json`). A lista de aceitos foi curada manualmente **depois** de observar
as saídas dos agentes — tem circularidade estrutural: por construção não daria menos que 1.00 a
não ser por decisão do curador. Cada um dos 11 blockers da solução foi verificado
individualmente (aponta arquivo real, descreve problema real). **1.00 aqui significa "nenhum
achado indefensável", não "testado contra achados inéditos".** O baseline foi pontuado contra a
mesma lista, sem vantagem — e mesmo assim deu 0.33, porque 8 dos seus 12 blockers são vagos
(sem arquivo), alucinados (`file` apontando código que não existe assim) ou fora do escopo.

## Experimentos removidos

- `[preencher]` — ex.: fundir Privacidade + Permissões num único prompt / few-shot de exemplos
  problemáticos. Registrar o que foi testado e por que não entrou.

## Notas por iteração

### 0 — Baseline

Modelo `gpt-4.1-mini` (trocado de `gpt-4.1` por limite de TPM da conta). Os 6 repositórios
rodaram (6/6), 77k tokens no total (~US$ 0,03), 44 s. **Recall 4/6** (scorer determinístico):
acerta #1/#2/#3/#6, erra #4/#5. **Precisão 0.33** — 8 dos 12 blockers são falso positivo.

O baseline *acha* os problemas de #1/#2/#3/#6 — mas com ruído, e é isso que o pipeline conserta:

- **#1 `auth0`, #2 `react-native-image-picker`, #6 `rnmapbox/maps` — HIT com imprecisão.**
  Aponta "manifesto de privacidade ausente" e o motivo certo, mas metade das vezes sem citar
  arquivo, com número de linha errado (offset de caractere `5790` no #2; linha 70 em vez de 120
  no #6), e junto de blockers alucinados: no #1 inventou uso de `UserDefaults`/timestamps em
  `ios/NativeBridge.swift` (2 blockers); no #2 afirmou que `NSCamera`/`NSPhotoLibrary` faltavam
  no `Info.plist`, e as chaves estão lá.
- **#3 `Wootric/WootricSDK-iOS` — HIT frágil.** Acertou o diagnóstico inteiro no texto
  (`WTRDefaults.m` usa `NSUserDefaults`, motivo `CA92.1`, sem `.xcprivacy` no repo), mas o campo
  estruturado `file` ficou vazio e só um dos dois arquivos do ground truth foi citado. Conta
  como HIT pelo critério documentado (o texto nomeia o arquivo); a fragilidade está no contrato
  estruturado, não no raciocínio.
- **#4 `firebase/firebase-ios-sdk` — MISS.** O repo já tem vários `PrivacyInfo.xcprivacy` de
  outros módulos. O modelo não distinguiu "existe manifesto em algum lugar" de "este uso de
  `UserDefaults` em `SettingsCacheClient.swift` está coberto", nem viu que a correção real troca
  o `UserDefaults` puro pelo wrapper `GULUserDefaults`.
- **#5 `cascadiacollections/shoutkit` — MISS.** Apontou o manifesto do app iOS principal e não
  percebeu que watchOS e tvOS são bundles separados, cada um precisando do próprio
  `PrivacyInfo.xcprivacy`.

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

**Recall: 4/6 → 4/6 — não muda.** Pelo scorer determinístico o baseline já acertava #1/#2/#3/#6
no texto dos achados. O que a separação em agentes mudou é *como* esses 4 são entregues:

- **#1 `auth0/react-native-auth0`** — `PrivacyInfo.xcprivacy` ausente (mesmo achado, agora sem os
  blockers alucinados que o baseline juntava).
- **#2 `react-native-image-picker`** — os dois eixos numa execução: privacidade
  (`creationDate` / motivo 3B52.1 em `ImagePickerManager.mm:208` — linha real) e permissões
  (fantasma `NSLocationWhenInUseUsageDescription`).
- **#3 `Wootric/WootricSDK-iOS`** — `WTRApiClient.m:529` **e** `WTRDefaults.m:33` (o baseline só
  citou um), motivo `CA92.1`, no campo estruturado.
- **#6 `rnmapbox/maps`** — `RNMBXModule.swift:120` (o baseline errou para 70), motivo `CA92.1`.

Continuam MISS, para todo mundo:

- **#5 `cascadiacollections/shoutkit`.** Acha a classe certa de problema (código com
  required-reason API sem manifest aplicável), mas nomeia `Packages/FeatureFlags` em vez dos
  targets watchOS/tvOS do ground truth — não casa pelo scorer.
- **#4 `firebase/firebase-ios-sdk`.** Acha 1 gap real de manifesto
  (`FirebaseAppCheck/Sources/Core/FIRAppCheck.m:95`) + 1 achado de wrapper + 1 de permissão de
  fotos não declarada — nenhum é o `SettingsCacheClient.swift` do PR de referência.

**Custo: 77k → ~20k tokens no total (~4x mais barato).** **Tempo:** ~5–9 s por repo, `firebase`
~18 s. **Precisão:** não medida nesta iteração (JSON sobrescrito pelo da iteração 2) — o scorer
mede baseline 0.33 e pipeline final 1.00.

`file:line`: no baseline eram alucinados (ex.: `NativeBridge.swift:40`, e um offset de caractere
`5790` reportado como linha); na iteração 1 são todos reais.

Novidade do agente de Permissões, que o baseline não fazia:

- **Permissão fantasma** — `NSLocationWhenInUseUsageDescription` com descrição vazia e sem uso
  de API de localização: sinalizada em #1, #2 e #6.
- **Permissão usada mas não declarada** — acesso a fotos sem a chave de uso correspondente: em
  #3 e #4.

Achados fora do ground truth (app de exemplo em auth0/maps; acesso a fotos em Wootric/Firebase)
são plausivelmente reais — incompletude do ground truth, não alucinação. Para o uso real da
ferramenta (auditar o próprio app antes do envio) esse é justamente o tipo de achado que se
quer.

**Decisão: MANTIDO.** O recall bruto não mudou (4/6 nos dois pelo scorer), mas a separação
trocou achados vagos/alucinados por achados com `file:line` real e cortou o custo ~4x — é o que
a precisão vai medir na iteração 2. O #4 segue como o caso duro: o manifesto existe e está
quase certo, mas um arquivo bypassa o wrapper `GULUserDefaults` — a especialização sozinha não
resolve. Precisa de ranqueamento do que se mostra ao modelo (hoje o agente de Privacidade corta
a lista de usos em 40 arquivos por ordem alfabética) e/ou do contexto do PR. Fica para a
iteração 2, junto com a chamada de IA do Orquestrador.

### 2 — Orquestrador

Modelo ainda `gpt-4.1-mini`. O Orquestrador deixou de ser 100% determinístico. O fluxo agora é:
dedupe determinístico por `id` (sempre) + **1 chamada de IA**. A IA **planeja** — agrupa
achados que são o mesmo problema de raiz, define a severidade do grupo (a mais alta entre os
membros, salvo justificativa registrada) e ordena por prioridade de rejeição. O **código**
aplica o plano. A IA não cria achado nem altera `file`/`line`/`evidence`/`title`. Se a chamada
falhar, cai no merge determinístico. A IA só entra quando há ≥2 achados deduplicados — por isso
o #5 `shoutkit` (1 achado) rodou com `aiApplied=false`.

**Achados totais: 16 → 11 (−31%), sem perder nenhum HIT de ground truth.** Agrupamentos
concretos (registrados em `orchestration.rationale` por repo, na trajetória):

- **#3 `Wootric`:** o blocker `PrivacyInfo.xcprivacy ausente` absorveu os 2 recomendados
  "`UserDefaults` cru em vez do wrapper do projeto" — que tinham framing errado, já que o
  Wootric não tem wrapper. 4 achados → 2.
- **#1, #2, #6:** "descrição vazia" + "declarada mas não usada" da mesma chave
  `NSLocationWhenInUseUsageDescription` viraram 1 achado. O aspecto de permissão não usada fica
  no `detail`, então o achado ainda casa com o ground truth.
- **#4 `firebase`:** o blocker de privacidade absorveu o recomendado de wrapper.

**Recall: inalterado, 4/6** (#1, #2, #3, #6 HIT; #4 e #5 MISS). O Orquestrador não recupera
recall — só enxerga o que os agentes produziram.

**Precisão: 0.33 → 1.00** (scorer determinístico, medido no baseline e neste pipeline). O
baseline tem 8 falso positivo em 12 blockers — 2 inventando uso em `ios/NativeBridge.swift` (#1),
"manifesto ausente" sem citar arquivo (#2, #6), `NSCamera`/`NSPhoto` "ausentes" que na verdade
existem (#2), 3 blockers sobre manifestos de módulos do firebase fora do escopo (#4). O pipeline
tem 0 em 11 — todos os blockers apontam arquivo real e descrevem problema real. **Ler antes o
bloco "Sobre a precisão 1.00" em `## Notas de avaliação`: a lista de aceitos que sustenta esse
1.00 é curada à mão a partir das saídas observadas.**

**Custo: ~20k → ~23k tokens** (o Orquestrador adiciona ~700–900 tok/repo, ~3,9k no total);
ainda ~3,3x mais barato que o baseline (77k). **Tempo:** ~53 s nos 6 repos (soma das durações
dos agentes no `solution.json`; o overhead do Orquestrador não foi cronometrado).

O `solution.json` passou a incluir a resposta crua do Orquestrador por repo (arquivo cresceu
para ~85K).

**Decisão: MANTIDO.** É o "precisão sobe" que a linha da tabela previa: 0.33 → 1.00, corte de
31% em achados redundantes, zero perda de recall, e de quebra o framing errado de "wrapper" no
Wootric foi absorvido. O recall segue 4/6 — #4 e #5 continuam abertos porque dependem do que o
agente de Privacidade mostra ao modelo (corte alfabético em 40 usos), não do Orquestrador. Fica
para a próxima iteração.

### 3 — Guidelines
`[preencher]`

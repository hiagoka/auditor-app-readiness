# Changelog

Cada iteração roda contra os mesmos repositórios de `evaluation/test-repos.json`, sempre no
`commitBefore`, com o mesmo ground truth. Números em `evaluation/results.md`.

| # | Iteração | Mudança | Hipótese | Recall | Precisão | Tempo | Custo |
|---|---|---|---|---|---|---|---|
| 0 | Baseline | 1 prompt único: "revise esse código de app mobile e aponte problemas de conformidade" (`gpt-4.1-mini`) | referência | **5/9** | 0.33 (8/12 FP) | 44s (6 repos) | ~US$ 0,03 (77k tokens) |
| 1 | Privacidade + Permissões | separa em dois agentes especializados | recall sobe; pode surgir falso positivo por falta de contexto cruzado | n/d | n/d | ~55s (6 repos) | ~20k tokens |
| 2 | + Orquestrador | dedupe determinístico + 1 chamada de IA para severidade/conflito | precisão sobe | **6/9** | 1.00 (0/11 FP) | ~1 min (6 repos) | ~23k tokens |
| 3 | + Guidelines (busca web) — **não executado** | agente com `web_search` checando as App Store Review Guidelines vigentes | pega mudança recente de política que um prompt estático perderia | — | — | — | — |

## Notas de avaliação

Recall e precisão vêm do scorer determinístico versionado (`scripts/fill-results.ts`), rodado
contra `evaluation/out/baseline.json` + `evaluation/out/solution.json`. As células Recall e
Precisão das linhas 0 (Baseline) e 2 (pipeline final) são preenchidas pelo script; a linha 1 não
tem JSON próprio e fica `n/d`. Critério de match em `evaluation/results.md`.

**Histórico do número de Recall — mudanças de método, não de desempenho.**

- **3/6 → 4/6 (2026-08-30, por repositório).** O 3/6 era avaliação manual mais rígida — contava
  como miss um achado com `file: null` mesmo quando o `detail` nomeava o arquivo certo (#3
  Wootric). O 4/6 veio do scorer determinístico, contando o texto de `detail`/`evidence` no
  match. Sob esse critério baseline e pipeline empatavam em 4/6.
- **4/6 (empate) → baseline 5/9, pipeline 6/9 (2026-08-30 #2, por caso).** A unidade passou de
  **repositório** para **caso**: um repo pode carregar vários casos independentes (o #2 tem
  três: `creationDate`/3B52.1, fantasma `NSLocation`, e a armadilha do microfone que **não**
  deve ser reportada). São 9 casos. Os números por repositório continuam válidos sob o critério
  anterior — ver `git show 685381a`. Diferente do empate por repo, a contagem por caso **separa
  baseline e pipeline**: o pipeline reporta o fantasma `NSLocation` do #2 (+1 caso) e o baseline
  não; ambos passam na armadilha do microfone (nenhum o reporta como blocker).

**Dois refinamentos de critério foram feitos depois de ver resultados parciais, e ambos
alargaram a diferença a favor do pipeline:** (a) a regra do basename solto (baseline 0.50 →
0.33), (b) a unidade por caso em vez de por repositório (baseline 0.67 → 0.56; solução estável
em 0.67). Cada um está justificado acima, foi verificado à mão, e o critério anterior continua
reproduzível via `git show`. O padrão é real — está registrado aqui de propósito.

**Sobre a precisão 1.00.** A precisão é medida contra `groundTruth` + `accepted_extra_findings`
(campo em `test-repos.json`). A lista de aceitos foi curada manualmente **depois** de observar
as saídas dos agentes — tem circularidade estrutural: por construção não daria menos que 1.00 a
não ser por decisão do curador. Cada um dos 11 blockers da solução foi verificado
individualmente (aponta arquivo real, descreve problema real). **1.00 aqui significa "nenhum
achado indefensável", não "testado contra achados inéditos".** O baseline foi pontuado contra a
mesma lista, sem vantagem — e mesmo assim deu 0.33, porque 8 dos seus 12 blockers são vagos
(sem arquivo), alucinados (`file` apontando código que não existe assim) ou fora do escopo.

## Experimentos removidos

- **Coletor de contexto por varredura de extensão → varredura por símbolos de required-reason
  API.** A primeira versão dos agentes montava o contexto pegando arquivos por extensão e
  ranqueando por densidade de "sinais", com um teto de ~40 arquivos. No monorepo do
  `firebase-ios-sdk` isso falhava em silêncio: o corte alfabético dos 40 nunca chegava em
  `FirebaseSessions/Sources/Settings/SettingsCacheClient.swift`, o alvo do caso #4. Substituído
  por `lib/scan.ts` — varredura linha a linha por símbolos concretos (`UserDefaults`,
  `.creationDate`, `NSPrivacyAccessedAPICategory*`, chaves `NS*UsageDescription`), numa passada
  só, com o manifesto ancestral resolvido por caminho. Introduzido na iteração 1 (`7077e35`).
  Não fechou o #4 (é caso duro), mas parou de perder o alvo por corte de orçamento.

- **Scoring por repositório → por caso.** O primeiro scorer determinístico media recall por
  repositório (HIT se qualquer achado do repo casava). Deu empate 4/6 entre baseline e pipeline
  — o que escondia a diferença real: o baseline *acha* os problemas no texto, mas de forma vaga,
  e um repo pode carregar problemas independentes (o #2 tem três). Substituído por scoring por
  **caso** (9 casos), que separa baseline 5/9 de pipeline 6/9. `git show 685381a` (por repo) e
  `3def319` (por caso) — o critério anterior continua reproduzível.

- **Injeção sintética de um 10º caso — considerada e descartada.** O brief sugere "dez ou mais
  casos". Um 10º caso por patch sintético num dos repos não seria pontuável contra os
  `baseline.json`/`solution.json` já commitados: os agentes rodaram *antes* do patch, então
  nenhum achado existente reflete a condição injetada → MISS/MISS mecânico. A alternativa —
  re-executar a avaliação — mexeria no harness a poucas horas do prazo, com risco de invalidar
  números já medidos e commitados. Ficou em 9 casos verificados; "boa meta" não é requisito.

## Notas por iteração

### 0 — Baseline

Modelo `gpt-4.1-mini` (trocado de `gpt-4.1` por limite de TPM da conta). Os 6 repositórios
rodaram (6/6), 77k tokens no total (~US$ 0,03), 44 s. **Recall 5/9** por caso (scorer
determinístico; era 4/6 por repositório). Acerta: #1, o `creationDate` do #2, o #3, o #6, e a
armadilha do microfone do #2 (não reporta, como deve). Erra: o fantasma `NSLocation` do #2, o
wrapper `GULUserDefaults` do #4 e os dois manifestos watchOS/tvOS do #5. **Precisão 0.33** — 8
dos 12 blockers são falso positivo.

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

Cobertura de avaliação para permissão fantasma: até 2026-08-29 os 6 repositórios de `evaluation/test-repos.json` tinham ground truth só de privacidade — nenhum caso de permissão fantasma, ou seja, o agente de Permissões entrava na iteração 1 sem nenhum caso que o exercitasse. Isso mudou hoje: o repo #2 (`react-native-image-picker`), no mesmo `commitBefore` (1257423) que já estava no dataset e sem nenhuma injeção sintética, ganhou cobertura real de permissão fantasma — `NSLocationWhenInUseUsageDescription` declarada com `<string></string>` vazia em `example/ios/example/Info.plist`, e grep de `CLLocation`/`CoreLocation`/`Geolocation`/`requestWhenInUse`/`locationManager`/`navigator.geolocation` em `example/ios`, `example/src`, `src` e `ios` sem nenhum uso (lib de foto/câmera não acessa localização). Com isso o #2 passa a exercitar os dois agentes numa única execução: Privacidade em `ios/ImagePickerManager.mm` (`phAsset.creationDate`, motivo 3B52.1) e Permissões no `Info.plist` (`NSLocationWhenInUseUsageDescription`). O ground truth do #2 também registra um near-miss deliberado: `NSMicrophoneUsageDescription`, com uso indireto plausível (o app grava vídeo, e a captura de vídeo via `UIImagePickerController` grava áudio sem o app chamar `AVAudioSession` direto), que por isso NÃO é marcada como fantasma — caso-armadilha para grep ingênuo.

### 1 — Privacidade + Permissões

Modelo ainda `gpt-4.1-mini`. O prompt único do baseline foi separado em dois agentes
especializados — **Privacidade** e **Permissões**. Cada agente faz a própria varredura e envia
ao pipeline um digest estruturado (tabela de manifests e usos), não o dump dos arquivos. O
Orquestrador continua 100% determinístico nesta iteração (dedupe + ordenação por severidade); a
chamada de IA dele fica para a iteração 2. Também foi corrigido o marcador de truncação do
bundle em `lib/collect.ts`: o trecho recortado agora carrega número de linha real.

**Recall por caso: baseline 5/9, pipeline final 6/9.** Por *repositório* dava empate (4/6) — o
baseline já acerta no texto os problemas de #1/#2/#3/#6. Por *caso* aparece a diferença: o
pipeline reporta o fantasma `NSLocation` do #2 e o baseline não. O que a separação em agentes
mudou, além desse +1 caso, é *como* os acertos comuns são entregues:

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

**Decisão: MANTIDO.** Por caso o recall sobe +1 (baseline 5/9 → pipeline 6/9, o fantasma
`NSLocation` do #2); e a separação trocou achados vagos/alucinados por achados com `file:line`
real e cortou o custo ~4x — é o que a precisão vai medir na iteração 2. O #4 segue como o caso duro: o manifesto existe e está
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

**Recall por caso: baseline 5/9, pipeline final 6/9.** O +1 caso (fantasma `NSLocation` do #2) é
mérito do agente de Permissões, não do Orquestrador — que só reorganiza o que os agentes
produziram, sem recuperar recall. Casos ainda em aberto: `firebase-gul-wrapper` (#4) e os dois
manifestos watchOS/tvOS do #5.

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
31% em achados redundantes, sem perder nenhum caso, e de quebra o framing errado de "wrapper" no
Wootric foi absorvido. O #4 e os dois casos do #5 continuam abertos porque dependem do que o
agente de Privacidade mostra ao modelo (corte alfabético em 40 usos), não do Orquestrador. Fica
para a próxima iteração.

### 3 — Guidelines (não executado)

Planejado: um 4º agente que, na chamada, liga a tool de busca web da Responses API e confere a
versão vigente das App Store Review Guidelines antes de decidir. Seria o único agente a
demonstrar uma ferramenta em tempo real.

**Não foi executado, por decisão com o tempo restante conhecido.** Priorizado abaixo do scorer
determinístico e do relatório HTML porque **não moveria o recall nos 9 casos do dataset** — os
casos são todos privacidade/permissões (manifesto ausente, required-reason API, permissão
fantasma), nenhum depende de uma mudança recente de guideline. O Guidelines seria demonstração
de *capacidade* (usar busca web num agente), não de *resultado* mensurável nesta avaliação. Com
poucas horas até o prazo, o tempo rendeu mais no scorer (que fecha o entregável de melhoria
mensurada) e no HTML (20 pts declarados de qualidade ponta a ponta).

O esqueleto (`agents/guidelines-agent.ts`) fica no repo como registro da arquitetura prevista.

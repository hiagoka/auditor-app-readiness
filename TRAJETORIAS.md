# Trajetórias dos agentes

Entregável 4. Duas partes:

1. **Uma execução real, ponta a ponta** (seção 1) — gerada de `evaluation/out/solution.json` por
   `npm run gen-trajectories`, dentro da região `<!-- GEN:TRAJ -->`. Só dado que está no JSON ou
   no código; nada reconstruído.
2. **Checkpoints humanos** (seção 2) — narrativa escrita à mão, fora da região gerada. Regenerar
   a seção 1 não apaga a seção 2 (mesmo padrão de `evaluation/results.md`).

Run escolhido: **`react-native-image-picker` (#2)** — é o único do dataset que exercita os dois
agentes numa execução só, então mostra a orquestração de verdade (dois achados de origens
diferentes, um deles agrupado).

---

## 1. Execução ponta a ponta — react-native-image-picker (#2)

<!-- GEN:TRAJ:START -->
_Gerado de `evaluation/out/solution.json` (run #2, `2-react-native-image-picker`) por `npm run gen-trajectories`. Não editar à mão — a narrativa fica fora desta região._

Repositório: `react-native-image-picker/react-native-image-picker` · sumário final: 2 blocker / 0 recomendado / 0 opcional

---

### Agente de Privacidade

**Instrução** — `agents/privacy-agent.ts`, constante `SYSTEM` (íntegra):

```text
Você é o Agente de Privacidade de um auditor de prontidão para publicação na App Store (iOS).
Pergunta central: cada uso de "required reason API" está DECLARADO num PrivacyInfo.xcprivacy que
se aplica ao mesmo target/módulo? E o app/SDK tem manifesto quando é obrigatório?

Você recebe dados já apurados por scanner (não invente nada além deles):
1. os manifests .xcprivacy publicados do repo (ignora example/demo/test) e o que cada um declara;
2. usos de required-reason API em código publicado, com file:line, contagem, o manifest ancestral
   e se ele já declara a categoria ("coberto"). Se "manifest ancestral: nenhum", não há manifesto
   que se aplique àquele arquivo;
3. "candidatos a wrapper": arquivos que usam UserDefaults/NSUserDefaults cru enquanto o repo tem
   um wrapper próprio (ex.: GULUserDefaults);
4. um flag dizendo se o repo NÃO tem NENHUM .xcprivacy publicado, e se ele distribui biblioteca.

Regras de decisão:
- "coberto: não" ou "manifest ancestral: nenhum" => "blocker": categoria não declarada num
  manifesto aplicável. Cite o file:line real.
- Repo sem NENHUM .xcprivacy publicado, distribuindo biblioteca ou com uso de required-reason API
  => UM "blocker" único: "PrivacyInfo.xcprivacy ausente" (obrigatório desde iOS 17). Não repita
  isso por arquivo. Mas o campo "evidence" DESSE achado tem que ENUMERAR cada required-reason API
  detectada com um file:line de exemplo (ex.: "creationDate em ios/ImagePickerManager.mm:208 ->
  NSPrivacyAccessedAPICategoryFileTimestamp (3B52.1); NSUserDefaults em .../Foo.m:12 -> ...
  UserDefaults (CA92.1)"), e "reference" deve listar todos os códigos de motivo aplicáveis.
- Candidato a wrapper => "recomendado": trocar UserDefaults cru pelo wrapper do projeto, que já
  carrega o motivo declarado. (Isso vale mesmo que o módulo tenha manifesto.)
- Item "coberto: sim" e não-wrapper => NÃO é achado.
- Não relate arquivo de teste nem arquivo fora dos dados.
- Agrupamento: 1 achado por MÓDULO/TARGET distinto sem cobertura (ex.: cada app de um monorepo,
  cada target watchOS/tvOS, cada Swift package). Não colapse targets diferentes num só achado, e
  não gere um achado por arquivo dentro do mesmo target — cite um arquivo:linha de exemplo e
  mencione os demais em "detail".

Responda SOMENTE JSON:
{"findings":[{"severity":"blocker|recomendado|opcional","title":"...","detail":"...","file":"...","line":<n|null>,"evidence":"...","suggestion":"...","reference":"<código de motivo, ex CA92.1, ou null>"}]}
Nada a relatar => {"findings":[]}.
```

**Ferramentas / o que varreu** (`inspected`, 2 arquivo(s)):

- `ios/ImagePickerManager.mm`
- `ios/ImagePickerUtils.mm`

**Digest enviado ao modelo** (a *user message*) — **reconstruído deterministicamente** pelo mesmo código de coleta (`buildPrivacyDigest` em `agents/privacy-agent.ts`, só `lib/scan.ts`, sem IA), **não capturado na execução original**. O `inspected` reconstruído bate com o do `solution.json` — a coleta é idêntica à da execução.

```text
Projeto: /Users/hiagokalil/desafio-hackathon/test-repos/2-react-native-image-picker
Repo sem NENHUM .xcprivacy publicado: SIM
Distribui biblioteca (tem .podspec): sim
Wrappers *UserDefaults do projeto: [nenhum]

Manifests de privacidade publicados (0):
  NENHUM .xcprivacy publicado no repositório.

Usos de required-reason API SEM cobertura (2); 0 outros usos já cobertos:
  [NSPrivacyAccessedAPICategoryFileTimestamp / 3B52.1/DDA9.1/C617.1] ios/ImagePickerManager.mm:208 (2x) — manifest ancestral: nenhum — coberto: não
     ex.: asset[@"timestamp"] = [self getDateTimeInUTC:phAsset.creationDate];
  [NSPrivacyAccessedAPICategoryFileTimestamp / 3B52.1/DDA9.1/C617.1] ios/ImagePickerUtils.mm:125 (1x) — manifest ancestral: nenhum — coberto: não
     ex.: NSDictionary *fileAttributes = [[NSFileManager defaultManager] attributesOfItemAtPath:[url path] error:&attributesError];

Candidatos a troca por wrapper (UserDefaults cru, wrapper existe no repo):
  (nenhum)
```

**Resposta crua do modelo** (`rawModelResponse.choices[0].message.content`):

```json
{
  "findings": [
    {
      "severity": "blocker",
      "title": "PrivacyInfo.xcprivacy ausente",
      "detail": "O repositório não possui nenhum arquivo PrivacyInfo.xcprivacy publicado e utiliza APIs que requerem declaração de motivo (required-reason API) em código que distribui biblioteca. Exemplos de usos detectados: ios/ImagePickerManager.mm:208 (2 ocorrências) e ios/ImagePickerUtils.mm:125 (1 ocorrência).",
      "file": "ios/ImagePickerManager.mm",
      "line": 208,
      "evidence": "creationDate em ios/ImagePickerManager.mm:208 -> NSPrivacyAccessedAPICategoryFileTimestamp (3B52.1); attributesOfItemAtPath em ios/ImagePickerUtils.mm:125 -> NSPrivacyAccessedAPICategoryFileTimestamp (3B52.1)",
      "suggestion": "Publicar um arquivo PrivacyInfo.xcprivacy adequado para o target/módulo que declare todas as categorias de motivo necessárias para as APIs usadas, conforme exigido a partir do iOS 17.",
      "reference": "3B52.1"
    }
  ]
}
```

**Findings estruturados** (1) · **1169 tokens** · **3255 ms**:

- **[blocker]** PrivacyInfo.xcprivacy ausente `ios/ImagePickerManager.mm:208` · 3B52.1

---

### Agente de Permissões

**Instrução** — `agents/permissions-agent.ts`, constante `SYSTEM` (íntegra):

```text
Você é o Agente de Permissões de um auditor de prontidão para publicação na App Store (iOS).
Pergunta central: cada permissão declarada (chave NS*UsageDescription no Info.plist) é realmente
usada pelo app?

Você recebe dados já apurados por scanner (não invente nada além deles):
1. cada permissão declarada, com valor da string, arquivo e linha;
2. por família de permissão: se está declarada, quantas ocorrências de uso o scanner achou no
   código, exemplos file:line, e (quando existir) uma nota sobre uso indireto plausível.

Regras de decisão:
- Declarada, 0 ocorrências de uso e SEM "NOTA (uso indireto)" nos dados => "permissão fantasma"
  => "blocker": recomendar remoção da chave. NÃO invente uso indireto: só considere uso indireto
  quando os dados trazem explicitamente uma "NOTA (uso indireto)" para aquela família.
- Declarada com string de descrição VAZIA => "blocker" separado: a Apple rejeita descrição vazia
  (mesmo que a permissão seja legítima). Este achado é independente do de permissão fantasma.
- USADA (>=1 ocorrência) mas "declarada: não" => "blocker": falta a chave NS*UsageDescription no
  Info.plist para uma capability efetivamente usada — o app quebra em runtime ao acessar a API.
  Use como `file`/`line` o do primeiro exemplo de uso listado.
- 0 ocorrências diretas MAS existe "NOTA (uso indireto)" para a família => NÃO é fantasma; no
  máximo "recomendado": confirmar que a permissão é necessária e ajustar a descrição.
- Uso real e direto (>=1 ocorrência) e já declarada => não relatar.
- Para os casos de fantasma/descrição vazia, cite o file:line da declaração no Info.plist.

Responda SOMENTE JSON:
{"findings":[{"severity":"blocker|recomendado|opcional","title":"...","detail":"...","file":"...","line":<n|null>,"evidence":"...","suggestion":"...","reference":"<ex: Guideline 5.1.1, ou null>"}]}
Nada a relatar => {"findings":[]}.
```

**Ferramentas / o que varreu** (`inspected`, 13 arquivo(s)):

- `example/ios/example/Info.plist`
- `example/ios/exampleTests/Info.plist`
- `android/src/main/java/com/imagepicker/ImagePickerModuleImpl.java`
- `android/src/newarch/java/com/imagepicker/ImagePickerModule.java`
- `android/src/oldarch/java/com/imagepicker/ImagePickerModule.java`
- `example/src/App.tsx`
- `ios/ImagePickerManager.mm`
- `ios/ImagePickerUtils.mm`
- `src/index.ts`
- `src/platforms/NativeImagePicker.ts`
- `src/platforms/NativeImagePicker.web.ts`
- `src/platforms/native.ts`
- `ios/ImagePickerUtils.h`

**Digest enviado ao modelo** (a *user message*) — **reconstruído deterministicamente** pelo mesmo código de coleta (`buildPermissionsDigest` em `agents/permissions-agent.ts`, só `lib/scan.ts`, sem IA), **não capturado na execução original**. O `inspected` reconstruído bate com o do `solution.json` — a coleta é idêntica à da execução.

```text
Projeto: /Users/hiagokalil/desafio-hackathon/test-repos/2-react-native-image-picker
Info.plist analisados: example/ios/example/Info.plist, example/ios/exampleTests/Info.plist

Permissões declaradas (4):
  NSCameraUsageDescription = "$(PRODUCT_NAME) would like to use your camera"  (example/ios/example/Info.plist:35)
  NSLocationWhenInUseUsageDescription = ""  [DESCRIÇÃO VAZIA]  (example/ios/example/Info.plist:37)
  NSMicrophoneUsageDescription = "$(PRODUCT_NAME) would like to your microphone (for videos)"  (example/ios/example/Info.plist:39)
  NSPhotoLibraryUsageDescription = "$(PRODUCT_NAME) would like access to your photo gallery"  (example/ios/example/Info.plist:41)

Uso por família de permissão:
  localização — declarada: sim — ocorrências de uso: 0
  câmera — declarada: sim — ocorrências de uso: 15
       android/src/main/java/com/imagepicker/ImagePickerModuleImpl.java:54 (1x) public void launchCamera(final ReadableMap options, final Callback callback) {
       android/src/newarch/java/com/imagepicker/ImagePickerModule.java:25 (2x) public void launchCamera(final ReadableMap options, final Callback callback) {
       android/src/oldarch/java/com/imagepicker/ImagePickerModule.java:30 (2x) public void launchCamera(final ReadableMap options, final Callback callback) {
       example/src/App.tsx:22 (1x) ImagePicker.launchCamera(options, setResponse);
  microfone — declarada: sim — ocorrências de uso: 0

     NOTA (uso indireto): Gravação de vídeo (UIImagePickerController / AVCaptureSession com mídia de vídeo) captura áudio sem chamar AVAudioSession diretamente — pode ser uso indireto legítimo.
  fotos — declarada: sim — ocorrências de uso: 41
       android/src/main/java/com/imagepicker/ImagePickerModuleImpl.java:115 (1x) public void launchImageLibrary(final ReadableMap options, final Callback callback) {
       android/src/newarch/java/com/imagepicker/ImagePickerModule.java:30 (2x) public void launchImageLibrary(final ReadableMap options, final Callback callback) {
       android/src/oldarch/java/com/imagepicker/ImagePickerModule.java:35 (2x) public void launchImageLibrary(final ReadableMap options, final Callback callback) {
       example/src/App.tsx:24 (1x) ImagePicker.launchImageLibrary(options, setResponse);
```

**Resposta crua do modelo** (`rawModelResponse.choices[0].message.content`):

```json
{
  "findings": [
    {
      "severity": "blocker",
      "title": "Permissão NSLocationWhenInUseUsageDescription com descrição vazia",
      "detail": "A permissão NSLocationWhenInUseUsageDescription está declarada no Info.plist com string de descrição vazia, o que causa rejeição pela Apple.",
      "file": "example/ios/example/Info.plist",
      "line": 37,
      "evidence": "NSLocationWhenInUseUsageDescription = \"\"  (example/ios/example/Info.plist:37)",
      "suggestion": "Preencher a string de descrição com uma justificativa clara e adequada para o uso da localização, ou remover a chave se não for necessária.",
      "reference": "Guideline 5.1.1"
    },
    {
      "severity": "blocker",
      "title": "Permissão fantasma: NSLocationWhenInUseUsageDescription declarada mas não usada",
      "detail": "A permissão NSLocationWhenInUseUsageDescription está declarada no Info.plist, porém não há ocorrências de uso direto no código e não há nota de uso indireto para esta permissão, caracterizando permissão fantasma.",
      "file": "example/ios/example/Info.plist",
      "line": 37,
      "evidence": "NSLocationWhenInUseUsageDescription = \"\"  (example/ios/example/Info.plist:37)",
      "suggestion": "Remover a chave NSLocationWhenInUseUsageDescription do Info.plist para evitar rejeição por permissão fantasma.",
      "reference": null
    }
  ]
}
```

**Findings estruturados** (2) · **1359 tokens** · **3655 ms**:

- **[blocker]** Permissão NSLocationWhenInUseUsageDescription com descrição vazia `example/ios/example/Info.plist:37` · Guideline 5.1.1
- **[blocker]** Permissão fantasma: NSLocationWhenInUseUsageDescription declarada mas não usada `example/ios/example/Info.plist:37`

---

### Orquestrador

**Instrução** — `agents/orchestrator.ts`, constante `SYSTEM` (íntegra):

```text
Você é o Orquestrador de um auditor de prontidão para publicação na App Store (iOS).
Recebe os achados JÁ deduplicados dos agentes (Privacidade, Permissões), cada um com um id curto
(F1, F2, ...).

Você NÃO cria achados novos, NÃO altera file/line/evidence/title. Só pode:
(a) AGRUPAR achados que são o mesmo problema de raiz — ex.: "PrivacyInfo.xcprivacy ausente" +
    "usar o wrapper X" apontando o mesmo arquivo; "descrição vazia" + "permissão não usada" para
    a mesma chave NS*UsageDescription. Escolha um como principal ("keep") e liste os outros em
    "absorbs".
(b) Definir a severidade final do grupo: a MAIS ALTA entre os membros, a menos que haja motivo
    claro para baixar (explique no rationale).
(c) ORDENAR por prioridade de rejeição: blockers primeiro; entre blockers, manifesto ausente e
    required-reason API não declarada antes de detalhes de string de permissão.

Todo Fn tem que aparecer em exatamente um "keep" ou um "absorbs". Achados independentes viram um
grupo só deles (keep sem absorbs).

Responda SOMENTE JSON:
{"groups":[{"keep":"F1","absorbs":["F2"],"severity":"blocker","rationale":"F2 é a mesma causa de F1"}],"order":["F1","F3"]}
"order" lista só os "keep", na ordem final.
```

**Entrada** — 3 achados deduplicados dos agentes (rótulos F1, F2, …):

- **F1** **[blocker]** PrivacyInfo.xcprivacy ausente `ios/ImagePickerManager.mm:208` · 3B52.1
- **F2** **[blocker]** Permissão NSLocationWhenInUseUsageDescription com descrição vazia `example/ios/example/Info.plist:37` · Guideline 5.1.1
- **F3** **[blocker]** Permissão fantasma: NSLocationWhenInUseUsageDescription declarada mas não usada `example/ios/example/Info.plist:37`

**Plano da IA** (`orchestration.rawModelResponse.choices[0].message.content`):

```json
{
  "groups": [
    {
      "keep": "F1",
      "absorbs": [],
      "severity": "blocker",
      "rationale": "Achado independente e bloqueador por ausência de PrivacyInfo.xcprivacy."
    },
    {
      "keep": "F2",
      "absorbs": [
        "F3"
      ],
      "severity": "blocker",
      "rationale": "F3 é consequência da permissão declarada em F2, que tem descrição vazia e causa rejeição."
    }
  ],
  "order": [
    "F1",
    "F2"
  ]
}
```

**Decisões aplicadas** (`orchestration.rationale`, `aiApplied: true`, 727 tokens):

- F2 agrupa [F3]: F3 é consequência da permissão declarada em F2, que tem descrição vazia e causa rejeição.

**Achados finais** (2):

- **[blocker]** PrivacyInfo.xcprivacy ausente `ios/ImagePickerManager.mm:208` · 3B52.1
- **[blocker]** Permissão NSLocationWhenInUseUsageDescription com descrição vazia `example/ios/example/Info.plist:37` · Guideline 5.1.1

**Custo total do run** (agentes + orquestrador): 3255 tokens · 6910 ms de agentes (o orquestrador não é cronometrado no JSON).
<!-- GEN:TRAJ:END -->

---

## 2. Checkpoints humanos

O processo teve correção **nas duas direções**. Não é "o humano consertou a IA" — é revisão
mútua, e é isso que mostra um fluxo real. Cada item abaixo é rastreável a um commit ou a um
campo do `test-repos.json`.

### 2.1 A revisão humana pegou erro da máquina

- **Número obsoleto no firebase.** O rascunho do CHANGELOG (via o agente Documentador) descrevia
  o #4 como "acha 2 gaps reais de manifesto". A revisão conferiu contra o `solution.json` atual —
  que tem **1** blocker de privacidade para o #4 (`FirebaseAppCheck/Sources/Core/FIRAppCheck.m:95`)
  mais 1 achado de wrapper e 1 de permissão de fotos — e corrigiu para "1 gap". A string
  "2 gaps reais" **nunca foi commitada** (`git log -S "2 gaps reais" -- CHANGELOG.md` não retorna
  nada); a versão corrigida entrou no commit `7077e35`.
- **Framing alucinado no Wootric.** O agente de Privacidade (iteração 1) emitiu, para o Wootric,
  dois achados `recomendado` do tipo "trocar `UserDefaults` cru pelo wrapper do projeto". O
  Wootric **não tem wrapper**, e `[NSUserDefaults standardUserDefaults]` é o método padrão da
  Apple — não existe "wrapper próprio" a usar. O blocker correto (`PrivacyInfo.xcprivacy`
  ausente, motivo `CA92.1`, citando os dois `WTR*.m`) ficou intacto, mas os dois `recomendado`
  eram recomendação enganosa. Mitigado na iteração 2: o Orquestrador absorveu os dois no blocker
  (`orchestration.rationale` do #3). **Causa raiz não corrigida** — está no prompt do agente de
  Privacidade, que oferece a troca por wrapper sempre que vê um identificador `*UserDefaults`
  distinto no repo. Registrado em `CHANGELOG.md`, seção "### 2 — Orquestrador".
- **Dois falsos positivos que a curadoria tinha aceitado (2026-08-31).** A lista
  `accepted_extra_findings` — curada à mão a partir das saídas dos agentes — sustentava um placar
  de precisão 1.00. Uma segunda passada, item a item contra o código dos repos clonados, achou
  dois blockers do pipeline que não se sustentavam: `WTRSurveyViewController.m` (o
  `UIActivityTypeSaveToCameraRoll` está **dentro de `excludedActivityTypes`** — o app remove a
  opção, não acessa fotos) e `example/ios/RNMapboxExample/Info.plist` (chave `NSLocation*`
  marcada como fantasma sem conferir `example/src/examples/UserLocation/`, que usa
  `followUserLocation`; descrições preenchidas). Mesma causa raiz nos dois: o agente casa o
  símbolo e ignora o contexto sintático. Reclassificados como FP → precisão da solução **1.00 →
  0.82**. A primeira curadoria tinha conferido três entradas da lista e parado antes de terminar.
  Rastro: `CHANGELOG.md` → "Sobre a precisão 0.82" e "## Experimentos removidos", 4º item.

### 2.2 A máquina pegou erro do humano

- **Ground truth do #2 escrito errado pelo revisor.** A primeira versão do `test-repos.json`
  dizia `ImagePickerManager.m` (extensão `.m`), com uso de `FileManager .creationDate` nas linhas
  ~198/263. A validação automática do dataset contra o source pinado no `commitBefore`
  (`1257423`) mostrou que o real é: arquivo **`.mm`**, `phAsset.creationDate` do framework
  **Photos** (não `FileManager`), linhas **208 e 311**. Corrigido sem intervenção. Rastro: campo
  `validated` do #2 em `evaluation/test-repos.json` ("arquivo é ImagePickerManager.mm (não .m),
  phAsset.creationDate nas linhas 208 e 311").

### 2.3 O scorer corrigiu o julgamento manual

- O recall inicial do baseline, **3/6**, era avaliação manual do revisor, mais rígida — contava
  como *miss* um achado com `file: null` mesmo quando o `detail` nomeava o arquivo certo (caso do
  #3 Wootric). O scorer determinístico, pelo critério **escrito** em `evaluation/results.md`
  (texto de `detail`/`evidence` conta para o match), deu **4/6**. O humano estava mais rígido que
  o próprio critério que tinha definido; o script aplicou o critério como escrito. Rastro:
  `git show 685381a` e a nota datada em `CHANGELOG.md` → "## Notas de avaliação".

### 2.4 Bugs pegos rodando

- **`nao-reportar` casando por arquivo.** A regra do caso-armadilha do microfone (`#2`,
  `image-picker-microphone-not-phantom`) checava se algum blocker "apontava o alvo" — e o alvo
  incluía o arquivo `example/ios/example/Info.plist`, que é o **mesmo** arquivo do caso da
  permissão fantasma `NSLocation`. Um blocker legítimo sobre o `NSLocation` fazia o trap dar
  *miss* mecanicamente. Corrigido: para caso `nao-reportar` **por chave**, o scorer olha só a
  chave, não o arquivo. Rastro: comentário em `caseHit`, `scripts/fill-results.ts`, commit
  `3def319`. (Ressalva de 2026-08-31: com o agente de Permissões comprovadamente super-reportando
  fantasma no #6 do maps, a passagem dele nessa armadilha pesa menos como prova de discriminação
  — ver a ressalva em `evaluation/results.md`.)
- **Basename solto escapando do check de FP.** Um blocker do baseline com `file` **alucinado**
  (ex.: "usa `UserDefaults` em `ios/NativeBridge.swift`" no auth0 — o auth0 não usa) escapava do
  cálculo de precisão só por mencionar "PrivacyInfo.xcprivacy" em prosa. Corrigido: match de
  basename solto só vale quando o achado **não** tem campo `file`. Efeito: precisão do baseline
  caiu de 0.50 para 0.33 (mais honesta). Rastro: comentário em `fileMatchesAny`,
  `scripts/fill-results.ts`, commit `685381a`.

### 2.5 O agente coordenador recusou uma tarefa contraditória

- O revisor pediu, na mesma janela: (a) adicionar um 10º caso por injeção sintética num repo;
  (b) o scorer avaliar esse caso contra os `baseline.json`/`solution.json` **já existentes**, sem
  re-executar os agentes. Os dois são incompatíveis: os agentes rodaram *antes* do patch, então
  nenhum achado existente pode refletir a condição injetada → o caso seria `MISS/MISS` mecânico,
  medindo nada. O agente **devolveu a contradição em vez de produzir o número sem sentido**. A
  decisão foi ficar em 9 casos. Rastro: `CHANGELOG.md` → "## Experimentos removidos", 3º item.
- **Sequência (2026-08-31):** tentou-se um 10º caso *real* promovendo um `accepted_extra_findings`
  do Wootric. A conferência do código mostrou que o achado era **falso positivo** (símbolo dentro
  de `excludedActivityTypes`); o 10º caso foi revertido e o FP — mais um segundo, no app de
  exemplo do maps — saiu da lista de aceitos. Precisão da solução: 1.00 → 0.82. Rastro:
  `CHANGELOG.md` → "## Experimentos removidos", 4º item, e "Sobre a precisão 0.82".

### 2.6 O checkpoint estrutural

Toda mudança de documentação passou pelo mesmo loop: um agente **Documentador** rascunha só com
fatos rastreáveis (Regra 9 do hackathon), **revisão humana** antes de qualquer commit, e um
agente de **Git** que confere `.gitignore`, varre os arquivos staged por chave de API vazada
(`sk-proj-`, `sk-ant-`, `OPENAI_API_KEY=…`) e faz um commit único. Duas chaves de API vazaram em
conversa no início do projeto; nenhuma entrou no repositório.

---

## Como este documento é gerado

`npm run gen-trajectories` reescreve **apenas** o miolo de `<!-- GEN:TRAJ:START -->` …
`<!-- GEN:TRAJ:END -->` a partir de `evaluation/out/solution.json` (run #2) e dos prompts `SYSTEM`
em `agents/*.ts`. A seção 2 e este texto são manuais e não são tocados. Idempotente: rodar de
novo não muda nada se os JSONs não mudaram.

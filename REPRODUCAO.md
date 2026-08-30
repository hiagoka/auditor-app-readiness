# Guia de reprodução

## Pré-requisitos

- Node.js >= 20
- `git`
- Uma `OPENAI_API_KEY`. O modelo padrão (em `lib/openai.ts` e no `.env.example`) é
  **`gpt-4.1-mini`** — o mesmo das execuções que geraram `evaluation/results.md`. Foi escolhido
  por limite de TPM da conta; a arquitetura não depende dele.

## 1. Instalar

```bash
npm install
cp .env.example .env
# edite .env e preencha OPENAI_API_KEY
```

## 2. Clonar os repositórios de teste

```bash
npm run clone-repos
```

Lê `evaluation/test-repos.json`, clona os 6 repositórios em `test-repos/<id>-<nome>/` e faz
checkout do `commitBefore` de cada um — o estado em que o problema ainda existe. Usa
`git clone --filter=blob:none` para não baixar todo o histórico de blobs.

## 3. Rodar o baseline

```bash
npm run baseline
```

Roda o prompt único contra cada repo de teste e grava `evaluation/out/baseline.json`.

## 4. Rodar a solução (pipeline de agentes)

```bash
npm run eval
```

Roda o pipeline completo contra cada repo e grava `evaluation/out/solution.json`.
Para auditar um app avulso fora do dataset:

```bash
npm run audit -- --repo ./caminho/do/app --guidelines
```

## 5. Comparar

```bash
npm run fill-results
```

Script determinístico (sem IA): lê `baseline.json` + `solution.json`, calcula recall / precisão /
tempo / custo contra o ground truth (`test-repos.json`) e preenche as células por posição em
`evaluation/results.md` e a coluna Precisão da tabela de iterações do `CHANGELOG.md`. Critério de
match documentado em `evaluation/results.md`. Idempotente: rodar de novo não muda nada.

## Nota sobre reprodutibilidade

Os números documentados vêm de **uma execução específica** (os JSONs em `evaluation/out/`).
`temperature: 0` reduz mas **não elimina** a variação entre execuções — inclusive em qual campo
o modelo coloca a informação: o achado "manifesto ausente" do repo #2 saiu com
`file: "ios/ImagePickerManager.mm"` na rodada de avaliação e com `file: null` (caminho só no
`evidence`) num run posterior do CLI, mesmo repo e mesmo modelo. Rodar de novo deve dar recall e
precisão iguais ou muito próximos, mas os achados individuais podem variar na forma. É a mesma
limitação registrada na nota "Sobre a precisão 1.00" do `CHANGELOG.md`.

## Dataset

Tabela **derivada de `evaluation/test-repos.json`** (fonte da verdade). Ao mexer no dataset,
atualizar aqui junto — os fatos (arquivo, linha, motivo, categoria) têm que bater com o
`groundTruth` correspondente. (TODO: gerar esta tabela do JSON em vez de manter à mão.)

A avaliação é pontuada por **caso**, não por repositório: são **9 casos** distribuídos nos 6
repos (o #2 tem três, o #5 tem dois). Cada caso tem `expectativa: reportar` ou `nao-reportar`.
`noUpstreamFix` (só o #6) = não existe commit de correção aceito upstream — a ferramenta **deve
reportar** mesmo assim; não confundir com a armadilha `nao-reportar` do #2 (microfone), onde
reportar é o erro.

| # | Repositório | Dificuldade | `noUpstreamFix` | Casos | Problema (ground truth) |
|---|---|---|---|---|---|
| 1 | `auth0/react-native-auth0` | baixa | não | 1 | `ios/PrivacyInfo.xcprivacy` ausente na lib A0Auth0; falta `NSPrivacyCollectedDataTypeUserID` |
| 2 | `react-native-image-picker/react-native-image-picker` | média | não | 3 | `phAsset.creationDate` em `ios/ImagePickerManager.mm` (linhas 208/311) sem `NSPrivacyAccessedAPICategoryFileTimestamp` (`3B52.1`); `NSLocationWhenInUseUsageDescription` fantasma em `example/ios/example/Info.plist`; **armadilha:** `NSMicrophoneUsageDescription` no mesmo plist **não** é fantasma (`nao-reportar`) |
| 3 | `Wootric/WootricSDK-iOS` | média | não | 1 | `[NSUserDefaults standardUserDefaults]` em `WootricSDK/WootricSDK/WTRApiClient.m` e `WTRDefaults.m` sem `NSPrivacyAccessedAPICategoryUserDefaults` (`CA92.1`) |
| 4 | `firebase/firebase-ios-sdk` | alta | não | 1 | `FirebaseSessions/Sources/Settings/SettingsCacheClient.swift:51` usa `UserDefaults` puro em vez do wrapper `GULUserDefaults`, sem required-reason declarado |
| 5 | `cascadiacollections/shoutkit` | baixa | não | 2 | faltam `ShoutKitApp/ShoutKitWatchApp/PrivacyInfo.xcprivacy` e `ShoutKitApp/ShoutKitTVApp/PrivacyInfo.xcprivacy` (um caso cada); ambos os targets acessam `UserDefaults` (`NSPrivacyAccessedAPICategoryUserDefaults`) |
| 6 | `rnmapbox/maps` | alta | **sim** | 1 | `ios/RNMBX/RNMBXModule.swift:120` chama `UserDefaults.standard` sem declaração; a lib não tem nenhum `PrivacyInfo.xcprivacy`. Sem correção de referência — mede se o agente aponta sem um exemplo para se guiar |

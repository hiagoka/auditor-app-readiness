# Guia de reprodução

## Pré-requisitos

- Node.js >= 20
- `git`
- Uma `OPENAI_API_KEY` com acesso ao modelo em `OPENAI_MODEL` (padrão `gpt-4.1`)

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
tempo / custo contra o ground truth e substitui os `[preencher]` em `evaluation/results.md` e
`CHANGELOG.md`.

## Dataset

| # | Repositório | Dificuldade | Problema (ground truth) |
|---|---|---|---|
| 1 | `auth0/react-native-auth0` | baixa | `ios/PrivacyInfo.xcprivacy` ausente; falta `NSPrivacyCollectedDataTypeUserID` |
| 2 | `react-native-image-picker/react-native-image-picker` | média | `.creationDate` em `ImagePickerManager.m` sem `NSPrivacyAccessedAPICategoryFileTimestamp` (motivo `3B52.1`) |
| 3 | `Wootric/WootricSDK-iOS` | média | UserDefaults em `WTRApiClient.m`/`WTRDefaults.m` sem `NSPrivacyAccessedAPICategoryUserDefaults` (`CA92.1`) |
| 4 | `firebase/firebase-ios-sdk` | alta | `SettingsCacheClient.swift:51` usa `UserDefaults` puro em vez do wrapper `GULUserDefaults`, sem required-reason |
| 5 | `cascadiacollections/shoutkit` | baixa | faltam `ShoutKitWatchApp/PrivacyInfo.xcprivacy` e `ShoutKitTVApp/PrivacyInfo.xcprivacy` (`NSPrivacyAccessedAPICategoryUserDefaults`) |
| 6 | `rnmapbox/maps` | caso negativo | `RNMBXModule.swift:111` usa `UserDefaults.standard` sem declaração; repo não tem nenhum `PrivacyInfo.xcprivacy`. Sem correção aceita — mede se o agente aponta sem exemplo para se guiar |

# Resultados da avaliação

Fonte: `evaluation/out/baseline.json` e `evaluation/out/solution.json`, comparados contra
`evaluation/test-repos.json`. Preenchido por `npm run fill-results` (determinístico, sem IA).

## Métricas agregadas

| Métrica | Baseline | Solução | Mudança |
|---|---|---|---|
| Recall (casos acertados) | 5/9 (0.56) | 6/9 (0.67) | +1 caso |
| Precisão (não gerou falso positivo) | 0.33 (8/12 FP) | 1.00 (0/11 FP) | +0.67 |
| Tempo de execução (total) | 44s | 53s | +8s |
| Custo em tokens (total) | 77.2k tok | 23.3k tok | -70% (3.3x) |

## Por caso

Recall é medido por **caso**, não por repositório — um repo pode carregar vários casos (o #2 tem
três). `expectativa: reportar` → acerto é apontar o alvo; `expectativa: nao-reportar` (armadilha)
→ acerto é **não** apontar.

> **Ressalva sobre `image-picker-microphone-not-phantom` (armadilha).** Baseline e pipeline
> "passam" por não reportar a chave — mas passar um teste de "não reporte X" sem ter olhado para
> X mede omissão, não discriminação. A qualidade de evidência é assimétrica e está nos JSONs: o
> agente de Permissões do pipeline tem `example/ios/example/Info.plist` em `inspected` (leu o
> arquivo, viu `NSMicrophoneUsageDescription`, decidiu não reportar); o baseline afirma
> literalmente "Sem o Info.plist completo, não é possível confirmar". Mesmo ponto no placar,
> confiança diferente. Uma versão futura do scorer poderia exigir prova de exame para creditar
> um `nao-reportar`.

<!-- GEN:CASES:START -->
| caso | repo | expectativa | baseline | solução |
|---|---|---|---|---|
| `auth0-manifest-missing` | #1 | reportar | sim | sim |
| `image-picker-filetimestamp` | #2 | reportar | sim | sim |
| `image-picker-phantom-location` | #2 | reportar | não | sim |
| `image-picker-microphone-not-phantom` | #2 | nao-reportar | sim | sim |
| `wootric-userdefaults` | #3 | reportar | sim | sim |
| `firebase-gul-wrapper` | #4 | reportar | não | não |
| `shoutkit-watchapp-manifest` | #5 | reportar | não | não |
| `shoutkit-tvapp-manifest` | #5 | reportar | não | não |
| `rnmapbox-userdefaults-no-manifest` | #6 | reportar | sim | sim |
<!-- GEN:CASES:END -->

## Falsos positivos (blockers)

FP = achado de severidade `blocker` cujo caminho não casa com `groundTruth` nem com a lista
curada `accepted_extra_findings`.

<!-- GEN:FP:START -->
**Baseline** — 8 FP em 12 blockers:
  - #1 `ios/NativeBridge.swift` — Uso de APIs requerendo categoria de privacidade não declarada
  - #1 `ios/NativeBridge.swift` — Uso de armazenamento de arquivos com timestamps sem categoria declarada
  - #2 `PrivacyInfo.xcprivacy` — PrivacyInfo.xcprivacy ausente para biblioteca que acessa fotos e câmera
  - #2 `Info.plist` — NSCameraUsageDescription e NSPhotoLibraryUsageDescription ausentes no Info.plist
  - #4 `FirebaseMessaging/Sources/Resources/PrivacyInfo.xcprivacy` — PrivacyInfo.xcprivacy ausente para FirebaseMessaging com coleta de DeviceID
  - #4 `Crashlytics/Resources/PrivacyInfo.xcprivacy` — Uso de NSUserDefaults sem declaração adequada em PrivacyInfo.xcprivacy
  - #4 `FirebaseDynamicLinks/Sources/Resources/PrivacyInfo.xcprivacy` — Uso de timestamps de arquivo sem declaração em PrivacyInfo.xcprivacy
  - #6 `PrivacyInfo.xcprivacy` — PrivacyInfo.xcprivacy missing for Mapbox data collection
**Solução** — 0 FP em 11 blockers.
<!-- GEN:FP:END -->

## Critério (implementado em `scripts/fill-results.ts`)

**Recall — por caso, binário.** Cada caso em `test-repos.json > cases` tem uma `expectativa`:

- **`reportar`** — HIT quando existe um `Finding` tal que (a) algum caminho do achado (campo
  `file` **ou** caminho extraído de `title`/`detail`/`evidence`/`suggestion`) casa por sufixo de
  segmento com um `target.files`, **ou** o texto do achado contém uma `target.keys`; **e** (b) o
  texto cita algum motivo de `reason` (`3B52.1`, `CA92.1`, uma string de categoria, etc.).
- **`nao-reportar`** (armadilha, ex.: `NSMicrophoneUsageDescription` no #2) — HIT quando
  **nenhum** `Finding` de severidade `blocker` aponta o alvo. Reportar como problema é o erro.

Sufixo de segmento: `a === b`, ou `a` termina em `/b`, ou `a` (contendo `/`) é sub-caminho de
`b`. Basename solto (sem `/`, ex.: `PrivacyInfo.xcprivacy` em prosa) só casa quando (i) o caso é
`privacy-manifest-missing` com um único `target.files` **e** (ii) o achado não tem `file`
estruturado. `Recall = casos acertados / total de casos`.

**Precisão — agregada, sobre blockers.** Inalterada em relação à versão por repositório:
`FP = blocker` cujo caminho não casa com `groundTruth.files`, `phantom_permissions[].file` nem
`accepted_extra_findings[].file`. `Precisão = 1 − FP / total de blockers`.

`accepted_extra_findings` é curada **à mão a partir das saídas observadas** — ver a nota "Sobre a
precisão 1.00" no `CHANGELOG.md` sobre a circularidade.

**Tempo / custo:** somados por conjunto. Tokens do baseline vêm de `run.tokensUsed`; da solução,
de `run.agentResults[].tokensUsed` + `run.orchestration.tokensUsed`.

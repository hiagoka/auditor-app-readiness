import { collectBundle, renderBundle } from "../lib/collect";
import { askJson } from "../lib/openai";
import { makeFindingId, type Finding, type Severity } from "../lib/types";

export interface BaselineResult {
  repoPath: string;
  findings: Finding[];
  tokensUsed: number;
  durationMs: number;
  raw: unknown;
  /** arquivos que entraram no bundle — para a trajetória. */
  bundleFiles: string[];
}

interface RawFinding {
  severity?: string;
  title?: string;
  detail?: string;
  file?: string | null;
  line?: number | null;
  evidence?: string | null;
  suggestion?: string | null;
  reference?: string | null;
}

const SYSTEM = `Você é um revisor sênior de conformidade para publicação na App Store (iOS).
Recebe um recorte de um projeto: manifestos (Info.plist, PrivacyInfo.xcprivacy, Podfile) e
trechos de código-fonte. Aponte problemas que causariam REJEIÇÃO ou aviso automático da App Store.

Priorize:
1. Privacy Manifest (PrivacyInfo.xcprivacy) da biblioteca/app ausente quando há coleta de dados
   ou uso de "required reason APIs".
2. Required-reason APIs usadas sem a categoria declarada no PrivacyInfo.xcprivacy:
   - UserDefaults / NSUserDefaults -> NSPrivacyAccessedAPICategoryUserDefaults (motivo CA92.1)
   - timestamps de arquivo (creationDate, modificationDate) -> NSPrivacyAccessedAPICategoryFileTimestamp (3B52.1)
   - espaço em disco -> NSPrivacyAccessedAPICategoryDiskSpace
   - systemUptime / mach_absolute_time -> NSPrivacyAccessedAPICategorySystemBootTime
3. Permissão declarada (NS...UsageDescription) sem uso correspondente no código ("permissão fantasma").
4. String NS...UsageDescription faltando para uma capability efetivamente usada.

Regras:
- Só reporte o que os trechos sustentam. Cite arquivo e, quando possível, linha e um trecho curto em "evidence".
- "severity": "blocker" = rejeição quase certa; "recomendado" = aviso/risco; "opcional" = melhoria.
- Se não houver problema, devolva {"findings": []}.

Responda SOMENTE com JSON válido, sem texto fora do JSON:
{
  "findings": [
    {
      "severity": "blocker" | "recomendado" | "opcional",
      "title": "resumo curto",
      "detail": "explicação",
      "file": "caminho/relativo ou null",
      "line": número ou null,
      "evidence": "trecho de código ou de manifesto",
      "suggestion": "o que declarar ou remover",
      "reference": "ex: CA92.1, 3B52.1, Guideline 5.1.1, ou null"
    }
  ]
}`;

function toSeverity(s: string | undefined): Severity {
  return s === "blocker" || s === "recomendado" || s === "opcional" ? s : "recomendado";
}

/** Baseline — 1 prompt único, mesma LLM, sem estrutura de agentes. */
export async function runBaseline(repoPath: string): Promise<BaselineResult> {
  const start = Date.now();
  const bundle = collectBundle(repoPath);

  const user = `Projeto em ${repoPath}.
Manifestos no bundle: ${bundle.manifestCount} (arquivos .xcprivacy: ${bundle.xcprivacyCount}).
Se nenhum .xcprivacy aparece abaixo, assuma que o projeto não tem privacy manifest.

${renderBundle(bundle)}`;

  const { data, tokensUsed, raw } = await askJson<{ findings: RawFinding[] }>({
    system: SYSTEM,
    user,
  });

  const findings: Finding[] = (data.findings ?? []).map((rf) => {
    const core = {
      agent: "baseline" as const,
      severity: toSeverity(rf.severity),
      title: rf.title?.trim() || "(sem título)",
      file: rf.file ?? undefined,
      line: rf.line ?? undefined,
    };
    return {
      id: makeFindingId(core),
      ...core,
      detail: rf.detail?.trim() ?? "",
      evidence: rf.evidence ?? undefined,
      suggestion: rf.suggestion ?? undefined,
      reference: rf.reference ?? undefined,
    };
  });

  return {
    repoPath,
    findings,
    tokensUsed,
    durationMs: Date.now() - start,
    raw,
    bundleFiles: bundle.files.map((f) => f.path),
  };
}

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

const EXCLUDED_DIR = new Set([
  "node_modules",
  "Pods",
  ".git",
  "build",
  "DerivedData",
  ".build",
  "example",
  "Example",
  "examples",
  "Examples",
  "__tests__",
  "Tests",
  "test",
  "tests",
  "UnitTests",
  "UnitTest",
  "IntegrationTests",
  "docs",
  "site",
  "fastlane",
  "Apps",
  "Sample",
  "Samples",
]);

const SOURCE_EXT = new Set([
  ".swift",
  ".m",
  ".mm",
  ".h",
  ".java",
  ".kt",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
]);

/** Sinais de "required reason API" — usados para ranquear quais fontes entram no bundle. */
const SIGNAL = [
  "UserDefaults",
  "NSUserDefaults",
  "creationDate",
  "modificationDate",
  "fileModificationDate",
  "contentModificationDate",
  "systemUptime",
  "mach_absolute_time",
  "mach_continuous_time",
  "availableCapacity",
  "systemFreeSize",
  "systemSize",
  "volumeAvailableCapacity",
  "activeInputModes",
];

const MANIFEST_NAMES = new Set(["Info.plist", "Podfile", "Podfile.lock"]);

/** ~200 KB — teto de leitura por arquivo antes de qualquer recorte. */
const HARD_READ_CAP = 200_000;

export interface BundleFile {
  /** caminho relativo ao repo. */
  path: string;
  content: string;
  truncated: boolean;
}

export interface Bundle {
  files: BundleFile[];
  totalChars: number;
  manifestCount: number;
  xcprivacyCount: number;
}

function isExcluded(relPath: string): boolean {
  return relPath.split("/").some((seg) => EXCLUDED_DIR.has(seg));
}

function isManifest(rel: string): boolean {
  return MANIFEST_NAMES.has(basename(rel)) || rel.endsWith(".xcprivacy");
}

/** Arquivos de "forma" do projeto: revelam que é um SDK iOS mesmo sem sinal de API. */
function isShape(rel: string): boolean {
  return rel.endsWith(".podspec") || rel.endsWith(".podspec.json");
}

function listFiles(repo: string): string[] {
  try {
    return execFileSync("git", ["-C", repo, "ls-files"], {
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    const acc: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        const rel = relative(repo, full);
        if (isExcluded(rel)) continue;
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile()) acc.push(rel);
      }
    };
    walk(repo);
    return acc;
  }
}

/**
 * Monta um recorte do projeto para mandar ao modelo: todos os manifestos + as fontes com mais
 * sinais de required-reason API, respeitando um teto de caracteres. A contagem de sinais é feita
 * sobre o arquivo inteiro; o recorte só acontece na hora de montar o bundle.
 */
export function collectBundle(
  repoPath: string,
  opts: { maxTotalChars?: number; maxFileChars?: number } = {},
): Bundle {
  const maxTotalChars = opts.maxTotalChars ?? 90_000;
  const maxFileChars = opts.maxFileChars ?? 6_000;
  /** teto de Info.plist/Podfile no bundle — .xcprivacy nunca é limitado. */
  const maxPlainManifests = 10;

  const all = listFiles(repoPath).filter((r) => !isExcluded(r));
  const fullCache = new Map<string, string | null>();

  const readFull = (rel: string): string | null => {
    const hit = fullCache.get(rel);
    if (hit !== undefined) return hit;
    let value: string | null = null;
    try {
      const abs = join(repoPath, rel);
      if (statSync(abs).size <= HARD_READ_CAP * 2) {
        const raw = readFileSync(abs, "utf8").slice(0, HARD_READ_CAP);
        value = raw.startsWith("bplist00") ? null : raw;
      } else {
        value = readFileSync(abs, "utf8").slice(0, HARD_READ_CAP);
        if (value.startsWith("bplist00")) value = null;
      }
    } catch {
      value = null;
    }
    fullCache.set(rel, value);
    return value;
  };

  const firstSignalOffset = (text: string): number | null => {
    let min = Infinity;
    for (const sig of SIGNAL) {
      const i = text.indexOf(sig);
      if (i >= 0 && i < min) min = i;
    }
    return Number.isFinite(min) ? min : null;
  };

  const picked: BundleFile[] = [];
  let total = 0;

  const push = (rel: string): boolean => {
    if (picked.some((f) => f.path === rel)) return true;
    const full = readFull(rel);
    if (full === null) return true;

    let content = full;
    let truncated = false;
    if (full.length > maxFileChars) {
      truncated = true;
      const sig = firstSignalOffset(full);
      // Recorte com janela em torno do primeiro sinal, quando ele cai depois do teto.
      const startAt =
        sig !== null && sig + 1500 > maxFileChars ? Math.max(0, sig - 1500) : 0;
      const slice = full.slice(startAt, startAt + maxFileChars);
      // Prefixa cada linha do trecho com o número de linha REAL do arquivo, para o modelo
      // conseguir citar file:line sem confundir com offset de caractere.
      const firstLine = startAt === 0 ? 1 : full.slice(0, startAt).split("\n").length;
      content = slice
        .split("\n")
        .map((l, i) => `${firstLine + i}\t${l}`)
        .join("\n");
    }

    if (total + content.length > maxTotalChars) return false;
    picked.push({ path: rel, content, truncated });
    total += content.length;
    return true;
  };

  // 1. manifestos + arquivos de forma. Todo .xcprivacy entra (é o que diz se a API foi
  //    declarada); Info.plist/Podfile são limitados e priorizados por profundidade de caminho,
  //    para não afogar as fontes num monorepo cheio de apps de exemplo.
  const manifests = all.filter(isManifest);
  const xcprivacy = manifests.filter((m) => m.endsWith(".xcprivacy"));
  const plainManifests = manifests
    .filter((m) => !m.endsWith(".xcprivacy"))
    .sort((a, b) => a.split("/").length - b.split("/").length)
    .slice(0, maxPlainManifests);
  const shapeFiles = all
    .filter(isShape)
    .sort((a, b) => a.split("/").length - b.split("/").length)
    .slice(0, 8);
  for (const m of xcprivacy) push(m);
  for (const m of plainManifests) push(m);
  for (const s of shapeFiles) push(s);
  if (all.includes("package.json")) push("package.json");

  // 2. fontes ranqueadas por DENSIDADE de sinais (hits por ~2 KB), contados no arquivo inteiro.
  //    Densidade em vez de contagem crua evita que, num monorepo grande, arquivos enormes e pouco
  //    relevantes enterrem uma fonte curta e claramente problemática.
  const scored: { rel: string; density: number; hits: number }[] = [];
  let scanned = 0;
  for (const rel of all) {
    if (scanned > 6000) break;
    const dot = rel.lastIndexOf(".");
    if (dot < 0 || !SOURCE_EXT.has(rel.slice(dot))) continue;
    scanned++;
    const full = readFull(rel);
    if (full === null) continue;
    let hits = 0;
    for (const sig of SIGNAL) {
      let i = full.indexOf(sig);
      while (i >= 0) {
        hits++;
        i = full.indexOf(sig, i + sig.length);
      }
    }
    if (hits > 0) scored.push({ rel, hits, density: hits / Math.max(1, full.length / 2000) });
  }
  scored.sort((a, b) => b.density - a.density || b.hits - a.hits);
  for (const s of scored) {
    if (!push(s.rel)) break;
  }

  // 3. backfill: se o bundle ficou raso (casos "manifesto ausente" sem sinal de API),
  //    inclui as maiores fontes nativas para dar contexto de que é um projeto iOS.
  if (picked.length < 6) {
    const nativeBySize = all
      .filter((r) => {
        const dot = r.lastIndexOf(".");
        return dot >= 0 && [".swift", ".m", ".mm", ".h"].includes(r.slice(dot));
      })
      .map((r) => ({ rel: r, len: readFull(r)?.length ?? 0 }))
      .filter((x) => x.len > 0)
      .sort((a, b) => b.len - a.len)
      .slice(0, 8);
    for (const n of nativeBySize) {
      if (picked.length >= 12 || !push(n.rel)) break;
    }
  }

  return {
    files: picked,
    totalChars: total,
    manifestCount: manifests.length,
    xcprivacyCount: xcprivacy.length,
  };
}

export function renderBundle(bundle: Bundle): string {
  return bundle.files
    .map((f) => `<<< arquivo: ${f.path}${f.truncated ? " (truncado)" : ""} >>>\n${f.content}`)
    .join("\n\n");
}

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const SKIP_DIR = new Set([
  "node_modules",
  "Pods",
  ".git",
  "build",
  "DerivedData",
  ".build",
]);

const CODE_EXT = /\.(swift|m|mm|h|hpp|c|cc|cpp|java|kt|js|jsx|ts|tsx)$/;

/** Segmentos de caminho de código de teste — nunca é enviado num app. */
const TEST_SEG = new Set([
  "Tests",
  "test",
  "tests",
  "UnitTests",
  "UnitTest",
  "IntegrationTests",
  "__tests__",
  "__mocks__",
]);

/** Segmentos de app de exemplo/demo — não é a biblioteca que se está publicando. */
const EXAMPLE_SEG = new Set([
  "example",
  "Example",
  "examples",
  "Examples",
  "Sample",
  "Samples",
  "Apps",
  "demo",
  "Demo",
]);

const hasSeg = (path: string, set: Set<string>): boolean =>
  path.split("/").some((s) => set.has(s));

export const isTestPath = (path: string): boolean => hasSeg(path, TEST_SEG);
export const isExamplePath = (path: string): boolean => hasSeg(path, EXAMPLE_SEG);

/** Todos os arquivos do repo (via `git ls-files`, com fallback para varredura de diretório). */
export function listFiles(repo: string): string[] {
  try {
    return execFileSync("git", ["-C", repo, "ls-files"], {
      encoding: "utf8",
      maxBuffer: 1 << 27,
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    const acc: string[] = [];
    const walk = (dir: string): void => {
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (SKIP_DIR.has(e.name)) continue;
        const full = join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.isFile()) acc.push(relative(repo, full));
      }
    };
    walk(repo);
    return acc;
  }
}

/** Código, sem arquivos de teste. */
export const codeFiles = (repo: string): string[] =>
  listFiles(repo).filter((f) => CODE_EXT.test(f) && !isTestPath(f));

/** Código que de fato é publicado: sem testes E sem apps de exemplo/demo. */
export const shippedCodeFiles = (repo: string): string[] =>
  codeFiles(repo).filter((f) => !isExamplePath(f));

export const infoPlists = (repo: string): string[] =>
  listFiles(repo).filter((f) => f.endsWith("Info.plist"));

export const privacyManifests = (repo: string): string[] =>
  listFiles(repo).filter((f) => f.endsWith(".xcprivacy"));

/** Manifests que fazem parte do que é publicado (ignora example/demo/test). */
export const shippedManifests = (repo: string): string[] =>
  privacyManifests(repo).filter((f) => !isExamplePath(f) && !isTestPath(f));

/** O repo distribui uma biblioteca? (tem .podspec / .podspec.json) */
export const hasPodspec = (repo: string): boolean =>
  listFiles(repo).some((f) => f.endsWith(".podspec") || f.endsWith(".podspec.json"));

export interface Hit {
  file: string;
  line: number;
  text: string;
}

export interface GroupHit extends Hit {
  /** chave do grupo de needles que casou (categoria de privacidade, família de permissão…). */
  key: string;
}

export interface NeedleGroup {
  key: string;
  needles: string[];
}

const IMPORT_LINE = /^\s*(#\s*import|#\s*include|@import|import\s|using\s)/;

/**
 * Uma passada só: lê cada arquivo UMA vez e testa todos os grupos de needles contra cada linha.
 * Substitui N chamadas de `scanFixed` (uma por grupo) que reliam a árvore toda N vezes.
 */
export function scanGroups(repo: string, files: string[], groups: NeedleGroup[]): GroupHit[] {
  const hits: GroupHit[] = [];
  for (const f of files) {
    let content: string;
    try {
      content = readFileSync(join(repo, f), "utf8");
    } catch {
      continue;
    }
    if (content.startsWith("bplist00")) continue;
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i]!;
      // linhas de import/include só citam o símbolo, não são uso
      if (IMPORT_LINE.test(ln)) continue;
      for (const g of groups) {
        if (g.needles.some((n) => ln.includes(n))) {
          hits.push({ key: g.key, file: f, line: i + 1, text: ln.trim().slice(0, 240) });
        }
      }
    }
  }
  return hits;
}

/** Procura um único conjunto de substrings fixas. Fino wrapper sobre `scanGroups`. */
export function scanFixed(repo: string, files: string[], needles: string[]): Hit[] {
  return scanGroups(repo, files, [{ key: "", needles }]);
}

/** Colapsa hits para 1 por arquivo (primeira linha + contagem). */
export function byFile(hits: Hit[]): { file: string; line: number; text: string; count: number }[] {
  const m = new Map<string, { file: string; line: number; text: string; count: number }>();
  for (const h of hits) {
    const e = m.get(h.file);
    if (e) e.count++;
    else m.set(h.file, { file: h.file, line: h.line, text: h.text, count: 1 });
  }
  return [...m.values()];
}

/**
 * Diretório "de módulo" de um manifest: o diretório dele sem os segmentos de empacotamento
 * finais (`Resources`, `Sources`, `Source`, `Src`). Um PrivacyInfo.xcprivacy costuma morar em
 * `Modulo/Sources/Resources/`, mas cobre o alvo `Modulo/` inteiro.
 */
function manifestModuleDir(manifest: string): string[] {
  const dir = manifest.split("/").slice(0, -1);
  const pkg = new Set(["Resources", "Sources", "Source", "Src", "src"]);
  while (dir.length > 1 && pkg.has(dir[dir.length - 1]!)) dir.pop();
  return dir;
}

/**
 * Manifest .xcprivacy que SE APLICA a um arquivo: aquele cujo diretório de módulo é ancestral do
 * arquivo (o mais específico, quando há vários). Retorna `null` quando nenhum manifest cobre o
 * arquivo — nesse caso o uso da required-reason API NÃO está declarado, e isso é um achado.
 */
export function nearestManifest(file: string, manifests: string[]): string | null {
  const dir = file.split("/").slice(0, -1);
  let best: string | null = null;
  let bestLen = -1;
  for (const m of manifests) {
    const md = manifestModuleDir(m);
    let c = 0;
    while (c < dir.length && c < md.length && dir[c] === md[c]) c++;
    if (c === md.length && c > bestLen) {
      bestLen = c;
      best = m;
    }
  }
  return best;
}

// ───────────────────────────── Privacidade ─────────────────────────────

export interface RequiredReasonApi {
  category: string;
  reasonCodes: string;
  needles: string[];
}

/** Required-reason APIs da Apple e as pistas de uso no código. */
export const REQUIRED_REASON_APIS: RequiredReasonApi[] = [
  {
    category: "NSPrivacyAccessedAPICategoryUserDefaults",
    reasonCodes: "CA92.1/1C8F.1",
    needles: ["UserDefaults", "NSUserDefaults"],
  },
  {
    category: "NSPrivacyAccessedAPICategoryFileTimestamp",
    reasonCodes: "3B52.1/DDA9.1/C617.1",
    needles: [
      ".creationDate",
      ".modificationDate",
      "contentModificationDateKey",
      "creationDateKey",
      "NSURLContentModificationDateKey",
      "NSURLCreationDateKey",
      "NSFileCreationDate",
      "NSFileModificationDate",
      "attributesOfItemAtPath",
      "getattrlist",
    ],
  },
  {
    category: "NSPrivacyAccessedAPICategoryDiskSpace",
    reasonCodes: "85F4.1/E174.1/7D9E.1/B728.1",
    needles: [
      "volumeAvailableCapacity",
      "NSURLVolumeAvailableCapacityKey",
      "NSFileSystemFreeSize",
      "systemFreeSize",
      "systemSize",
      "statfs",
    ],
  },
  {
    category: "NSPrivacyAccessedAPICategorySystemBootTime",
    reasonCodes: "35F9.1/8FFB.1",
    needles: ["systemUptime", "mach_absolute_time", "mach_continuous_time", "kern.boottime"],
  },
  {
    category: "NSPrivacyAccessedAPICategoryActiveKeyboards",
    reasonCodes: "3EC4.1/54BD.1",
    needles: ["activeInputModes"],
  },
];

/** Identificadores `<Algo>UserDefaults` distintos usados no código — revela wrappers do projeto. */
export function userDefaultsIdentifiers(repo: string, files: string[]): string[] {
  const re = /\b([A-Za-z_][A-Za-z0-9_]*UserDefaults)\b/g;
  const seen = new Set<string>();
  for (const f of files) {
    let content: string;
    try {
      content = readFileSync(join(repo, f), "utf8");
    } catch {
      continue;
    }
    let m: RegExpExecArray | null;
    while ((m = re.exec(content))) seen.add(m[1]!);
  }
  return [...seen].sort();
}

export interface DeclaredManifest {
  file: string;
  categories: string[];
  collected: string[];
}

export function declaredPrivacyCategories(repo: string, manifests: string[]): DeclaredManifest[] {
  return manifests.map((f) => {
    let content = "";
    try {
      content = readFileSync(join(repo, f), "utf8");
    } catch {
      /* ignore */
    }
    const categories = [
      ...content.matchAll(/<string>\s*(NSPrivacyAccessedAPICategory\w+)\s*<\/string>/g),
    ].map((m) => m[1]!);
    const collected = [
      ...content.matchAll(/<string>\s*(NSPrivacyCollectedDataType\w+)\s*<\/string>/g),
    ].map((m) => m[1]!);
    return { file: f, categories: [...new Set(categories)], collected: [...new Set(collected)] };
  });
}

// ───────────────────────────── Permissões ─────────────────────────────

export interface PermissionFamily {
  name: string;
  keys: string[];
  usageNeedles: string[];
  indirectNote?: string;
}

export const PERMISSION_FAMILIES: PermissionFamily[] = [
  {
    name: "localização",
    keys: [
      "NSLocationWhenInUseUsageDescription",
      "NSLocationAlwaysUsageDescription",
      "NSLocationAlwaysAndWhenInUseUsageDescription",
      "NSLocationUsageDescription",
    ],
    usageNeedles: [
      "CLLocationManager",
      "CoreLocation",
      "requestWhenInUseAuthorization",
      "requestAlwaysAuthorization",
      "startUpdatingLocation",
      "navigator.geolocation",
      "Geolocation.getCurrentPosition",
      "react-native-geolocation",
      "@react-native-community/geolocation",
      "MKMapView",
      "showsUserLocation",
    ],
  },
  {
    name: "câmera",
    keys: ["NSCameraUsageDescription"],
    usageNeedles: [
      "AVCaptureDevice",
      "AVCaptureSession",
      "UIImagePickerControllerSourceTypeCamera",
      "sourceType = .camera",
      "sourceType: .camera",
      "requestAccessForMediaType",
      "AVMediaTypeVideo",
      "launchCamera",
      "RNCamera",
      "expo-camera",
      "VisionCamera",
    ],
  },
  {
    name: "microfone",
    keys: ["NSMicrophoneUsageDescription"],
    // só sinais inequívocos de captação — AVAudioSession/AVAudioEngine sozinhos são playback
    usageNeedles: [
      "AVAudioRecorder",
      "requestRecordPermission",
      "AudioQueueNewInput",
      "AVCaptureAudioDataOutput",
      "installTap(onBus",
      "react-native-audio-recorder",
      "expo-audio",
    ],
    indirectNote:
      "Gravação de vídeo (UIImagePickerController / AVCaptureSession com mídia de vídeo) captura áudio sem chamar AVAudioSession diretamente — pode ser uso indireto legítimo.",
  },
  {
    name: "fotos",
    keys: ["NSPhotoLibraryUsageDescription", "NSPhotoLibraryAddUsageDescription"],
    usageNeedles: [
      "PHPhotoLibrary",
      "PHAsset",
      "PHPickerViewController",
      "PHPickerConfiguration",
      "UIImagePickerControllerSourceTypePhotoLibrary",
      "sourceType = .photoLibrary",
      "PHImageManager",
      "launchImageLibrary",
      "CameraRoll",
      "@react-native-camera-roll",
      "expo-media-library",
      "UIImageWriteToSavedPhotosAlbum",
    ],
  },
  {
    name: "contatos",
    keys: ["NSContactsUsageDescription"],
    usageNeedles: ["CNContactStore", "CNContact", "ABAddressBook", "react-native-contacts"],
  },
  {
    name: "calendário",
    keys: ["NSCalendarsUsageDescription", "NSCalendarsFullAccessUsageDescription"],
    usageNeedles: ["EKEventStore", "EKEvent", "EventKit"],
  },
  {
    name: "lembretes",
    keys: ["NSRemindersUsageDescription", "NSRemindersFullAccessUsageDescription"],
    usageNeedles: ["EKReminder", "EKEntityTypeReminder"],
  },
  {
    name: "movimento",
    keys: ["NSMotionUsageDescription"],
    usageNeedles: ["CMMotionManager", "CMPedometer", "CoreMotion", "CMAltimeter"],
  },
  {
    name: "bluetooth",
    keys: ["NSBluetoothAlwaysUsageDescription", "NSBluetoothPeripheralUsageDescription"],
    usageNeedles: ["CBCentralManager", "CBPeripheralManager", "CoreBluetooth"],
  },
  {
    name: "reconhecimento de fala",
    keys: ["NSSpeechRecognitionUsageDescription"],
    usageNeedles: ["SFSpeechRecognizer", "SFSpeechAudioBufferRecognitionRequest"],
  },
  {
    name: "Face ID",
    keys: ["NSFaceIDUsageDescription"],
    usageNeedles: ["LAContext", "LocalAuthentication", "evaluatePolicy", "kLAPolicyDeviceOwner"],
  },
  {
    name: "rastreamento (ATT)",
    keys: ["NSUserTrackingUsageDescription"],
    usageNeedles: [
      "ATTrackingManager",
      "AppTrackingTransparency",
      "requestTrackingAuthorization",
      "advertisingIdentifier",
      "ASIdentifierManager",
    ],
  },
  {
    name: "saúde",
    keys: ["NSHealthShareUsageDescription", "NSHealthUpdateUsageDescription"],
    usageNeedles: ["HKHealthStore", "HealthKit"],
  },
  {
    name: "rede local",
    keys: ["NSLocalNetworkUsageDescription"],
    // descoberta/anúncio na LAN — NWConnection a host remoto NÃO é rede local
    usageNeedles: [
      "NWBrowser",
      "NetServiceBrowser",
      "NSNetServiceBrowser",
      "Bonjour",
      "MCNearbyServiceBrowser",
      "MCNearbyServiceAdvertiser",
    ],
  },
];

export interface DeclaredPermission {
  key: string;
  value: string;
  file: string;
  line: number;
}

/** Extrai as chaves NS*UsageDescription (chave, valor, arquivo, linha) de todos os Info.plist. */
export function declaredPermissions(repo: string, plists: string[]): DeclaredPermission[] {
  const out: DeclaredPermission[] = [];
  for (const f of plists) {
    let content: string;
    try {
      content = readFileSync(join(repo, f), "utf8");
    } catch {
      continue;
    }
    if (content.startsWith("bplist00")) continue;
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const km = lines[i]!.match(/<key>(NS\w*UsageDescription)<\/key>/);
      if (!km) continue;
      const key = km[1]!;
      let value = "<não resolvido>";
      const inline = lines[i]!.match(
        /<key>NS\w*UsageDescription<\/key>\s*<string>([\s\S]*?)<\/string>/,
      );
      if (inline) {
        value = inline[1]!.trim();
      } else {
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          if (/<string\s*\/>/.test(lines[j]!)) {
            value = "";
            break;
          }
          const vm = lines[j]!.match(/<string>([\s\S]*?)<\/string>/);
          if (vm) {
            value = vm[1]!.trim();
            break;
          }
        }
      }
      out.push({ key, value, file: f, line: i + 1 });
    }
  }
  return out;
}

// server/featureFlags.ts
import fs from "fs/promises";
import * as fss from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ────────────────────────────────────────────────────────────────
   Path resolution
   ──────────────────────────────────────────────────────────────── */

function resolveFlagsPath(): string {
  // Env override (absolute or relative to cwd)
  const envPath = process.env.FEATURE_FLAGS_PATH && path.resolve(process.env.FEATURE_FLAGS_PATH);
  if (envPath) return envPath;

  // Prefer project root if present
  const candidateRoot = path.join(process.cwd(), "feature-flags.json");
  try {
    if (fss.statSync(candidateRoot).isFile()) return candidateRoot;
  } catch {}

  // Fallback to server-local
  return path.join(__dirname, "feature-flags.json");
}

const FLAGS_PATH = resolveFlagsPath();
if (!process.env.SUPPRESS_FLAGS_LOG) {
  // eslint-disable-next-line no-console
  console.log(`[featureFlags] Using flags file: ${FLAGS_PATH}`);
}

/* ────────────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────────────── */

export type BillingColumnVisibility = {
  hideDate?: boolean;
  hideStudent?: boolean;
  hideEventType?: boolean;
  hideAttendance?: boolean;
  hideAdjustment?: boolean;
};

export type Policy = {
  hideBilling?: boolean;
  hideHours?: boolean;
  billingColumnVisibility?: BillingColumnVisibility;
};

type FranchiseConfig = Policy & {
  admins?: string[];
};

export type FlagsFile = {
  default?: Policy;
  franchises?: Record<string, FranchiseConfig>;
};

/* ────────────────────────────────────────────────────────────────
   Constants & internal state
   ──────────────────────────────────────────────────────────────── */

const DEFAULT_COLS: Required<BillingColumnVisibility> = {
  hideDate: false,
  hideStudent: false,
  hideEventType: false,
  hideAttendance: false,
  hideAdjustment: false,
};

// Tracks which shape was detected when loading so we can write back consistently
let LEGACY_FLAT_SHAPE = false;

/* ────────────────────────────────────────────────────────────────
   Debug helpers (exported)
   ──────────────────────────────────────────────────────────────── */

export const __FLAGS_PATH_DEBUG = FLAGS_PATH;

export async function __debugReadRaw(): Promise<string> {
  try {
    return await fs.readFile(FLAGS_PATH, "utf8");
  } catch (e) {
    return `(cannot read ${FLAGS_PATH}): ${String(e)}`;
  }
}

/* ────────────────────────────────────────────────────────────────
   Utils
   ──────────────────────────────────────────────────────────────── */

async function ensureFile(): Promise<void> {
  try {
    await fs.access(FLAGS_PATH);
  } catch {
    await fs.writeFile(FLAGS_PATH, JSON.stringify({}, null, 2), "utf8");
  }
}

function normalizePolicy(p?: Policy): Required<Policy> {
  return {
    hideBilling: !!p?.hideBilling,
    hideHours: !!p?.hideHours,
    billingColumnVisibility: { ...DEFAULT_COLS, ...(p?.billingColumnVisibility ?? {}) },
  };
}

function isLikelyFlatShape(obj: any): boolean {
  if (!obj || typeof obj !== "object") return false;
  if ("default" in obj || "franchises" in obj) return false;
  const keys = Object.keys(obj);
  if (!keys.length) return false;
  let numericish = 0;
  for (const k of keys) if (/^\d+$/.test(k)) numericish++;
  return numericish / keys.length >= 0.5;
}

/* ────────────────────────────────────────────────────────────────
   Core I/O (shape-aware)
   ──────────────────────────────────────────────────────────────── */

async function loadFlags(): Promise<FlagsFile> {
  await ensureFile();
  const raw = await fs.readFile(FLAGS_PATH, "utf8");

  try {
    const parsed = JSON.parse(raw) as any;

    if (isLikelyFlatShape(parsed)) {
      LEGACY_FLAT_SHAPE = true;

      const franchises: Record<string, FranchiseConfig> = {};
      for (const [id, v] of Object.entries(parsed)) {
        const cfg = (v || {}) as FranchiseConfig;
        franchises[id] = {
          hideBilling: typeof cfg.hideBilling === "boolean" ? cfg.hideBilling : undefined,
          hideHours: typeof cfg.hideHours === "boolean" ? cfg.hideHours : undefined,
          billingColumnVisibility: { ...DEFAULT_COLS, ...(cfg.billingColumnVisibility ?? {}) },
          admins: Array.isArray(cfg.admins) ? cfg.admins : [],
        };
      }

      return {
        // flat files don't store a default; we provide a harmless default in memory
        default: { hideBilling: false, hideHours: false, billingColumnVisibility: { ...DEFAULT_COLS } },
        franchises,
      };
    }

    // wrapped shape: { default, franchises }
    LEGACY_FLAT_SHAPE = false;

    const def = normalizePolicy(parsed.default);
    const franchises: Record<string, FranchiseConfig> = {};
    for (const [k, v] of Object.entries(parsed.franchises || {})) {
      const np = normalizePolicy(v as Policy);
      franchises[k] = {
        hideBilling: np.hideBilling,
        hideHours: np.hideHours,
        billingColumnVisibility: np.billingColumnVisibility,
        admins: Array.isArray((v as any).admins) ? (v as any).admins : [],
      };
    }
    return { default: def, franchises };
  } catch {
    LEGACY_FLAT_SHAPE = false;
    await fs.writeFile(FLAGS_PATH, JSON.stringify({}, null, 2), "utf8");
    return {
      default: { hideBilling: false, hideHours: false, billingColumnVisibility: { ...DEFAULT_COLS } },
      franchises: {},
    };
  }
}

async function saveFlags(data: FlagsFile): Promise<void> {
  if (LEGACY_FLAT_SHAPE) {
    // Write back as flat file (preserve original style)
    const outFlat: Record<string, any> = {};
    for (const [id, v] of Object.entries(data.franchises || {})) {
      const np = normalizePolicy(v);
      outFlat[id] = {
        hideBilling: np.hideBilling,
        hideHours: np.hideHours,
        billingColumnVisibility: { ...DEFAULT_COLS, ...(np.billingColumnVisibility ?? {}) },
        ...(Array.isArray((v as any).admins) ? { admins: (v as any).admins } : {}),
      };
    }
    await fs.writeFile(FLAGS_PATH, JSON.stringify(outFlat, null, 2), "utf8");
    return;
  }

  // Write wrapped shape
  const def = normalizePolicy(data.default);
  const outWrapped: FlagsFile = {
    default: {
      hideBilling: def.hideBilling,
      hideHours: def.hideHours,
      billingColumnVisibility: def.billingColumnVisibility,
    },
    franchises: {},
  };
  for (const [k, v] of Object.entries(data.franchises || {})) {
    const np = normalizePolicy(v);
    outWrapped.franchises![k] = {
      hideBilling: np.hideBilling,
      hideHours: np.hideHours,
      billingColumnVisibility: np.billingColumnVisibility,
      admins: Array.isArray((v as any).admins) ? (v as any).admins : [],
    };
  }
  await fs.writeFile(FLAGS_PATH, JSON.stringify(outWrapped, null, 2), "utf8");
}

/* ────────────────────────────────────────────────────────────────
   Public API used by routes
   ──────────────────────────────────────────────────────────────── */

export async function getPolicyForFranchise(franchiseId: number | string): Promise<Policy> {
  const flags = await loadFlags();
  const per = flags.franchises?.[String(franchiseId)];
  return normalizePolicy(per ?? flags.default);
}

export async function getPolicyMap(franchiseIds: Array<number | string>): Promise<Record<string, Policy>> {
  const flags = await loadFlags();
  const out: Record<string, Policy> = {};
  for (const id of franchiseIds) {
    const per = flags.franchises?.[String(id)];
    out[String(id)] = normalizePolicy(per ?? flags.default);
  }
  return out;
}

export async function updatePolicyForFranchise(franchiseId: number | string, patch: Policy): Promise<Policy> {
  const flags = await loadFlags();
  flags.franchises = flags.franchises || {};
  const cur = flags.franchises[String(franchiseId)] || {};

  const merged: FranchiseConfig = {
    hideBilling: typeof patch.hideBilling === "boolean" ? patch.hideBilling : cur.hideBilling,
    hideHours: typeof patch.hideHours === "boolean" ? patch.hideHours : cur.hideHours,
    billingColumnVisibility:
      patch.billingColumnVisibility && typeof patch.billingColumnVisibility === "object"
        ? { ...DEFAULT_COLS, ...(cur.billingColumnVisibility ?? {}), ...patch.billingColumnVisibility }
        : { ...DEFAULT_COLS, ...(cur.billingColumnVisibility ?? {}) },
    admins: Array.isArray(cur.admins) ? cur.admins : [],
  };

  flags.franchises[String(franchiseId)] = merged;
  await saveFlags(flags);
  return normalizePolicy(merged);
}

/* ────────────────────────────────────────────────────────────────
   Optional admin helpers
   ──────────────────────────────────────────────────────────────── */

export async function isFranchiseAdmin(franchiseId: number | string, email: string): Promise<boolean> {
  const flags = await loadFlags();
  const cfg = flags.franchises?.[String(franchiseId)];
  const list = (cfg?.admins || []).map((e) => String(e).trim().toLowerCase());
  return list.includes(String(email || "").trim().toLowerCase());
}

export async function listAdmins(franchiseId: number | string): Promise<string[]> {
  const flags = await loadFlags();
  const cfg = flags.franchises?.[String(franchiseId)];
  return cfg?.admins || [];
}

export async function setAdmins(franchiseId: number | string, admins: string[]): Promise<string[]> {
  const flags = await loadFlags();
  flags.franchises = flags.franchises || {};
  const cur = flags.franchises[String(franchiseId)] || {};
  flags.franchises[String(franchiseId)] = {
    ...cur,
    admins: admins.map((e) => String(e).trim()).filter(Boolean),
  };
  await saveFlags(flags);
  return flags.franchises[String(franchiseId)].admins || [];
}

export async function readAllFlags(): Promise<FlagsFile> {
  return loadFlags();
}

export async function updateDefaultPolicy(patch: Policy): Promise<Policy> {
  const flags = await loadFlags();
  flags.default = normalizePolicy({ ...flags.default, ...patch });
  await saveFlags(flags);
  return flags.default;
}

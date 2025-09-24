// server/featureFlags.ts
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// File lives alongside server code by default
const FLAGS_PATH = path.join(__dirname, "feature-flags.json");

export type Policy = {
  hideBilling?: boolean;
};

type FranchiseConfig = Policy & {
  admins?: string[]; // allowed admin emails for this franchise
};

type FlagsFile = {
  default?: Policy; // defaults for all franchises
  franchises?: Record<string, FranchiseConfig>; // per-franchise overrides + admin list
};

const DEFAULT_FLAGS: FlagsFile = {
  default: { hideBilling: false },
  franchises: {},
};

async function ensureFile(): Promise<void> {
  try {
    await fs.access(FLAGS_PATH);
  } catch {
    await fs.writeFile(FLAGS_PATH, JSON.stringify(DEFAULT_FLAGS, null, 2), "utf8");
  }
}

async function loadFlags(): Promise<FlagsFile> {
  await ensureFile();
  const raw = await fs.readFile(FLAGS_PATH, "utf8");
  try {
    const parsed = JSON.parse(raw) as FlagsFile;
    // normalize structure
    const franchises: Record<string, FranchiseConfig> = {};
    for (const [k, v] of Object.entries(parsed.franchises || {})) {
      const cfg = v || {};
      franchises[k] = {
        hideBilling: typeof cfg.hideBilling === "boolean" ? cfg.hideBilling : undefined,
        admins: Array.isArray(cfg.admins) ? cfg.admins : [],
      };
    }
    return {
      default: {
        hideBilling: typeof parsed.default?.hideBilling === "boolean" ? parsed.default.hideBilling : false,
      },
      franchises,
    };
  } catch {
    await fs.writeFile(FLAGS_PATH, JSON.stringify(DEFAULT_FLAGS, null, 2), "utf8");
    return DEFAULT_FLAGS;
  }
}

async function saveFlags(data: FlagsFile): Promise<void> {
  // keep shape consistent
  const out: FlagsFile = {
    default: { hideBilling: !!data.default?.hideBilling },
    franchises: {},
  };
  for (const [k, v] of Object.entries(data.franchises || {})) {
    out.franchises![k] = {
      hideBilling: !!v.hideBilling,
      admins: Array.isArray(v.admins) ? v.admins : [],
    };
  }
  await fs.writeFile(FLAGS_PATH, JSON.stringify(out, null, 2), "utf8");
}

/** Merge default + franchise override for a single franchise. */
export async function getPolicyForFranchise(franchiseId: number | string): Promise<Policy> {
  const flags = await loadFlags();
  if (String(franchiseId) === "default") return { hideBilling: !!flags.default?.hideBilling };
  const per = flags.franchises?.[String(franchiseId)];
  return {
    hideBilling: typeof per?.hideBilling === "boolean" ? per!.hideBilling : !!flags.default?.hideBilling,
  };
}

/** Batch fetch effective policy for multiple franchiseIds; returns map */
export async function getPolicyMap(franchiseIds: Array<number | string>): Promise<Record<string, Policy>> {
  const flags = await loadFlags();
  const out: Record<string, Policy> = {};
  for (const id of franchiseIds) {
    const per = flags.franchises?.[String(id)];
    out[String(id)] = {
      hideBilling: typeof per?.hideBilling === "boolean" ? per!.hideBilling : !!flags.default?.hideBilling,
    };
  }
  return out;
}

/** Update (merge) a franchise policy and persist. Keeps existing admins list intact. */
export async function updatePolicyForFranchise(franchiseId: number | string, patch: Policy): Promise<Policy> {
  const flags = await loadFlags();
  flags.franchises = flags.franchises || {};
  const cur = flags.franchises[String(franchiseId)] || {};
  const next: FranchiseConfig = {
    hideBilling: typeof patch.hideBilling === "boolean" ? patch.hideBilling : cur.hideBilling,
    admins: Array.isArray(cur.admins) ? cur.admins : [],
  };
  flags.franchises[String(franchiseId)] = next;
  await saveFlags(flags);
  return { hideBilling: !!next.hideBilling };
}

/** Admin list helpers */
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
    hideBilling: !!cur.hideBilling,
    admins: admins.map((e) => String(e).trim()).filter(Boolean),
  };
  await saveFlags(flags);
  return flags.franchises[String(franchiseId)].admins || [];
}

/** Read all flags (for super-admin tools; route will scope as needed) */
export async function readAllFlags(): Promise<FlagsFile> {
  return loadFlags();
}

/** Replace default policy */
export async function updateDefaultPolicy(patch: Policy): Promise<Policy> {
  const flags = await loadFlags();
  flags.default = {
    hideBilling: typeof patch.hideBilling === "boolean" ? patch.hideBilling : !!flags.default?.hideBilling,
  };
  await saveFlags(flags);
  return flags.default;
}

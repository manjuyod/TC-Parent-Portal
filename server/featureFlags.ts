// server/featureFlagsDb.ts
import { pgPool } from "./pg";

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

const DEFAULT_COLS: Required<BillingColumnVisibility> = {
  hideDate: false,
  hideStudent: false,
  hideEventType: false,
  hideAttendance: false,
  hideAdjustment: false,
};

function normalizePolicy(p?: Policy): Required<Policy> {
  return {
    hideBilling: !!p?.hideBilling,
    hideHours: !!p?.hideHours,
    billingColumnVisibility: { ...DEFAULT_COLS, ...(p?.billingColumnVisibility ?? {}) },
  };
}

/**
 * Assumes you have tables:
 * - franchises (franchise_id pk)
 * - franchise_policies (franchise_id, key, value)
 */
export async function getPolicyForFranchise(franchiseId: number | string): Promise<Policy> {
  const fid = String(franchiseId);

  // read rows like: hideBilling=true, hideDate=false, etc.
  const { rows } = await pgPool.query(
    `
    SELECT policy_key, policy_value
    FROM franchise_policies
    WHERE franchise_id = $1
    `,
    [fid]
  );

  // Turn rows into the Policy shape your UI expects
  const policy: Policy = {};
  const cols: BillingColumnVisibility = {};

  for (const r of rows) {
    const key = String(r.policy_key);
    const val = r.policy_value;

    // policy_value might be boolean or text depending on your schema
    const b =
      typeof val === "boolean" ? val :
      typeof val === "string" ? val.toLowerCase() === "true" :
      !!val;

    if (key === "hideBilling") policy.hideBilling = b;
    else if (key === "hideHours") policy.hideHours = b;
    else if (key in DEFAULT_COLS) (cols as any)[key] = b;
  }

  policy.billingColumnVisibility = cols;
  return normalizePolicy(policy);
}

/**
 * Patch a franchise policy. Only writes keys that exist in patch.
 */
export async function updatePolicyForFranchise(franchiseId: number | string, patch: Policy): Promise<Policy> {
  const fid = String(franchiseId);
  const norm = normalizePolicy(patch);

  // Build key/value pairs to upsert
  const kv: Array<[string, boolean]> = [
    ["hideBilling", norm.hideBilling],
    ["hideHours", norm.hideHours],
    ["hideDate", !!norm.billingColumnVisibility.hideDate],
    ["hideStudent", !!norm.billingColumnVisibility.hideStudent],
    ["hideEventType", !!norm.billingColumnVisibility.hideEventType],
    ["hideAttendance", !!norm.billingColumnVisibility.hideAttendance],
    ["hideAdjustment", !!norm.billingColumnVisibility.hideAdjustment],
  ];

  await pgPool.query("BEGIN");
  try {
    // Ensure franchise exists
    await pgPool.query(
      `INSERT INTO franchises(franchise_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [fid]
    );

    // Upsert each flag
    for (const [k, v] of kv) {
      await pgPool.query(
        `
        INSERT INTO franchise_policies(franchise_id, policy_key, policy_value)
        VALUES ($1, $2, $3)
        ON CONFLICT (franchise_id, policy_key)
        DO UPDATE SET policy_value = EXCLUDED.policy_value, updated_at = now()
        `,
        [fid, k, v]
      );
    }

    await pgPool.query("COMMIT");
  } catch (e) {
    await pgPool.query("ROLLBACK");
    throw e;
  }

  return getPolicyForFranchise(fid);
}

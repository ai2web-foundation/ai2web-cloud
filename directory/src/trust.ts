// RFC-0017 Trust & Reputation - two-sided attestation primitive (DESIGN STAGE).
//
// SAFETY: RFC-0017 is design-first and says implementation MUST NOT begin until its §8 open
// questions are resolved, and the capability MUST NOT be presented publicly as available. This
// module therefore implements ONLY the reviewable, non-dangerous foundation and is disabled by
// default (directory env flag TRUST_ENABLED). It deliberately does NOT:
//   - store negative/failure signals (legal review required - RFC-0017 §8 [VERIFY]),
//   - store free-text reviews (out of scope - §3.3),
//   - expose a public ranking/score (aggregation governance unresolved - §8).
// It enforces the acceptance criteria: audit_ref-anchored, two-sided (no unilateral self-report is
// trusted), personal-data-free.

export type Party = "site" | "agent";

export interface Attestation {
  audit_ref: string;    // links to a completed action (RFC-0003); the anti-fabrication anchor
  site_origin: string;  // https origin of the site
  agent: string;        // coarse agent identity (RFC-0013) - NEVER an end-user identifier
  outcome: "fulfilled"; // positive-only for now; negatives blocked pending legal review (§8)
  rating?: number;      // optional bounded 1-5
  party: Party;         // who is attesting
  ts: number;
}

export interface CorroboratedSignal {
  audit_ref: string;
  site_origin: string;
  agent: string;
  outcome: "fulfilled";
  rating?: number;
  ts: number;
}

const looksPersonal = (s: string) => /@|\d{6,}/.test(s); // emails / long digit runs (ids, phones, cards)

/** Validate one attestation: shape, positive-only, and personal-data-free (§3.3). */
export function validateAttestation(a: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const o = (a ?? {}) as Partial<Attestation>;
  if (!o.audit_ref || typeof o.audit_ref !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(o.audit_ref)) errors.push("audit_ref invalid");
  try { const u = new URL(String(o.site_origin)); if (u.protocol !== "https:" || u.origin !== o.site_origin) errors.push("site_origin must be an https origin"); } catch { errors.push("site_origin invalid"); }
  if (!o.agent || typeof o.agent !== "string" || o.agent.length > 64 || looksPersonal(o.agent)) errors.push("agent invalid or looks personal");
  if (o.outcome !== "fulfilled") errors.push("only outcome 'fulfilled' is accepted (negative signals require legal review, RFC-0017 §8)");
  if (o.rating !== undefined && (!Number.isInteger(o.rating) || o.rating < 1 || o.rating > 5)) errors.push("rating must be an integer 1-5");
  if (o.party !== "site" && o.party !== "agent") errors.push("party must be 'site' or 'agent'");
  return { valid: errors.length === 0, errors };
}

/**
 * Two-sided corroboration (§3.2): a signal is network-trustworthy only when BOTH the site and the
 * acting agent attest to the same audit_ref with a matching outcome. A single party's self-report
 * is never trusted. Returns the corroborated signal, or null if the pair does not corroborate.
 */
export function corroborate(a: Attestation, b: Attestation): CorroboratedSignal | null {
  if (a.party === b.party) return null;                 // need one site + one agent, not two of a kind
  if (a.audit_ref !== b.audit_ref) return null;
  if (a.site_origin !== b.site_origin) return null;
  if (a.outcome !== b.outcome) return null;
  const site = a.party === "site" ? a : b;
  const agent = a.party === "agent" ? a : b;
  if (agent.agent !== site.agent && site.agent && agent.agent) {
    // both may name the agent; if they disagree, do not corroborate
    return null;
  }
  const rating = a.rating !== undefined && b.rating !== undefined ? Math.round((a.rating + b.rating) / 2) : (a.rating ?? b.rating);
  return { audit_ref: a.audit_ref, site_origin: a.site_origin, agent: agent.agent, outcome: a.outcome, rating, ts: Math.max(a.ts, b.ts) };
}

/**
 * A bounded, time-decayed trust score from CORROBORATED signals only. Experimental and NOT a public
 * ranking - kept internal pending §8 (aggregation governance, sybil resistance). Half-life 180 days.
 */
export function trustScore(signals: CorroboratedSignal[], now: number): { score: number; count: number; avgRating: number | null; note: string } {
  const HALF_LIFE = 180 * 86400_000;
  let weight = 0, ratingSum = 0, ratingN = 0;
  for (const s of signals) {
    const age = Math.max(0, now - s.ts);
    const w = Math.pow(0.5, age / HALF_LIFE);
    weight += w;
    if (s.rating !== undefined) { ratingSum += s.rating * w; ratingN += w; }
  }
  // Diminishing returns: many corroborated fulfilments approach but never exceed 100.
  const score = Math.round(100 * (1 - Math.exp(-weight / 8)));
  return {
    score,
    count: signals.length,
    avgRating: ratingN > 0 ? Math.round((ratingSum / ratingN) * 10) / 10 : null,
    note: "experimental; corroborated fulfilments only; not a public ranking (RFC-0017 §8 pending)",
  };
}

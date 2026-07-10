import type { Action } from "./shared.js";

const ORIGIN = "https://ai2web-oauth-store.workers.dev";

// OAuth-protected store: advertises oauth2 + PKCE. The MCP endpoint runs behind OAuth,
// so tools execute as the authenticated customer (this.props). Discovery stays public.
export const MANIFEST = {
  protocol: "ai2w",
  version: "0.1",
  site: { name: "Example Store (secure)", url: ORIGIN, type: "ecommerce", description: "AI2Web OAuth-protected demo store.", languages: ["en-GB"] },
  identity: { legal_name: "Example Store Ltd", privacy_policy: `${ORIGIN}/privacy`, terms: `${ORIGIN}/terms` },
  capabilities: {
    content: { enabled: true, endpoint: "/ai2w/content" },
    commerce: { enabled: true, endpoint: "/ai2w/products", checkout: true, returns: true },
    support: { enabled: true, endpoint: "/ai2w/support", order_tracking: true, returns: true, refunds: true, issue_report: true, human_handoff: true },
    search: { enabled: true, endpoint: "/ai2w/search" },
    actions: { enabled: true, endpoint: "/ai2w/actions" },
    events: { enabled: true, endpoint: "/ai2w/events" },
  },
  transports: { rest: { enabled: true, base: "/ai2w" }, mcp: { enabled: true, endpoint: "/ai2w/mcp" }, acp: { enabled: false, endpoint: "/ai2w/acp" } },
  auth: {
    methods: ["none", "oauth2"],
    oauth2: { authorization_url: `${ORIGIN}/authorize`, token_url: `${ORIGIN}/token`, pkce: true, scopes: ["read_orders", "track_delivery", "manage_returns"] },
  },
  consent: { requires_user_approval_for: ["purchase", "payment", "refund", "return", "cancellation"] },
  actions: [
    { id: "check_stock", name: "check_stock", display_name: "Check stock", description: "Check product availability by SKU.", method: "POST", endpoint: "/ai2w/actions/check-stock", requires_auth: false, requires_user_approval: false, risk: "low",
      input_schema: { type: "object", properties: { sku: { type: "string" } }, required: ["sku"] } },
    { id: "list_orders", name: "list_orders", display_name: "List my orders", description: "List the signed-in customer's recent orders.", method: "POST", endpoint: "/ai2w/actions/list-orders", requires_auth: true, requires_user_approval: false, risk: "medium",
      input_schema: { type: "object", properties: {} } },
    { id: "track_order", name: "track_order", display_name: "Track order", description: "Track the delivery status of one of your orders.", method: "POST", endpoint: "/ai2w/actions/track-order", requires_auth: true, requires_user_approval: false, risk: "medium",
      input_schema: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] } },
    { id: "request_refund", name: "request_refund", display_name: "Request a refund", description: "Request a refund on one of your orders. High-risk: requires explicit approval.", method: "POST", endpoint: "/ai2w/actions/request-refund", requires_auth: true, requires_user_approval: true, risk: "high",
      input_schema: { type: "object", properties: { order_id: { type: "string" }, reason: { type: "string" } }, required: ["order_id"] } },
  ] as Action[],
  events: { endpoint: "/ai2w/events", delivery: ["webhook", "poll"], types: ["order.shipped", "order.delivered", "return.approved", "refund.processed"] },
  agent_service: { enabled: true, endpoint: "/ai2w/agent", supported_intents: ["track_order", "request_refund", "handoff_to_human"] },
  rate_limits: { default: "60/min" },
  contact: { support: "support@ai2web.dev", security: "security@ai2web.dev" },
} as const;

// Read-only public module data (discovery is public).
export function moduleData(name: string): unknown | undefined {
  if (name === "products") return [{ id: "ADI-CF-12", sku: "ADI-CF-12", title: "Cloudfoam Move Sock", price: "20.00", currency: "GBP", availability: "in_stock" }];
  if (name === "content") return [{ id: 1, type: "page", title: "About", url: "/about" }];
  return undefined;
}

// Action backend, SCOPED TO THE AUTHENTICATED USER. A real store checks the user's scopes
// and queries their orders. Here it just echoes the userId to prove the request runs as them.
export async function backend(user: { userId: string; scopes: string[] }, actionId: string, input: Record<string, unknown>): Promise<unknown> {
  const need = (scope: string) => {
    if (!user.scopes.includes(scope)) return { error: "insufficient_scope", required: scope };
    return null;
  };
  switch (actionId) {
    case "check_stock": return { sku: input.sku, available: true, price: "20.00", currency: "GBP" };
    case "list_orders": return need("read_orders") ?? { customer: user.userId, orders: [{ order_id: "A1023", status: "in_transit", total: "20.00" }] };
    case "track_order": return need("track_delivery") ?? { customer: user.userId, order_id: input.order_id, status: "in_transit", carrier: "DPD", eta: "tomorrow 12:00" };
    case "request_refund": return need("manage_returns") ?? { customer: user.userId, refund_id: "R-9087", order_id: input.order_id, amount: "20.00", currency: "GBP", audit_ref: "aud_01H8", status: "refunded" };
    default: return { ok: true };
  }
}

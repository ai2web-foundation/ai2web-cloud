// The demo store's AI2Web capability model, plus a simulated backend.
// In a real store these handlers would talk to WooCommerce / an order system.
import type { Action } from "./types.js";

export const MANIFEST = {
  protocol: "ai2w",
  version: "0.1",
  site: { name: "Example Store", url: "https://ai2web-demo-store.workers.dev", type: "ecommerce", description: "AI2Web demo store.", languages: ["en-GB"] },
  identity: { legal_name: "Example Store Ltd", privacy_policy: "https://ai2web.dev/" },
  capabilities: {
    content: { enabled: true, endpoint: "/ai2w/content" },
    commerce: { enabled: true, endpoint: "/ai2w/products", checkout: true, returns: true },
    support: { enabled: true, endpoint: "/ai2w/support", order_tracking: true, returns: true, refunds: true, issue_report: true, human_handoff: true },
    search: { enabled: true, endpoint: "/ai2w/search" },
    actions: { enabled: true, endpoint: "/ai2w/actions" },
    events: { enabled: true, endpoint: "/ai2w/events" },
  },
  transports: {
    rest: { enabled: true, base: "/ai2w" },
    mcp: { enabled: true, endpoint: "/ai2w/mcp" },
    acp: { enabled: false, endpoint: "/ai2w/acp" },
  },
  auth: { methods: ["none"] },
  consent: { requires_user_approval_for: ["purchase", "payment", "refund", "return", "cancellation"] },
  actions: [
    { id: "check_stock", name: "check_stock", display_name: "Check stock", description: "Check product availability by SKU, size and colour.", method: "POST", endpoint: "/ai2w/actions/check-stock", requires_auth: false, requires_user_approval: false, risk: "low",
      input_schema: { type: "object", properties: { sku: { type: "string" }, size: { type: "string" }, colour: { type: "string" } }, required: ["sku"] } },
    { id: "track_order", name: "track_order", display_name: "Track order", description: "Track the delivery status of an order.", method: "POST", endpoint: "/ai2w/actions/track-order", requires_auth: true, requires_user_approval: false, risk: "medium",
      input_schema: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] } },
    { id: "report_issue", name: "report_issue", display_name: "Report an issue", description: "Report a problem with an order (e.g. a damaged item), with optional photo evidence.", method: "POST", endpoint: "/ai2w/actions/report-issue", requires_auth: true, requires_user_approval: false, risk: "low",
      input_schema: { type: "object", properties: { order_id: { type: "string" }, description: { type: "string" }, evidence: { type: "array", items: { type: "object", properties: { type: { type: "string" }, url: { type: "string" } } } } }, required: ["order_id", "description"] } },
    { id: "start_return", name: "start_return", display_name: "Start a return", description: "Initiate a return and receive a return label / RMA.", method: "POST", endpoint: "/ai2w/actions/start-return", requires_auth: true, requires_user_approval: true, risk: "medium",
      input_schema: { type: "object", properties: { order_id: { type: "string" }, reason: { type: "string" } }, required: ["order_id", "reason"] } },
    { id: "request_refund", name: "request_refund", display_name: "Request a refund", description: "Request a refund for an order. High-risk: requires explicit user approval.", method: "POST", endpoint: "/ai2w/actions/request-refund", requires_auth: true, requires_user_approval: true, risk: "high",
      input_schema: { type: "object", properties: { order_id: { type: "string" }, reason: { type: "string" } }, required: ["order_id"] } },
    { id: "check_return_status", name: "check_return_status", display_name: "Check return status", description: "Check the status of an existing return or refund.", method: "POST", endpoint: "/ai2w/actions/check-return-status", requires_auth: true, requires_user_approval: false, risk: "low",
      input_schema: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] } },
  ] as Action[],
  events: { endpoint: "/ai2w/events", delivery: ["webhook", "poll"], types: ["order.shipped", "order.delivered", "return.requested", "return.approved", "refund.processed", "price.drop"] },
  agent_service: { enabled: true, endpoint: "/ai2w/agent", supported_intents: ["product_question", "check_stock", "track_order", "report_issue", "start_return", "request_refund", "handoff_to_human"] },
  contact: { support: "support@ai2web.dev" },
} as const;

// Simulated read-only module data.
export function moduleData(name: string): unknown | undefined {
  switch (name) {
    case "content": return [{ id: 1, type: "page", title: "About Example Store", url: "/about" }];
    case "products": return [
      { id: "ADI-CF-12", sku: "ADI-CF-12", title: "Cloudfoam Move Sock", price: "20.00", currency: "GBP", availability: "in_stock", categories: ["shoes"] },
      { id: "ADI-UB-9", sku: "ADI-UB-9", title: "Ultraboost", price: "150.00", currency: "GBP", availability: "in_stock", categories: ["shoes"] },
    ];
    case "events": return { types: MANIFEST.events.types };
    default: return undefined;
  }
}

// Simulated action backend. A real store would authorise the user and hit its order system.
export async function backend(actionId: string, input: Record<string, unknown>): Promise<unknown> {
  switch (actionId) {
    case "check_stock": return { sku: input.sku, available: true, price: "20.00", currency: "GBP", delivery: "2-4 working days" };
    case "track_order": return { order_id: input.order_id, status: "in_transit", carrier: "DPD", eta: "tomorrow 12:00", last_event: "Out for delivery" };
    case "report_issue": return { ticket: "T-5521", order_id: input.order_id, received_evidence: Array.isArray(input.evidence) ? input.evidence.length : 0, status: "logged" };
    case "start_return": return { return_id: "RMA-4410", order_id: input.order_id, label_url: "https://ai2web-demo-store.workers.dev/labels/RMA-4410.pdf", status: "return_started" };
    case "request_refund": return { refund_id: "R-9087", order_id: input.order_id, amount: "20.00", currency: "GBP", method: "original payment", audit_ref: "aud_01H8", status: "refunded" };
    case "check_return_status": return { order_id: input.order_id, return_id: "RMA-4410", status: "in_transit_to_warehouse" };
    default: return { ok: true };
  }
}

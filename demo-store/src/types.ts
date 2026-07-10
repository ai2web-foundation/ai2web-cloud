export interface Env {
  STORE_MCP: DurableObjectNamespace;
}

export interface Action {
  id: string;
  name: string;
  display_name?: string;
  description: string;
  method: string;
  endpoint: string;
  requires_auth: boolean;
  requires_user_approval: boolean;
  risk: "low" | "medium" | "high";
  input_schema: Record<string, unknown>;
}

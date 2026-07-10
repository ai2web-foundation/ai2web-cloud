import { z } from "zod";

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

// Minimal JSON Schema -> Zod raw shape for MCP tool input schemas.
type JsonSchema = { type?: string; properties?: Record<string, JsonSchema>; items?: JsonSchema; required?: string[]; enum?: string[]; description?: string };

function toZod(s: JsonSchema | undefined): z.ZodTypeAny {
  if (!s || typeof s !== "object") return z.any();
  if (Array.isArray(s.enum) && s.enum.length) return z.enum(s.enum as [string, ...string[]]);
  switch (s.type) {
    case "string": return z.string();
    case "number": case "integer": return z.number();
    case "boolean": return z.boolean();
    case "array": return z.array(toZod(s.items));
    case "object": return z.object(shapeFrom(s)).passthrough();
    default: return z.any();
  }
}
function shapeFrom(s: JsonSchema): z.ZodRawShape {
  const props = s.properties ?? {};
  const required = new Set(s.required ?? []);
  const shape: z.ZodRawShape = {};
  for (const [k, sub] of Object.entries(props)) {
    let f = toZod(sub);
    if (sub?.description) f = f.describe(sub.description);
    shape[k] = required.has(k) ? f : f.optional();
  }
  return shape;
}
export function inputShape(inputSchema: Record<string, unknown>): z.ZodRawShape {
  return shapeFrom(inputSchema as JsonSchema);
}

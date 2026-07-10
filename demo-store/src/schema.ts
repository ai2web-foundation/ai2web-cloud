// Minimal JSON Schema -> Zod raw shape, covering the types used in AI2Web action
// input schemas (string, number, boolean, array, object). Good enough to give MCP
// clients a real parameter schema; a full converter is future work.
import { z } from "zod";

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: string[];
  description?: string;
};

function toZod(s: JsonSchema | undefined): z.ZodTypeAny {
  if (!s || typeof s !== "object") return z.any();
  if (Array.isArray(s.enum) && s.enum.length) return z.enum(s.enum as [string, ...string[]]);
  switch (s.type) {
    case "string": return z.string();
    case "number":
    case "integer": return z.number();
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
  for (const [key, sub] of Object.entries(props)) {
    let field = toZod(sub);
    if (sub?.description) field = field.describe(sub.description);
    shape[key] = required.has(key) ? field : field.optional();
  }
  return shape;
}

/** Build a Zod raw shape (for McpServer.registerTool inputSchema) from an action's input_schema. */
export function inputShape(inputSchema: Record<string, unknown>): z.ZodRawShape {
  return shapeFrom(inputSchema as JsonSchema);
}

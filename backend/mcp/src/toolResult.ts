import { AppError } from "@notar-ai/core";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Wraps a successful tool result as the single JSON text block MCP expects. */
export function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/**
 * Wraps a core error (AppError or otherwise) as an MCP tool error. `core`
 * remains the single source of truth for what's an error and why — this only
 * translates it to the MCP transport's error shape (mirrors
 * `backend/api/src/middleware/errorHandler.ts` for the REST transport).
 */
export function fail(err: unknown): CallToolResult {
  if (err instanceof AppError) {
    return { content: [{ type: "text", text: `${err.code}: ${err.message}` }], isError: true };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text: `internal_error: ${message}` }], isError: true };
}

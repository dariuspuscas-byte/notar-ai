#!/usr/bin/env node
/**
 * MCP server adapter (spec §1.1/§7). Registers the tools from spec §7, each a
 * thin wrapper over the exact same `core` use-case functions the REST API
 * calls — no new business logic here (spec §7's implementation note). stdio
 * transport, launched on-demand by an MCP client (spec §1.2/§6).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  listActTypes,
  getChecklist,
  createCase,
  getCaseStatus,
  recomputeCaseStatus,
  setChecklistOverride,
  classifyDocument,
  reviewClassification,
  uploadDocumentAndClassify,
  AppError,
  type ReviewDecisionInput,
} from "@notar-ai/core";
import { ok, fail } from "./toolResult.js";

const CONFIDENCE_POLICY_NOTE =
  "Documents are classified against the case's act-type checklist by a local vision model. " +
  "High-confidence matches are accepted automatically (document status classified_auto). " +
  "Low-confidence or unrecognized documents are marked needs_review and are NOT counted as received " +
  "until a human calls review_document to confirm, reassign, or reject them. " +
  "If the classifier is unreachable the document stays pending_classification — nothing is ever guessed.";

const EXTENSION_MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

function guessMimeType(filename: string): string {
  return EXTENSION_MIME_TYPES[path.extname(filename).toLowerCase()] ?? "application/octet-stream";
}

const server = new McpServer({ name: "notar-ai", version: "0.1.0" });

server.registerTool(
  "list_act_types",
  {
    title: "List act types",
    description: "Lists the legal act types this office handles (e.g. sale-purchase, succession), each with its checklist id.",
    inputSchema: {},
  },
  async () => {
    try {
      const items = await listActTypes();
      return ok({ act_types: items.map((a) => ({ id: a.id, code: a.code, name_ro: a.name_ro })) });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "get_checklist",
  {
    title: "Get required-document checklist for an act type",
    description: "Lists the required document types for a given act type (its checklist template), not tied to any specific case.",
    inputSchema: { act_type_id: z.string().describe("Act type id, from list_act_types") },
  },
  async ({ act_type_id }) => {
    try {
      const items = await getChecklist(act_type_id);
      return ok({ items: items.map((i) => ({ id: i.id, code: i.code, name_ro: i.name_ro, is_mandatory: i.is_mandatory })) });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "create_case",
  {
    title: "Create a case",
    description: "Creates a new case (dossier) for one client and one legal act type. The case starts with every mandatory document missing.",
    inputSchema: {
      act_type_id: z.string().describe("Act type id, from list_act_types"),
      client_name: z.string().describe("Client's full name"),
      notes: z.string().optional(),
    },
  },
  async ({ act_type_id, client_name, notes }) => {
    try {
      const created = await createCase({ act_type_id, client_name, notes });
      return ok({ case: created });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "upload_document",
  {
    title: "Upload a document to a case",
    description:
      "Uploads one document (photo, scan, or PDF) to a case and classifies it against that case's checklist. " +
      CONFIDENCE_POLICY_NOTE +
      " Provide exactly one of file_path (a path readable by this MCP server process) or file_base64.",
    inputSchema: {
      case_id: z.string(),
      file_path: z.string().optional().describe("Path readable by the MCP server process"),
      file_base64: z.string().optional().describe("Base64-encoded file bytes, for clients with no shared local filesystem"),
      original_filename: z.string().optional(),
    },
  },
  async ({ case_id, file_path, file_base64, original_filename }) => {
    try {
      if (!file_path && !file_base64) {
        throw AppError.badRequest("missing_file_input", "Provide either file_path or file_base64");
      }
      if (file_path && file_base64) {
        throw AppError.badRequest("ambiguous_file_input", "Provide only one of file_path or file_base64, not both");
      }
      const buffer = file_path ? await readFile(file_path) : Buffer.from(file_base64 as string, "base64");
      const filename = original_filename ?? (file_path ? path.basename(file_path) : "upload");
      const result = await uploadDocumentAndClassify({
        case_id,
        buffer,
        original_filename: filename,
        mime_type: guessMimeType(filename),
      });
      return ok({
        document: result.document,
        classification_result: result.classification_result,
        ...(result.classification_error ? { classification_error: result.classification_error } : {}),
      });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "classify_document",
  {
    title: "(Re)classify a document",
    description:
      "Retries classification for a document already uploaded to a case (e.g. after a prior failure, or after editing the checklist's classification hints). " +
      CONFIDENCE_POLICY_NOTE,
    inputSchema: { document_id: z.string() },
  },
  async ({ document_id }) => {
    try {
      const result = await classifyDocument(document_id);
      return ok({
        document: result.document,
        classification_result: result.classification_result,
        ...(result.classification_error ? { classification_error: result.classification_error } : {}),
      });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "review_document",
  {
    title: "Review a classified document",
    description:
      "Resolves a document's classification: confirm accepts the model's current match, reassign overrides it to a specific required document type, reject marks the document unusable. " +
      "This is the required human step for any document sitting at needs_review — nothing reaches ready_to_sign without it.",
    inputSchema: {
      document_id: z.string(),
      decision: z.enum(["confirm", "reassign", "reject"]),
      required_document_type_id: z.string().optional().describe("Required for decision 'reassign'"),
      note: z.string().optional().describe("Used for decision 'reject'"),
      reviewed_by: z.string().optional().describe("Identifies who is making this review decision, for the audit trail"),
    },
  },
  async ({ document_id, decision, required_document_type_id, note, reviewed_by }) => {
    try {
      let input: ReviewDecisionInput;
      if (decision === "confirm") {
        input = { decision: "confirm" };
      } else if (decision === "reassign") {
        if (!required_document_type_id) {
          throw AppError.badRequest("missing_required_document_type_id", "required_document_type_id is required for decision 'reassign'");
        }
        input = { decision: "reassign", required_document_type_id };
      } else {
        input = { decision: "reject", note };
      }
      const document = await reviewClassification(document_id, input, reviewed_by ?? null);
      return ok({ document });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "override_checklist_item",
  {
    title: "Manually override a checklist item",
    description:
      "Manually sets a checklist item's status for a case (received/missing/not_applicable), overriding any classification result. " +
      "Use this for documents that will never have a digital scan, or to mark an item not applicable to this case (e.g. no mortgage, no marriage certificate needed).",
    inputSchema: {
      case_id: z.string(),
      required_document_type_id: z.string(),
      override_status: z.enum(["received", "missing", "not_applicable"]),
      note: z.string().optional(),
    },
  },
  async ({ case_id, required_document_type_id, override_status, note }) => {
    try {
      const result = await setChecklistOverride({ case_id, required_document_type_id, override_status, note });
      return ok({ override: result });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "get_case_status",
  {
    title: "Get a case's checklist status",
    description:
      "Returns the case's overall status (ready_to_sign / missing_documents / pending_review), the per-item checklist detail, and which mandatory items are still missing or awaiting human review.",
    inputSchema: { case_id: z.string() },
  },
  async ({ case_id }) => {
    try {
      return ok(await getCaseStatus(case_id));
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "validate_case",
  {
    title: "Recompute and validate a case's status",
    description: "Forces recomputation of a case's checklist status (same response shape as get_case_status) and persists it as the case's current status.",
    inputSchema: { case_id: z.string() },
  },
  async ({ case_id }) => {
    try {
      return ok(await recomputeCaseStatus(case_id));
    } catch (err) {
      return fail(err);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // eslint-disable-next-line no-console
  console.error("notar-ai MCP server running on stdio");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal error starting notar-ai MCP server:", err);
  process.exit(1);
});

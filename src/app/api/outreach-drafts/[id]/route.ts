import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/lib/auth/session";
import { getDraft, getLead, transitionDraft, updateDraftBody } from "@/lib/db/repos";
import {
  jsonError,
  jsonOk,
  parseJson,
  withErrorHandling,
} from "../../_lib/response";
import { outreachStatusSchema } from "../../_lib/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_req, ctx) => {
  const { params } = ctx as RouteContext;
  const { id } = await params;
  const owner = await requireOwner();
  const db = await getDb();
  const draft = await getDraft(db, owner.id, id);
  if (!draft) {
    return jsonError(404, { code: "not_found", message: "Draft not found." });
  }
  return jsonOk(draft);
});

const patchSchema = z.object({
  subject: z.string().trim().max(200).optional().nullable(),
  body: z.string().trim().min(1).max(10_000).optional(),
  personalizationEvidence: z
    .array(z.string().trim().max(400))
    .max(20)
    .optional(),
  status: outreachStatusSchema.optional(),
});

/**
 * PATCH /api/outreach-drafts/:id
 *
 * Two kinds of update:
 *   - Content edit (subject/body/evidence) — simple column update.
 *   - Status transition (needs_review → approved → contacted → replied/archived)
 *     — routed through `transitionDraft` which stamps the matching timestamp.
 *
 * Guardrail: a lead with `do_not_contact = true` cannot transition a draft out
 * of `draft`/`needs_review` into `approved`/`contacted`. Spec §15 says the
 * suppression flag blocks new drafts; this is the live-draft counterpart.
 */
export const PATCH = withErrorHandling(async (req, ctx) => {
  const { params } = ctx as RouteContext;
  const { id } = await params;
  const owner = await requireOwner();
  const db = await getDb();
  const parsed = await parseJson(req, patchSchema);
  if (parsed instanceof Response) return parsed;

  const existing = await getDraft(db, owner.id, id);
  if (!existing) {
    return jsonError(404, { code: "not_found", message: "Draft not found." });
  }

  if (
    parsed.status &&
    (parsed.status === "approved" || parsed.status === "contacted")
  ) {
    const lead = await getLead(db, owner.id, existing.leadId);
    if (lead?.doNotContact.flagged) {
      return jsonError(409, {
        code: "do_not_contact",
        message:
          "This lead is marked do-not-contact. Approve or contact actions are blocked.",
      });
    }
  }

  const contentChanged =
    parsed.subject !== undefined ||
    parsed.body !== undefined ||
    parsed.personalizationEvidence !== undefined;

  if (contentChanged) {
    await updateDraftBody(db, owner.id, id, {
      subject: parsed.subject ?? undefined,
      body: parsed.body,
      personalizationEvidence: parsed.personalizationEvidence,
    });
  }

  if (parsed.status && parsed.status !== existing.status) {
    const next = await transitionDraft(db, owner.id, id, parsed.status);
    return jsonOk(next);
  }

  const after = await getDraft(db, owner.id, id);
  return jsonOk(after);
});

import { ZodError, type ZodType } from "zod";
import { UnauthenticatedError } from "@/lib/auth/session";

/**
 * Consistent response envelope for all `/api/*` routes.
 *
 * Error shape:
 *   { error: { code: string, message: string, details?: unknown } }
 *
 * Success is returned as the resource JSON directly (no envelope). Lists are
 * returned as `{ items: T[], total?: number }` so pagination can be layered on
 * later without breaking the contract.
 */

export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

function errorBody(err: ApiError): string {
  return JSON.stringify({ error: err });
}

export function jsonError(status: number, err: ApiError): Response {
  return new Response(errorBody(err), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function jsonOk<T>(body: T, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

export function jsonCreated<T>(body: T): Response {
  return jsonOk(body, { status: 201 });
}

/**
 * Parse a request body as JSON and validate it with the given Zod schema.
 * On failure returns a 400 Response that the handler should return directly;
 * the type signature forces callers to narrow with `instanceof Response`.
 */
export async function parseJson<T>(
  req: Request,
  schema: ZodType<T>
): Promise<T | Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(400, {
      code: "invalid_json",
      message: "Request body is not valid JSON.",
    });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(400, {
      code: "validation_failed",
      message: "Request body failed validation.",
      details: parsed.error.flatten(),
    });
  }
  return parsed.data;
}

/**
 * Wrap a route handler so that `UnauthenticatedError` and Zod errors become
 * well-formed error responses. Also catches thrown Response objects (from
 * `requireOwner`) and returns them as-is.
 */
export function withErrorHandling(
  handler: (req: Request, ctx: unknown) => Promise<Response>
): (req: Request, ctx: unknown) => Promise<Response> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof Response) return err;
      if (err instanceof UnauthenticatedError) {
        return jsonError(401, { code: "unauthorized", message: err.message });
      }
      if (err instanceof ZodError) {
        return jsonError(400, {
          code: "validation_failed",
          message: "Request failed validation.",
          details: err.flatten(),
        });
      }
      // eslint-disable-next-line no-console
      console.error("api error", err);
      return jsonError(500, {
        code: "internal_error",
        message: "Something went wrong processing this request.",
      });
    }
  };
}

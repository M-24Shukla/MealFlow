import { HTTPException } from "hono/http-exception";
import type { ZodType } from "zod";

export async function readJson<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  const body = await request.json().catch(() => {
    throw new HTTPException(400, {
      message: "A JSON request body is required.",
    });
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: parsed.error.issues[0]?.message ?? "Invalid request body.",
    });
  }
  return parsed.data;
}

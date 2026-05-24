import { createReservation } from "@/lib/inventory";
import { withIdempotency, hashRequestBody } from "@/lib/idempotency";
import { getIdempotencyKey, jsonResponse } from "@/lib/api";
import { reserveSchema } from "@/lib/validations";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({
      status: 400,
      body: { error: "Invalid JSON body" },
    });
  }

  const parsed = reserveSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({
      status: 400,
      body: { error: "Validation failed", details: parsed.error.flatten() },
    });
  }

  const idempotencyKey = getIdempotencyKey(request);
  const requestHash = hashRequestBody(parsed.data);

  const result = await withIdempotency(
    idempotencyKey,
    "reserve",
    requestHash,
    async () => {
      const outcome = await createReservation(
        parsed.data,
        idempotencyKey ?? undefined
      );

      if (!outcome.ok) {
        return {
          status: outcome.status,
          body: { error: outcome.message },
        };
      }

      return {
        status: 201,
        body: { reservation: outcome.reservation },
      };
    }
  );

  return jsonResponse(result);
}

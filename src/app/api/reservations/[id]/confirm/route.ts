import { confirmReservation } from "@/lib/inventory";
import { withIdempotency } from "@/lib/idempotency";
import { getIdempotencyKey, jsonResponse } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const idempotencyKey = getIdempotencyKey(request);

    const result = await withIdempotency(
      idempotencyKey,
      `confirm:${id}`,
      undefined,
      async () => {
        const outcome = await confirmReservation(id);

        if (!outcome.ok) {
          return {
            status: outcome.status,
            body: { error: outcome.message },
          };
        }

        return {
          status: 200,
          body: { reservation: outcome.reservation },
        };
      }
    );

    return jsonResponse(result);
  } catch (error) {
    console.error("POST /api/reservations/[id]/confirm", error);
    return jsonResponse({
      status: 500,
      body: { error: "Failed to confirm reservation" },
    });
  }
}

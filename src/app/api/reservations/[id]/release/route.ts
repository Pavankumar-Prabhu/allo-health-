import { releaseReservation } from "@/lib/inventory";
import { jsonResponse } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const outcome = await releaseReservation(id, { reason: "cancelled" });

  if (!outcome.ok) {
    return jsonResponse({
      status: outcome.status,
      body: { error: outcome.message },
    });
  }

  return jsonResponse({
    status: 200,
    body: { reservation: outcome.reservation },
  });
}

import { expireStaleReservations } from "@/lib/inventory";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const expected = `Bearer ${cronSecret}`;
    if (authHeader !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const released = await expireStaleReservations();
    return NextResponse.json({ ok: true, released });
  } catch (error) {
    console.error("Cron expire-reservations", error);
    return NextResponse.json(
      { error: "Failed to expire reservations" },
      { status: 500 }
    );
  }
}

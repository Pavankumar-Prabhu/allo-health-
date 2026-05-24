import { NextResponse } from "next/server";
import type { HandlerResult } from "@/lib/idempotency";

export function jsonResponse(result: HandlerResult) {
  return NextResponse.json(result.body, { status: result.status });
}

export function getIdempotencyKey(request: Request): string | null {
  return request.headers.get("Idempotency-Key");
}

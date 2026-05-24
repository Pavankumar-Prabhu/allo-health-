import type { Product, Reservation } from "@/types/api";

async function parseJsonResponse(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: "Invalid server response" };
  }
}

function idempotencyKey(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}`;
}

export async function fetchProducts(): Promise<Product[]> {
  const res = await fetch("/api/products", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load products");
  const data = await parseJsonResponse(res);
  return data.products as Product[];
}

export async function reserveStock(input: {
  productId: string;
  warehouseId: string;
  quantity: number;
}): Promise<{ reservation?: Reservation; error?: string; status: number }> {
  const res = await fetch("/api/reservations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey("reserve"),
    },
    body: JSON.stringify(input),
  });

  const data = await parseJsonResponse(res);
  if (!res.ok) {
    return {
      status: res.status,
      error: String(data.error ?? "Request failed"),
    };
  }
  return { status: res.status, reservation: data.reservation as Reservation };
}

export async function fetchReservation(
  id: string
): Promise<Reservation | null> {
  const res = await fetch(`/api/reservations/${id}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load reservation");
  const data = await parseJsonResponse(res);
  return data.reservation as Reservation;
}

export async function confirmReservation(
  id: string
): Promise<{ reservation?: Reservation; error?: string; status: number }> {
  const res = await fetch(`/api/reservations/${id}/confirm`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey("confirm") },
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    return {
      status: res.status,
      error: String(data.error ?? "Confirm failed"),
    };
  }
  return { status: res.status, reservation: data.reservation as Reservation };
}

export async function releaseReservation(
  id: string
): Promise<{ reservation?: Reservation; error?: string; status: number }> {
  const res = await fetch(`/api/reservations/${id}/release`, {
    method: "POST",
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    return {
      status: res.status,
      error: String(data.error ?? "Release failed"),
    };
  }
  return { status: res.status, reservation: data.reservation as Reservation };
}

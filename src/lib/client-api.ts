import type { Product, Reservation } from "@/types/api";

function idempotencyKey(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}`;
}

export async function fetchProducts(): Promise<Product[]> {
  const res = await fetch("/api/products", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load products");
  const data = await res.json();
  return data.products;
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

  const data = await res.json();
  if (!res.ok) {
    return { status: res.status, error: data.error ?? "Request failed" };
  }
  return { status: res.status, reservation: data.reservation };
}

export async function fetchReservation(
  id: string
): Promise<Reservation | null> {
  const res = await fetch(`/api/reservations/${id}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load reservation");
  const data = await res.json();
  return data.reservation;
}

export async function confirmReservation(
  id: string
): Promise<{ reservation?: Reservation; error?: string; status: number }> {
  const res = await fetch(`/api/reservations/${id}/confirm`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey("confirm") },
  });
  const data = await res.json();
  if (!res.ok) {
    return { status: res.status, error: data.error ?? "Confirm failed" };
  }
  return { status: res.status, reservation: data.reservation };
}

export async function releaseReservation(
  id: string
): Promise<{ reservation?: Reservation; error?: string; status: number }> {
  const res = await fetch(`/api/reservations/${id}/release`, {
    method: "POST",
  });
  const data = await res.json();
  if (!res.ok) {
    return { status: res.status, error: data.error ?? "Release failed" };
  }
  return { status: res.status, reservation: data.reservation };
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  confirmReservation,
  fetchReservation,
  releaseReservation,
} from "@/lib/client-api";
import { formatPrice } from "@/lib/utils";
import type { Reservation } from "@/types/api";

function useCountdown(expiresAt: string | null, active: boolean) {
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    if (!expiresAt || !active) return;

    const tick = () => {
      setRemainingMs(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [expiresAt, active]);

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return {
    remainingMs,
    label: `${minutes}:${seconds.toString().padStart(2, "0")}`,
    expired: remainingMs <= 0,
  };
}

export function CheckoutPanel({ reservationId }: { reservationId: string }) {
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchReservation(reservationId);
      setReservation(data);
    } catch {
      setReservation(null);
    } finally {
      setLoading(false);
    }
  }, [reservationId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, [load]);

  const pending = reservation?.status === "PENDING";
  const { label, expired } = useCountdown(
    reservation?.expiresAt ?? null,
    Boolean(pending)
  );

  async function handleConfirm() {
    setBusy(true);
    setActionError(null);
    setActionStatus(null);

    const result = await confirmReservation(reservationId);
    setBusy(false);
    setActionStatus(result.status);

    if (result.status === 410) {
      setActionError(
        result.error ??
          "410 — This reservation expired. Stock has been released for other shoppers."
      );
      await load();
      return;
    }

    if (!result.reservation) {
      setActionError(result.error ?? "Payment could not be confirmed");
      return;
    }

    setReservation(result.reservation);
  }

  async function handleCancel() {
    setBusy(true);
    setActionError(null);
    setActionStatus(null);

    const result = await releaseReservation(reservationId);
    setBusy(false);
    setActionStatus(result.status);

    if (!result.reservation) {
      setActionError(result.error ?? "Could not cancel reservation");
      return;
    }

    setReservation(result.reservation);
  }

  if (loading) {
    return (
      <p className="text-center text-slate-500 py-16">Loading checkout…</p>
    );
  }

  if (!reservation) {
    return (
      <Alert variant="destructive">
        Reservation not found.{" "}
        <Link href="/" className="underline font-medium">
          Back to products
        </Link>
      </Alert>
    );
  }

  const lineTotal =
    (reservation.product?.priceCents ?? 0) * reservation.quantity;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Checkout</CardTitle>
            <StatusBadge status={reservation.status} />
          </div>
          <CardDescription>
            Complete payment before the hold expires — units are reserved only for
            you during this window.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-4 space-y-2 text-sm">
            <p>
              <span className="text-slate-500">Product</span>{" "}
              <span className="font-medium">{reservation.product?.name}</span>
            </p>
            <p>
              <span className="text-slate-500">Warehouse</span>{" "}
              <span className="font-medium">
                {reservation.warehouse?.name} ({reservation.warehouse?.code})
              </span>
            </p>
            <p>
              <span className="text-slate-500">Quantity</span>{" "}
              <span className="font-medium">{reservation.quantity}</span>
            </p>
            <p>
              <span className="text-slate-500">Total</span>{" "}
              <span className="font-semibold text-emerald-700">
                {formatPrice(lineTotal)}
              </span>
            </p>
          </div>

          {pending && (
            <div
              className={`rounded-lg border p-4 text-center ${
                expired
                  ? "border-amber-300 bg-amber-50"
                  : "border-emerald-200 bg-emerald-50"
              }`}
            >
              <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                Hold expires in
              </p>
              <p
                className={`text-4xl font-mono font-bold tabular-nums ${
                  expired ? "text-amber-700" : "text-emerald-700"
                }`}
              >
                {label}
              </p>
              {expired && (
                <p className="text-sm text-amber-800 mt-2">
                  Timer elapsed — confirm may return 410 until cron or cleanup
                  runs.
                </p>
              )}
            </div>
          )}

          {actionError && (
            <Alert
              variant={
                actionStatus === 410 || actionStatus === 409
                  ? "warning"
                  : "destructive"
              }
            >
              {actionStatus === 410 && (
                <strong className="block mb-1">410 — Reservation expired</strong>
              )}
              {actionStatus === 409 && (
                <strong className="block mb-1">409 — Conflict</strong>
              )}
              {actionError}
            </Alert>
          )}

          {reservation.status === "CONFIRMED" && (
            <Alert>
              Purchase confirmed. Stock has been permanently decremented.
            </Alert>
          )}

          {reservation.status === "RELEASED" && (
            <Alert variant="warning">
              Reservation released — units are available again for other shoppers.
            </Alert>
          )}

          <div className="flex flex-wrap gap-3">
            {pending && (
              <>
                <Button onClick={handleConfirm} disabled={busy}>
                  Confirm purchase
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={busy}
                >
                  Cancel
                </Button>
              </>
            )}
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Back to catalog
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: Reservation["status"] }) {
  if (status === "PENDING") return <Badge variant="warning">Pending</Badge>;
  if (status === "CONFIRMED") return <Badge>Confirmed</Badge>;
  return <Badge variant="secondary">Released</Badge>;
}

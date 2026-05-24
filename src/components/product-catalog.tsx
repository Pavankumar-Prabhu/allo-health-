"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { fetchProducts, reserveStock } from "@/lib/client-api";
import { formatPrice } from "@/lib/utils";
import type { Product } from "@/types/api";

export function ProductCatalog() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reserveError, setReserveError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchProducts();
      setProducts(data);
    } catch {
      setError("Could not load products. Check your database connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleReserve(
    productId: string,
    warehouseId: string,
    available: number
  ) {
    if (available < 1) return;

    const key = `${productId}:${warehouseId}`;
    setBusyKey(key);
    setReserveError(null);

    const result = await reserveStock({
      productId,
      warehouseId,
      quantity: 1,
    });

    setBusyKey(null);

    if (result.status === 409) {
      setReserveError(
        result.error ??
          "Not enough stock — another shopper may have taken the last unit."
      );
      await load();
      return;
    }

    if (!result.reservation) {
      setReserveError(result.error ?? "Could not create reservation");
      return;
    }

    router.push(`/checkout/${result.reservation.id}`);
  }

  if (loading && products.length === 0) {
    return (
      <p className="text-center text-slate-500 py-16">Loading inventory…</p>
    );
  }

  return (
    <div className="space-y-6">
      {error && <Alert variant="destructive">{error}</Alert>}
      {reserveError && (
        <Alert variant="warning">
          <strong>409 — Stock unavailable.</strong> {reserveError}
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {products.map((product) => (
          <Card key={product.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{product.name}</CardTitle>
                  <CardDescription className="mt-1">
                    SKU {product.sku} · {formatPrice(product.priceCents)}
                  </CardDescription>
                </div>
                <Badge variant="secondary">{product.sku}</Badge>
              </div>
              {product.description && (
                <p className="text-sm text-slate-600 mt-2">{product.description}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {product.warehouses.map((wh) => (
                <div
                  key={wh.warehouseId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-3"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      {wh.warehouseName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {wh.warehouseCode}
                      {wh.region ? ` · ${wh.region}` : ""}
                    </p>
                    <p className="text-sm mt-1">
                      <span className="text-emerald-700 font-semibold">
                        {wh.availableUnits}
                      </span>{" "}
                      available
                      <span className="text-slate-400">
                        {" "}
                        ({wh.reservedUnits} reserved of {wh.totalUnits})
                      </span>
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={
                      wh.availableUnits < 1 ||
                      busyKey === `${product.id}:${wh.warehouseId}`
                    }
                    onClick={() =>
                      handleReserve(
                        product.id,
                        wh.warehouseId,
                        wh.availableUnits
                      )
                    }
                  >
                    {wh.availableUnits < 1 ? "Out of stock" : "Reserve"}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

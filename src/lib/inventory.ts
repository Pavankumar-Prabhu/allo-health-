import { ReservationStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { RESERVATION_TTL_MS } from "@/lib/constants";
import type { ReserveInput } from "@/lib/validations";

export type ReservationDto = {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: string;
  confirmedAt: string | null;
  releasedAt: string | null;
  createdAt: string;
  product?: { id: string; name: string; sku: string; priceCents: number };
  warehouse?: { id: string; name: string; code: string };
};

function toDto(
  reservation: {
    id: string;
    productId: string;
    warehouseId: string;
    quantity: number;
    status: ReservationStatus;
    expiresAt: Date;
    confirmedAt: Date | null;
    releasedAt: Date | null;
    createdAt: Date;
    product?: { id: string; name: string; sku: string; priceCents: number };
    warehouse?: { id: string; name: string; code: string };
  }
): ReservationDto {
  return {
    id: reservation.id,
    productId: reservation.productId,
    warehouseId: reservation.warehouseId,
    quantity: reservation.quantity,
    status: reservation.status,
    expiresAt: reservation.expiresAt.toISOString(),
    confirmedAt: reservation.confirmedAt?.toISOString() ?? null,
    releasedAt: reservation.releasedAt?.toISOString() ?? null,
    createdAt: reservation.createdAt.toISOString(),
    product: reservation.product,
    warehouse: reservation.warehouse,
  };
}

export async function expireStaleReservations(): Promise<number> {
  const now = new Date();
  const stale = await prisma.reservation.findMany({
    where: {
      status: ReservationStatus.PENDING,
      expiresAt: { lt: now },
    },
    take: 200,
  });

  let released = 0;
  for (const reservation of stale) {
    const ok = await releaseReservation(reservation.id, { reason: "expired" });
    if (ok.ok) released += 1;
  }
  return released;
}

export async function createReservation(
  input: ReserveInput,
  idempotencyKey?: string | null
): Promise<
  | { ok: true; reservation: ReservationDto }
  | { ok: false; status: 409; message: string }
  | { ok: false; status: 404; message: string }
> {
  await expireStaleReservations();

  const stock = await prisma.stockLevel.findUnique({
    where: {
      productId_warehouseId: {
        productId: input.productId,
        warehouseId: input.warehouseId,
      },
    },
    include: { product: true, warehouse: true },
  });

  if (!stock) {
    return { ok: false, status: 404, message: "Product or warehouse stock not found" };
  }

  const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);

  try {
    const reservation = await prisma.$transaction(async (tx) => {
      const updated = await tx.$executeRaw`
        UPDATE stock_levels
        SET "reservedUnits" = "reservedUnits" + ${input.quantity}
        WHERE "productId" = ${input.productId}
          AND "warehouseId" = ${input.warehouseId}
          AND "totalUnits" - "reservedUnits" >= ${input.quantity}
      `;

      if (updated === 0) {
        throw new Error("INSUFFICIENT_STOCK");
      }

      return tx.reservation.create({
        data: {
          productId: input.productId,
          warehouseId: input.warehouseId,
          quantity: input.quantity,
          expiresAt,
          idempotencyKey: idempotencyKey ?? undefined,
        },
        include: {
          product: { select: { id: true, name: true, sku: true, priceCents: true } },
          warehouse: { select: { id: true, name: true, code: true } },
        },
      });
    });

    return { ok: true, reservation: toDto(reservation) };
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") {
      return {
        ok: false,
        status: 409,
        message: "Not enough stock available to reserve",
      };
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      const existing = await prisma.reservation.findUnique({
        where: { idempotencyKey: idempotencyKey! },
        include: {
          product: { select: { id: true, name: true, sku: true, priceCents: true } },
          warehouse: { select: { id: true, name: true, code: true } },
        },
      });
      if (existing) {
        return { ok: true, reservation: toDto(existing) };
      }
    }
    throw error;
  }
}

export async function getReservation(id: string): Promise<ReservationDto | null> {
  await expireStaleReservations();

  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: {
      product: { select: { id: true, name: true, sku: true, priceCents: true } },
      warehouse: { select: { id: true, name: true, code: true } },
    },
  });

  return reservation ? toDto(reservation) : null;
}

export async function confirmReservation(
  id: string
): Promise<
  | { ok: true; reservation: ReservationDto }
  | { ok: false; status: 404; message: string }
  | { ok: false; status: 409; message: string }
  | { ok: false; status: 410; message: string }
> {
  await expireStaleReservations();

  try {
    const reservation = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          productId: string;
          warehouseId: string;
          quantity: number;
          status: ReservationStatus;
          expiresAt: Date;
        }>
      >`
        SELECT id, "productId", "warehouseId", quantity, status, "expiresAt"
        FROM reservations
        WHERE id = ${id}
        FOR UPDATE
      `;

      const row = rows[0];
      if (!row) return null;

      if (row.status === ReservationStatus.CONFIRMED) {
        const full = await tx.reservation.findUnique({
          where: { id },
          include: {
            product: { select: { id: true, name: true, sku: true, priceCents: true } },
            warehouse: { select: { id: true, name: true, code: true } },
          },
        });
        return full;
      }

      if (row.status !== ReservationStatus.PENDING) {
        throw new Error("NOT_PENDING");
      }

      if (row.expiresAt < new Date()) {
        throw new Error("EXPIRED");
      }

      await tx.$executeRaw`
        UPDATE stock_levels
        SET
          "reservedUnits" = "reservedUnits" - ${row.quantity},
          "totalUnits" = "totalUnits" - ${row.quantity}
        WHERE "productId" = ${row.productId}
          AND "warehouseId" = ${row.warehouseId}
          AND "reservedUnits" >= ${row.quantity}
          AND "totalUnits" >= ${row.quantity}
      `;

      return tx.reservation.update({
        where: { id },
        data: {
          status: ReservationStatus.CONFIRMED,
          confirmedAt: new Date(),
        },
        include: {
          product: { select: { id: true, name: true, sku: true, priceCents: true } },
          warehouse: { select: { id: true, name: true, code: true } },
        },
      });
    });

    if (!reservation) {
      return { ok: false, status: 404, message: "Reservation not found" };
    }

    return { ok: true, reservation: toDto(reservation) };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "EXPIRED") {
        await releaseReservation(id, { reason: "expired" });
        return {
          ok: false,
          status: 410,
          message: "Reservation has expired and was released",
        };
      }
      if (error.message === "NOT_PENDING") {
        return {
          ok: false,
          status: 409,
          message: "Reservation is no longer pending",
        };
      }
    }
    throw error;
  }
}

export async function releaseReservation(
  id: string,
  options?: { reason?: "cancelled" | "expired" }
): Promise<
  | { ok: true; reservation: ReservationDto }
  | { ok: false; status: 404; message: string }
  | { ok: false; status: 409; message: string }
> {
  try {
    const reservation = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          productId: string;
          warehouseId: string;
          quantity: number;
          status: ReservationStatus;
        }>
      >`
        SELECT id, "productId", "warehouseId", quantity, status
        FROM reservations
        WHERE id = ${id}
        FOR UPDATE
      `;

      const row = rows[0];
      if (!row) return null;

      if (row.status === ReservationStatus.RELEASED) {
        const full = await tx.reservation.findUnique({
          where: { id },
          include: {
            product: { select: { id: true, name: true, sku: true, priceCents: true } },
            warehouse: { select: { id: true, name: true, code: true } },
          },
        });
        return full;
      }

      if (row.status === ReservationStatus.CONFIRMED) {
        throw new Error("ALREADY_CONFIRMED");
      }

      if (row.status === ReservationStatus.PENDING) {
        await tx.$executeRaw`
          UPDATE stock_levels
          SET "reservedUnits" = "reservedUnits" - ${row.quantity}
          WHERE "productId" = ${row.productId}
            AND "warehouseId" = ${row.warehouseId}
            AND "reservedUnits" >= ${row.quantity}
        `;
      }

      return tx.reservation.update({
        where: { id },
        data: {
          status: ReservationStatus.RELEASED,
          releasedAt: new Date(),
        },
        include: {
          product: { select: { id: true, name: true, sku: true, priceCents: true } },
          warehouse: { select: { id: true, name: true, code: true } },
        },
      });
    });

    if (!reservation) {
      return { ok: false, status: 404, message: "Reservation not found" };
    }

    return { ok: true, reservation: toDto(reservation) };
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY_CONFIRMED") {
      return {
        ok: false,
        status: 409,
        message: "Cannot release a confirmed reservation",
      };
    }
    throw error;
  }
}

export async function listProductsWithStock() {
  await expireStaleReservations();

  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: {
      stockLevels: {
        include: { warehouse: true },
      },
    },
  });

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    description: product.description,
    priceCents: product.priceCents,
    warehouses: product.stockLevels.map((stock) => ({
      warehouseId: stock.warehouseId,
      warehouseName: stock.warehouse.name,
      warehouseCode: stock.warehouse.code,
      region: stock.warehouse.region,
      totalUnits: stock.totalUnits,
      reservedUnits: stock.reservedUnits,
      availableUnits: stock.totalUnits - stock.reservedUnits,
    })),
  }));
}

export async function listWarehouses() {
  const warehouses = await prisma.warehouse.findMany({
    orderBy: { name: "asc" },
    include: {
      stockLevels: {
        include: { product: { select: { id: true, name: true, sku: true } } },
      },
    },
  });

  return warehouses.map((warehouse) => ({
    id: warehouse.id,
    name: warehouse.name,
    code: warehouse.code,
    region: warehouse.region,
    stock: warehouse.stockLevels.map((level) => ({
      productId: level.productId,
      productName: level.product.name,
      sku: level.product.sku,
      totalUnits: level.totalUnits,
      reservedUnits: level.reservedUnits,
      availableUnits: level.totalUnits - level.reservedUnits,
    })),
  }));
}

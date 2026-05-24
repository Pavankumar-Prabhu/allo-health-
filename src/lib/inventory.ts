import { Prisma, ReservationStatus } from "@prisma/client";
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

const reservationInclude = {
  product: { select: { id: true, name: true, sku: true, priceCents: true } },
  warehouse: { select: { id: true, name: true, code: true } },
} as const;

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

async function loadReservation(id: string) {
  return prisma.reservation.findUnique({
    where: { id },
    include: reservationInclude,
  });
}

/** Bulk expire — single SQL, no interactive transaction (PgBouncer-safe). */
export async function expireStaleReservations(): Promise<number> {
  const result = await prisma.$executeRaw`
    WITH expired AS (
      SELECT id, "productId", "warehouseId", quantity
      FROM reservations
      WHERE status = 'PENDING'::"ReservationStatus"
        AND "expiresAt" < NOW()
      LIMIT 200
    ),
    stock AS (
      UPDATE stock_levels sl
      SET "reservedUnits" = sl."reservedUnits" - e.quantity
      FROM expired e
      WHERE sl."productId" = e."productId"
        AND sl."warehouseId" = e."warehouseId"
        AND sl."reservedUnits" >= e.quantity
    ),
    released AS (
      UPDATE reservations r
      SET
        status = 'RELEASED'::"ReservationStatus",
        "releasedAt" = NOW(),
        "updatedAt" = NOW()
      FROM expired e
      WHERE r.id = e.id
    )
    SELECT 1
  `;
  return typeof result === "number" ? result : 0;
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
  });

  if (!stock) {
    return { ok: false, status: 404, message: "Product or warehouse stock not found" };
  }

  const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);

  const updated = await prisma.$executeRaw`
    UPDATE stock_levels
    SET "reservedUnits" = "reservedUnits" + ${input.quantity}
    WHERE "productId" = ${input.productId}
      AND "warehouseId" = ${input.warehouseId}
      AND "totalUnits" - "reservedUnits" >= ${input.quantity}
  `;

  if (updated === 0) {
    return {
      ok: false,
      status: 409,
      message: "Not enough stock available to reserve",
    };
  }

  try {
    const reservation = await prisma.reservation.create({
      data: {
        productId: input.productId,
        warehouseId: input.warehouseId,
        quantity: input.quantity,
        expiresAt,
        idempotencyKey: idempotencyKey ?? undefined,
      },
      include: reservationInclude,
    });

    return { ok: true, reservation: toDto(reservation) };
  } catch (error) {
    await prisma.$executeRaw`
      UPDATE stock_levels
      SET "reservedUnits" = "reservedUnits" - ${input.quantity}
      WHERE "productId" = ${input.productId}
        AND "warehouseId" = ${input.warehouseId}
        AND "reservedUnits" >= ${input.quantity}
    `;

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      idempotencyKey
    ) {
      const existing = await prisma.reservation.findUnique({
        where: { idempotencyKey },
        include: reservationInclude,
      });
      if (existing) {
        return { ok: true, reservation: toDto(existing) };
      }
    }
    throw error;
  }
}

export async function getReservation(id: string): Promise<ReservationDto | null> {
  const reservation = await loadReservation(id);
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
  const existing = await loadReservation(id);
  if (!existing) {
    return { ok: false, status: 404, message: "Reservation not found" };
  }

  if (existing.status === ReservationStatus.CONFIRMED) {
    return { ok: true, reservation: toDto(existing) };
  }

  if (existing.status !== ReservationStatus.PENDING) {
    return {
      ok: false,
      status: 409,
      message: "Reservation is no longer pending",
    };
  }

  if (existing.expiresAt < new Date()) {
    await releaseReservation(id, { reason: "expired" });
    return {
      ok: false,
      status: 410,
      message: "Reservation has expired and was released",
    };
  }

  const confirmed = await prisma.$queryRaw<
    Array<{ id: string }>
  >`
    WITH updated_res AS (
      UPDATE reservations
      SET
        status = 'CONFIRMED'::"ReservationStatus",
        "confirmedAt" = NOW(),
        "updatedAt" = NOW()
      WHERE id = ${id}
        AND status = 'PENDING'::"ReservationStatus"
        AND "expiresAt" > NOW()
      RETURNING id, "productId", "warehouseId", quantity
    ),
    updated_stock AS (
      UPDATE stock_levels sl
      SET
        "reservedUnits" = sl."reservedUnits" - ur.quantity,
        "totalUnits" = sl."totalUnits" - ur.quantity
      FROM updated_res ur
      WHERE sl."productId" = ur."productId"
        AND sl."warehouseId" = ur."warehouseId"
        AND sl."reservedUnits" >= ur.quantity
        AND sl."totalUnits" >= ur.quantity
      RETURNING sl.id
    )
    SELECT ur.id FROM updated_res ur
    INNER JOIN updated_stock us ON TRUE
  `;

  if (confirmed.length === 0) {
    const current = await loadReservation(id);
    if (!current) {
      return { ok: false, status: 404, message: "Reservation not found" };
    }
    if (current.expiresAt < new Date()) {
      await releaseReservation(id, { reason: "expired" });
      return {
        ok: false,
        status: 410,
        message: "Reservation has expired and was released",
      };
    }
    return {
      ok: false,
      status: 409,
      message: "Could not confirm reservation — stock conflict",
    };
  }

  const reservation = await loadReservation(id);
  if (!reservation) {
    return { ok: false, status: 404, message: "Reservation not found" };
  }

  return { ok: true, reservation: toDto(reservation) };
}

export async function releaseReservation(
  id: string,
  _options?: { reason?: "cancelled" | "expired" }
): Promise<
  | { ok: true; reservation: ReservationDto }
  | { ok: false; status: 404; message: string }
  | { ok: false; status: 409; message: string }
> {
  const existing = await loadReservation(id);
  if (!existing) {
    return { ok: false, status: 404, message: "Reservation not found" };
  }

  if (existing.status === ReservationStatus.RELEASED) {
    return { ok: true, reservation: toDto(existing) };
  }

  if (existing.status === ReservationStatus.CONFIRMED) {
    return {
      ok: false,
      status: 409,
      message: "Cannot release a confirmed reservation",
    };
  }

  await prisma.$executeRaw`
    WITH updated_res AS (
      UPDATE reservations
      SET
        status = 'RELEASED'::"ReservationStatus",
        "releasedAt" = NOW(),
        "updatedAt" = NOW()
      WHERE id = ${id}
        AND status = 'PENDING'::"ReservationStatus"
      RETURNING "productId", "warehouseId", quantity
    )
    UPDATE stock_levels sl
    SET "reservedUnits" = sl."reservedUnits" - ur.quantity
    FROM updated_res ur
    WHERE sl."productId" = ur."productId"
      AND sl."warehouseId" = ur."warehouseId"
      AND sl."reservedUnits" >= ur.quantity
  `;

  const reservation = await loadReservation(id);
  if (!reservation) {
    return { ok: false, status: 404, message: "Reservation not found" };
  }

  return { ok: true, reservation: toDto(reservation) };
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

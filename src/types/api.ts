export type WarehouseStock = {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  region: string | null;
  totalUnits: number;
  reservedUnits: number;
  availableUnits: number;
};

export type Product = {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  priceCents: number;
  warehouses: WarehouseStock[];
};

export type Reservation = {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: "PENDING" | "CONFIRMED" | "RELEASED";
  expiresAt: string;
  confirmedAt: string | null;
  releasedAt: string | null;
  createdAt: string;
  product?: { id: string; name: string; sku: string; priceCents: number };
  warehouse?: { id: string; name: string; code: string };
};

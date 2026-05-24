import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.idempotencyRecord.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.stockLevel.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  const mumbai = await prisma.warehouse.create({
    data: { name: "Mumbai Central", code: "BOM-01", region: "West" },
  });
  const bangalore = await prisma.warehouse.create({
    data: { name: "Bangalore Hub", code: "BLR-01", region: "South" },
  });
  const delhi = await prisma.warehouse.create({
    data: { name: "Delhi NCR", code: "DEL-01", region: "North" },
  });

  const whey = await prisma.product.create({
    data: {
      name: "Plant Protein — Chocolate",
      sku: "ALLO-WHEY-CH-1KG",
      description: "24g protein per serving, 1 kg pouch",
      priceCents: 249900,
    },
  });

  const multivitamin = await prisma.product.create({
    data: {
      name: "Daily Multivitamin",
      sku: "ALLO-MV-60",
      description: "60 capsules, one-a-day",
      priceCents: 89900,
    },
  });

  const omega = await prisma.product.create({
    data: {
      name: "Omega-3 Fish Oil",
      sku: "ALLO-OM3-90",
      description: "90 softgels, triple strength",
      priceCents: 129900,
    },
  });

  const lowStock = await prisma.product.create({
    data: {
      name: "Limited Drop — Collagen",
      sku: "ALLO-COL-300G",
      description: "Demo SKU with only 1 unit for concurrency testing",
      priceCents: 199900,
    },
  });

  await prisma.stockLevel.createMany({
    data: [
      { productId: whey.id, warehouseId: mumbai.id, totalUnits: 120, reservedUnits: 0 },
      { productId: whey.id, warehouseId: bangalore.id, totalUnits: 80, reservedUnits: 0 },
      { productId: multivitamin.id, warehouseId: mumbai.id, totalUnits: 200, reservedUnits: 0 },
      { productId: multivitamin.id, warehouseId: delhi.id, totalUnits: 150, reservedUnits: 0 },
      { productId: omega.id, warehouseId: bangalore.id, totalUnits: 60, reservedUnits: 0 },
      { productId: omega.id, warehouseId: delhi.id, totalUnits: 45, reservedUnits: 0 },
      { productId: lowStock.id, warehouseId: mumbai.id, totalUnits: 1, reservedUnits: 0 },
    ],
  });

  console.log("Seed complete: 3 warehouses, 4 products");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

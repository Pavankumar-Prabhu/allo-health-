import { listProductsWithStock } from "@/lib/inventory";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const products = await listProductsWithStock();
    return NextResponse.json({ products });
  } catch (error) {
    console.error("GET /api/products", error);
    return NextResponse.json(
      { error: "Failed to load products" },
      { status: 500 }
    );
  }
}

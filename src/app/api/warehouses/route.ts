import { listWarehouses } from "@/lib/inventory";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const warehouses = await listWarehouses();
    return NextResponse.json({ warehouses });
  } catch (error) {
    console.error("GET /api/warehouses", error);
    return NextResponse.json(
      { error: "Failed to load warehouses" },
      { status: 500 }
    );
  }
}

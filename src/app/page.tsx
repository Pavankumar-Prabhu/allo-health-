import { ProductCatalog } from "@/components/product-catalog";

export default function HomePage() {
  return (
    <main className="flex-1">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <p className="text-sm font-medium text-emerald-600 uppercase tracking-wide">
            Allo Inventory
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 tracking-tight">
            Reserve stock at checkout
          </h1>
          <p className="mt-3 max-w-2xl text-slate-600 leading-relaxed">
            Units are held for 10 minutes while payment completes. Concurrent
            shoppers compete fairly — only one wins the last unit.
          </p>
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <ProductCatalog />
      </div>
    </main>
  );
}

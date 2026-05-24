import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur sticky top-0 z-10">
      <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold text-slate-900">
          Allo<span className="text-emerald-600">Health</span>
        </Link>
        <nav className="text-sm text-slate-500">
          <Link href="/" className="hover:text-slate-900">
            Products
          </Link>
        </nav>
      </div>
    </header>
  );
}

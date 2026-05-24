/**
 * Quick concurrency check — run while `npm run dev` is up:
 * node scripts/concurrency-test.mjs <productId> <warehouseId>
 */
const [productId, warehouseId] = process.argv.slice(2);
const base = process.env.BASE_URL ?? "http://localhost:3000";

if (!productId || !warehouseId) {
  console.error("Usage: node scripts/concurrency-test.mjs <productId> <warehouseId>");
  process.exit(1);
}

const body = JSON.stringify({ productId, warehouseId, quantity: 1 });

const attempts = await Promise.all(
  Array.from({ length: 10 }, (_, i) =>
    fetch(`${base}/api/reservations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `race-test-${i}`,
      },
      body,
    }).then(async (res) => ({ status: res.status, body: await res.json() }))
  )
);

const ok = attempts.filter((a) => a.status === 201).length;
const conflict = attempts.filter((a) => a.status === 409).length;

console.log({ success: ok, conflict, results: attempts.map((a) => a.status) });

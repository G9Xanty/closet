import { config } from "dotenv";
config();

import { createClient } from "@supabase/supabase-js";

const API = "http://localhost:3000";
const UA = "Mozilla/5.0 Node.js Test";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const supabaseAnon = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

let pass = 0, fail = 0;

async function api(method, path, token, body) {
  const opts = {
    method,
    headers: {
      "User-Agent": UA,
      "X-Requested-With": "XMLHttpRequest",
    },
  };
  if (token) opts.headers["Authorization"] = `Bearer ${token}`;
  if (body != null) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function waitForServer() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`${API}/api/auth/me`, {
        headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest" },
      });
      if (r.status === 401) return; // server is up
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error("Server did not start within 30s");
}

async function main() {
  console.log("Waiting for server...");
  await waitForServer();

  const TS = Date.now();
  const SELLER = { email: `seller-${TS}@test.closet`, pass: "TestPass123!" };
  const BUYER = { email: `buyer-${TS}@test.closet`, pass: "TestPass123!" };
  const THIRD = { email: `third-${TS}@test.closet`, pass: "TestPass123!" };

  let sellerToken, buyerToken, thirdToken;
  let productA, productB, productC;

  function check(name, cond, detail) {
    if (cond) { pass++; console.log(`  \u2713 ${name}`); }
    else { fail++; console.log(`  \u2717 ${name}: ${detail || cond}`); }
  }

  /* ── Setup ── */
  console.log("\n--- Setup ---");
  for (const u of [SELLER, BUYER, THIRD]) {
    const { error } = await supabase.auth.admin.createUser({
      email: u.email, password: u.pass, email_confirm: true,
      user_metadata: {
        dealer_id: `Test#${TS}`, username: u.email.split("@")[0],
        avatar: "avatar-1", is_admin: false, banned: false,
      },
    });
    if (error) throw new Error(`Failed to create ${u.email}: ${error.message}`);
    const { data: session, error: loginErr } = await supabaseAnon.auth.signInWithPassword({
      email: u.email, password: u.pass,
    });
    if (loginErr) throw new Error(`Login failed for ${u.email}: ${loginErr.message}`);
    const token = session.session.access_token;
    if (u === SELLER) sellerToken = token;
    if (u === BUYER) buyerToken = token;
    if (u === THIRD) thirdToken = token;
    console.log(`  ${u.email} created + logged in`);
  }

  const payload = {
    name: "Test Product", price: 100, size: "M", brand: "Test",
    category: "otros", condition: "good",
    description: "Testing transactions", images: ["data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect fill='%23cccccc' width='400' height='400'/%3E%3Ctext fill='%23666666' font-size='48' x='200' y='200' text-anchor='middle'%3ETEST%3C/text%3E%3C/svg%3E"],
  };
  for (const [name, store] of [["A", (v) => productA = v], ["B", (v) => productB = v], ["C", (v) => productC = v]]) {
    const r = await api("POST", "/api/products", sellerToken, payload);
    if (!r.ok) throw new Error(`Product ${name} creation: ${r.data.error}`);
    store(r.data.product.id);
  }
  console.log(`  Products A=${productA} B=${productB} C=${productC}`);

  /* ── Case 6: Self-request blocked ── */
  console.log("\n--- Case 6: Self-request blocked ---");
  let r = await api("POST", "/api/transactions", sellerToken, { product_id: productA });
  check("Seller cannot request own product", r.status === 400 && r.data.error?.includes("propia"), r.data.error);

  /* ── Case 1: Happy flow ── */
  console.log("\n--- Case 1: Happy flow ---");
  r = await api("POST", "/api/transactions", buyerToken, { product_id: productA });
  check("Buyer can request product", r.ok && r.data.transaction?.status === "requested", r.data.error);
  const txA = r.data.transaction?.id;

  r = await api("GET", "/api/transactions/mine", buyerToken);
  check("Buyer sees transaction in asBuyer", r.data.asBuyer?.some(tx => tx.id === txA), "not in list");

  r = await api("GET", "/api/transactions/mine", sellerToken);
  check("Seller sees transaction in asSeller", r.data.asSeller?.some(tx => tx.id === txA), "not in list");

  r = await api("PATCH", `/api/transactions/${txA}`, sellerToken, { status: "accepted" });
  check("Seller can accept transaction", r.ok && r.data.transaction?.status === "accepted", r.data.error);

  // Check transaction events were created
  r = await api("GET", `/api/transactions/${txA}/events`, sellerToken);
  check("Transaction has events", r.ok && r.data.events?.length >= 2, `events: ${r.data.events?.length}`);

  /* ── Case 2: Duplicates blocked ── */
  console.log("\n--- Case 2: Duplicates blocked ---");
  r = await api("POST", "/api/transactions", buyerToken, { product_id: productA });
  check("Duplicate request is rejected", r.status === 400 && (r.data.error?.includes("Ya solicitaste") || r.data.error?.includes("disponible")), r.data.error);

  /* ── Case 3: Reserved blocks third parties ── */
  console.log("\n--- Case 3: Reserved product blocks third parties ---");
  r = await api("POST", "/api/transactions", thirdToken, { product_id: productA });
  check("Third party cannot request reserved product", r.status === 400 && r.data.error?.includes("disponible"), r.data.error);

  /* ── Case 4: Cancellation frees product ── */
  console.log("\n--- Case 4: Cancellation frees product ---");
  r = await api("POST", "/api/transactions", buyerToken, { product_id: productB });
  check("Buyer can request product B", r.ok, r.data.error);
  const txB = r.data.transaction?.id;

  r = await api("GET", `/api/products/${productB}`);
  check("Product B is reserved after request", r.data.product?.status === "reserved", `status=${r.data.product?.status}`);

  r = await api("PATCH", `/api/transactions/${txB}`, buyerToken, { status: "cancelled" });
  check("Buyer can cancel own transaction", r.ok && r.data.transaction?.status === "cancelled", r.data.error);

  r = await api("GET", `/api/products/${productB}`);
  check("Product B is disponible after cancel", r.data.product?.status === "disponible", `status=${r.data.product?.status}`);

  r = await api("POST", "/api/transactions", buyerToken, { product_id: productB });
  check("Buyer can request product B again after cancel", r.ok, r.data.error);

  /* ── Case 5: Rejection frees product ── */
  console.log("\n--- Case 5: Rejection frees product ---");
  r = await api("POST", "/api/transactions", buyerToken, { product_id: productC });
  check("Buyer can request product C", r.ok, r.data.error);
  const txC = r.data.transaction?.id;

  r = await api("GET", `/api/products/${productC}`);
  check("Product C is reserved after request", r.data.product?.status === "reserved", `status=${r.data.product?.status}`);

  r = await api("PATCH", `/api/transactions/${txC}`, sellerToken, { status: "rejected" });
  check("Seller can reject transaction", r.ok && r.data.transaction?.status === "rejected", r.data.error);

  r = await api("GET", `/api/products/${productC}`);
  check("Product C is disponible after reject", r.data.product?.status === "disponible", `status=${r.data.product?.status}`);

  /* ── Results ── */
  console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exit(1);

  /* ── Cleanup ── */
  console.log("\n--- Cleanup ---");
  for (const u of [SELLER, BUYER, THIRD]) {
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const match = users?.find(x => x.email === u.email);
    if (match) {
      await supabase.auth.admin.deleteUser(match.id);
      console.log(`  Deleted ${u.email}`);
    }
  }
}

main().catch(err => {
  console.error(`\nFATAL: ${err.message}`);
  process.exit(1);
});

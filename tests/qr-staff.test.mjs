import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { readFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import sharp from "sharp";
import { decodeShippedQr } from "./qr-image-decoder.mjs";
import { createTestDatabase, databaseTestPlugin } from "./helpers/postgres.mjs";

const { database, db } = await createTestDatabase();
after(() => database.close());
globalThis.__qrTestDb = db;
const files = new Map();
let membership, userAllowed, factors, authReads, membershipReads, failStorage, failDownload;
const secretKey = "sb_secret_test_server_only";
process.env.SUPABASE_URL = "https://gary-auth.example";
process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_only";
process.env.SUPABASE_SECRET_KEY = secretKey;
process.env.SUPABASE_SERVICE_ROLE_KEY = secretKey;

// Exercise the real Supabase SDK and storage adapter without external network I/O.
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url ?? input.href);
  const method = init.method || (input instanceof Request ? input.method : "GET");
  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : {}));
  if (url.pathname === "/auth/v1/user") {
    authReads++;
    assert.equal(headers.get("apikey"), "sb_publishable_test_only");
    return Response.json(userAllowed ? { id: "00000000-0000-4000-8000-000000000001", email: "staff@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", is_anonymous: false, factors, user_metadata: { role: "owner" } } : { message: "Invalid token", status: 401, code: "bad_jwt" }, { status: userAllowed ? 200 : 401 });
  }
  if (url.pathname === "/rest/v1/team_members") {
    membershipReads++;
    assert.equal(headers.get("apikey"), "sb_publishable_test_only");
    assert.equal(url.searchParams.get("user_id"), "eq.00000000-0000-4000-8000-000000000001");
    assert.equal(url.searchParams.get("active"), "eq.true");
    return Response.json(membership ? [membership] : []);
  }
  if (url.pathname.startsWith("/storage/v1/object/")) {
    assert.equal(headers.get("apikey"), secretKey, "private storage uses the server credential");
    const path = url.pathname.slice("/storage/v1/object/".length).replace(/^authenticated\//, "");
    const slash = path.indexOf("/");
    const key = slash < 0 ? "" : decodeURIComponent(path.slice(slash + 1));
    if (method === "POST") {
      assert.equal(headers.get("x-upsert"), "false", "QR object versions must be immutable");
      if (failStorage) return Response.json({ message: "Storage unavailable", statusCode: "503", error: "ServiceUnavailable" }, { status: 503 });
      const body = init.body instanceof FormData ? init.body.get("") : init.body;
      files.set(key, { bytes: new Uint8Array(await new Response(body).arrayBuffer()), mimeType: headers.get("content-type") || body?.type });
      return Response.json({ Id: key, Key: path });
    }
    if (method === "DELETE") {
      const body = JSON.parse(init.body);
      for (const prefix of body.prefixes) files.delete(prefix);
      return Response.json([]);
    }
    if (method === "GET") {
      if (failDownload) return Response.json({ message: "Storage unavailable", statusCode: "503", error: "ServiceUnavailable" }, { status: 503 });
      const file = files.get(key);
      return file ? new Response(file.bytes, { headers: { "Content-Type": file.mimeType } }) : Response.json({ message: "Object not found", statusCode: "404", error: "not_found" }, { status: 404 });
    }
  }
  throw new Error(`Unexpected network request in QR tests: ${method} ${url.pathname}`);
};
await mkdir(new URL("../.sites-runtime/qa/qr", import.meta.url), { recursive: true });
await build({ entryPoints: { staff: "app/api/staff/qr/route.ts", public: "app/api/qr/route.ts", image: "app/api/qr/image/route.ts", config: "app/api/staff/config/route.ts", utils: "lib/qr.ts" }, outdir: ".sites-runtime/qa/qr", bundle: true, platform: "node", format: "esm", target: "es2022", outExtension: { ".js": ".mjs" }, plugins: [databaseTestPlugin("__qrTestDb")] });
const staffRoute = await import("../.sites-runtime/qa/qr/staff.mjs");
const publicRoute = await import("../.sites-runtime/qa/qr/public.mjs");
const imageRoute = await import("../.sites-runtime/qa/qr/image.mjs");
const configRoute = await import("../.sites-runtime/qa/qr/config.mjs");
const utils = await import("../.sites-runtime/qa/qr/utils.mjs");
const token = (aal) => `test.${Buffer.from(JSON.stringify({ aal })).toString("base64url")}.signature`;
const request = (body, headers = {}) => new Request("https://gary.example/api/staff/qr", { method: body ? "POST" : "GET", headers: { Origin: "https://gary.example", Authorization: `Bearer ${token("aal1")}`, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...headers }, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
const generate = (overrides = {}) => ({ mode: "generate", destination: utils.DEFAULT_QR_DESTINATION, expectedVersion: "default", ...overrides });
const rows = async () => (await database.query("SELECT * FROM customer_connect.site_qr_codes")).rows;
beforeEach(async () => {
  await database.exec("DELETE FROM customer_connect.site_qr_codes");
  files.clear(); membership = { role: "editor", active: true }; userAllowed = true; factors = []; authReads = 0; membershipReads = 0; failStorage = false; failDownload = false;
  globalThis.__qrTestDb = db;
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_only";
  process.env.SUPABASE_SECRET_KEY = secretKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY = secretKey;
});

test("anonymous, expired, inactive, and non-staff accounts cannot replace QR codes", async () => {
  assert.equal((await staffRoute.POST(request(generate(), { Authorization: "" }))).status, 401);
  userAllowed = false;
  assert.equal((await staffRoute.POST(request(generate()))).status, 401);
  userAllowed = true; membership = null;
  assert.equal((await staffRoute.POST(request(generate()))).status, 403);
  membership = { role: "editor", active: false };
  assert.equal((await staffRoute.POST(request(generate()))).status, 403);
  membership = { role: "customer", active: true };
  assert.equal((await staffRoute.POST(request(generate()))).status, 403);
  assert.equal((await rows()).length, 0);
  assert.equal(files.size, 0);
});
test("existing active staff can generate a QR and revoked staff lose access immediately", async () => {
  const result = await staffRoute.POST(request(generate()));
  assert.equal(result.status, 200);
  const saved = await result.json();
  assert.equal((await rows()).length, 1);
  assert.equal(files.size, 1);
  assert.equal((await rows())[0].updated_by, "00000000-0000-4000-8000-000000000001");
  assert.equal(saved.qr.destination, utils.DEFAULT_QR_DESTINATION);
  membership = { role: "editor", active: false };
  assert.equal((await staffRoute.POST(request(generate({ expectedVersion: saved.qr.version, destination: "https://garyhome.vn" })))).status, 403);
  assert.equal((await rows())[0].version, saved.qr.version);
  assert.equal(authReads, 2); assert.equal(membershipReads, 2);
});
test("MFA-enabled accounts must complete the second factor", async () => {
  factors = [{ id: "factor", factor_type: "totp", status: "verified" }];
  const denied = await staffRoute.POST(request(generate()));
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, "mfa_required");
  assert.equal((await staffRoute.POST(request(generate(), { Authorization: `Bearer ${token("aal2")}` }))).status, 200);
});
test("concurrent and stale saves do not overwrite an unseen staff change", async () => {
  const results = await Promise.all([staffRoute.POST(request(generate())), staffRoute.POST(request(generate()))]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await rows()).length, 1);
  assert.equal(files.size, 1);
  assert.equal((await staffRoute.POST(request(generate()))).status, 409);
  assert.equal(files.size, 1);
});
test("concurrent replacements preserve the winning version and delete only the losing new object", async () => {
  const first = await staffRoute.POST(request(generate()));
  const version = (await first.json()).qr.version;
  const results = await Promise.all([
    staffRoute.POST(request(generate({ expectedVersion: version, destination: "https://garyhome.vn/one" }))),
    staffRoute.POST(request(generate({ expectedVersion: version, destination: "https://garyhome.vn/two" }))),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const winning = await results.find((r) => r.status === 200).json();
  assert.equal((await rows())[0].version, winning.qr.version);
  assert.equal(files.size, 2, "the original and winning immutable images remain");
});
test("staff can replace the QR with PNG, while invalid files and unsafe destinations are rejected", async () => {
  const png = await readFile(new URL("../public/qr/customer-connect.png", import.meta.url));
  const body = new FormData();
  body.set("image", new File([png], "code.png", { type: "image/png" }));
  body.set("destination", utils.DEFAULT_QR_DESTINATION); body.set("expectedVersion", "default");
  assert.equal((await staffRoute.POST(request(body))).status, 200);
  assert.equal((await rows())[0].mime_type, "image/png");
  const invalid = new FormData();
  invalid.set("image", new File(["<svg/>"], "fake.png", { type: "image/png" }));
  invalid.set("destination", "https://garyhome.vn"); invalid.set("expectedVersion", (await rows())[0].version);
  assert.equal((await staffRoute.POST(request(invalid))).status, 400);
  for (const destination of ["javascript:alert(1)", "http://garyhome.vn", "https://name:password@garyhome.vn"]) {
    assert.equal((await staffRoute.POST(request(generate({ destination, expectedVersion: (await rows())[0].version })))).status, 400);
  }
  assert.equal(files.size, 1);
});
test("failed storage and cross-site writes leave the current QR untouched", async () => {
  failStorage = true;
  assert.equal((await staffRoute.POST(request(generate()))).status, 503);
  assert.equal((await rows()).length, 0);
  assert.equal((await staffRoute.POST(request(generate(), { Origin: "https://other.example" }))).status, 403);
  assert.equal(files.size, 0);
});
test("public QR responses expose only public metadata and serve the latest private image", async () => {
  const initialBody = await (await publicRoute.GET()).json();
  assert.equal(initialBody.version, "default"); assert.equal(initialBody.destination, utils.DEFAULT_QR_DESTINATION);
  assert.equal((await imageRoute.GET(new Request("https://gary.example/api/qr/image"))).status, 302);
  assert.equal((await staffRoute.POST(request(generate()))).status, 200);
  const body = await (await publicRoute.GET()).json();
  assert.equal(body.updatedBy, undefined); assert.equal(body.email, undefined);
  assert.equal(body.version, (await rows())[0].version);
  const image = await imageRoute.GET(new Request("https://gary.example" + body.imageUrl));
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/svg+xml");
  assert.equal(image.headers.get("x-content-type-options"), "nosniff");
  assert.ok((await image.text()).includes("<svg"));
  assert.equal((await imageRoute.GET(new Request("https://gary.example/api/qr/image", { headers: { "If-None-Match": `"${body.version}"` } }))).status, 304);
});
test("missing or unavailable private objects never return a successful image response", async () => {
  assert.equal((await staffRoute.POST(request(generate()))).status, 200);
  failDownload = true;
  assert.equal((await imageRoute.GET(new Request("https://gary.example/api/qr/image"))).status, 503);
  failDownload = false; files.clear();
  assert.equal((await imageRoute.GET(new Request("https://gary.example/api/qr/image"))).status, 503);
});
test("the sign-in configuration endpoint never returns a secret API key", async () => {
  const config = await configRoute.GET();
  assert.equal(config.status, 200); assert.equal((await config.json()).key, "sb_publishable_test_only");
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_secret_must_not_be_exposed";
  const denied = await configRoute.GET();
  assert.equal(denied.status, 503); assert.ok(!(await denied.text()).includes("sb_secret"));
});
test("the actual rendered QR PNG decodes to the customer form and has valid error correction", async () => {
  assert.equal(await decodeShippedQr(new URL("../public/qr/customer-connect.png", import.meta.url)), utils.DEFAULT_QR_DESTINATION);
});
test("desktop and mobile favicons have the required dimensions and valid ICO entries", async () => {
  for (const [name, size] of [["favicon-16", 16], ["favicon-32", 32], ["favicon-48", 48], ["apple-touch-icon", 180], ["android-chrome-192", 192], ["android-chrome-512", 512]]) {
    const metadata = await sharp(new URL(`../public/icons/${name}.png`, import.meta.url).pathname).metadata();
    assert.equal(metadata.width, size); assert.equal(metadata.height, size);
  }
  const ico = await readFile(new URL("../public/favicon.ico", import.meta.url));
  assert.equal(ico.readUInt16LE(2), 1); assert.equal(ico.readUInt16LE(4), 3);
  const manifest = JSON.parse(await readFile(new URL("../public/site.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.start_url, "/customer"); assert.deepEqual(manifest.icons.map((x) => x.sizes), ["192x192", "512x512"]);
});

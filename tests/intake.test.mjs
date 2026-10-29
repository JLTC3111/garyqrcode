import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import ts from "typescript";
import { runInNewContext } from "node:vm";

const database = new DatabaseSync(":memory:");
database.exec(await readFile(new URL("../drizzle/0000_absent_bucky.sql", import.meta.url), "utf8"));
class LocalD1Statement {
  constructor(sql, params = []) { this.sql = sql; this.params = params; }
  bind(...params) { return new LocalD1Statement(this.sql, params); }
  async raw() { const statement = database.prepare(this.sql); statement.setReturnArrays(true); return statement.all(...this.params); }
  async all() { return { success: true, results: database.prepare(this.sql).all(...this.params), meta: {} }; }
  async run() { return { success: true, results: [], meta: database.prepare(this.sql).run(...this.params) }; }
}
const binding = { prepare: (sql) => new LocalD1Statement(sql) };
globalThis.__intakeTestEnv = { DB: binding };
await mkdir(new URL("../.sites-runtime/qa/", import.meta.url), { recursive: true });
await build({ entryPoints: ["app/api/submissions/route.ts"], outfile: ".sites-runtime/qa/route.mjs", bundle: true, platform: "node", format: "esm", target: "es2022", plugins: [{ name: "local-d1-test-binding", setup(builder) {
  builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "env", namespace: "local-d1" }));
  builder.onLoad({ filter: /.*/, namespace: "local-d1" }, () => ({ contents: "export const env = globalThis.__intakeTestEnv;", loader: "js" }));
} }] });
await build({ entryPoints: ["lib/intake.ts"], outfile: ".sites-runtime/qa/intake.mjs", bundle: true, platform: "node", format: "esm", target: "es2022" });
const { POST } = await import("../.sites-runtime/qa/route.mjs");
await build({ entryPoints: ["lib/i18n.ts", "lib/preferences.ts"], outdir: ".sites-runtime/qa", bundle: true, platform: "node", format: "esm", outExtension: { ".js": ".mjs" }, target: "es2022" });
const { translate, vietnamese } = await import("../.sites-runtime/qa/i18n.mjs");
const { resolvePreferences, themeBootstrap } = await import("../.sites-runtime/qa/preferences.mjs");
const { defaultIntake, buildQuickSubmission, draftSchema, validateIntake, receiptText, serviceLabels, intentLabels, ratingLabels, feedbackTopicLabels } = await import("../.sites-runtime/qa/intake.mjs");
const payload = (overrides = {}) => ({ ...defaultIntake, intent: "both", services: ["home", "job", "paperwork"], repName: "Jamie Example", repCompany: "Example Agency", repEmail: "jamie@example.com", overallRating: 5, communicationRating: 4, helpfulnessRating: 5, feedback: "Clear explanations and thoughtful support.", firstName: "Taylor", lastName: "Example", email: "taylor@example.com", location: "Example City", homeGoal: "Rent a home", homeBudget: "USD 1,200/month", jobRole: "Customer service", jobType: "Full-time", paperworkType: "Employment documents", timeline: "Within a month", details: "I need help finding a home and a job and understanding the forms.", consent: true, ...overrides });
const send = (data, key = randomUUID(), headers = {}) => POST(new Request("https://gary.example/api/submissions", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key, Origin: "https://gary.example", ...headers }, body: JSON.stringify(data) }));
const rows = () => database.prepare("SELECT * FROM customer_submissions").all();
beforeEach(() => { database.exec("DELETE FROM customer_submissions"); globalThis.__intakeTestEnv.DB = binding; });

test("a combined housing, job, and paperwork request persists rep details and feedback", async () => {
  const response = await send(payload());
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.match(result.reference, /^GARY-[A-F0-9]{12}$/);
  const [row] = rows();
  assert.equal(row.representative_name, "Jamie Example");
  assert.equal(row.customer_email, "taylor@example.com");
  assert.equal(row.overall_rating, 5);
  const saved = JSON.parse(row.payload);
  assert.deepEqual(saved.services, ["home", "job", "paperwork"]);
  assert.equal(saved.homeBudget, "USD 1,200/month");
  assert.equal(saved.jobRole, "Customer service");
  assert.equal(saved.paperworkType, "Employment documents");
  assert.equal(saved.communicationRating, 4);
});

test("feedback-only submissions need no new service request", async () => {
  const response = await send(payload({ intent: "feedback", details: "", services: ["job"] }));
  assert.equal(response.status, 201);
  const saved = JSON.parse(rows()[0].payload);
  assert.equal(saved.homeGoal, ""); assert.equal(saved.jobRole, ""); assert.equal(saved.timeline, "");
  assert.equal(saved.overallRating, 5);
});

test("quick feedback saves with only a representative, service, and one rating", async () => {
  const data = buildQuickSubmission({ ...defaultIntake, repName: "Jamie Example", services: ["home"], overallRating: 5 }, "", "");
  assert.deepEqual(validateIntake(data), {});
  assert.equal((await send(data)).status, 201);
  const [row] = rows();
  assert.equal(row.customer_name, "");
  assert.equal(row.customer_email, "");
  assert.equal(row.customer_phone, "");
  assert.equal(row.overall_rating, 5);
  assert.equal(JSON.parse(row.payload).feedback, "");
});

test("quick feedback topics persist and reject unsupported or duplicate choices", async () => {
  const data = buildQuickSubmission({ ...defaultIntake, repName: "Jamie Example", services: ["job"], overallRating: 2, feedbackTopics: ["communication", "speed"] }, "Please reply sooner.", "");
  assert.equal((await send(data)).status, 201);
  assert.deepEqual(JSON.parse(rows()[0].payload).feedbackTopics, ["communication", "speed"]);
  for (const feedbackTopics of [["unknown"], ["speed", "speed"]]) assert.equal((await send({ ...data, feedbackTopics })).status, 400);
  const receipt = receiptText(data, "GARY-TOPICS", "vi");
  for (const text of [translate("vi", "Could be improved"), translate("vi", "Clear communication"), translate("vi", "Response time"), "Please reply sooner."]) assert.ok(receipt.includes(text), text);
  assert.equal(rows().length, 1);
});

test("follow-up needs one email or phone and opt-out clears hidden personal details", async () => {
  const draft = { ...defaultIntake, repName: "Jamie Example", services: ["paperwork"], overallRating: 4, firstName: "Taylor", email: "old@example.com", phone: "+1 202 555 0199", followUp: true };
  assert.equal((await send(buildQuickSubmission(draft, "", ""))).status, 400);
  for (const contact of ["taylor@example.com", "+84 912 345 678"]) {
    const data = buildQuickSubmission(draft, "", contact);
    assert.equal((await send(data)).status, 201);
    assert.equal(data.email || data.phone, contact);
    assert.equal(data.firstName, "Taylor");
  }
  const anonymous = buildQuickSubmission({ ...draft, followUp: false }, "", "taylor@example.com");
  for (const field of ["firstName", "lastName", "email", "phone"]) assert.equal(anonymous[field], "");
  assert.equal((await send(anonymous)).status, 201);
  assert.equal((await send(buildQuickSubmission({ ...draft, website: "bot.example" }, "", "taylor@example.com"))).status, 400);
});

test("quick help needs a request and contact but does not require a name or rating", async () => {
  const draft = { ...defaultIntake, intent: "help", repName: "Jamie Example", services: ["home"] };
  assert.equal((await send(buildQuickSubmission(draft, "I need help renting a home.", "taylor@example.com"))).status, 201);
  assert.equal(rows()[0].customer_name, "");
  assert.equal(rows()[0].overall_rating, null);
  assert.equal((await send(buildQuickSubmission(draft, "", "taylor@example.com"))).status, 400);
  assert.equal((await send(buildQuickSubmission(draft, "I need help renting a home.", ""))).status, 400);
  const both = buildQuickSubmission({ ...draft, intent: "both", overallRating: 4 }, "Help with the next step, please.", "taylor@example.com");
  assert.equal((await send(both)).status, 201);
  assert.equal(both.feedback, both.details);
  assert.equal(receiptText(both, "GARY-BOTH").split(both.details).length - 1, 1);
});

test("help-only submissions work without ratings and retain only selected service details", async () => {
  const response = await send(payload({ intent: "help", overallRating: 0, services: ["paperwork"] }));
  assert.equal(response.status, 201);
  const saved = JSON.parse(rows()[0].payload);
  assert.equal(rows()[0].overall_rating, null);
  assert.equal(saved.feedback, ""); assert.equal(saved.communicationRating, 0);
  assert.equal(saved.homeBudget, ""); assert.equal(saved.jobRole, "");
  assert.equal(saved.paperworkType, "Employment documents");
});

test("incomplete or invalid submissions never reach the database", async () => {
  for (const overrides of [{ services: [] }, { repName: "" }, { overallRating: 0 }, { details: "  " }, { consent: false }, { email: "invalid" }, { contactPreference: "phone", phone: "123" }, { website: "bot.example" }]) {
    assert.equal((await send(payload(overrides))).status, 400, JSON.stringify(overrides));
  }
  assert.equal(rows().length, 0);
});

test("phone and text are usable without an email address", async () => {
  for (const contactPreference of ["phone", "text"]) assert.equal((await send(payload({ email: "", phone: "+1 202 555 0144", contactPreference }))).status, 201);
  assert.equal(rows().length, 2);
});

test("retries and concurrent double-clicks save one submission", async () => {
  const key = randomUUID();
  const results = await Promise.all([send(payload(), key), send(payload(), key)]);
  assert.ok(results.every((result) => [200, 201].includes(result.status)));
  const references = await Promise.all(results.map(async (result) => (await result.json()).reference));
  assert.equal(references[0], references[1]);
  assert.equal(rows().length, 1);
  assert.equal((await send(payload(), key)).status, 200);
  assert.equal((await send(payload({ repName: "Another Example" }), key)).status, 409);
  assert.equal(rows().length, 1);
});

test("cross-site, malformed, and oversized requests are rejected", async () => {
  assert.equal((await send(payload(), randomUUID(), { Origin: "https://other.example" })).status, 403);
  assert.equal((await send(payload(), randomUUID(), { "Sec-Fetch-Site": "cross-site" })).status, 403);
  assert.equal((await send(payload(), randomUUID(), { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await send(payload(), "invalid-key")).status, 400);
  assert.equal((await send(payload({ details: "x".repeat(31_000) }))).status, 413);
  assert.equal((await POST(new Request("https://gary.example/api/submissions", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID() }, body: "{" }))).status, 400);
  assert.equal(rows().length, 0);
});

test("storage failure returns an honest retry message, without a success reference", async () => {
  globalThis.__intakeTestEnv.DB = undefined;
  const response = await send(payload());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).reference, undefined);
});

test("drafts accept unfinished answers while submission validation catches missing information", () => {
  assert.equal(draftSchema.safeParse(defaultIntake).success, true);
  assert.equal(draftSchema.safeParse({ ...defaultIntake, repEmail: "unfinished@" }).success, true);
  assert.equal(draftSchema.safeParse({ services: ["unknown"] }).success, false);
  assert.ok(validateIntake(defaultIntake).services);
  assert.deepEqual(validateIntake(payload()), {});
  assert.ok(validateIntake(payload({ overallRating: 0 })).overallRating);
  assert.ok(validateIntake(payload({ email: "" })).email);
  assert.ok(validateIntake(payload({ consent: false })).consent);
});

test("downloadable summaries include the request, rep contact details, and all ratings", () => {
  const receipt = receiptText(payload(), "GARY-TEST");
  for (const value of ["GARY-TEST", "Jamie Example", "taylor@example.com", "USD 1,200/month", "Customer service", "Employment documents", "Communication: 4/5", "Helpfulness: 5/5"]) assert.ok(receipt.includes(value), value);
});

test("Vietnamese summaries translate service choices without rewriting customer answers", () => {
  const data = payload({ firstName: "Minh", lastName: "Nguyễn", repName: "Trần An", repCompany: "Good", details: "Tôi cần tìm một căn hộ gần trường.", feedback: "Tư vấn rõ ràng và tận tâm.", homeBudget: "15 triệu VND/tháng", jobRole: "Contract" });
  const receipt = receiptText(data, "GARY-VI-TEST", "vi");
  for (const value of ["GARY · KẾT NỐI KHÁCH HÀNG", "Mã tham chiếu: GARY-VI-TEST", "Nguyễn Minh", "Tìm nhà", "Tìm việc", "Hỗ trợ giấy tờ", "Thuê nhà", "Toàn thời gian", "Giao tiếp: 4/5", "Trần An", "15 triệu VND/tháng", data.details, data.feedback]) assert.ok(receipt.includes(value), value);
  assert.ok(receipt.includes("Công ty: Good"));
  assert.ok(receipt.includes("Vị trí hoặc ngành nghề: Contract"));
  assert.equal(data.homeGoal, "Rent a home");
  assert.equal(data.jobType, "Full-time");
  assert.equal(validateIntake(data).details, undefined);
});

test("language and theme preferences respect shared links, saved choices, and system defaults", () => {
  assert.deepEqual(resolvePreferences("", null, "vi-VN", true), { locale: "vi", theme: "dark" });
  assert.deepEqual(resolvePreferences("", '{"locale":"vi","theme":"dark"}', "en-US", false), { locale: "vi", theme: "dark" });
  assert.deepEqual(resolvePreferences("?lang=en&theme=light", '{"locale":"vi","theme":"dark"}', "vi-VN", true), { locale: "en", theme: "light" });
  assert.deepEqual(resolvePreferences("?lang=other&theme=unknown", '{"locale":"bad","theme":"bad"}', "en-US", false), { locale: "en", theme: "light" });
  assert.deepEqual(resolvePreferences("", "broken JSON", "vi-VN", false), { locale: "vi", theme: "light" });
});

test("the first-paint theme matches the selected preference", () => {
  for (const [search, saved, systemDark, expected] of [["", '{"theme":"dark"}', false, "dark"], ["?theme=light", '{"theme":"dark"}', true, "light"], ["?theme=unknown", "invalid", true, "dark"]]) {
    const document = { documentElement: { dataset: {} } };
    runInNewContext(themeBootstrap, { document, location: { search }, localStorage: { getItem: () => saved }, matchMedia: () => ({ matches: systemDark }), URLSearchParams });
    assert.equal(document.documentElement.dataset.theme, expected);
  }
});

test("Vietnamese copy covers all literal UI text, service choices, and validation errors", async () => {
  const missing = new Set();
  const check = (value) => { if (/[A-Za-z]/.test(value) && !Object.hasOwn(vietnamese, value)) missing.add(value); };
  const body = (await Promise.all(["customer-intake", "qr-share-card", "staff-qr-manager"].map(name => readFile(new URL(`../components/${name}.tsx`, import.meta.url), "utf8")))).join("\n");
  const file = ts.createSourceFile("form.tsx", body, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function textBranches(node) {
    if (ts.isStringLiteral(node)) check(node.text);
    else if (ts.isConditionalExpression(node)) { textBranches(node.whenTrue); textBranches(node.whenFalse); }
    else if (ts.isBinaryExpression(node)) textBranches(node.right);
  }
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === "t" && node.arguments[0]) textBranches(node.arguments[0]);
    if (ts.isJsxText(node)) { const value = node.text.replace(/\s+/g, " ").trim(); if (value && !["gary", "Gary", "EN", "VI"].includes(value)) check(value); }
    if (ts.isJsxAttribute(node) && node.name.getText(file) === "label" && node.initializer && ts.isStringLiteral(node.initializer)) check(node.initializer.text);
    if (ts.isPropertyAssignment(node) && ["title", "subtitle", "description", "tag"].includes(node.name.getText(file)) && ts.isStringLiteral(node.initializer)) check(node.initializer.text);
    ts.forEachChild(node, visit);
  }
  visit(file);
  for (const value of [...Object.values(serviceLabels), ...Object.values(intentLabels), ...Object.values(feedbackTopicLabels), ...ratingLabels, "Housing", "Jobs", "Paperwork", "Leave feedback", "Request help", "Both"]) check(value);
  for (const name of ["../lib/intake.ts", "../app/api/submissions/route.ts", "../lib/staff-auth.ts", "../lib/qr.ts", "../app/api/staff/qr/route.ts"]) {
    const source = ts.createSourceFile(name, await readFile(new URL(name, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
    function errors(node) {
      if (ts.isPropertyAssignment(node) && node.name.getText(source) === "error") textBranches(node.initializer);
      if (ts.isNewExpression(node) && ["Error", "StaffError"].includes(node.expression.getText(source)) && node.arguments?.[0]) textBranches(node.arguments[0]);
      if (ts.isCallExpression(node) && node.expression.getText(source) === "issue" && node.arguments[1] && ts.isStringLiteral(node.arguments[1])) check(node.arguments[1].text);
      ts.forEachChild(node, errors);
    }
    errors(source);
  }
  assert.deepEqual([...missing], [], `Missing translations: ${[...missing].join(", ")}`);
  assert.equal(translate("vi", "Choose at least one area."), "Vui lòng chọn ít nhất một dịch vụ.");
  assert.equal(translate("vi", "Thanks, {name}.", { name: "Minh" }), "Cảm ơn Minh.");
});

test("all three requested Gary links open independently of the form", async () => {
  const source = await readFile(new URL("../components/customer-intake.tsx", import.meta.url), "utf8");
  for (const domain of ["garyhome.vn", "visa.garyhome.vn", "agency.garyhome.vn"]) assert.ok(source.includes(`href: "https://${domain}"`), domain);
  assert.match(source, /href=\{href\} target="_blank" rel="noopener noreferrer"/);
});

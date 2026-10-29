import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const customerSubmissions = sqliteTable("customer_submissions", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  intent: text("intent").notNull(),
  services: text("services", { mode: "json" }).$type<string[]>().notNull(),
  representativeName: text("representative_name").notNull(),
  representativeCompany: text("representative_company").notNull(),
  representativeEmail: text("representative_email").notNull(),
  representativePhone: text("representative_phone").notNull(),
  representativeCode: text("representative_code").notNull(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone").notNull(),
  contactPreference: text("contact_preference").notNull(),
  overallRating: integer("overall_rating"),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
});

export const siteQrCodes = sqliteTable("site_qr_codes", {
  id: text("id").primaryKey(),
  destination: text("destination").notNull(),
  assetKey: text("asset_key").notNull(),
  mimeType: text("mime_type").notNull(),
  version: text("version").notNull(),
  mode: text("mode").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

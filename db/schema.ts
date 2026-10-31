import { integer, jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

export const customerConnect = pgSchema("customer_connect");

export const customerSubmissions = customerConnect.table("customer_submissions", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  intent: text("intent").notNull(),
  services: jsonb("services").$type<string[]>().notNull(),
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
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
});

export const siteQrCodes = customerConnect.table("site_qr_codes", {
  id: text("id").primaryKey(),
  destination: text("destination").notNull(),
  assetKey: text("asset_key").notNull(),
  mimeType: text("mime_type").notNull(),
  version: text("version").notNull(),
  mode: text("mode").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

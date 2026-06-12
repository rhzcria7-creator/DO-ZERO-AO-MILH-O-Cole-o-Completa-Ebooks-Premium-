import { pgTable, serial, text, timestamp, integer, decimal, jsonb } from 'drizzle-orm/pg-core';

// Define the 'users' table.
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Full purchases schema merged from backend
export const purchases = pgTable("purchases", {
  id: serial("id").primaryKey(),
  userId: text('user_id').references(() => users.uid),
  ebookId: text('ebook_id'),
  stripeSessionId: text("stripe_session_id").unique(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  email: text("email"),
  name: text("name"),
  product: text("product"),
  amount: decimal("amount", { precision: 10, scale: 2 }),
  currency: text("currency").default("brl"),
  status: text("status").default("pending"),
  paidAt: timestamp("paid_at"),
  refundedAt: timestamp("refunded_at"),
  statusReason: text("status_reason"),
  metadata: jsonb("metadata"),
  purchaseDate: timestamp('purchase_date').defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const downloads = pgTable("downloads", {
  id: serial("id").primaryKey(),
  purchaseId: integer("purchase_id").references(() => purchases.id).notNull(),
  token: text("token").unique().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedCount: integer("used_count").default(0),
  lastUsedIp: text("last_used_ip"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const subscribers = pgTable("subscribers", {
  id: serial("id").primaryKey(),
  email: text("email").unique().notNull(),
  name: text("name").notNull(),
  source: text("source").default("website").notNull(),
  tags: jsonb("tags").default("[]"),
  subscribedAt: timestamp("subscribed_at").defaultNow().notNull(),
  unsubscribedAt: timestamp("unsubscribed_at"),
});

export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

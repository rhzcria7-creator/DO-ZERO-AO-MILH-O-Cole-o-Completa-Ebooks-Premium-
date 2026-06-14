import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  decimal,
  jsonb,
  index,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ============================================================
// USERS (Firebase Auth linkage)
// ============================================================
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  uid: text("uid").notNull().unique(), // Firebase Auth UID
  email: text("email").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================
// PURCHASES
//   * status expandido para incluir 'approved' (legado) e 'refunded'
//   * constraint CHECK em amount
//   * índices otimizados para queries comuns
// ============================================================
export const purchases = pgTable(
  "purchases",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").references(() => users.uid, { onDelete: "set null" }),
    ebookId: text("ebook_id"),
    stripeSessionId: text("stripe_session_id").unique(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    email: text("email").notNull(),
    name: text("name").notNull(),
    product: text("product").notNull(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").default("brl").notNull(),
    status: text("status").default("pending").notNull(),
    paidAt: timestamp("paid_at"),
    refundedAt: timestamp("refunded_at"),
    statusReason: text("status_reason"),
    metadata: jsonb("metadata").default({}).notNull(),
    purchaseDate: timestamp("purchase_date").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    emailIdx: index("idx_purchases_email").on(t.email),
    statusIdx: index("idx_purchases_status").on(t.status),
    createdAtIdx: index("idx_purchases_created_at").on(t.createdAt.desc()),
    paidAtIdx: index("idx_purchases_paid_at").on(t.paidAt.desc()),
    userIdIdx: index("idx_purchases_user_id").on(t.userId),
    statusPaidIdx: index("idx_purchases_status_paid").on(t.status, t.paidAt),
    sessionIdIdx: uniqueIndex("idx_purchases_stripe_session").on(t.stripeSessionId),
    amountCheck: check("chk_purchases_amount", sql`${t.amount} >= 0`),
    statusCheck: check(
      "chk_purchases_status",
      sql`${t.status} IN ('pending', 'completed', 'approved', 'refunded', 'cancelled')`
    ),
  })
);

// ============================================================
// DOWNLOADS
//   * tokenHash adicionado (campo era exigido pelo SQL mas faltava
//     no schema Drizzle — causava erro silencioso de insert)
// ============================================================
export const downloads = pgTable(
  "downloads",
  {
    id: serial("id").primaryKey(),
    purchaseId: integer("purchase_id")
      .references(() => purchases.id, { onDelete: "cascade" })
      .notNull(),
    token: text("token").unique().notNull(),
    tokenHash: text("token_hash").unique().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    usedCount: integer("used_count").default(0).notNull(),
    lastUsedIp: text("last_used_ip"),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    tokenIdx: uniqueIndex("idx_downloads_token").on(t.token),
    tokenHashIdx: uniqueIndex("idx_downloads_token_hash").on(t.tokenHash),
    purchaseIdIdx: index("idx_downloads_purchase_id").on(t.purchaseId),
    expiresAtIdx: index("idx_downloads_expires_at").on(t.expiresAt),
  })
);

// ============================================================
// REVOKED TOKENS
//   * antes só consultada via activity_logs (que nunca casava).
//   * agora tem tabela própria com índice no token_hash.
// ============================================================
export const revokedTokens = pgTable(
  "revoked_tokens",
  {
    id: serial("id").primaryKey(),
    tokenHash: text("token_hash").unique().notNull(),
    revokedAt: timestamp("revoked_at").defaultNow().notNull(),
    reason: text("reason"),
    revokedByIp: text("revoked_by_ip"),
  },
  (t) => ({
    tokenHashIdx: uniqueIndex("idx_revoked_tokens_hash").on(t.tokenHash),
    revokedAtIdx: index("idx_revoked_tokens_revoked_at").on(t.revokedAt.desc()),
  })
);

// ============================================================
// SUBSCRIBERS
// ============================================================
export const subscribers = pgTable(
  "subscribers",
  {
    id: serial("id").primaryKey(),
    email: text("email").unique().notNull(),
    name: text("name").notNull(),
    source: text("source").default("website").notNull(),
    tags: jsonb("tags").default([]).notNull(),
    subscribedAt: timestamp("subscribed_at").defaultNow().notNull(),
    unsubscribedAt: timestamp("unsubscribed_at"),
    confirmedAt: timestamp("confirmed_at"),
    confirmationToken: text("confirmation_token").unique(),
  },
  (t) => ({
    sourceIdx: index("idx_subscribers_source").on(t.source),
    subscribedAtIdx: index("idx_subscribers_subscribed_at").on(t.subscribedAt.desc()),
  })
);

// ============================================================
// ACTIVITY LOGS (auditoria)
// ============================================================
export const activityLogs = pgTable(
  "activity_logs",
  {
    id: serial("id").primaryKey(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id"),
    metadata: jsonb("metadata").default({}).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    actionIdx: index("idx_activity_logs_action").on(t.action),
    createdAtIdx: index("idx_activity_logs_created_at").on(t.createdAt.desc()),
    entityIdx: index("idx_activity_logs_entity").on(t.entityType, t.entityId),
    actionCheck: check(
      "chk_activity_logs_action",
      sql`${t.action} ~ '^[a-z_]+$'`
    ),
  })
);

// ============================================================
// ADMIN SESSIONS
//   * Persistência no PostgreSQL substitui o Map em memória.
//   * L1 cache em services/auth.ts; PG é source of truth.
// ============================================================
export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: text("id").primaryKey(), // 64-char hex (32 bytes random)
    email: text("email").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
  },
  (t) => ({
    emailIdx: index("idx_admin_sessions_email").on(t.email),
    expiresAtIdx: index("idx_admin_sessions_expires_at").on(t.expiresAt),
    idCheck: check("chk_admin_sessions_id", sql`length(${t.id}) >= 32`),
  })
);

// ============================================================
// IP BLOCKS
// ============================================================
export const ipBlocks = pgTable(
  "ip_blocks",
  {
    id: serial("id").primaryKey(),
    ipAddress: text("ip_address").notNull(),
    reason: text("reason").notNull(),
    blockedAt: timestamp("blocked_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    unblockedAt: timestamp("unblocked_at"),
    attempts: integer("attempts").default(1).notNull(),
  },
  (t) => ({
    ipIdx: index("idx_ip_blocks_ip").on(t.ipAddress),
    activeIdx: index("idx_ip_blocks_active").on(t.ipAddress, t.expiresAt),
  })
);

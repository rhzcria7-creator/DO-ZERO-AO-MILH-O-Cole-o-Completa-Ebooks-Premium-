import crypto from "crypto";
import { config } from "../config/env.js";
import { logger } from "../server.js";
import { db, adminSessions } from "./database.js";
import { eq, lt, sql } from "drizzle-orm";

export interface Session {
  id: string;
  email: string;
  createdAt: number;
  expiresAt: number;
}

const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * L1 in-memory cache for admin sessions.
 * Authoritative store is the `admin_sessions` table in PostgreSQL.
 * The cache is populated on `validateSession` and used to skip a DB
 * round-trip for hot sessions. It is **not** authoritative — the DB
 * is the source of truth and is consulted on every login + on cache
 * miss.
 */
const sessionCache = new Map<string, Session>();
const CACHE_TTL = 5 * 60 * 1000; // 5 min
const CACHE_MAX_ENTRIES = 1000;

interface CacheEntry {
  session: Session;
  cachedAt: number;
}
const sessionCacheWithTtl = new Map<string, CacheEntry>();

/**
 * Hash password with PBKDF2 (PBKDF2-SHA512, 100k iterações).
 * NOTA: Argon2id é o estado da arte e está no roadmap (P2).
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(32).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Verifica senha contra hash armazenado.
 * Usa comparação constant-time para evitar timing attacks.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  if (hash.length !== 128) return false; // 64 bytes hex

  const testHash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  // timingSafeEqual exige buffers de mesmo tamanho
  if (testHash.length !== hash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(testHash, "hex"));
}

/**
 * Cria uma nova sessão admin e persiste no PostgreSQL.
 * @returns sessionId (32 bytes hex) ou null se falhar
 */
export async function createSession(email: string, ip?: string, userAgent?: string): Promise<string | null> {
  const sessionId = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  const expiresAt = now + SESSION_TTL;

  try {
    await db.insert(adminSessions).values({
      id: sessionId,
      email,
      ipAddress: ip ?? null,
      userAgent: userAgent ?? null,
      expiresAt: new Date(expiresAt),
    });
  } catch (error) {
    logger.error("Failed to persist admin session", { error, email });
    return null;
  }

  const session: Session = {
    id: sessionId,
    email,
    createdAt: now,
    expiresAt,
  };
  cacheSet(sessionId, session);
  logger.info("Admin session created", { email, sessionIdPrefix: sessionId.substring(0, 8) });
  return sessionId;
}

/**
 * Valida sessão: consulta cache L1; em caso de miss consulta DB.
 * Sessões expiradas são removidas do DB (lazy cleanup).
 */
export async function validateSession(sessionId: string): Promise<Session | null> {
  if (!sessionId || sessionId.length < 32) return null;

  // L1 cache
  const cached = sessionCacheWithTtl.get(sessionId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    if (Date.now() > cached.session.expiresAt) {
      sessionCacheWithTtl.delete(sessionId);
      sessionCache.delete(sessionId);
      return null;
    }
    return cached.session;
  }

  // DB lookup
  try {
    const [row] = await db
      .select()
      .from(adminSessions)
      .where(eq(adminSessions.id, sessionId))
      .limit(1);

    if (!row) {
      sessionCacheWithTtl.delete(sessionId);
      sessionCache.delete(sessionId);
      return null;
    }

    const expiresAt = row.expiresAt.getTime();
    if (Date.now() > expiresAt) {
      // Expired — clean up
      await invalidateSession(sessionId);
      return null;
    }

    const session: Session = {
      id: row.id,
      email: row.email,
      createdAt: row.createdAt.getTime(),
      expiresAt,
    };
    cacheSet(sessionId, session);
    return session;
  } catch (error) {
    logger.error("Session validation DB error", { error, sessionIdPrefix: sessionId.substring(0, 8) });
    return null;
  }
}

/**
 * Invalida (deleta) uma sessão no DB e no cache.
 */
export async function invalidateSession(sessionId: string): Promise<void> {
  sessionCacheWithTtl.delete(sessionId);
  sessionCache.delete(sessionId);
  try {
    await db.delete(adminSessions).where(eq(adminSessions.id, sessionId));
    logger.info("Admin session invalidated", { sessionIdPrefix: sessionId.substring(0, 8) });
  } catch (error) {
    logger.warn("Failed to delete session from DB", { error, sessionId });
  }
}

/**
 * Autentica admin e cria sessão persistida.
 */
export async function authenticateAdmin(
  email: string,
  password: string,
  ip?: string,
  userAgent?: string
): Promise<string | null> {
  if (!config.ADMIN_EMAIL || !config.ADMIN_PASSWORD_HASH) {
    logger.warn("Admin authentication attempted but not configured");
    return null;
  }

  // Constant-time email comparison
  const emailBuf = Buffer.from(email.toLowerCase().trim());
  const expectedBuf = Buffer.from(config.ADMIN_EMAIL.toLowerCase().trim());
  let emailMatch = false;
  if (emailBuf.length === expectedBuf.length) {
    emailMatch = crypto.timingSafeEqual(emailBuf, expectedBuf);
  }
  if (!emailMatch) {
    logger.warn("Admin login with wrong email", { emailPrefix: email.substring(0, 3) + "***" });
    return null;
  }

  if (!verifyPassword(password, config.ADMIN_PASSWORD_HASH)) {
    logger.warn("Admin login with wrong password", { emailPrefix: email.substring(0, 3) + "***" });
    return null;
  }

  return createSession(email, ip, userAgent);
}

/**
 * Remove sessões expiradas do DB.
 * Deve ser chamado periodicamente (cron job ou no startup).
 */
export async function cleanupExpiredSessions(): Promise<number> {
  try {
    const result = await db
      .delete(adminSessions)
      .where(lt(adminSessions.expiresAt, new Date()))
      .returning({ id: adminSessions.id });
    const count = result.length;
    if (count > 0) {
      logger.info("Cleaned up expired admin sessions", { count });
    }
    return count;
  } catch (error) {
    logger.error("Failed to cleanup sessions", { error });
    return 0;
  }
}

/**
 * Helper de cache.
 */
function cacheSet(sessionId: string, session: Session): void {
  if (sessionCacheWithTtl.size >= CACHE_MAX_ENTRIES) {
    // Eviction simples: remove o mais antigo
    const oldest = sessionCacheWithTtl.entries().next().value;
    if (oldest) sessionCacheWithTtl.delete(oldest[0]);
  }
  sessionCacheWithTtl.set(sessionId, { session, cachedAt: Date.now() });
  sessionCache.set(sessionId, session);
}

// Cleanup periódico a cada 1h. Em serverless (Vercel), este módulo é
// carregado uma vez por cold-start; o setInterval mantém a função viva.
// Para ambiente serverless, recomenda-se mover para vercel.json crons
// e chamar cleanupExpiredSessions() externamente.
const CLEANUP_INTERVAL = 60 * 60 * 1000;
if (typeof process !== "undefined" && process.env.VERCEL !== "1") {
  setInterval(() => {
    cleanupExpiredSessions().catch((e) =>
      logger.error("Scheduled session cleanup failed", { error: e })
    );
  }, CLEANUP_INTERVAL);
}

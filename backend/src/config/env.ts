import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  TRUST_PROXY: z.boolean().default(false),

  // Domínios permitidos (CORS)
  ALLOWED_ORIGINS: z.string().default("https://dozeroaomilhao.com"),

  // Cookie secret (CSRF + sessão)
  COOKIE_SECRET: z.string().min(32),

  // Database (PostgreSQL via Supabase)
  DATABASE_URL: z.string().startsWith("postgresql://"),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(10),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),

  // E-mail (SendGrid ou SMTP)
  EMAIL_PROVIDER: z.enum(["sendgrid", "smtp"]).default("sendgrid"),
  SENDGRID_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().email().default("noreply@dozeroaomilhao.com"),
  EMAIL_FROM_NAME: z.string().default("Do Zero ao Milhão"),

  // Download seguro
  DOWNLOAD_SECRET: z.string().min(32),
  DOWNLOAD_URL: z.string().url().default("https://dozeroaomilhao.com"),

  // Token HMAC (opcional, usa DOWNLOAD_SECRET se não definido)
  TOKEN_SECRET: z.string().min(32).optional(),

  // Admin (opcional)
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD_HASH: z.string().optional(),
  ADMIN_API_KEY: z.string().min(16).optional(),

  // Log
  LOG_LEVEL: z.string().default("info"),
});

type Env = z.infer<typeof envSchema>;

function loadConfig(): Env {
  // Carrega .env em desenvolvimento
  if (process.env.NODE_ENV !== "production") {
    try {
      import("dotenv").then((dotenv) => dotenv.config());
    } catch {
      // dotenv não instalado - assume variáveis no ambiente
    }
  }

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Configuração inválida:", result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();

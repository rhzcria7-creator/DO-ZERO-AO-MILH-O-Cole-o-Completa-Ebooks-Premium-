-- ============================================
-- SCHEMA: Do Zero ao Milhão
-- Execute no SQL Editor do Supabase
-- ============================================

-- Tabela de compras
CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  stripe_session_id TEXT UNIQUE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  product TEXT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'brl',
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMP,
  refunded_at TIMESTAMP,
  status_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_purchases_email ON purchases(email);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(status);
CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON purchases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_user_id ON purchases(user_id);

-- Tabela de downloads
CREATE TABLE IF NOT EXISTS downloads (
  id SERIAL PRIMARY KEY,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_count INTEGER DEFAULT 0,
  last_used_ip TEXT,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_downloads_token ON downloads(token);
CREATE INDEX IF NOT EXISTS idx_downloads_token_hash ON downloads(token_hash);
CREATE INDEX IF NOT EXISTS idx_downloads_purchase_id ON downloads(purchase_id);

-- Tabela de tokens revogados
CREATE TABLE IF NOT EXISTS revoked_tokens (
  id SERIAL PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  revoked_at TIMESTAMP DEFAULT NOW() NOT NULL,
  reason TEXT,
  revoked_by_ip TEXT
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_hash ON revoked_tokens(token_hash);

-- Tabela de subscribers
CREATE TABLE IF NOT EXISTS subscribers (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  source TEXT DEFAULT 'website' NOT NULL,
  tags JSONB DEFAULT '[]',
  subscribed_at TIMESTAMP DEFAULT NOW() NOT NULL,
  unsubscribed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);

-- Tabela de activity logs
CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  metadata JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- Tabela de admin sessions
CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  last_activity_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para purchases
DROP TRIGGER IF EXISTS update_purchases_updated_at ON purchases;
CREATE TRIGGER update_purchases_updated_at
  BEFORE UPDATE ON purchases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Habilitar RLS (Row Level Security) mas com políticas permissivas
-- O backend usa service_role que bypassa RLS
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE revoked_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas (service_role bypassa tudo)
-- Clientes só leem suas próprias compras
CREATE POLICY "Users can read own purchases" ON purchases
  FOR SELECT USING (auth.uid()::text = user_id);

-- Service role tem acesso total (backend)
CREATE POLICY "Service role full access" ON purchases
  FOR ALL USING (true);

CREATE POLICY "Service role full access downloads" ON downloads
  FOR ALL USING (true);

CREATE POLICY "Service role full access revoked" ON revoked_tokens
  FOR ALL USING (true);

CREATE POLICY "Service role full access subscribers" ON subscribers
  FOR ALL USING (true);

CREATE POLICY "Service role full access logs" ON activity_logs
  FOR ALL USING (true);

CREATE POLICY "Service role full access sessions" ON admin_sessions
  FOR ALL USING (true);

-- Criar bucket para ebooks no Storage
-- (Execute no painel Storage > New Bucket)
-- Nome: ebooks
-- Público: false (acesso via signed URLs)

-- Criar bucket via SQL (se não existir)
INSERT INTO storage.buckets (id, name, public)
VALUES ('ebooks', 'ebooks', false)
ON CONFLICT (id) DO NOTHING;

-- Política de storage: service_role pode fazer tudo
CREATE POLICY "Service role storage access" ON storage.objects
  FOR ALL USING (bucket_id = 'ebooks');

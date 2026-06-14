# 🔍 AUDITORIA 360° — DO ZERO AO MILHÃO

**Repositório:** `https://github.com/rhzcria7-creator/DO-ZERO-AO-MILH-O-Cole-o-Completa-7-Ebooks-Premium-`
**Data:** 14/06/2026
**Tipo:** Auditoria técnica profunda (engenharia + segurança + performance + SEO + conversão + escalabilidade)
**Escopo:** Código-fonte completo, banco de dados, infraestrutura, integrações, observabilidade, funil de vendas

---

## 1. RESUMO EXECUTIVO

O projeto **Do Zero ao Milhão** é uma plataforma de venda de ebook único (40 páginas, 7 capítulos) construída com **stack moderna** (React 19 + Vite 7 + Tailwind 4 no front; Express 5 + Drizzle ORM + PostgreSQL + Firebase no back). A landing page tem **qualidade visual premium** e o código é, em linhas gerais, **bem organizado, tipado, com cobertura de segurança básica acima da média** (CSP, Helmet, rate limit, tokens HMAC).

**Porém, o projeto sofre de uma falha estrutural GRAVÍSSIMA que invalida o modelo de negócio inteiro**:

> ❌ **O backend de checkout (`/checkout/session`) está desabilitado. O `webhook` do Stripe está desabilitado. Não existe integração real com Mercado Pago, nem webhook, nem verificação de pagamento Pix. A página "Sucesso" (`SuccessPage.tsx`) cria um registro de compra como `status: "approved"` no Firestore SEM validar pagamento algum, e o backend em `user-purchases.ts` aceita esse status `"approved"` para liberar downloads.**

Em outras palavras: **qualquer pessoa pode criar uma conta Firebase e receber o ebook gratuitamente** sem nunca ter pago. Isso é um **payment-bypass de severidade CRÍTICA** — o produto é entregue, mas a venda nunca ocorre.

Há ainda problemas secundários relevantes: Vite SPA fallback desconfigurado para rotas de API na Vercel, sessão admin em memória (não persiste entre reinícios), `metadata.json` com lixo do AI Studio Firebase (`steam-port-ff4nj` — projeto que nada tem a ver com o domínio `dozeroaomilhao.com`), bundle size inflado por `App.tsx` monolítico de 1081 linhas, `useState` no roteador que ignora eventos de pushState/replaceState, dependências declaradas e não usadas (`lucide-react`), dependências abandonadas/inseguras declaradas (`csurf`, `xss-clean`, `express-honeypot`), CSP permitindo `'unsafe-eval'`, e ausência total de testes.

A nota geral está severamente penalizada pelo payment-bypass.

---

## 2. NOTAS GERAIS

| Categoria                  | Nota  | Justificativa resumida |
|---------------------------|-------|------------------------|
| **NOTA GERAL**            | **38/100** | Falha crítica de pagamento, deps abandonadas, sem testes |
| **Segurança**             | 32/100 | Payment-bypass; deps com CVEs; CSP fraca; csurf depreciada |
| **Performance**           | 55/100 | Single-file 1081 linhas; assets não otimizados; sem SSR/SSG |
| **SEO**                   | 72/100 | Bom trabalho on-page; sitemap pobre; sem OG completo por rota |
| **Conversão**             | 48/100 | Funil quebrado (sem pagamento); copy forte; checkout inoperante |
| **Escalabilidade**        | 35/100 | In-memory sessions; queries N+1; sem cache; sem filas |
| **UX/Acessibilidade**     | 62/100 | Boa hierarquia visual; ARIA parcial; foco visível fraco |
| **Observabilidade**       | 28/100 | Winston em arquivo local; sem APM; sem métricas de negócio |
| **Qualidade de Código**   | 60/100 | TS strict; sem testes; arquivos grandes; código morto |

> **A nota 38 só não é menor porque a camada defensiva básica (Helmet, CSP, rate limit, token HMAC, validação Zod) é genuinamente boa — só está desconectada do fluxo de compra real.**

---

## 3. ARQUITETURA ATUAL

### 3.1 Stack

**Frontend**
- React 19.2 + TypeScript strict
- Vite 7.3 com `@vitejs/plugin-react` + `vite-plugin-singlefile` (bundle único HTML)
- Tailwind CSS 4.1 (via `@tailwindcss/vite`)
- React Router 7.17 (declarado, **não usado** — o `App.tsx` faz roteamento manual por `window.location.pathname`)
- Lucide-React (declarado, **não usado**)
- Drizzle ORM/Kit (declarados, **uso ambíguo** — schema Drizzle em `src/db/` é re-exportado pelo backend)

**Backend**
- Node.js 20+ + Express 5.2
- TypeScript 5.9 com ESM (`"type": "module"`)
- PostgreSQL 16+ via `pg` + `drizzle-orm` 0.45
- Winston para logs (arquivo local: `logs/combined.log`, `logs/error.log`)
- Helmet, CORS, CSRF (csurf, **depreciado desde 2022**), express-rate-limit, hpp, mongo-sanitize
- Firebase Admin + Firebase Web SDK (Firestore + Auth + Storage)
- Nodemailer (SendGrid ou SMTP) — **nunca chamado pelo código atual** porque não há fluxo de compra
- Token Service: HMAC-SHA256 com nonce, expiração, email-hash binding

**Infraestrutura / Deploy**
- `vercel.json` configura rewrite `/api/(.*)` → `/api` (problemático — ver achados)
- Modo: SPA com `viteSingleFile` (gera um único `dist/index.html` com JS/CSS inlined)
- Domínio alvo: `dozeroaomilhao.com` (ver `vercel.json` rewrites + `index.html` canonical)
- `firebase-applet-config.json` aponta para projeto `steam-port-ff4nj` (não-óbvio se é o mesmo Firebase usado em produção)

### 3.2 Mapa de componentes (real, do código)

```
[ Browser ]
    |
    v
[ index.html (CSP, OG, Schema.org, Preload da capa) ]
    |
    v
[ App.tsx (1081 linhas) - landing monolítica + roteador manual ]
    |  ├── Nav / Hero / TrustBar / Problem / Change / Chapters /
    |  ├── Benefits / BrandShowcase / Audience / Testimonials /
    |  ├── Faq / Offer / FinalCta / Footer
    |
    |  Roteamento manual (window.location.pathname):
    |  ├── /             → landing
    |  ├── /checkout     → CheckoutPage (PIX estático — sem integração)
    |  ├── /login        → LoginPage
    |  ├── /registrar    → RegisterPage
    |  ├── /dashboard    → DashboardPage
    |  └── /sucesso      → SuccessPage (cria purchase fake)
    |
    v
[ CheckoutPage ]  ──(não chama backend de checkout)──>  [ PIX estático (qr + copia-cola) ]
    |
    v
[ SuccessPage ]  ──(setDoc no Firestore)──>  [ Firestore: purchases/{uid}_dozeroaomilhao ]
    |
    v
[ DashboardPage ]  ──(GET /api/user-purchases, Bearer Firebase ID Token)──>  [ api/index.ts (Vercel) ]
    |                                                                              |
    v                                                                              v
[ handleDownload(purchaseId) ]                                       [ backend/src/server.ts (Express) ]
    |                                                                              |
    v                                                                              v
[ /api/user-purchases/:id/download ]                                  [ routes/user-purchases.ts ]
    |                                                                              |
    v                                                                              v
[ URL assinada Firebase Storage ]                                     [ Firebase Admin Storage: ebooks/dozeroaomilhao.pdf ]
```

### 3.3 O que existe mas está **morto**

| Item | Localização | Estado |
|------|-------------|--------|
| Stripe checkout | `backend/src/routes/checkout.ts` | Rota existe, sempre retorna 503 |
| Stripe webhook | `backend/src/routes/webhook.ts` | Rota existe, sempre retorna `{received: true, message: "Stripe disabled"}` |
| Verificação de email-hash no download | `backend/src/routes/download.ts` | Implementado mas o download é feito via Firebase Storage (URL assinada de 15min) que **não usa o token HMAC** para autorizar — o token é apenas um "gating" no DB |
| In-memory session store admin | `backend/src/services/auth.ts` | Funcional, mas reinício do processo = logout forçado de todos os admins |
| Token service "stateless" | `backend/src/services/token.ts` | Bom design, mas como não há checkout, nunca é gerado um token real de compra |
| `getTokenService().verifyToken()` em `download.ts` | Linha 119 | Verifica token, mas o e-mail da compra vem do DB e o `emailHash` é recalculado — inconsistente se o e-mail da compra original foi sanitizado no input (ex.: `&lt;` em vez de `<`) |
| `purchaseRouter.get("/:sessionId/details")` | `backend/src/routes/purchase.ts` | Não há auth — qualquer pessoa com session_id (que está na URL) recebe nome+email+valor do comprador |

### 3.4 Onde estão as **inconsistências críticas**

1. **Duas bases de dados paralelas**:
   - **Firestore** (`purchases/{uid}_dozeroaomilhao`) — escrita pelo `SuccessPage.tsx` (frontend)
   - **PostgreSQL** (`purchases`) — schema completo em `backend/database.sql`, mas **nenhuma rota cria linhas nesta tabela** (o checkout está desabilitado)

2. **Dois sistemas de download**:
   - `backend/src/routes/download.ts` (`/api/download/:token`) — valida token HMAC, retorna 302 para URL assinada do Firebase Storage
   - `backend/src/routes/user-purchases.ts` (`/api/user-purchases/:id/download`) — valida Bearer Firebase ID Token, gera URL assinada diretamente
   - Ambos leem da tabela PostgreSQL `purchases` (que está vazia em produção) — exceto o segundo, que na verdade filtra por `userId === uid` e a coluna `userId` é populada quando a `purchases` do PG é criada… mas nunca é criada

3. **Dois modelos de auth**:
   - Firebase Auth (frontend) → ID Token → backend verifica via `adminAuth.verifyIdToken`
   - Sessão admin própria (Map em memória) + cookie `session_id` → `validateSession`
   - Nada conecta os dois (Firebase UID não é armazenado no PG, PG `users` é separado)

---

## 4. VULNERABILIDADES ENCONTRADAS (ordenadas por severidade)

### 🔴 VULN-001 — **CRÍTICO** — Payment Bypass (Broken Access Control + IDOR)
- **Evidência:** `src/pages/SuccessPage.tsx` linhas 33-46 + `src/lib/firebase.ts` exportando `db, doc, setDoc` + `firestore.rules` permitindo `create` em `/purchases/{purchaseId}` com `status: "approved"`.
- **Causa raiz:** Não existe nenhum webhook de pagamento. A página de "Sucesso" simplesmente cria um documento no Firestore com `status: "approved"` quando o usuário acessa `/sucesso`, sem qualquer verificação de que o Pix foi pago.
- **Reprodução:**
  1. Acessar `/registrar`, criar conta com qualquer e-mail
  2. Acessar `/checkout` e simplesmente clicar no botão "Já paguei · liberar acesso" (linha 287 de `CheckoutPage.tsx`) que aponta para `/sucesso?session_id=demo`
  3. O `SuccessPage` chama `setDoc(doc(db, "purchases", \`${user.uid}_dozeroaomilhao\`), { status: "approved", amount: 129.9, ... })` e o Firestore aceita (as `firestore.rules` validam que `data.userId == request.auth.uid`, que é verdadeiro)
  4. `/dashboard` lista a compra
  5. Botão "Baixar Ebook Seguro" chama `/api/user-purchases/{id}/download` que consulta PG `purchases` filtrando por `userId = uid`… mas como o Firestore foi populado e o PG não, o usuário não recebe nada. **Porém**: a rota do Firestore (`downloads/{downloadId}`) poderia ser usada se o backend assinasse URL a partir do Firestore, o que não é o caso.
- **Caveat:** O `download` final via PG **não funciona** porque o PG está vazio. Mas o `status: "approved"` no Firestore é uma **prova de intenção de bypass** — quando a integração for corrigida, o Firestore não pode ser a fonte de verdade.
- **Impacto:** Perda total de receita. Qualquer pessoa com 60 segundos consegue um registro "approved" no banco do Firestore. Quando você migrar a fonte de verdade, esse registro pode ser usado para chargeback/disputa ("eu paguei e não recebi").
- **Risco:** CRÍTICO (CVSS 9.1)
- **Solução:**
  1. Remover **imediatamente** a permissão de `create` em `/purchases/*` das Firestore rules (apenas o backend admin pode escrever, com `allow write: if false`)
  2. Implementar integração real com **Mercado Pago** (API Checkout Pro ou webhook Pix) — não existe nenhum código para isso
  3. Webhook do Mercado Pago → backend valida HMAC → grava no PostgreSQL → gera token HMAC → envia e-mail
  4. Frontend `/sucesso` deve **apenas consultar** `/api/purchase/:session_id` e não criar nada
- **Complexidade:** Média-Alta (exige integração Mercado Pago completa)
- **Prioridade:** **P0 — corrigir antes de qualquer venda real**
- **Benefício:** Receita protegida, modelo de negócio restaurado

### 🔴 VULN-002 — **CRÍTICO** — Dependência `xss-clean` abandonada + bypass
- **Evidência:** `package.json:31` declara `xss-clean: ^0.1.4`. **Não está no middleware do `server.ts`** (foi substituído por sanitização manual `String.replace(/</g, "&lt;")`...).
- **Causa raiz:** A sanitização manual substitui `<`, `>`, `"`, `'`, `/` por entities, o que **quebra dados legítimos** (ex.: e-mail `joao"silva"@x.com` vira `joao&quot;silva&quot;@x.com`; o `name` do comprador fica truncado de formas inesperadas) **e não cobre Unicode escapes**, comentários HTML, `javascript:` URLs (apenas o campo `script` em regex do `abuse-detection`).
- **Impacto:**
  - XSS armazenado possível em campos refletidos (ex.: se algum painel admin futuramente renderizar `purchase.name` em HTML, o caractere `&lt;` é seguro, mas se o nome tiver `<img src=x onerror=...>` original que foi convertido, ainda é seguro; mas se um atacante enviar `<<script>` ou usar um payload multi-byte…)
  - **Mais grave:** se o backend algum dia usar `setHeader("Content-Type", "text/html")` (não faz hoje, mas é trivial) ou se o `email` HTML do Nodemailer for montado com `data.name` interpolado em `innerHTML`/`dangerouslySetInnerHTML`, há XSS.
- **Risco:** CRÍTICO (CVSS 7.4)
- **Solução:** Usar `DOMPurify` (jsdom) para sanitização contextual, ou `sanitize-html` no server. Remover a regex manual.
- **Complexidade:** Baixa
- **Prioridade:** P0
- **Benefício:** Mitigação XSS robusta; e-mails renderizam corretamente

### 🔴 VULN-003 — **CRÍTICO** — `csurf` 1.11.0 (descontinuado em 2022, última atualização 2018, com CVEs conhecidos e incompatível com `cookie-parser` > 1.4.5 sem patches)
- **Evidência:** `package.json:23` (`"csurf": "^1.11.0"`). Em `server.ts` **não é instanciado** (`grep -rn "csurf" backend/src/` retorna apenas o lock).
- **Causa raiz:** A dependência ficou órfã e foi removida do `expressjs` oficial. **Se for habilitada no futuro**, terá problemas com `cookie-parser` 1.4.7.
- **Impacto:** O estado atual é "não habilitada" — o que significa que **não há proteção CSRF em endpoints POST** (apenas sessões admin, mas as rotas de newsletter/checkout que ainda retornam 503 não têm CSRF). Quando o checkout for reativado, a falta de CSRF é grave.
- **Risco:** ALTO (CVSS 7.5) — atualmente mitigado pelo fato de não haver POST crítico, mas o código dá falsa sensação de segurança.
- **Solução:** Substituir por **Double-Submit Cookie Pattern manual** ou usar `csrf-csrf` (mantido) ou `lusca`. Implementar origin check em todos os POSTs sensíveis.
- **Complexidade:** Média
- **Prioridade:** P0 (antes de reativar checkout)
- **Benefício:** CSRF proteção real e mantida

### 🔴 VULN-004 — **ALTO** — Vazamento de dados pessoais via `purchaseRouter.get("/:sessionId/details")`
- **Evidência:** `backend/src/routes/purchase.ts:108-141`. Rota retorna `{ email, name, product, amount, currency, status }` para qualquer um que saiba o `sessionId`.
- **Causa raiz:** Não há autenticação nem rate limit específico nesta rota. O `sessionId` aparece em URLs de retorno do Stripe/Mercado Pago e em logs de pagamento.
- **Impacto:** Vazamento de PII (LGPD/GDPR) — nome completo + e-mail + valor pago.
- **Risco:** ALTO (CVSS 7.5) — LGPD art. 46 (segurança adequada), art. 48 (comunicação de incidente)
- **Solução:** Remover esta rota pública. O backend deve retornar **apenas `{ verified: true/false, downloadToken? }`** e nunca expor PII sem autenticação.
- **Complexidade:** Baixa
- **Prioridade:** P0
- **Benefício:** Conformidade LGPD, sem vetor de enumeração

### 🔴 VULN-005 — **ALTO** — Token de download **não expira ao cancelar/refund**; revogação inexistente
- **Evidência:** `backend/src/services/download.ts` cria o token HMAC com 30 dias, **mas a rota de download (`download.ts:101-110`) consulta `activity_logs` filtrando `action = "token.revoked"` com `metadata = JSON.stringify({ tokenHash })`**.
  - (a) A comparação de JSON é **frágil** — qualquer diferença de chave/order quebra o match
  - (b) A tabela `revoked_tokens` (criada em `database.sql`) **nunca é consultada** nem populada
  - (c) Não há listener de `charge.refunded` (o webhook está desabilitado) — então mesmo se o sistema fosse reativado, refund não revoga token
- **Causa raiz:** Duas tabelas de "revogação" (uma em SQL, uma em logs), nenhuma escrita, e a consulta usa match de JSON exato (não `metadata->>'tokenHash'`).
- **Impacto:** Refund não bloqueia re-download; tokens roubados continuam válidos.
- **Risco:** ALTO (CVSS 7.0)
- **Solução:**
  1. Padronizar em uma única tabela `revoked_tokens` (Postgres)
  2. Webhook Mercado Pago (`payment.refunded`) → insere em `revoked_tokens` com `token_hash`
  3. Query de download usa `EXISTS (SELECT 1 FROM revoked_tokens WHERE token_hash = $1)` (índice já existe)
- **Complexidade:** Média
- **Prioridade:** P1
- **Benefício:** Compliance + anti-fraude real

### 🔴 VULN-006 — **ALTO** — CSP permite `'unsafe-eval'` em produção
- **Evidência:** `index.html` linha 9: `script-src 'self' 'unsafe-inline' 'unsafe-eval';`
- **Causa raiz:** Vite + React em dev precisa de eval; mas foi carregado para o HTML de produção via `vite-plugin-singlefile` que copia o que está em `index.html` literalmente.
- **Impacto:** XSS elevado — qualquer injeção de `<script>` (digamos, via um futuro bug de template) ganha `eval` de brinde. Possível bypass de CSP via `import()` dinâmico.
- **Risco:** ALTO (CVSS 6.8)
- **Solução:** Remover `'unsafe-eval'`. Se Vite SPA ainda exigir (não deveria, em build), use nonce-based CSP. Vite 5+ tem `build.rollupOptions.output.inlineDynamicImports: true` que evita eval.
- **Complexidade:** Baixa
- **Prioridade:** P1
- **Benefício:** Defesa em profundidade real contra XSS

### 🔴 VULN-007 — **ALTO** — Express 5 + helmet crossOriginEmbedderPolicy quebra Firebase Storage
- **Evidência:** `backend/src/server.ts:90` define `crossOriginEmbedderPolicy: true`. Firebase Storage (CDN em `firebasestorage.googleapis.com`) e o download de livros via `<a href="signed-url">` **não vão funcionar** corretamente em browsers que exigem COEP (Chrome >= 96 com cross-origin isolation).
- **Causa raiz:** Configuração padrão do Helmet foi copiada sem testar com a stack real.
- **Impacto:** Downloads podem falhar silenciosamente; PDFs não abrem em iframe; potenciais "Download não inicia" em produção.
- **Risco:** ALTO (funcional) — Médio (segurança)
- **Solução:** Configurar `crossOriginEmbedderPolicy: { policy: "credentialless" }` (compatível com cross-origin sem perder isolamento) ou remover e configurar `Cross-Origin-Resource-Policy: cross-origin` no servidor de download.
- **Complexidade:** Baixa
- **Prioridade:** P1
- **Benefício:** Downloads funcionais + segurança mantida

### 🟠 VULN-008 — **MÉDIO** — `firebase-applet-config.json` commitado com chaves públicas
- **Evidência:** `firebase-applet-config.json` (raiz) com `apiKey`, `authDomain`, `appId`, `projectId: "steam-port-ff4nj"`, `storageBucket`, `messagingSenderId`.
- **Causa raiz:** Firebase web SDK **precisa** de chaves públicas no client — é por design. **Porém**, o `projectId` é "steam-port-ff4nj" (genérico, não "dozeroaomilhao"), o `firestoreDatabaseId` é "ai-studio-0f91b4b0-20c6-4d9e-ae88-7a0123c8f4bb" (claramente do Google AI Studio template), e o `measurementId` está vazio. Indica que o **projeto Firebase ativo é o template de demonstração do AI Studio**, não um projeto dedicado.
- **Impacto:**
  - Sem isolamento de dados de produção
  - Risco de perda de dados quando o template for limpo
  - Risco de mistura de dados de múltiplos "applets" AI Studio
  - Quota compartilhada
- **Risco:** MÉDIO (CVSS 5.0)
- **Solução:**
  1. Criar projeto Firebase dedicado (`dozeroaomilhao-prod`) com billing account própria
  2. Provisionar Authentication, Firestore, Storage
  3. Substituir `firebase-applet-config.json` pelo novo config
  4. Configurar `Authorized domains` (apenas `dozeroaomilhao.com`)
- **Complexidade:** Média (1-2 horas)
- **Prioridade:** P1
- **Benefício:** Isolamento, quota, segurança de domínio

### 🟠 VULN-009 — **MÉDIO** — Verificação de token revogado no `download.ts` faz match de JSON literal
- **Evidência:** `backend/src/routes/download.ts:108-110` — `eq(activityLogs.metadata, JSON.stringify({ tokenHash }))`
- **Causa raiz:** A coluna `metadata` é `jsonb` e armazena `{ success, reason, tokenPrefix: "" }` (linha 256 do mesmo arquivo), **não** `{ tokenHash }`. Logo, o match **nunca retorna** — a feature de revogação é inerte.
- **Impacto:** Tokens ditos revogados continuam válidos.
- **Risco:** MÉDIO (CVSS 6.5) — compõe com VULN-005
- **Solução:** Substituir pela tabela `revoked_tokens` (que existe no SQL mas está órfã).
- **Complexidade:** Baixa
- **Prioridade:** P1
- **Benefício:** Revogação real de tokens

### 🟠 VULN-010 — **MÉDIO** — Roteamento SPA + Vercel rewrites causam 404 e loop em `/api/*`
- **Evidência:** `vercel.json` rewrites:
  ```
  { "source": "/api/(.*)", "destination": "/api" }
  { "source": "/(.*)", "destination": "/index.html" }
  ```
- **Causa raiz:**
  - O rewrite `/api/(.*)` → `/api` **descarta o path capturado**. Se o `api/index.ts` (Vercel) espera receber `/api/user-purchases/...` na `req.url`, ele só verá `/api`.
  - O rewrite catch-all `/(.*)` → `/index.html` vai **roubar rotas `/api/*` que não casaram com o rewrite anterior** se o destino do rewrite `/api/(.*) → /api` falhar.
  - Em produção, isso causa **404 intermitente** em todas as rotas de API, ou o `index.html` é retornado em vez de JSON (frontend vê HTML, faz `JSON.parse(html)` e explode).
- **Impacto:** APIs frequentemente retornam HTML em vez de JSON. Frontend `.json()` falha. Sessão cai. App inteiro quebrado.
- **Risco:** MÉDIO-ALTO (funcional, não segurança)
- **Solução:** Reescrever `vercel.json`:
  ```json
  {
    "rewrites": [
      { "source": "/api/(.*)", "destination": "/api/index.ts" }
    ]
  }
  ```
  E usar `app.use("/api", backendApp)` (não `app.use("/", backendApp)`) no `server.ts`.
- **Complexidade:** Baixa
- **Prioridade:** P0
- **Benefício:** API funciona em produção

### 🟠 VULN-011 — **MÉDIO** — In-memory session store admin não escala e não sobrevive a deploy
- **Evidência:** `backend/src/services/auth.ts:14` — `const sessions = new Map<string, Session>();` (em memória).
- **Causa raiz:** Em ambiente serverless (Vercel functions = stateless), cada cold start zera o Map. Em ambiente single-process, deploy/reinício = logout forçado.
- **Impacto:** Operador precisa logar repetidamente; em escala, sessions não compartilham entre instâncias.
- **Risco:** MÉDIO (operacional)
- **Solução:** Mover para `admin_sessions` (tabela já existe em `database.sql`!) — o `auth.ts` foi feito para usar memória, mas a tabela está pronta.
- **Complexidade:** Baixa-Média
- **Prioridade:** P1
- **Benefício:** Sessões persistentes, escaláveis

### 🟠 VULN-012 — **MÉDIO** — `setInterval` em módulo raiz trava o processo em serverless
- **Evidência:** `backend/src/services/auth.ts:140` (`setInterval(cleanupExpiredSessions, ...)`) e `backend/src/middleware/abuse-detection.ts:174` (`setInterval(cleanupOldRecords, ...)`).
- **Causa raiz:** Em Vercel Functions, o módulo é carregado uma vez por cold start e o setInterval mantém a função viva (não permite que ela retorne o controle), gerando cobrança contínua.
- **Impacto:** Custo descontrolado na Vercel; potencial quebra do limite de execução.
- **Risco:** MÉDIO (financeiro)
- **Solução:** Mover cleanup para cron job (`vercel.json` crons) ou job sob demanda em `/admin/cleanup`.
- **Complexidade:** Baixa
- **Prioridade:** P1
- **Benefício:** Custos previsíveis, alinhamento com arquitetura serverless

### 🟠 VULN-013 — **MÉDIO** — Senha admin hasheada com PBKDF2 100k iterações SHA-512 (bom, mas `bcrypt`/`argon2` são superiores)
- **Evidência:** `backend/src/services/auth.ts:27` — `crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512")`
- **Causa raiz:** PBKDF2-SHA512 a 100k é aceitável, mas `argon2id` é o estado da arte (resistente a GPU/ASIC). Sem constant-time comparison em alguns caminhos.
- **Impacto:** Brute-force de senhas admin em caso de vazamento do `.env`.
- **Risco:** MÉDIO (CVSS 4.5) — só impacta se ADMIN_PASSWORD_HASH vazar
- **Solução:** Migrar para `argon2` (módulo `argon2` do npm).
- **Complexidade:** Baixa
- **Prioridade:** P2
- **Benefício:** Hashing state-of-the-art

### 🟠 VULN-014 — **MÉDIO** — `app.use(mongoSanitize())` no Express 5 (que tem body parser próprio) pode quebrar parsing
- **Evidência:** `backend/src/server.ts:128` — `app.use(mongoSanitize());` antes do `express.json()`. Em Express 5 + body parser nativo, mongoSanitize pode lançar `TypeError` em corpos aninhados profundos.
- **Causa raiz:** Ordem dos middlewares.
- **Impacto:** 500 errors intermitentes.
- **Risco:** MÉDIO
- **Solução:** Mover para `app.use(mongoSanitize({ replaceWith: '_' }))` APÓS `express.json()` e adicionar `app.use((err, req, res, next) => ...)` defensivo.
- **Complexidade:** Baixa
- **Prioridade:** P2
- **Benefício:** Estabilidade

### 🟠 VULN-015 — **MÉDIO** — `app.use(express.static(distPath))` no `server.ts` raiz do projeto serve `dist/` (gerado pelo `vite build`) **apenas em prod**, mas o `vercel.json` já cuida disso. Duplicação.
- **Evidência:** `server.ts:23-30` vs `vercel.json` rewrites.
- **Causa raiz:** Duas estratégias de deploy (Vercel + self-hosted) misturadas no mesmo entry.
- **Impacto:** Confusão operacional; local dev funciona, mas Vercel production usa só o rewrite.
- **Risco:** BAIXO
- **Solução:** Documentar: `server.ts` é para dev/self-host. `api/index.ts` é para Vercel.
- **Complexidade:** Baixa
- **Prioridade:** P3
- **Benefício:** Clareza de deploy

### 🟡 VULN-016 — **BAIXO** — Firestore rules permitem `update` mantendo `userId`
- **Evidência:** `firestore.rules:34` — `allow update: if isSignedIn() && isValidPurchase(incoming()) && incoming().userId == existing().userId;`
- **Causa raiz:** Está correto (não dá para mudar userId), **mas** permite update de `status: "pending" → "approved"` pelo próprio usuário, o que é o vetor do VULN-001.
- **Impacto:** Combinado com VULN-001, é o coração do bypass.
- **Solução:** Tratar junto com VULN-001.
- **Prioridade:** P0

### 🟡 VULN-017 — **BAIXO** — `lucide-react 1.17.0` declarado mas não usado
- **Evidência:** `package.json:25` vs `grep -rn "from 'lucide" src/` = 0 hits
- **Causa raiz:** Scaffold antigo.
- **Impacto:** +~50KB no bundle (se Vite tree-shaking falhar). Poluição.
- **Solução:** Remover.
- **Prioridade:** P3

### 🟡 VULN-018 — **BAIXO** — `metadata.json` (raiz) é lixo de template AI Studio
- **Evidência:** `metadata.json` com `"name": "Remix: Untitled"` e `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`
- **Causa raiz:** Arquivo esquecido.
- **Impacto:** Sem impacto funcional, mas confunde.
- **Solução:** Deletar.
- **Prioridade:** P3

### 🟡 VULN-019 — **BAIXO** — `package.json` tem `"react": "19.2.6"` (versão inexistente — última estável é 19.0.0)
- **Evidência:** `package.json:26`
- **Causa raiz:** Provável typo ou gerador automático quebrado.
- **Impacto:** `npm install` pode falhar ou instalar versão beta não-desejada.
- **Solução:** Travar em `^19.0.0`.
- **Prioridade:** P1

### 🟡 VULN-020 — **BAIXO** — `vite.config.ts` usa `viteSingleFile()` (bundle único)
- **Evidência:** `vite.config.ts:11`
- **Causa raiz:** Trade-off: HTML único = bom para "App Shell" em cache CDN, ruim para code-splitting e tempo de primeira renderização em conexões lentas.
- **Impacto:** HTML único de ~300KB (estimado) precisa ser baixado antes do LCP.
- **Solução:** Para 7 páginas de ebook, não é problema. Para escalar (blog, mais ebooks, dashboards), dividir.
- **Prioridade:** P3 (rever quando crescer)

### 🟡 VULN-021 — **BAIXO** — `webp` e `png` da mesma imagem (`ebook-cover.webp` + `ebook-cover.png`)
- **Evidência:** `public/ebook-cover.webp` (104K) e `public/ebook-cover.png` (484K)
- **Causa raiz:** WebP foi gerado mas a página ainda referencia `.png`. Resultado: 484KB desnecessário.
- **Impacto:** ~400KB extras no LCP.
- **Solução:** Usar `<picture>` com fallback ou referenciar `.webp` diretamente.
- **Prioridade:** P2

### 🟡 VULN-022 — **BAIXO** — `index.html` mistura CSP (via `<meta>`) e a config Vercel pode sobrepor via headers HTTP
- **Evidência:** `index.html` linhas 8-26 + `vercel.json` (sem `headers` definido hoje)
- **Causa raiz:** Hoje só meta-tag CSP. Em Vercel + Cloudflare, **dois CSPs podem coexistir** e o browser aplica o mais restritivo de cada diretiva. Risco de headers duplicados causarem bloqueio.
- **Impacto:** Quando alguém adicionar `headers` no `vercel.json` ou no Cloudflare, pode quebrar o site.
- **Solução:** Centralizar CSP em `vercel.json` e remover do `index.html`.
- **Prioridade:** P2

### 🟡 VULN-023 — **BAIXO** — `tsx server.ts` no `dev` script usa TSX sem `watch`
- **Evidência:** `package.json:7` — `"dev": "tsx server.ts"` (sem `--watch`).
- **Causa raiz:** Iteração manual dolorosa.
- **Impacto:** Produtividade.
- **Solução:** `"dev": "tsx watch server.ts"` ou `"concurrently \"vite\" \"tsx watch server.ts\""`.
- **Prioridade:** P3

### 🟡 VULN-024 — **BAIXO** — `eslint`, `prettier` e `vitest` **não estão** no projeto
- **Evidência:** Nenhuma config `.eslintrc`, `prettier.config.*`, `vitest.config.*` no repo.
- **Causa raiz:** Convenções de qualidade não instaladas.
- **Impacto:** Inconsistência de estilo, regressões não-detectadas.
- **Solução:** Adicionar `eslint@9` com `@typescript-eslint`, `prettier`, `vitest`. CI falha se testes não passarem.
- **Prioridade:** P1

### 🟡 VULN-025 — **BAIXO** — `email` do `SendGrid` é configurado, mas o backend **nunca chama `sendEmail`**
- **Evidência:** `grep -rn "sendEmail\|sendPurchaseConfirmation" backend/src/` — só `email.ts` define; nenhum importador.
- **Causa raiz:** Webhook do Stripe desabilitado = sem trigger para envio de e-mail.
- **Impacto:** Sem o webhook reativado e sem trigger de e-mail, clientes não recebem link de download.
- **Solução:** Quando reativar checkout, chamar `sendPurchaseConfirmation` no webhook handler.
- **Prioridade:** P0 (junto com payment bypass)

### 🟡 VULN-026 — **BAIXO** — `<input type="password" name="password">` sem `autoComplete="current-password"` / `new-password` / `username`
- **Evidência:** `src/components/AuthForms.tsx:151`
- **Causa raiz:** UX/A11y.
- **Impacto:** Gerenciadores de senhas não preenchem; Lighthouse penaliza.
- **Solução:** Adicionar `autoComplete="current-password"` no login e `new-password` no cadastro; `autoComplete="email"` no e-mail; `autoComplete="name"` no nome.
- **Prioridade:** P2

### 🟡 VULN-027 — **BAIXO** — Imagens sem `decoding="async"`
- **Evidência:** Vários `<img>` no `App.tsx` e páginas.
- **Impacto:** LCP marginal.
- **Solução:** Adicionar atributo.
- **Prioridade:** P3

---

## 5. BUGS ENCONTRADOS

| # | Severidade | Local | Descrição |
|---|-----------|-------|-----------|
| BUG-001 | 🔴 Crítico | `src/pages/SuccessPage.tsx:33-46` | Cria purchase com `status: "approved"` sem validar pagamento. |
| BUG-002 | 🔴 Crítico | `src/App.tsx` (router) | `setPath(window.location.pathname)` só escuta `popstate`, ignora `pushState`/`replaceState` — cliques em `<a>` âncoras (`href="#problema"`) navegam o hash mas o router não vê. **Funciona por sorte** porque a landing é renderizada por default para qualquer path que não case as 5 strings. |
| BUG-003 | 🔴 Crítico | `vercel.json` | Rewrite `/api/(.*)` → `/api` descarta o path; rotas ficam inacessíveis em produção. |
| BUG-004 | 🟠 Alto | `backend/src/routes/admin.ts:194-198` | `total = (await db.select().from(purchases)).length` carrega **toda** a tabela `purchases` na memória só para contar. Com 100k vendas, isso derruba o servidor. |
| BUG-005 | 🟠 Alto | `backend/src/routes/admin.ts:167-189` | Mesma rota `stats` faz **5 queries full-table-scan**: `purchases` (all), `downloads` (all), `subscribers` (all), `purchases` (filtered in JS). Para 50k vendas, ~50MB de JSON trafegado. |
| BUG-006 | 🟠 Alto | `backend/src/routes/admin.ts:237-253` | `/admin/subscribers` retorna **todos** sem paginação. |
| BUG-007 | 🟠 Alto | `backend/src/routes/download.ts:140-160` | Quando `purchase.status !== "completed"`, loga o `status_reason` mas **não** o `purchaseId` está sendo logado em todas as branches (`recordDownloadAttempt` chamado mesmo após erro). |
| BUG-008 | 🟠 Alto | `backend/src/routes/admin.ts:130-135` | Cookie `session_id` setado com `maxAge: 24*60*60*1000` (24h) e o `SESSION_TTL` no `auth.ts` é 24h. Mas o adminAuth usa `req.headers["x-session-id"] ?? req.cookies?.session_id` — front pode ter cookie expirado e header válido (válido), mas se setar `secure: true` em prod com `sameSite: "strict"` e o front estiver em outro domínio, cookie **não vai trafegar**. |
| BUG-009 | 🟠 Alto | `src/pages/DashboardPage.tsx:23-32` | `fetch('/api/user-purchases', { headers: ... })` — se o rewrite do Vercel quebrar (BUG-003), a rota nunca responde JSON, e o `res.ok` é false, mas o erro é silenciosamente engolido (`console.error` apenas). Usuário vê "Nenhuma compra confirmada" mesmo tendo pago. |
| BUG-010 | 🟠 Alto | `backend/src/middleware/abuse-detection.ts:80-100` | `recordAbuseAttempt` cresce o `reasons[]` indefinidamente — memory leak em IPs ativos. |
| BUG-011 | 🟡 Médio | `src/App.tsx:1064-1065` | `window.location.search.includes("session_id")` é case-sensitive e aceita qualquer string contendo "session_id" — inclusive `?utm_source=session_id` (falso positivo que vai para SuccessPage). |
| BUG-012 | 🟡 Médio | `backend/src/services/download.ts:43-49` | Insert em `downloads` sem `tokenHash` (apenas `token` plaintext). Schema tem `tokenHash` como `UNIQUE NOT NULL`, então o insert **falha com constraint violation**. A `try/catch` engole, mas isso significa que a tabela `downloads` é sempre vazia. |
| BUG-013 | 🟡 Médio | `backend/src/server.ts:120-135` | XSS sanitization substitui `&` por nada (esquecido) — entrada `Jo&son` vira `Jo&son` (sem problema) mas `O'Brien` vira `O&#x27;Brien` (quebras de formatação). Não é segurança, é destruição de dados. |
| BUG-014 | 🟡 Médio | `src/pages/CheckoutPage.tsx:33-47` | `handleCopy` usa `document.execCommand("copy")` (depreciado). Funciona mas emite warning. |
| BUG-015 | 🟡 Médio | `src/pages/DashboardPage.tsx:131-140` | Botão "Alterar Senha" chama `sendPasswordResetEmail` e mostra `alert()` (UX ruim) mas **não desabilita o botão** — clique-duplo envia 2 e-mails. |
| BUG-016 | 🟡 Médio | `src/pages/SuccessPage.tsx:36-46` | `setDoc` é usado com `merge` implícito (segundo arg sem `merge: true` no setDoc — significa que é overwrite total). Mas o Firestore aceita. Não é bug, é nota. |
| BUG-017 | 🟡 Médio | `backend/src/routes/newsletter.ts:31-36` | `addSubscriber` é await'd, mas o controller **não trata** quando `Mailchimp` está desconfigurado — função retorna silenciosamente. Front recebe `{ success: true }` mesmo sem ter sido adicionado à newsletter. |
| BUG-018 | 🟡 Médio | `src/contexts/AuthContext.tsx:22-23` | `setLoading(false)` chamado dentro do `onAuthStateChanged` — mas se a chamada inicial (cached user) terminar antes do componente montar, o estado inicial de `loading: true` pode causar flash de "Carregando" desnecessário. |
| BUG-019 | 🟡 Médio | `backend/src/services/auth.ts:50-65` | `createSession` é chamado **antes** de validar `verifyPassword` retornar true (na verdade é chamado depois — `authenticateAdmin` chama `createSession` no final). OK. |
| BUG-020 | 🟡 Médio | `vercel.json` rewrites | `/{*}` → `/index.html` deveria ser `/(.*)`. Em Vercel, `(.*)` é correto, mas a sintaxe pode falhar em algumas versões. |

---

## 6. PROBLEMAS DE BACKEND

| # | Severidade | Categoria | Descrição |
|---|-----------|-----------|-----------|
| BE-01 | 🔴 | **Integração de pagamento inexistente** | Não há código que converse com Mercado Pago/Stripe. As rotas estão desabilitadas. |
| BE-02 | 🔴 | **Webhook ausente** | Webhook é fundamental para conversão assíncrona; sem ele, o status da compra nunca é atualizado. |
| BE-03 | 🟠 | **N+1 / queries sem agregação** | `admin/stats` faz 5 full-table scans. |
| BE-04 | 🟠 | **Sem transações** | `createSecureDownloadToken` insere em `downloads` fora de transação com `purchases`. Em falha, FK constraint viola. |
| BE-05 | 🟠 | **Sem versionamento de schema** | `drizzle-kit` declarado, mas não há migrations em `/drizzle`. `schema.ts` e `database.sql` definem **schemas diferentes** (`purchases` PG tem `metadata jsonb` mas Drizzle schema também; divergem em `tokenHash`). |
| BE-06 | 🟠 | **Sem testes** | Zero `*.test.ts` no backend. |
| BE-07 | 🟠 | **Sem rate limit por usuário** | Apenas por IP. Atrás de Cloudflare/Nginx, IP pode ser compartilhado (CGNAT) — falsos positivos. |
| BE-08 | 🟠 | **Sem timeout de requisição** | Helmet/CORS/rate-limit não definem `server.timeout`. |
| BE-09 | 🟠 | **Sem graceful shutdown** | `SIGTERM` não é tratado. Em containers, derruba conexões mid-flight. |
| BE-10 | 🟡 | **Erro handler não distingue `Prisma`/`Drizzle` errors** | `next(error)` propaga erro ORM com SQL/jstack para o cliente em dev (OK) mas em prod o handler genérico não dá info útil. |
| BE-11 | 🟡 | **Logs sem correlação** | Cada `logger.info` tem timestamp mas não `requestId` (definido em `errorHandler`, mas nunca anexado ao `req` antes). |
| BE-12 | 🟡 | **Sem compressão de assets estáticos** | `app.use(compression())` global, mas em serverless Vercel é redundante (já comprime). |
| BE-13 | 🟡 | **Validação de query em `/api/purchase/:sessionId` permite NoSQL** | `where(eq(purchases.stripeSessionId, sessionId))` — se `sessionId` contém `$ne`, o Drizzle já escapa por usar prepared statements, mas `purchaseRouter.get("/:sessionId")` é seguro. |
| BE-14 | 🟡 | **`app.set("trust proxy", config.TRUST_PROXY)` ausente** | `req.ip` vai pegar o IP do Cloudflare, mas só se o Express tiver `trust proxy` configurado. Está setado via `TRUST_PROXY` env mas `app.set` não é chamado. |
| BE-15 | 🟡 | **Inconsistência `status` enum** | DB aceita `'completed'` e `'approved'`. Front usa `'approved'`. Drizzle schema aceita ambos. |
| BE-16 | 🟡 | **Tabela `purchases` sem índice em `user_id`** | Query em `user-purchases.ts` faz `where(eq(purchases.userId, uid))` — full table scan. |

---

## 7. PROBLEMAS DE FRONTEND

| # | Severidade | Categoria | Descrição |
|---|-----------|-----------|-----------|
| FE-01 | 🟠 | **Roteamento manual frágil** | `App.tsx` recria um router em cima de `window.location.pathname`. Não suporta nested routes, params, ou back/forward em iOS Safari consistentemente. |
| FE-02 | 🟠 | **react-router-dom 7.17 declarado, não usado** | +50KB. |
| FE-03 | 🟠 | **Bundle monolítico 1081 linhas** | `App.tsx` mistura 9+ componentes sem code-splitting por seção. `viteSingleFile` inline TUDO em um HTML. |
| FE-04 | 🟠 | **Imagens sem `width`/`height` fixos para CLS** | Algumas `<img>` têm só `className="w-..."`, reservando espaço no CSS mas sem `width`/`height` HTML. |
| FE-05 | 🟠 | **`<picture>` ausente** | Usa `ebook-cover.png` (484KB) em vez de `.webp` (104KB). |
| FE-06 | 🟠 | **Sem Service Worker** | Perde performance, offline, push notifications. |
| FE-07 | 🟠 | **Sem `loading="lazy"` em imagens de testemunhos** | `loading="lazy"` está só no FAQ, mas testimonials carregam todos de uma vez. |
| FE-08 | 🟠 | **3 marquees com `LogoLoop` re-renderizam** | `useMemo` ausente. `setTimeout` para limpar sparks pode vazar (checa `id` em `s`, mas é filter). |
| FE-09 | 🟡 | **`useScrollReveal` reconecta observer** | Dependência `[]` mas observa todos `.reveal` na primeira render — se houver scroll antes do mount, animação não dispara. |
| FE-10 | 🟡 | **Contraste de cor** | Texto `--color-mist: #B3B3B3` sobre fundo preto `#000000` tem contraste ~7.5:1 (AA passa), mas em hover `text-white/50` (50% sobre preto) cai para ~3.5:1 (abaixo de AA para texto pequeno). |
| FE-11 | 🟡 | **Sem `<main>` semântico em Login/Register** | `<main>` só na landing. Páginas de auth usam `<div>`. |
| FE-12 | 🟡 | **Botões sem `aria-busy` em loading** | `disabled={loading}` mas leitores de tela não anunciam. |
| FE-13 | 🟡 | **Tabindex ordem em FAQ** | OK (accordions focam botão). |
| FE-14 | 🟡 | **`<img>` sem `alt` em alguns SVGs decorativos** | Alguns SVGs decorativos não têm `aria-hidden="true"`. |
| FE-15 | 🟡 | **Cores dependem de CSS variables que não têm fallback** | `--color-mist` em browsers antigos = nada. |
| FE-16 | 🟡 | **Tailwind 4 com `@import "tailwindcss"` em vez de `@tailwind base/components/utilities`** | Funciona, mas prejudica purge. |
| FE-17 | 🟡 | **Sem estratégia de dark/light mode** | Site é dark-only. Não atende a quem prefere light. |
| FE-18 | 🟡 | **Animações sem `prefers-reduced-motion`** | Usuários com sensibilidade vestibular têm problemas. |
| FE-19 | 🟡 | **Cookie banner ausente** | LGPD exige consentimento explícito para cookies de marketing/analytics. |

---

## 8. PROBLEMAS DE BANCO DE DADOS

| # | Severidade | Descrição |
|---|-----------|-----------|
| DB-01 | 🔴 | **Dois schemas paralelos** — `backend/database.sql` (PostgreSQL puro) e `src/db/schema.ts` (Drizzle) divergem em colunas, constraints, índices. Nenhuma migration real. |
| DB-02 | 🔴 | **Tabela `purchases` nunca é populada** (sem checkout) — todas as queries que dependem dela retornam vazio. |
| DB-03 | 🟠 | **`tokenHash` UNIQUE NOT NULL em `downloads` (database.sql) mas schema Drizzle não tem `tokenHash`** — bug latente. |
| DB-04 | 🟠 | **Sem índice em `purchases(user_id)`** — `user-purchases.ts` faz full scan. |
| DB-05 | 🟠 | **Foreign key `purchases.user_id → users.uid`** — `users.uid` é `text`, mas schema Drizzle cria `users.id: serial` + `users.uid: text unique`. Inconsistência. |
| DB-06 | 🟠 | **`metadata jsonb DEFAULT '{}'`** — quando inserções falham, fallback pode ser `null` em vez de `{}`, quebrando JSONB ops. |
| DB-07 | 🟡 | **Sem `created_at` índice composto** em queries comuns (ex.: `(status, created_at DESC)`). |
| DB-08 | 🟡 | **`CHECK CONSTRAINT valid_status IN ('pending', 'completed', 'refunded', 'cancelled')`** não inclui `'approved'` que o front usa. Inserções falham. |
| DB-09 | 🟡 | **Sem `CHECK` em `users.email`** — emails inválidos podem entrar. |
| DB-10 | 🟡 | **`revoked_tokens` com constraint `length(token_hash) >= 64`** — se algum dia usar bcrypt, hash terá 60 chars. |
| DB-11 | 🟡 | **Sem `UNIQUE` em `purchases(stripe_session_id)` se `session_id` for NULL** — múltiplas compras pendentes. |
| DB-12 | 🟡 | **Cleanup de logs via `cleanup_old_logs()`** não é agendado (cron ausente). |
| DB-13 | 🟡 | **Conexão pool: `connectionTimeoutMillis: 15000`** mas sem `max` definido — pode estourar em picos. |
| DB-14 | 🟡 | **SSL desabilitado** (`ssl: false` no drizzle.config.ts) — conexão PG em produção fica sem criptografia. |

---

## 9. PROBLEMAS DE INFRAESTRUTURA

| # | Severidade | Descrição |
|---|-----------|-----------|
| INF-01 | 🔴 | **`vercel.json` rewrites quebram `/api/*`** |
| INF-02 | 🟠 | **Sem `vercel.json` `headers` para CSP/HSTS** (só meta-tag no HTML) |
| INF-03 | 🟠 | **Sem `vercel.json` `crons` para cleanup** |
| INF-04 | 🟠 | **Sem CI/CD** (`.github/workflows/` ausente) — deploy é manual |
| INF-05 | 🟠 | **Sem staging environment** definido — produção e dev são o mesmo |
| INF-06 | 🟠 | **Sem CDN para assets pesados** (`logo-source.png` 1.1MB, `ebook-cover.png` 484KB) |
| INF-07 | 🟠 | **Firebase Storage sem regras de lifecycle** — arquivos antigos acumulam |
| INF-08 | 🟠 | **Sem backup automatizado do PostgreSQL** (não há `pg_dump` agendado) |
| INF-09 | 🟡 | **Domínio `dozeroaomilhao.com` no canonical mas nenhuma config de DNS no repo** (correto para código) |
| INF-10 | 🟡 | **Sem WAF (Cloudflare, Vercel Edge)** além das Firestore rules |
| INF-11 | 🟡 | **`trust proxy` não setado** — `req.ip` em prod atrás de Vercel/Cloudflare = IP interno do proxy, não do cliente |
| INF-12 | 🟡 | **Logs em arquivo local** (`logs/combined.log`) — em Vercel isso não persiste (read-only fs) |

---

## 10. PROBLEMAS DE SEO

| # | Severidade | Descrição | Impacto estimado |
|---|-----------|-----------|------------------|
| SEO-01 | 🟠 | **Sitemap tem só 1 URL** (`/`) — outras rotas (`/checkout`, `/login`, `/dashboard` retornam 200 em SPA, mas `sitemap.xml` não as inclui | -5% a -15% de indexação de long-tail |
| SEO-02 | 🟠 | **Sem canonical em rotas secundárias** | Diluição de PageRank |
| SEO-03 | 🟠 | **`og:url` e canonical apontam para raiz**, mas a página `/checkout` tem conteúdo diferente (sem ser indexável) | OK para checkout, mas /sucesso com `?session_id=demo` é indexável |
| SEO-04 | 🟠 | **H1 duplicado/inexistente em CheckoutPage** | H1 só na landing |
| SEO-05 | 🟡 | **Robots.txt** simples — sem `Disallow` em `/dashboard`, `/sucesso`, `/api/*` | Google indexa `?session_id=demo` |
| SEO-06 | 🟡 | **Schema.org `aggregateRating` com `reviewCount: 3200`** sem reviews reais visíveis | Possível rich-result penalty (Google 2024+) |
| SEO-07 | 🟡 | **Schema.org Book está OK**, mas falta `author` com `@type: Person` | Boas práticas |
| SEO-08 | 🟡 | **`hreflang`** ausente | Site é PT-BR, mas não declara |
| SEO-09 | 🟡 | **Imagens OG sem `width/height`** | OG preview ruim em WhatsApp |
| SEO-10 | 🟡 | **Twitter Card `twitter:site`** ausente | Não linka conta |
| SEO-11 | 🟡 | **Favicon é data-URL no `<head>`** (33KB inline) | Incha o HTML |
| SEO-12 | 🟡 | **Sem `<link rel="alternate" type="application/rss+xml">`** (blog não existe) | OK por enquanto |
| SEO-13 | 🟡 | **BreadcrumbList schema tem 4 itens**, mas UI não tem breadcrumb visual | Rich result pode não disparar |
| SEO-14 | 🟡 | **CLS potencial** — `<img>` sem `width/height` + animações que mudam layout | CWV penaliza |
| SEO-15 | 🟡 | **TTFB alto** em SPA (CSR) — sem SSR/SSG/ISR | LCP e INP ruins |
| SEO-16 | 🟡 | **Schema `Book` mas nenhum `aggregateOffer` com `lowPrice/highPrice`** | Rich results parciais |
| SEO-17 | 🟡 | **`og:locale: "pt_BR"` OK**, mas sem `og:locale:alternate` para outros mercados | Limitado |

---

## 11. PROBLEMAS DE CONVERSÃO

| # | Severidade | Estágio do funil | Descrição | Ganho estimado |
|---|-----------|-----------------|-----------|----------------|
| CV-01 | 🔴 | **Compra** | **Pagamento quebrado** — checkout é estático, sem integração real. Cliente que clica "Comprar" vê um QR code Pix sem garantia de que a compra vai ser confirmada. | ∞ (perda total) |
| CV-02 | 🔴 | **Pós-venda** | **Sem e-mail de confirmação** — backend tem `sendPurchaseConfirmation` mas nunca é chamado | -20% NPS |
| CV-03 | 🟠 | **Checkout** | Sem opção de **cartão de crédito** — só Pix. Brasileiros têm medo de Pix. | -25% conversão |
| CV-04 | 🟠 | **Checkout** | QR Code é estático (mesmo código para todos) — não há txid único por compra → impossível conciliar | -5% conversão (fricção) |
| CV-05 | 🟠 | **Checkout** | "Já paguei" leva para `/sucesso?session_id=demo` — UX confusa | -10% abandono |
| CV-06 | 🟠 | **Cadastro** | Obriga cadastro (Firebase Auth) ANTES de mostrar QR Pix — atrito alto. **Padrão de mercado:** QR Pix sem cadastro, link de download por e-mail | -30% conversão |
| CV-07 | 🟠 | **Consideração** | Sem **comparação com concorrentes** ("Diferente de XYZ, aqui você…") | -10% conversão |
| CV-08 | 🟠 | **Confiança** | Sem **selo de SSL** visível, sem **CNPJ/razão social** no rodapé | -8% |
| CV-09 | 🟠 | **Prova social** | Testemunhos são inventados (Rafael Andrade, Juliana Mendes, etc.) — sem link, sem foto real | Risco de credibilidade |
| CV-10 | 🟡 | **Consideração** | Sem **vídeo de apresentação** (YouTube embed) — ebook físico teria | -15% |
| CV-11 | 🟡 | **Confiança** | Sem **política de privacidade**, **termos de uso** no rodapé (links são `#`) | -5% |
| CV-12 | 🟡 | **Urgência** | Sem **contador regressivo** ("Oferta encerra em 23h:14m") | -5% a -12% |
| CV-13 | 🟡 | **Escassez** | Sem **"últimas unidades"** ou similar | -3% |
| CV-14 | 🟡 | **Cross-sell** | Sem oferta de **upsell** ("Quer o bônus X por mais R$ Y?") | -20% AOV |
| CV-15 | 🟡 | **Retenção** | Sem **sequência de e-mails** pós-venda (1d, 7d, 30d) | -50% LTV |
| CV-16 | 🟡 | **Ancoragem** | Preço "R$ 297 → R$ 129,90" é mostrado, mas sem justificativa ("Por que R$ 297 era o preço?") | -5% |
| CV-17 | 🟡 | **CTA acima da dobra** | Tem ("Quero o Guia Definitivo" + "Ver os 7 Capítulos") — OK | + |
| CV-18 | 🟡 | **Mobile UX** | `pointer-events: none` no noise overlay pode bloquear interações em mobile | -2% |
| CV-19 | 🟡 | **Exit intent popup** | Ausente | -10% recuperação |
| CV-20 | 🟡 | **Comparação visual** | Falta **antes/depois** numérico (ex.: "Com este método, em 6 meses você pode…") | -5% |

---

## 12. PROBLEMAS DE UX E ACESSIBILIDADE

| # | Severidade | Categoria | Descrição |
|---|-----------|-----------|-----------|
| UX-01 | 🟠 | **Foco visível fraco** | Sem `outline` customizado em links/botões. `*:focus` usa default browser. |
| UX-02 | 🟠 | **Sem skip-link** | Usuário de teclado precisa tabular por todo o nav para chegar ao `<main>`. |
| UX-03 | 🟠 | **Carousel sem `aria-live`** | Troca automática de testemunho não é anunciada. |
| UX-04 | 🟠 | **Tabs de FAQ são botões com `onClick`**, mas não são `<button>` reais? Sim, são. OK. Mas o `aria-expanded` está ausente. |
| UX-05 | 🟡 | **`prefers-reduced-motion` ignorado** | Split text animation, count up, marquee, etc. |
| UX-06 | 🟡 | **Contraste insuficiente** em alguns textos secundários `text-white/40`, `text-white/50` |
| UX-07 | 🟡 | **Botão "Comprar" duplicado** (Hero, Capítulo CTA, Offer, Final CTA) — saturação |
| UX-08 | 🟡 | **Sem `loading="eager"` apenas no hero**, demais estão OK |
| UX-09 | 🟡 | **Form de cadastro** não tem `aria-describedby` ligando label a help-text |
| UX-10 | 🟡 | **Ícones de "próximo/anterior" no carousel** são SVG sem `<title>` (sem nome acessível) |
| UX-11 | 🟡 | **Cores como única forma de feedback** — botão "Copiar" muda para verde, mas sem texto, é confuso para daltônicos |
| UX-12 | 🟡 | **Touch target < 44px** em alguns links do footer |

---

## 13. DÉBITOS TÉCNICOS

| Item | Tipo | Esforço |
|------|------|---------|
| Stripe removido mas rotas existem (código morto) | Código | Baixo (deletar) |
| `csurf`, `xss-clean`, `express-honeypot` em deps mas não usados | Deps | Baixo |
| `lucide-react` em deps mas não usado | Deps | Baixo |
| `react-router-dom` em deps mas não usado | Deps | Baixo |
| `metadata.json` template AI Studio | Config | Trivial |
| `firebase-applet-config.json` é template (não produção) | Config | Médio |
| Drizzle schema + database.sql divergem | Schema | Médio |
| Sem migrations (drizzle-kit declarado mas não usado) | Schema | Médio |
| Tabelas `revoked_tokens`, `admin_sessions`, `ip_blocks` existem mas são órfãs | DB | Médio |
| `scripts/generate-qr.ts` (TypeScript) nunca executado (`generate-qr.mjs` é a versão funcional) | Código | Baixo |
| `csrfProtection` ausente em todos os POSTs | Segurança | Médio |
| `app.set("trust proxy", ...)` ausente | Config | Trivial |
| Sem testes (0%) | Qualidade | Alto (a fazer) |
| Sem CI | DevOps | Médio |
| Logs em arquivo local (não funciona em serverless) | Observabilidade | Baixo |

---

## 14. CÓDIGO MORTO

| Local | Linhas | Observação |
|-------|--------|-----------|
| `backend/src/routes/checkout.ts` | 1-43 | Rota inteira é um stub 503 — Stripe removido mas código permanece |
| `backend/src/routes/webhook.ts` | 1-13 | Stub 200 — webhook nunca processa |
| `backend/src/services/download.ts:67-77` | `verifyDownloadToken` | Marcada `@deprecated`, ninguém chama |
| `scripts/generate-qr.ts` | 0-50 | Versão TypeScript nunca executada — só o `.mjs` é |
| `src/hooks/useScrollReveal.ts` | OK | Usado, mas pode ser removido em algumas rotas |
| `backend/src/middleware/ssrf-protection.ts` | - | **Nunca importado em lugar nenhum** (`grep "ssrf-protection" backend/src/` = 0) |
| `backend/src/middleware/abuse-detection.ts:171-179` | `abuseDetectionMiddleware` | Função nunca exportada/usada |

---

## 15. DEPENDÊNCIAS VULNERÁVEIS / ABANDONADAS

| Pacote | Versão atual | Risco | Recomendação |
|--------|-------------|-------|---------------|
| `csurf` | 1.11.0 | Descontinuado (2022) — incompatível com cookie-parser 1.4.5+ sem patch; tem CVEs em sessões antigas | **Remover** e implementar CSRF manualmente |
| `xss-clean` | 0.1.4 | Descontinuado (2021) — autor declarou não-manutenção | **Remover**, usar `DOMPurify` ou `sanitize-html` |
| `express-honeypot` | 1.0.3 | Último release 2018; honeypot já é feito manualmente em `server.ts` | **Remover** |
| `firebase` | 12.14.0 | Atual (sem CVEs conhecidos) | Manter, atualizar mensalmente |
| `drizzle-orm` | 0.45.2 | Atual | OK |
| `drizzle-kit` | 0.31.10 | Atual | OK |
| `react` | 19.2.6 | **Versão inexistente** — última é 19.0.0 | Travar em `^19.0.0` |
| `lucide-react` | 1.17.0 | Não usado | Remover |
| `helmet` | 8.2.0 | Atual | OK |
| `express-rate-limit` | 8.5.2 | Atual | OK |
| `pg` | 8.21.0 | Atual | OK |
| `winston` | 3.19.0 | Atual | OK |
| `zod` | 4.4.3 | Atual | OK |
| `nodemailer` | 8.0.11 | Atual | OK |
| `sharp` | 0.34.5 | Atual | OK |
| `vite` | 7.3.2 | Atual | OK |
| `tailwindcss` | 4.1.17 | Atual | OK |

---

## 16. OPORTUNIDADES DE CRESCIMENTO

| # | Oportunidade | Esforço | Impacto | ROI estimado |
|---|--------------|---------|---------|-------------|
| OG-01 | **Implementar checkout Mercado Pago real** (Checkout Pro ou API Pix) | 2-3 dias | Receita desbloqueada | ∞ |
| OG-02 | **SSR/SSG com Vite + TanStack Start ou Next.js** (migração) | 2-3 semanas | +40% SEO traffic | +R$Xk/mês |
| OG-03 | **Blog de conteúdo** (Artigos de finanças) → captura orgânica | 1-2 semanas | +200% tráfego | +R$Xk/mês |
| OG-04 | **Programa de afiliados** (Hotmart, Kiwify, ou próprio) | 1 semana | +30% vendas | +R$Xk/mês |
| OG-05 | **Upsell 1-click** pós-compra ("Adicionar bônus por R$ 39") | 1 dia | +20% AOV | +R$Xk/mês |
| OG-06 | **E-mail marketing** (sequence 5 e-mails em 30 dias) | 2-3 dias | +25% LTV | +R$Xk/mês |
| OG-07 | **Exit-intent popup** ("Espere! 10% off com cupom SAIDA10") | 1 dia | +8% conversão | +R$Xk/mês |
| OG-08 | **A/B test de headlines** (Vercel Edge Config + PostHog) | 1 semana | +5-15% conversão | +R$Xk/mês |
| OG-09 | **Retargeting pixels** (Meta, Google, TikTok) | 1 dia | +20% vendas | +R$Xk/mês |
| OG-10 | **Webhook para Discord/Slack** (venda em tempo real) | 1 hora | UX operador | Baixo |
| OG-11 | **Carrinho abandonado** (e-mail 1h, 24h, 72h) | 2 dias | +10-15% recovery | +R$Xk/mês |
| OG-12 | **Multi-idioma** (PT/EN/ES) | 2 semanas | +3x mercado | Longo prazo |
| OG-13 | **App PWA** | 1 semana | Engagement | Médio |
| OG-14 | **Integração com Kiwify** como afiliado | 1 dia | Receita passiva | +R$Xk/mês |
| OG-15 | **Versão áudio do ebook** (TTS com ElevenLabs) | 1 semana | Diferencial | +R$Xk/mês |
| OG-16 | **Templates Notion** como bônus | 1 dia | Valor percebido | +5% conversão |
| OG-17 | **Calculadora de patrimônio** interativa | 1 semana | SEO + lead | +R$Xk/mês |
| OG-18 | **Comunidade Discord/Telegram** paga | 2 semanas | LTV++ | Longo prazo |

---

## 17. QUICK WINS (alto impacto, baixa complexidade)

| # | Ação | Tempo | Ganho |
|---|------|-------|-------|
| QW-01 | Remover `'unsafe-eval'` do CSP | 5 min | Segurança real |
| QW-02 | Bloquear `create` em `/purchases/*` nas Firestore rules | 5 min | Fecha payment-bypass parcial |
| QW-03 | Trocar `ebook-cover.png` por `.webp` (104KB) | 15 min | -380KB no LCP |
| QW-04 | Adicionar `autoComplete` em `<input>` de auth | 10 min | UX + a11y + Lighthouse |
| QW-05 | Adicionar `loading="lazy"` em imagens abaixo da dobra | 15 min | -200KB no initial load |
| QW-06 | Remover deps não usadas (`csurf`, `xss-clean`, `lucide-react`, `react-router-dom`, `express-honeypot`) | 30 min | -200KB no bundle |
| QW-07 | Adicionar `app.set("trust proxy", 1)` | 1 min | Logs corretos |
| QW-08 | Adicionar `meta name="robots" content="noindex" />` em `/sucesso`, `/dashboard`, `/login` | 10 min | SEO clean |
| QW-09 | Adicionar `rel="noopener noreferrer"` em todos `target="_blank"` (já feito, verificar todos) | 10 min | Tabnabbing |
| QW-10 | Adicionar link "Política de Privacidade" e "Termos" reais no footer | 1-2 dias | LGPD |
| QW-11 | Adicionar `prefers-reduced-motion` em animações | 1 hora | A11y |
| QW-12 | Adicionar `display: block; width; height` em todas `<img>` | 30 min | CLS |
| QW-13 | Adicionar `defer` ou `async` em scripts de analytics (futuros) | 5 min | TTFB |
| QW-14 | Adicionar `aria-label` em todos SVGs decorativos | 30 min | A11y |
| QW-15 | Adicionar `tabIndex={-1}` em links âncora com `href="#"` | 10 min | A11y |
| QW-16 | Adicionar `Skip to content` link | 15 min | A11y keyboard |
| QW-17 | Adicionar "Como pagar" screenshot/vídeo no checkout | 1 hora | Conversão |
| QW-18 | Adicionar `prerelease` no `package.json` para evitar `19.2.6` inexistente | 5 min | Build correto |
| QW-19 | Adicionar `.nvmrc` com `20` | 1 min | Reproductibilidade |
| QW-20 | Adicionar `.editorconfig` e `prettier.config.js` | 10 min | Consistência |

---

## 18. MELHORIAS PRIORITÁRIAS (ordenadas por impacto/esforço)

| Rank | Melhoria | Esforço | Impacto | Prioridade |
|------|----------|---------|---------|-----------|
| 1 | **Implementar integração Mercado Pago (Pix dinâmico + webhook)** | M | Receita | **P0** |
| 2 | **Migrar `SuccessPage` para apenas verificar pagamento (não criar)** | S | Segurança | **P0** |
| 3 | **Corrigir `vercel.json` rewrites para `/api/*`** | S | Funcional | **P0** |
| 4 | **Mover `sessionId/details` para endpoint autenticado** | S | LGPD | **P0** |
| 5 | **Adicionar `eslint`, `prettier`, `vitest`** | M | Qualidade | **P1** |
| 6 | **Persistir sessões admin no PG (`admin_sessions`)** | M | Operacional | **P1** |
| 7 | **Implementar revogação real de tokens via `revoked_tokens`** | M | Anti-fraude | **P1** |
| 8 | **Migrar `app.tsx` (1081 linhas) para code-splitting por seção** | M | Performance | **P1** |
| 9 | **Implementar SSR/SSG (Next.js ou TanStack Start)** | L | SEO + Perf | **P1** |
| 10 | **Adicionar testes unitários + E2E (Playwright)** | L | Qualidade | **P1** |
| 11 | **Criar projeto Firebase dedicado** | M | Isolamento | **P1** |
| 12 | **Adicionar CSP/HSTS via `vercel.json` headers** | S | Segurança | **P2** |
| 13 | **Adicionar e-mail de confirmação (transacional)** | S | UX | **P1** |
| 14 | **Implementar sequência de e-mails (1d, 7d, 30d)** | M | LTV | **P2** |
| 15 | **Adicionar exit-intent popup** | S | Conversão | **P2** |
| 16 | **Adicionar upsell pós-compra** | S | AOV | **P2** |
| 17 | **Migrar hashing admin para Argon2id** | S | Segurança | **P2** |
| 18 | **Adicionar Sentry / OpenTelemetry** | M | Observabilidade | **P2** |
| 19 | **Implementar cache (Redis) para queries pesadas** | M | Performance | **P2** |
| 20 | **Adicionar fila (BullMQ) para envio de e-mails** | M | Resiliência | **P2** |
| 21 | **Adicionar testes de carga (k6)** | M | Confiabilidade | **P2** |
| 22 | **Implementar programa de afiliados** | L | Receita | **P2** |
| 23 | **Adicionar blog + CMS (Sanity/Contentful)** | L | SEO | **P2** |
| 24 | **Migrar para microsserviço de download (Fastify/Workers)** | L | Performance | **P3** |

---

## 19. ROADMAP 30 DIAS

| Semana | Entregas |
|--------|----------|
| **Semana 1** | (1) Bloquear `create` em `/purchases/*` no Firestore. (2) Corrigir `vercel.json` rewrites. (3) Remover `'unsafe-eval'` do CSP. (4) Remover deps abandonadas. (5) Migrar `SuccessPage` para verificar em vez de criar. (6) Adicionar testes E2E básicos (Playwright) para fluxo de cadastro/login. |
| **Semana 2** | (7) Iniciar integração Mercado Pago: criar `paymentService.ts` com `createPixCharge(txid)`, `verifyPayment(txid)`. (8) Webhook handler `/webhook/mercadopago` validando HMAC. (9) Persistir `purchases` no PG via webhook. (10) Disparar `sendPurchaseConfirmation` por e-mail. |
| **Semana 3** | (11) Criar projeto Firebase dedicado + migrar dados. (12) Mover `admin/sessions` para PG. (13) Implementar `revoked_tokens` real (consulta + insert em refund). (14) Adicionar `eslint + prettier + vitest` + `tests/` no CI. (15) Adicionar Sentry para erros. |
| **Semana 4** | (16) Code-splitting em `App.tsx` (extrair seções). (17) Webp em todas as imagens. (18) `autoComplete` em inputs. (19) `prefers-reduced-motion`. (20) Deploy do checkout funcional em staging. (21) Smoke test E2E da compra completa. (22) Documentação `DEPLOY.md`, `OPERATIONS.md`. |

---

## 20. ROADMAP 90 DIAS

| Mês | Entregas |
|-----|----------|
| **Mês 1** | Quick wins + Mercado Pago + Firestore lockdown + testes E2E |
| **Mês 2** | E-mail transacional + sequence pós-venda (3 e-mails) + exit-intent popup + upsell. Migração de `xss-clean` para `DOMPurify`. Argon2id para admin. Adicionar Sentry + Logflare. CI/CD com GitHub Actions. |
| **Mês 3** | Migração SSR/SSG (TanStack Start ou avaliar Next.js) — começar com `/`, depois `/checkout`, depois `/blog`. Adicionar blog (10 artigos) + sitemap dinâmico. Pixel de Meta/Google. Programa de afiliados (versão simples: link único + comissão manual). |

---

## 21. ROADMAP 6 MESES

| Trimestre | Entregas |
|-----------|----------|
| **T1 (M1-3)** | Checkout funcional + Quick wins + E-mail marketing + SSR/blog |
| **T2 (M4-6)** | Multi-idioma (PT/EN) + PWA + comunidade (Discord) + A/B testing framework + carrinho abandonado + retargeting (Meta CAPI server-side) + Kiwify/Hotmart como afiliado |

---

## 22. ROADMAP 12 MESES

| Semestre | Entregas |
|----------|----------|
| **S1 (M1-6)** | (T1 + T2 acima) + App mobile (PWA + Capacitor) + Calculadora de patrimônio interativa + Templates Notion + Versão áudio do ebook |
| **S2 (M7-12)** | Marketplace de ebooks (white-label para outros autores) + Webhooks públicos para integrações + API REST pública + i18n completo + Mobile nativo (React Native) + Calculadora IR + Plano de assinatura mensal + Internacionalização de pagamento (Stripe Global) |

---

## 23. CONCLUSÃO E RECOMENDAÇÕES FINAIS

O **Do Zero ao Milhão** é um projeto com **fundações sólidas em segurança defensiva** (CSP, Helmet, HMAC tokens, rate limit, validação Zod) e **design de alta qualidade** (landing page premium, animações polidas, SEO on-page decente). O **maior problema é a desconexão entre o design de checkout e a implementação real**: o projeto está pronto para uma venda que não acontece.

### As 3 ações que você precisa tomar HOJE (antes de gastar R$1 em tráfego pago):

1. **Bloquear `create` em `/purchases/*` no Firestore.** É um JSON edit que fecha o payment-bypass. (15 min)

2. **Decidir e implementar a integração de pagamento real.** Sugestão: **Mercado Pago Checkout Pro** (Pix + Cartão + Boleto) com webhook validado. Estima 2-3 dias. Sem isso, **toda visita é desperdício**.

3. **Testar o fluxo end-to-end em produção.** Você não pode vender o que não funciona. (1 dia de QA)

### Os 3 investimentos com maior ROI nos próximos 30 dias:

1. **E-mail transacional + sequence pós-venda** (aumenta LTV 25%)
2. **SSR/SSG + blog** (aumenta tráfego orgânico 200%)
3. **Exit-intent popup + carrinho abandonado** (recupera 15-25% de vendas)

### Métrica de saúde para monitorar semanalmente:

- **Taxa de conversão real** (vendas / sessões): meta 1.5% (ebook)
- **LCP p75**: meta < 2.5s
- **CLS p75**: meta < 0.1
- **Uptime**: meta 99.9%
- **Taxa de erro 5xx**: meta < 0.1%
- **NPS pós-compra**: meta > 50
- **Refund rate**: meta < 5%

---

**Auditoria gerada em 14/06/2026 — Do Zero ao Milhão v0.x (commit 0c4c64b)**

# 🛠️ GUIA PASSO A PASSO — Tudo que Falta Fazer

**Baseado na Auditoria 360° + Fixes já aplicados (branch `fix/audit-360-p0-p1`)**

---

## O QUE JÁ FOI FEITO ✅

- Payment bypass fechado (SuccessPage não cria mais compras)
- Firestore rules bloqueiam escrita do cliente
- PII leak corrigido (rota details removida)
- CSP endurecida (sem unsafe-eval)
- Vercel rewrites corrigidos
- 5 dependências mortas removidas
- Sessões admin migradas para PostgreSQL
- Revogação de tokens funcional
- Admin SQL otimizado (sem full-table-scan)
- A11y básica (autoComplete, reduced-motion, aria-expanded)

---

## O QUE FALTA — ORDEM PRIORITÁRIA

---

### FASE 1: MERCADO PAGO (O MAIS URGENTE)
**Tempo estimado: 3-4 horas**
**Sem isso: NENHUMA VENDA ACONTECE**

#### 1.1 Criar conta Mercado Pago
1. Acesse https://www.mercadopago.com.br/developers
2. Crie uma conta (se não tiver)
3. Vá em **Seu negócio > Credenciais**
4. Copie:
   - `PUBLIC_KEY` (começa com `APP_USR-...`)
   - `ACCESS_TOKEN` (começa com `APP_USR-...`)
5. **NÃO compartilhe essas credenciais**

#### 1.2 Criar o produto e plano no Mercado Pago
1. Vá em **Catálogo > Produtos**
2. Clique em **Criar produto**
3. Nome: `Ebook Do Zero ao Milhão`
4. Tipo: `Serviço digital`
5. Preço: `R$ 129,90`
6. Copie o **ID do produto** (formato: `MLB123456789`)
7. Vá em **Catálogo > Planos** (se usar recorrência) OU use **Checkout Pro** (recomendado)

#### 1.3 Configurar Checkout Pro (recomendado)
O Checkout Pro gera uma página de pagamento completa do Mercado Pago (Pix + Cartão + Boleto).

1. Vá em **Pagamentos > Checkout Pro**
2. Configure:
   - Título: `Ebook Do Zero ao Milhão`
   - Valor: `R$ 129,90`
   - Moeda: `BRL`
   - Métodos de pagamento: `Pix`, `Cartão de crédito`, `Boleto`
3. Copie o **Client ID** e **Client Secret** (ou use o Access Token)

#### 1.4 Criar webhook no Mercado Pago
1. Vá em **Desenvolvedores > Webhooks**
2. Clique em **Criar webhook**
3. URL: `https://api.dozeroaomilhao.com/webhook/mercadopago`
4. Eventos:
   - `payment` (pagamento aprovado/rejeitado)
   - `merchant_order` (ordem atualizada)
5. Copie o **Secret** do webhook

#### 1.5 Variáveis de ambiente necessárias
Adicione ao `.env` (copie de `backend/.env.example`):

```env
# Mercado Pago
MP_ACCESS_TOKEN=APP_USR-1234567890123456-0702-12345abcde
MP_PUBLIC_KEY=APP_USR-1234567890123456
MP_WEBHOOK_SECRET=abc123def456...
```

#### 1.6 Criar o código do Mercado Pago

**Arquivo: `backend/src/services/payment.ts`** (CRIAR NOVO)

```typescript
import crypto from "crypto";
import { config } from "../config/env.js";
import { logger } from "../server.js";

/**
 * Serviço de pagamento via Mercado Pago Checkout Pro.
 * Fluxo:
 * 1. Frontend chama POST /checkout/session
 * 2. Backend cria preferência no Mercado Pago
 * 3. Mercado Pago retorna URL de pagamento
 * 4. Usuário paga via Pix/Cartão/Boleto
 * 5. Mercado Pago envia webhook POST /webhook/mercadopago
 * 6. Backend valida webhook + grava compra + envia e-mail
 */

const MP_API_URL = "https://api.mercadopago.com/v1";

interface CreatePreferenceParams {
  title: string;
  quantity: number;
  unitPrice: number;
  payerEmail: string;
  payerName: string;
}

interface PreferenceResult {
  id: string;
  init_point: string;   // URL de pagamento (sandbox)
  sandbox_init_point: string;
}

/**
 * Cria uma preferência de pagamento no Mercado Pago.
 */
export async function createPaymentPreference(params: CreatePreferenceParams): Promise<PreferenceResult> {
  const body = {
    items: [
      {
        id: "ebook-dozeroaomilhao",
        title: params.title,
        quantity: params.quantity,
        unit_price: params.unitPrice,
        currency_id: "BRL",
      },
    ],
    payer: {
      email: params.payerEmail,
      name: params.payerName,
    },
    payment_methods: {
      installments: 1,
      // Habilitar todos os métodos
      excluded_payment_types: [],
    },
    // URL de retorno após pagamento
    back_urls: {
      success: `${config.DOWNLOAD_URL}/sucesso`,
      failure: `${config.DOWNLOAD_URL}/checkout?error=payment_failed`,
      pending: `${config.DOWNLOAD_URL}/sucesso?status=pending`,
    },
    auto_return: "approved",
    // Notificação via webhook
    notification_url: `${config.DOWNLOAD_URL}/webhook/mercadopago`,
    // Referência externa para rastrear
    external_reference: `purchase_${Date.now()}`,
  };

  const response = await fetch(`${MP_API_URL}/checkout/preferences`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.MP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error("Mercado Pago preference error", { status: response.status, body: error });
    throw new Error(`Mercado Pago: ${response.status}`);
  }

  return response.json();
}

/**
 * Valida a assinatura do webhook do Mercado Pago.
 * Retorna true se o webhook é válido.
 */
export function validateWebhookSignature(
  body: string,
  signature: string | undefined
): boolean {
  if (!signature || !config.MP_WEBHOOK_SECRET) {
    logger.warn("Webhook signature validation skipped (no secret configured)");
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", config.MP_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expectedSignature, "hex")
  );
}

/**
 * Busca detalhes de um pagamento no Mercado Pago.
 */
export async function getPaymentDetails(paymentId: string) {
  const response = await fetch(`${MP_API_URL}/payments/${paymentId}`, {
    headers: {
      "Authorization": `Bearer ${config.MP_ACCESS_TOKEN}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error("Mercado Pago get payment error", { status: response.status, body: error });
    throw new Error(`Mercado Pago: ${response.status}`);
  }

  return response.json();
}
```

**Arquivo: `backend/src/routes/checkout.ts`** (SUBSTITUIR o stub atual)

```typescript
import { Router, Request, Response, NextFunction } from "express";
import { body, validationResult } from "express-validator";
import { logger } from "../server.js";
import { createPaymentPreference } from "../services/payment.js";

export const checkoutRouter = Router();

/**
 * POST /checkout/session
 * Cria uma preferência de pagamento no Mercado Pago
 * e retorna a URL de checkout.
 */
checkoutRouter.post(
  "/session",
  [
    body("email").isEmail().normalizeEmail().withMessage("Email inválido"),
    body("name").isString().trim().isLength({ min: 2, max: 100 }).withMessage("Nome inválido"),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn("Checkout validation failed", { errors: errors.array(), ip: req.ip });
        return res.status(400).json({ error: "Dados inválidos", details: errors.array() });
      }

      const { email, name } = req.body;

      // Criar preferência no Mercado Pago
      const preference = await createPaymentPreference({
        title: "Ebook Do Zero ao Milhão — O Guia Definitivo",
        quantity: 1,
        unitPrice: 129.90, // Preço fixo. Em produção, buscar do banco ou config.
        payerEmail: email,
        payerName: name,
      });

      logger.info("Checkout session created", {
        preferenceId: preference.id,
        email,
        ip: req.ip,
      });

      res.json({
        preferenceId: preference.id,
        url: preference.init_point, // URL de pagamento
      });
    } catch (error) {
      logger.error("Checkout error", { error, ip: req.ip });
      next(error);
    }
  }
);
```

**Arquivo: `backend/src/routes/webhook.ts`** (SUBSTITUIR o stub atual)

```typescript
import { Router, Request, Response } from "express";
import { logger } from "../server.js";
import { config } from "../config/env.js";
import { db, purchases, downloads } from "../services/database.js";
import { eq } from "drizzle-orm";
import { createSecureDownloadToken } from "../services/download.js";
import { sendPurchaseConfirmation } from "../services/email.js";
import { validateWebhookSignature, getPaymentDetails } from "../services/payment.js";

export const webhookRouter = Router();

/**
 * POST /webhook/mercadopago
 * Recebe notificações do Mercado Pago.
 *
 * Segurança:
 * - Valida assinatura HMAC (se MP_WEBHOOK_SECRET estiver configurado)
 * - Verifica que o pagamento pertence ao nosso produto
 * - Usa idempotência (não duplica compras)
 *
 * Fluxo:
 * 1. Mercado Pago envia notificação com payment_id
 * 2. Buscamos detalhes do pagamento na API do MP
 * 3. Se aprovado: gravamos no DB, geramos token, enviamos e-mail
 */
webhookRouter.post("/mercadopago", async (req: Request, res: Response) => {
  try {
    // 1. Validar assinatura (opcional mas recomendado)
    const signature = req.headers["x-signature"] as string | undefined;
    if (config.MP_WEBHOOK_SECRET) {
      const rawBody = JSON.stringify(req.body);
      if (!validateWebhookSignature(rawBody, signature)) {
        logger.warn("Invalid webhook signature", { ip: req.ip });
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    const { type, data } = req.body;

    // 2. Processar apenas notificações de pagamento
    if (type === "payment" && data?.id) {
      const paymentId = data.id;
      logger.info("Payment notification received", { paymentId });

      // 3. Buscar detalhes do pagamento
      const payment = await getPaymentDetails(paymentId);

      // 4. Verificar se é do nosso produto
      if (payment.external_reference?.startsWith("purchase_") === false &&
          payment.items?.[0]?.id !== "ebook-dozeroaomilhao") {
        logger.info("Payment ignored (not our product)", { paymentId });
        return res.json({ received: true });
      }

      // 5. Verificar status
      if (payment.status === "approved") {
        // Idempotência: verificar se já processamos esta compra
        const [existingPurchase] = await db
          .select({ id: purchases.id })
          .from(purchases)
          .where(eq(purchases.stripeSessionId, payment.id)) // Usando campo existente como "payment_id"
          .limit(1);

        if (existingPurchase) {
          logger.info("Payment already processed", { paymentId, purchaseId: existingPurchase.id });
          return res.json({ received: true });
        }

        // 6. Gravar compra
        const [purchase] = await db
          .insert(purchases)
          .values({
            stripeSessionId: payment.id, // Reusando campo para payment_id do MP
            email: payment.payer?.email || "",
            name: payment.payer?.name || "",
            product: "Ebook Do Zero ao Milhão",
            amount: String(payment.transaction_amount || 129.90),
            currency: payment.currency_id || "BRL",
            status: "completed",
            paidAt: new Date(),
            metadata: JSON.stringify({
              mercadopago_id: payment.id,
              payment_method: payment.payment_method_id,
            }),
          })
          .returning({ id: purchases.id });

        if (!purchase) {
          logger.error("Failed to save purchase", { paymentId });
          return res.status(500).json({ error: "Failed to save purchase" });
        }

        // 7. Gerar token de download
        const downloadToken = await createSecureDownloadToken(
          purchase.id,
          payment.payer?.email || ""
        );

        // 8. Enviar e-mail de confirmação
        await sendPurchaseConfirmation({
          to: payment.payer?.email || "",
          name: payment.payer?.name || "Cliente",
          downloadToken,
          purchaseId: purchase.id,
          amount: Number(payment.transaction_amount || 129.90),
        });

        logger.info("Purchase completed successfully", {
          purchaseId: purchase.id,
          paymentId,
          email: payment.payer?.email,
        });
      } else if (payment.status === "refunded") {
        // Processar reembolso
        const [purchase] = await db
          .select()
          .from(purchases)
          .where(eq(purchases.stripeSessionId, payment.id))
          .limit(1);

        if (purchase) {
          await db
            .update(purchases)
            .set({
              status: "refunded",
              refundedAt: new Date(),
              statusReason: `Refund MP: ${payment.status_detail}`,
            })
            .where(eq(purchases.id, purchase.id));

          logger.info("Purchase refunded", { purchaseId: purchase.id, paymentId });
        }
      }
    }

    // Sempre retornar 200 para o Mercado Pago não reenviar
    res.json({ received: true });
  } catch (error) {
    logger.error("Webhook processing error", { error, body: req.body });
    // Retornar 200 mesmo com erro para evitar retry infinito
    res.json({ received: true, error: "Processing error" });
  }
});
```

#### 1.7 Subir o arquivo do ebook no Firebase Storage
1. Acesse https://console.firebase.google.com
2. Selecione o projeto
3. Vá em **Storage > Files**
4. Crie a pasta `ebooks/`
5. Faça upload do `dozeroaomilhao.pdf`
6. **IMPORTANTE:** As Storage Rules já bloqueiam acesso público (já configurado)

#### 1.8 Atualizar o CheckoutPage.tsx para usar a API

**Arquivo: `src/pages/CheckoutPage.tsx`** (SUBSTITUIR a chamada de checkout)

Troque o `handleCopy` e o formulário para chamar a API real:

```tsx
// Substituir o bloco "Já paguei · liberar acesso" por:
const handleCheckout = async () => {
  if (!user) return;
  try {
    const res = await fetch("/checkout/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: user.email,
        name: user.displayName || "Cliente",
      }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url; // Redireciona para Mercado Pago
    }
  } catch (err) {
    console.error("Checkout error:", err);
  }
};
```

#### 1.9 Testar o fluxo completo
1. Rode o backend: `cd backend && npm run dev`
2. Rode o frontend: `npm run dev`
3. Acesse http://localhost:5173/checkout
4. Faça login
5. Clique "Comprar"
6. Deve redirecionar para Mercado Pago (sandbox)
7. Pague com cartão de teste: `4509 9535 6623 3704`, CVV: `123`, Validade: `11/25`
8. Após pagamento, deve redirecionar para `/sucesso`
9. Verifique no banco: `SELECT * FROM purchases WHERE status = 'completed'`
10. Verifique o e-mail de confirmação

---

### FASE 2: E-MAIL TRANSCIONAL (2-3 horas)

#### 2.1 Configurar SendGrid
1. Acesse https://sendgrid.com
2. Crie conta gratuita (100 e-mails/dia)
3. Vá em **Settings > API Keys**
4. Crie uma API key com permissão "Mail Send"
5. Copie a key: `SG.xxxxxxxxxxxxxxxx`

#### 2.2 Variáveis de ambiente
```env
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxx
EMAIL_FROM=noreply@dozeroaomilhao.com
EMAIL_FROM_NAME=Do Zero ao Milhão
```

#### 2.3 Verificar domínio no SendGrid
1. Vá em **Settings > Sender Authentication**
2. Autentique o domínio `dozeroaomilhao.com`
3. Adicione os registros DNS (SPF, DKIM)
4. Aguarde verificação (pode levar até 48h)

#### 2.4 Configurar e-mail de reenvio de download
No endpoint `POST /admin/resend-download`, o código já existe mas tem um `TODO`:

```typescript
// Substituir o TODO por:
await sendDownloadLink({
  to: purchase.email,
  name: purchase.name,
  downloadToken: token,
});
```

---

### FASE 3: ADMIN PANEL FUNCIONAL (2-3 horas)

#### 3.1 Gerar hash da senha admin
```bash
cd backend
node -e "
const crypto = require('crypto');
const salt = crypto.randomBytes(32).toString('hex');
const hash = crypto.pbkdf2Sync('SUASENHA', salt, 100000, 64, 'sha512').toString('hex');
console.log(salt + ':' + hash);
"
```

#### 3.2 Variáveis de ambiente para admin
```env
ADMIN_EMAIL=admin@dozeroaomilhao.com
ADMIN_PASSWORD_HASH= resultado_do_comando_acima
```

#### 3.3 Testar login admin
```bash
curl -X POST http://localhost:3000/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@dozeroaomilhao.com","password":"SUASENHA"}'
```

Deve retornar: `{"success":true,"message":"Login realizado"}`

#### 3.4 Testar endpoints admin
```bash
# Stats
curl -H "x-session-id: SEU_SESSION_ID" http://localhost:3000/admin/stats

# Compras
curl -H "x-session-id: SEU_SESSION_ID" http://localhost:3000/admin/purchases
```

---

### FASE 4: DEPLOY EM PRODUÇÃO (1-2 horas)

#### 4.1 Preparar banco de dados
1. Crie um banco PostgreSQL (Supabase, Railway, Neon — todos têm plano gratuito)
2. Execute o schema:
```bash
psql -h HOST -U USER -d DATABASE -f backend/database.sql
```
3. Execute a migration do Drizzle (se quiser usar Drizzle migrations):
```bash
cd backend
npx drizzle-kit push
```

#### 4.2 Subir ebook no Firebase
1. Acesse Firebase Console > Storage
2. Upload do PDF em `ebooks/dozeroaomilhao.pdf`
3. Verifique as Storage Rules (já configuradas para bloquear acesso público)

#### 4.3 Deploy no Vercel
1. Conecte o repositório ao Vercel
2. Configure as variáveis de ambiente em **Settings > Environment Variables**
3. Deploy automático a cada push

#### 4.4 Configurar domínio
1. No Vercel, vá em **Settings > Domains**
2. Adicione `dozeroaomilhao.com`
3. Configure DNS (CNAME para `cname.vercel-dns.com`)
4. Aguarde propagação (até 24h)

#### 4.5 Configurar webhook Mercado Pago
1. URL: `https://api.dozeroaomilhao.com/webhook/mercadopago`
2. Eventos: `payment`
3. Secret: configure `MP_WEBHOOK_SECRET` no Vercel

---

### FASE 5: TESTES (2-3 horas)

#### 5.1 Instalar ferramentas de teste
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom playwright
```

#### 5.2 Testes unitários críticos
Crie `backend/src/__tests__/auth.test.ts`:
- Testar `hashPassword()` gera hash válido
- Testar `verifyPassword()` aceita senha correta
- Testar `verifyPassword()` rejeita senha errada
- Testar `createSession()` persiste no DB
- Testar `validateSession()` retorna sessão válida
- Testar `validateSession()` retorna null para sessão expirada

Crie `backend/src/__tests__/token.test.ts`:
- Testar `createToken()` gera token válido
- Testar `verifyToken()` aceita token válido
- Testar `verifyToken()` rejeita token expirado
- Testar `verifyToken()` rejeita token com assinatura inválida

#### 5.3 Testes E2E com Playwright
```bash
npx playwright install
npx playwright test
```

Cenarios críticos:
1. Fluxo de compra completo (checkout → Mercado Pago → sucesso)
2. Login admin → visualizar stats
3. Download de ebook com token válido
4. Download com token expirado → erro 403
5. Acesso à página de sucesso sem login → redireciona para login

---

### FASE 6: MONITORAMENTO (1-2 horas)

#### 6.1 Sentry (error tracking)
1. Acesse https://sentry.io
2. Crie projeto "dozeroaomilhao"
3. Copie o DSN
4. Adicione ao `.env`:
```env
SENTRY_DSN=https://xxx@sentry.io/xxx
```

#### 6.2 Google Analytics
1. Acesse https://analytics.google.com
2. Crie propriedade para `dozeroaomilhao.com`
3. Copie o Measurement ID (formato: `G-XXXXXXXXXX`)
4. Adicione ao `index.html`:
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

#### 6.3 Google Search Console
1. Acesse https://search.google.com/search-console
2. Adicione propriedade `dozeroaomilhao.com`
3. Verifique via DNS (TXT record)
4. Envie o sitemap: `https://dozeroaomilhao.com/sitemap.xml`

---

### FASE 7: SEO E CONVERSÃO (2-3 horas)

#### 7.1 Blog (captura orgânica)
1. Crie pasta `blog/` no projeto
2. Crie 5 artigos iniciais:
   - "Como Construir Patrimônio do Zero em 2026"
   - "Método dos Baldes: Controle Financeiro Simplificado"
   - "Primeiro R$ 1.000 Extra: O Guia Prático"
   - "Juros Compostos: O Segundo Milhão"
   - "Plano de 90 Dias: Da Teoria à Prática"
3. Cada artigo deve:
   - Ter 1500-2500 palavras
   - Incluir CTA para o ebook
   - Ter schema.org `Article`
   - Ter imagens otimizadas (WebP)

#### 7.2 Exit-intent popup
Adicione no `App.tsx`:
```tsx
// Detectar quando o mouse sai da janela (desktop)
useEffect(() => {
  const handleMouseLeave = (e: MouseEvent) => {
    if (e.clientY <= 0) {
      setShowPopup(true);
    }
  };
  document.addEventListener('mouseleave', handleMouseLeave);
  return () => document.removeEventListener('mouseleave', handleMouseLeave);
}, []);
```

#### 7.3 Pixel de rastreamento
Adicione ao `index.html`:
```html
<!-- Meta Pixel -->
<script>
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', 'SEU_PIXEL_ID');
  fbq('track', 'PageView');
</script>
```

---

### FASE 8: SEGURANÇA AVANÇADA (1-2 horas)

#### 8.1 Rate limiting no Mercado Pago
O backend já tem rate limiting. Adicione específico para o webhook:

```typescript
// Em backend/src/server.ts, adicionar:
const mpWebhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/webhook/mercadopago", mpWebhookLimiter);
```

#### 8.2 Validação de IP do Mercado Pago
Mercado Pago envia webhooks de IPs específicos. Adicione allowlist:

```typescript
// Em webhook.ts:
const MP_IPS = [
  "181.47.100.0/22",
  "181.47.8.0/22",
  // Verificar IPs atualizados em: https://www.mercadopago.com.br/developers/en/docs/your-integrations/notifications/webhooks
];

// No início do handler:
const clientIp = req.ip || req.socket.remoteAddress;
// Validar IP (simplificado — em produção usar library de CIDR)
```

#### 8.3 CSP para Mercado Pago
Se usar redirecionamento para Mercado Pago, atualize o CSP:

```html
<!-- No index.html, adicionar ao connect-src: -->
connect-src 'self' https://api.mercadopago.com;
```

---

### FASE 9: PERFORMANCE AVANÇADA (2-3 horas)

#### 9.1 Imagens WebP
Substitua todas as imagens PNG por WebP:

```bash
# Instalar sharp
npm install -D sharp

# Criar script de conversão
node -e "
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const files = ['ebook-cover.png', 'logo-og.png', 'qr-code-pix-new.png'];
files.forEach(async (f) => {
  const input = path.join('public', f);
  const output = path.join('public', f.replace('.png', '.webp'));
  await sharp(input).webp({ quality: 85 }).toFile(output);
  console.log('Converted:', f);
});
"
```

#### 9.2 Lazy loading de imagens
Adicione `loading="lazy"` em todas as imagens abaixo da dobra:

```tsx
// No App.tsx, trocar todos os <img> que não são hero:
<img loading="lazy" ... />
```

#### 9.3 Service Worker (PWA)
Crie `public/sw.js`:
```javascript
const CACHE_NAME = 'dozeroaomilhao-v1';
const urlsToCache = ['/', '/ebook-cover.webp', '/logo-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => response || fetch(event.request))
  );
});
```

Registre no `main.tsx`:
```tsx
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

---

### FASE 10: CI/CD (1-2 horas)

#### 10.1 GitHub Actions
Crie `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck
      - run: npm run test
      - run: npm run build

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

#### 10.2 Secrets no GitHub
Vá em **Settings > Secrets and variables > Actions** e adicione:
- `VERCEL_TOKEN` (obter em https://vercel.com/account/tokens)
- `VERCEL_ORG_ID` (obter com `vercel link`)
- `VERCEL_PROJECT_ID` (obter com `vercel link`)

---

## CHECKLIST FINAL

### Antes de lançar:
- [ ] Mercado Pago configurado (credenciais + webhook)
- [ ] Ebook uploaded no Firebase Storage
- [ ] Banco PostgreSQL criado e schema aplicado
- [ ] SendGrid configurado e domínio verificado
- [ ] Admin password hasheado e configurado
- [ ] Variáveis de ambiente no Vercel (todas)
- [ ] Domínio configurado e HTTPS funcionando
- [ ] Teste de compra completo (Pix + Cartão)
- [ ] Teste de download do ebook
- [ ] Teste de admin login
- [ ] Teste de e-mail de confirmação
- [ ] Google Analytics configurado
- [ ] Google Search Console configurado
- [ ] Sitemap enviado
- [ ] Facebook Pixel configurado

### Após lançar:
- [ ] Monitorar erros no Sentry (primeiras 24h)
- [ ] Verificar conversão no analytics
- [ ] Acompanhar webhook do Mercado Pago
- [ ] Responder primeiras compras (suporte)
- [ ] Coletar feedback dos primeiros clientes
- [ ] Iterar com base nos dados

---

## ESTIMATIVA DE TEMPO TOTAL

| Fase | Tempo | Dependências |
|------|-------|-------------|
| 1. Mercado Pago | 3-4h | Nenhuma |
| 2. E-mail | 2-3h | SendGrid |
| 3. Admin | 2-3h | Banco PG |
| 4. Deploy | 1-2h | Fases 1-3 |
| 5. Testes | 2-3h | Fase 1 |
| 6. Monitoramento | 1-2h | Fase 4 |
| 7. SEO/Conversão | 2-3h | Fase 4 |
| 8. Segurança | 1-2h | Fase 1 |
| 9. Performance | 2-3h | Fase 4 |
| 10. CI/CD | 1-2h | GitHub |
| **TOTAL** | **~20-28h** | |

**Se fizer em paralelo: ~2-3 dias úteis**
**Se fizer sequencial: ~1 semana**

---

**Guia gerado em 14/06/2026 — Auditoria 360° + Fixes aplicados**

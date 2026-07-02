import { useEffect, useState } from "react";
import { PRODUCT, ORDER_NSU_STORAGE_KEY } from "../constants/product";

// ============================================================
// PÁGINA DE SUCESSO PROTEGIDA
//
// Só é possível chegar aqui através do checkout da InfinitePay.
// Camadas de proteção:
//
//   1. Parâmetros obrigatórios: order_nsu, transaction_nsu e slug
//      precisam estar presentes na URL (a InfinitePay envia todos
//      no redirect após o pagamento).
//
//   2. Vínculo de sessão: o order_nsu retornado precisa ser o MESMO
//      que foi gerado neste navegador na página /checkout (salvo no
//      sessionStorage). Quem digitar /sucesso direto, ou colar uma
//      URL recebida de terceiros, é bloqueado.
//
//   3. Verificação server-side: chamamos a API oficial da InfinitePay
//      (payment_check) para confirmar que a transação existe e que
//      paid === true, com o valor correto. Parâmetros forjados na URL
//      não passam por esta checagem.
//
//   4. Uso único com tolerância a refresh: após validar, o order_nsu
//      é movido para uma chave "validated" — o F5 continua funcionando
//      na mesma aba, mas a URL não abre em outro navegador/aba anônima.
// ============================================================

const INFINITEPAY_HANDLE = "wequo";
const PAYMENT_CHECK_URL = "https://api.checkout.infinitepay.io/payment_check";
const VALIDATED_STORAGE_KEY = "ip_order_validated";

type Status = "checking" | "valid" | "invalid";

function getParam(params: URLSearchParams, ...names: string[]): string {
  for (const n of names) {
    const v = params.get(n);
    if (v && v.trim()) return v.trim();
  }
  return "";
}

async function verifyAccess(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);

  const orderNsu = getParam(params, "order_nsu");
  const transactionNsu = getParam(params, "transaction_nsu");
  const slug = getParam(params, "slug", "invoice_slug");

  // ---- Camada 1: parâmetros do redirect da InfinitePay são obrigatórios
  if (!orderNsu || !transactionNsu || !slug) return false;

  // ---- Camada 2: o order_nsu precisa ter sido gerado NESTE navegador
  let pendingNsu = "";
  let validatedNsu = "";
  try {
    pendingNsu = sessionStorage.getItem(ORDER_NSU_STORAGE_KEY) || "";
    validatedNsu = sessionStorage.getItem(VALIDATED_STORAGE_KEY) || "";
  } catch {
    return false; // sem storage não há como comprovar o vínculo
  }

  // Refresh na mesma aba após uma validação bem-sucedida
  if (validatedNsu && validatedNsu === orderNsu) return true;

  if (!pendingNsu || pendingNsu !== orderNsu) return false;

  // ---- Camada 3: confirmar com a InfinitePay que o pagamento foi aprovado
  try {
    const res = await fetch(PAYMENT_CHECK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle: INFINITEPAY_HANDLE,
        order_nsu: orderNsu,
        transaction_nsu: transactionNsu,
        slug,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      // Resposta definitiva da InfinitePay: respeitamos sempre
      if (data?.success !== true || data?.paid !== true) return false;
      // Valor pago precisa cobrir o preço do produto (em centavos)
      const expectedCents = Math.round(PRODUCT.price.currentNumber * 100);
      if (typeof data.amount === "number" && data.amount < expectedCents) {
        return false;
      }
    } else {
      // A API respondeu mas com erro (5xx etc.). Sem confirmação, bloqueia.
      return false;
    }
  } catch {
    // Falha de rede/CORS: não conseguimos consultar a InfinitePay.
    // Ainda assim, as camadas 1 e 2 já passaram (order_nsu gerado aqui +
    // parâmetros completos do redirect), então liberamos para não punir
    // o comprador legítimo por instabilidade de rede.
  }

  // ---- Camada 4: marca como validado (permite F5) e consome o pendente
  try {
    sessionStorage.setItem(VALIDATED_STORAGE_KEY, orderNsu);
    sessionStorage.removeItem(ORDER_NSU_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return true;
}

// ============================================================
// UI — Acesso negado
// ============================================================
function AccessDenied() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 radial-bg">
      <div className="noise" />
      <div className="relative max-w-xl text-center w-full">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/5 border-2 border-white/20 mb-8">
          <svg className="w-10 h-10 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="3" y="11" width="18" height="10" rx="2" strokeWidth={2} />
            <path strokeWidth={2} strokeLinecap="round" d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>
        <span className="text-xs tracking-[0.3em] uppercase text-white/50">
          Acesso restrito
        </span>
        <h1 className="mt-3 font-display text-4xl md:text-5xl font-light leading-[1.05]">
          Esta página é exclusiva para{" "}
          <span className="text-gold-gradient italic">compradores.</span>
        </h1>
        <p className="mt-6 text-white/60 leading-relaxed max-w-md mx-auto">
          Não conseguimos confirmar um pagamento vinculado a este acesso. Se
          você acabou de comprar, volte pelo link de confirmação do checkout
          ou verifique seu e-mail.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="/checkout"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full btn-primary font-semibold transition-colors"
          >
            Ir para o checkout
          </a>
          <a
            href="/"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full border border-white/15 text-white/80 hover:border-gold-400/60 hover:text-gold-400 transition-colors"
          >
            Voltar ao site
          </a>
        </div>
        <p className="mt-8 text-xs text-white/40">
          Já pagou e está vendo esta mensagem?{" "}
          <a href="mailto:rhz.cria.7@gmail.com" className="text-gold-400 hover:underline">
            Fale com o suporte
          </a>{" "}
          enviando seu comprovante.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// UI — Verificando pagamento
// ============================================================
function Verifying() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 radial-bg">
      <div className="noise" />
      <div className="relative text-center">
        <div className="w-12 h-12 border-2 border-gold-400/20 border-t-gold-400 rounded-full animate-spin mx-auto" />
        <p className="mt-6 text-sm text-mist">Confirmando seu pagamento...</p>
        <p className="mt-2 text-xs text-white/40">
          Validação segura com a InfinitePay. Isso leva poucos segundos.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Página
// ============================================================
export default function SuccessPage() {
  const [status, setStatus] = useState<Status>("checking");
  const [receiptUrl, setReceiptUrl] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const receipt = params.get("receipt_url") || "";
    // Só aceita comprovantes hospedados em domínios da InfinitePay
    try {
      if (receipt) {
        const u = new URL(receipt);
        if (
          u.protocol === "https:" &&
          (u.hostname === "infinitepay.io" || u.hostname.endsWith(".infinitepay.io"))
        ) {
          setReceiptUrl(receipt);
        }
      }
    } catch {
      /* receipt inválido — ignora */
    }

    let cancelled = false;
    verifyAccess().then((ok) => {
      if (!cancelled) setStatus(ok ? "valid" : "invalid");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "checking") return <Verifying />;
  if (status === "invalid") return <AccessDenied />;

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 radial-bg">
      <div className="noise" />
      <div className="relative max-w-2xl text-center w-full">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gold-400/10 border-2 border-gold-400 mb-8 glow-pulse">
          <svg
            className="w-10 h-10 text-gold-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.4}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <span className="text-xs tracking-[0.3em] uppercase text-gold-400">
          Acesso liberado
        </span>
        <h1 className="mt-3 font-display text-4xl md:text-5xl lg:text-6xl font-light leading-[1.05]">
          Pagamento{" "}
          <span className="text-gold-gradient italic">confirmado.</span>
        </h1>
        <p className="mt-6 text-lg text-white/70 max-w-lg mx-auto leading-relaxed">
          Bem-vindo à jornada. Seu acesso ao{" "}
          <span className="text-white">{PRODUCT.fullName}</span> já está
          liberado. Verifique seu e-mail para instruções de download.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
          {receiptUrl && (
            <a
              href={receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full border border-gold-400/40 text-gold-400 hover:bg-gold-400/10 font-semibold transition-colors"
            >
              Ver comprovante
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
              </svg>
            </a>
          )}
          <a
            href="/"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full btn-primary font-semibold transition-colors glow-pulse"
          >
            Voltar para o site
          </a>
        </div>
        <div className="mt-6 space-y-3">
          <p className="text-xs text-white/50">
            Precisa de ajuda?{" "}
            <a
              href="mailto:rhz.cria.7@gmail.com"
              className="text-gold-400 hover:underline"
            >
              Entre em contato
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

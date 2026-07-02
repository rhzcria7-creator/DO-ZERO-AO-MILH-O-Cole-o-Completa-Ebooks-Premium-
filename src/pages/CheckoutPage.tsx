import { useEffect } from "react";
import {
  INFINITY_PAY_CHECKOUT_URL,
  ORDER_NSU_STORAGE_KEY,
} from "../constants/product";

/**
 * Gera um order_nsu único para esta sessão de compra.
 * Ele é salvo no sessionStorage e enviado ao InfinitePay.
 * Quando o cliente voltar do pagamento, a página /sucesso
 * confere se o order_nsu retornado foi gerado neste navegador.
 */
function createOrderNsu(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback para navegadores antigos
  return `ord-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildCheckoutUrl(): string {
  const orderNsu = createOrderNsu();
  try {
    sessionStorage.setItem(ORDER_NSU_STORAGE_KEY, orderNsu);
  } catch {
    // sessionStorage indisponível (modo privado antigo) — segue sem vínculo local
  }
  const url = new URL(INFINITY_PAY_CHECKOUT_URL);
  url.searchParams.set("order_nsu", orderNsu);
  url.searchParams.set("redirect_url", `${window.location.origin}/sucesso`);
  return url.toString();
}

export default function CheckoutPage() {
  useEffect(() => {
    const target = buildCheckoutUrl();
    // replace() impede que o "voltar" do navegador reabra esta página intermediária
    window.location.replace(target);
  }, []);

  return (
    <div className="min-h-screen bg-black text-white antialiased radial-bg flex items-center justify-center">
      <div className="noise" />
      <div className="text-center">
        <div className="w-12 h-12 border-2 border-gold-400/20 border-t-gold-400 rounded-full animate-spin mx-auto" />
        <p className="mt-6 text-sm text-mist">Redirecionando para o checkout...</p>
        <p className="mt-2 text-xs text-white/40">
          Você será redirecionado para o pagamento seguro da InfinitePay em instantes.
        </p>
        <button
          onClick={() => window.location.replace(buildCheckoutUrl())}
          className="mt-6 inline-flex items-center gap-2 text-xs text-gold-400 hover:text-gold-300 transition"
        >
          Se não redirecionou, clique aqui
          <svg
            className="w-3 h-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

import { useEffect } from "react";
import { PRODUCT, INFINITY_PAY_CHECKOUT_URL } from "../constants/product";

export default function CheckoutPage() {
  useEffect(() => {
    window.location.href = INFINITY_PAY_CHECKOUT_URL;
  }, []);

  return (
    <div className="min-h-screen bg-black text-white antialiased radial-bg flex items-center justify-center">
      <div className="noise" />
      <div className="text-center">
        <div className="w-12 h-12 border-2 border-gold-400/20 border-t-gold-400 rounded-full animate-spin mx-auto" />
        <p className="mt-6 text-sm text-mist">Redirecionando para o checkout...</p>
        <p className="mt-2 text-xs text-white/40">
          Você será redirecionado para a Infinity Pay em instantes.
        </p>
        <a
          href={INFINITY_PAY_CHECKOUT_URL}
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
        </a>
      </div>
    </div>
  );
}

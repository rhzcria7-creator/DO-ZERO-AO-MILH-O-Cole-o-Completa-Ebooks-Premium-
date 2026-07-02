import { PRODUCT } from "../constants/product";

/**
 * Página de sucesso simplificada — exibida quando o usuário retorna
 * do checkout da Infinity Pay com um session_id na URL.
 *
 * Não depende de auth nem de backend. Exibe apenas uma mensagem
 * de confirmação com links úteis.
 */
export default function SuccessPage() {
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
        <div className="mt-10 space-y-4">
          <a
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full btn-primary font-semibold transition-colors glow-pulse"
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

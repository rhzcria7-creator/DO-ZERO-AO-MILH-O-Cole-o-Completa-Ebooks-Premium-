import { useEffect, useState } from "react";
import { PRODUCT } from "../constants/product";
import { useAuth } from "../contexts/AuthContext";
import { db, setDoc, doc } from "../lib/firebase";

export default function SuccessPage() {
  const { user, loading } = useAuth();
  const [status, setStatus] = useState<"loading" | "verifying" | "success" | "error">("loading");

  useEffect(() => {
    let mounted = true;

    if (loading) return;

    if (!user) {
      if (mounted) window.location.href = '/login';
      return;
    }

    const verifyPayment = async () => {
      setStatus("verifying");

      // In a real application, you would verify a Stripe or MercadoPago
      // callback via a secure backend function here.
      // For this implementation, we will simulate a successful purchase
      // and grant the user access in the Firestore database.

      try {
        // Obter session_id da URL apenas para checagem se desejar: 
        // const params = new URLSearchParams(window.location.search);
        // ...

        await setDoc(doc(db, "purchases", `${user.uid}_dozeroaomilhao`), {
            userId: user.uid,
            ebookId: "dozeroaomilhao",
            status: "approved",
            purchaseDate: new Date(),
            amount: PRODUCT.price.currentNumber
        });

        if (mounted) {
          setStatus("success");
        }
      } catch (err) {
        console.error("Falha ao registrar compra", err);
        if (mounted) {
           setStatus("error");
        }
      }
    };

    verifyPayment();

    return () => {
      mounted = false;
    };
  }, [user, loading]);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 radial-bg">
      <div className="noise" />
      <div className="relative max-w-2xl text-center w-full">
        {(status === "loading" || status === "verifying") && (
          <div className="animate-pulse">
            <div className="w-16 h-16 mx-auto border-4 border-gold-400/20 border-t-gold-400 rounded-full animate-spin" />
            <p className="mt-6 text-white/60">Confirmando seu pagamento e liberando acesso...</p>
          </div>
        )}

        {status === "success" && (
          <>
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gold-400/10 border-2 border-gold-400 mb-8 glow-pulse">
              <svg
                className="w-10 h-10 text-gold-400"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <span className="text-xs tracking-[0.3em] uppercase text-gold-400">
              Acesso liberado
            </span>
            <h1 className="mt-3 font-display text-4xl md:text-5xl lg:text-6xl font-light leading-[1.05]">
              Pagamento <span className="text-gold-gradient italic">confirmado.</span>
            </h1>

            <p className="mt-6 text-lg text-white/70 max-w-lg mx-auto leading-relaxed">
              Bem-vindo à jornada. Seu acesso ao <span className="text-white">{PRODUCT.fullName}</span> já está liberado no seu painel.
            </p>

            <div className="mt-10">
                <a
                  href="/dashboard"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full btn-primary font-semibold transition-colors glow-pulse"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <path d="M7 10l5 5 5-5" />
                    <path d="M12 15V3" />
                  </svg>
                  Acessar Área do Cliente
                </a>
            </div>
            
            <div className="mt-6 space-y-3">
              <p className="text-xs text-white/50">
                Precisa de ajuda? <a href="mailto:rhz.cria.7@gmail.com" className="text-gold-400 hover:underline">Entre em contato</a>.
              </p>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-500/10 border-2 border-red-500 mb-8">
              <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="font-display text-5xl font-light mb-4">
              Erro na <span className="text-red-500 italic">confirmação</span>
            </h1>
            <p className="text-lg text-white/70 mb-6 max-w-lg mx-auto">
              Não foi possível confirmar o pagamento ou liberar seu acesso.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="/dashboard" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-gold-400 text-black font-semibold hover:bg-gold-300 transition-colors">
                Ir para o Painel e Tentar Novamente
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

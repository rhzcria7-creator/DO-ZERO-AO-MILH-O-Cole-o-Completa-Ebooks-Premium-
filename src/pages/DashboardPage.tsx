import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { auth, signOut } from "../lib/firebase";

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const [purchases, setPurchases] = useState<any[]>([]);

  useEffect(() => {
    if (!user) {
      if (!loading) {
        window.location.href = '/login';
      }
      return;
    }
    
    const fetchPurchases = async () => {
      try {
        const idToken = await user.getIdToken();
        const res = await fetch('/api/user-purchases', {
          headers: {
            'Authorization': `Bearer ${idToken}`
          }
        });
        if (res.ok) {
          const userPurchases = await res.json();
          setPurchases(userPurchases);
        }
      } catch (err) {
        console.error("Erro ao buscar compras:", err);
      }
    };
    
    fetchPurchases();
  }, [user, loading]);

  const handleDownload = async (purchaseId: string) => {
    try {
      const idToken = await user?.getIdToken();
      if (!idToken) return;

      const res = await fetch(`/api/user-purchases/${purchaseId}/download`, {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to get download URL");
      }

      const { url } = await res.json();
      window.open(url, "_blank");
    } catch (err) {
      console.error("Erro ao gerar link de download protegido", err);
      alert("Erro ao acessar o arquivo. Verifique se sua compra foi confirmada ou contate o suporte.");
    }
  };

  if (loading || !user) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-gold-400">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-black text-white antialiased radial-bg">
      <div className="noise" />
      
      {/* ===== HEADER ===== */}
      <header className="border-b border-white/5 bg-black/60 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-5 lg:px-10 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 group">
            <img src="/logo-icon.png" alt="Logo" width={32} height={32} />
            <span className="text-sm font-medium tracking-tight hidden sm:inline">
              Área do Cliente
            </span>
          </a>
          <div className="flex items-center gap-4">
            <span className="text-xs text-white/50">{user.email}</span>
            <button
              onClick={() => signOut(auth)}
              className="text-xs text-white hover:text-gold-400 transition"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="relative max-w-4xl mx-auto px-5 lg:px-10 py-10 lg:py-16">
        <div className="mb-10">
          <h1 className="font-display text-3xl font-light tracking-tight mb-2">
            Bem-vindo(a), <span className="text-gold-gradient">{user.displayName || 'Leitor'}</span>
          </h1>
          <p className="text-sm text-mist">
            Membro desde {user.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString('pt-BR') : 'Hoje'}. Aqui estão seus acessos.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur p-7 lg:p-9 shadow-xl">
          <h2 className="text-sm uppercase tracking-widest text-gold-400 mb-6">Suas Compras</h2>
          
          {purchases.length === 0 ? (
            <div className="text-center py-12 border border-white/10 rounded-2xl bg-black/40">
              <p className="text-mist text-sm mb-4">Nenhuma compra confirmada encontrada para este usuário.</p>
              <a href="/checkout" className="btn-primary !py-2 !px-5 !text-xs inline-flex">
                Adquirir Ebook
              </a>
            </div>
          ) : (
            <div className="space-y-4">
              {purchases.map(purchase => (
                <div key={purchase.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl border border-gold-400/20 bg-gradient-to-r from-gold-400/5 to-transparent">
                  <div className="flex items-center gap-4">
                    <img src="/ebook-cover.png" alt="Cover" loading="lazy" className="w-12 h-16 object-cover rounded-md border border-white/10" />
                    <div>
                      <h3 className="font-medium text-white">Guia Definitivo Do Zero ao Milhão</h3>
                      <p className="text-xs text-mist mt-1">Status: <span className="text-green-400">Aprovado</span> • Adquirido em: {purchase.purchaseDate ? new Date(purchase.purchaseDate).toLocaleDateString('pt-BR') : "Hoje"}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownload(purchase.id)}
                    className="btn-primary !px-4 !py-2 !text-xs whitespace-nowrap"
                  >
                    Baixar Ebook Seguro
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="mt-8 text-center">
            <button className="text-xs text-white/50 hover:text-white transition underline" onClick={async () => {
              const { sendPasswordResetEmail } = await import("firebase/auth");
              try {
                if(user?.email) {
                  await sendPasswordResetEmail(auth, user.email);
                  alert("E-mail de redefinição de senha enviado para sua caixa de entrada.");
                }
              } catch (e) {
                alert("Erro ao enviar o e-mail de redefinição.");
              }
            }}>Alterar Senha de Acesso</button>
        </div>
      </main>
    </div>
  );
}

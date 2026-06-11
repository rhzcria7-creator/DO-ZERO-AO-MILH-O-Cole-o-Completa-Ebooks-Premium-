import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { signInWithPopup, googleProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, auth } from '../lib/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';

export function AuthForms() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuthError = (err: any) => {
    let msg = err.message || 'Erro de autenticação.';
    if (err.code === 'auth/invalid-credential') msg = "E-mail ou senha inválidos.";
    else if (err.code === 'auth/email-already-in-use') msg = "Este e-mail já está em uso.";
    else if (err.code === 'auth/weak-password') msg = "A senha deve ter pelo menos 6 caracteres.";
    else if (err.code === 'auth/operation-not-allowed') {
      msg = "Método de login não ativado no Firebase.";
    } else if (err.code === 'auth/popup-closed-by-user') {
      msg = 'O login foi cancelado.';
    } else if (err.code === 'auth/internal-error' || err.code === 'auth/network-request-failed') {
       msg = "Erro interno no processo de autenticação. Confirme se as origens do app estão permitidas no console e tente recarregar.";
    }
    setError(msg);
  };

  const handleGoogle = async () => {
    try {
      setLoading(true);
      setError('');
      setMessage('');
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      handleAuthError(err);
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      setError("Digite seu e-mail para recuperar a senha.");
      return;
    }
    try {
      setLoading(true);
      setError('');
      setMessage('');
      await sendPasswordResetEmail(auth, email);
      setMessage("E-mail de redefinição enviado! Verifique sua caixa de entrada.");
    } catch (err: any) {
      handleAuthError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Preencha os campos obrigatórios.');
      return;
    }
    if (!isLogin && !name) {
      setError('Nome é obrigatório para cadastro.');
      return;
    }
    
    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        if (password.length < 6) {
          throw new Error("A senha deve ter pelo menos 6 caracteres.");
        }
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCred.user, { displayName: name });
      }
    } catch (err: any) {
      handleAuthError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="text-center mb-6">
        <h2 className="font-display text-2xl tracking-tight mb-2">
          {isLogin ? 'Bem-vindo(a) de volta' : 'Crie sua conta'}
        </h2>
        <p className="text-sm text-mist">
          {isLogin ? 'Faça login para continuar sua compra.' : 'Preencha seus dados para começar.'}
        </p>
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-white/20 rounded-xl bg-white/5 hover:bg-white/10 transition mb-6 font-medium text-sm disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" width="18" height="18">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        {loading ? "Aguarde..." : "Continuar com Google"}
      </button>

      <div className="flex items-center gap-3 mb-6">
        <hr className="flex-1 border-white/10" />
        <span className="text-[10px] uppercase tracking-widest text-white/30">Ou use email</span>
        <hr className="flex-1 border-white/10" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {!isLogin && (
          <div>
            <label className="block text-xs uppercase tracking-widest text-white/50 mb-1">Nome Completo</label>
            <input
              type="text"
              name="name"
              className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:border-gold-400 focus:outline-none transition"
              placeholder="Seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}
        <div>
          <label className="block text-xs uppercase tracking-widest text-white/50 mb-1">E-mail</label>
          <input
            type="email"
            name="email"
            className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:border-gold-400 focus:outline-none transition"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-widest text-white/50 mb-1">Senha</label>
          <input
            type="password"
            name="password"
            className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:border-gold-400 focus:outline-none transition"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
            <p className="text-red-400 text-xs font-medium text-center">{error}</p>
          </div>
        )}
        {message && (
          <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
            <p className="text-green-400 text-xs font-medium text-center">{message}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full !py-3 !px-4 !text-sm mt-2 flex justify-center disabled:opacity-50"
        >
          {loading ? 'Aguarde...' : isLogin ? 'Entrar' : 'Criar Conta'}
        </button>

        {isLogin && (
          <div className="text-center mt-2">
            <button
              type="button"
              onClick={handlePasswordReset}
              className="text-xs text-white/50 hover:text-white transition underline"
            >
              Esqueci minha senha
            </button>
          </div>
        )}
      </form>

      <div className="mt-6 text-center text-xs text-white/50">
        {isLogin ? 'Não tem uma conta?' : 'Já tem uma conta?'}
        <button
          type="button"
          onClick={() => { setIsLogin(!isLogin); setError(''); setMessage(''); }}
          className="ml-2 text-gold-400 hover:text-gold-300 font-medium"
        >
          {isLogin ? 'Cadastre-se' : 'Faça login'}
        </button>
      </div>
    </div>
  );
}

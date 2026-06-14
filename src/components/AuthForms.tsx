import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function AuthForms() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const { signUp, signIn, resetPassword } = useAuth();

  const handlePasswordReset = async () => {
    if (!email) {
      setError('Digite seu e-mail para recuperar a senha.');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    const { error } = await resetPassword(email);
    if (error) {
      setError(error);
    } else {
      setMessage('E-mail de redefinição enviado! Verifique sua caixa de entrada.');
    }
    setLoading(false);
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

    if (isLogin) {
      const { error } = await signIn(email, password);
      if (error) setError(error);
    } else {
      if (password.length < 6) {
        setError('A senha deve ter pelo menos 6 caracteres.');
        setLoading(false);
        return;
      }
      const { error } = await signUp(email, password, name);
      if (error) {
        setError(error);
      } else {
        setMessage('Conta criada! Verifique seu e-mail para confirmar.');
      }
    }

    setLoading(false);
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

      <form onSubmit={handleSubmit} className="space-y-4">
        {!isLogin && (
          <div>
            <label className="block text-xs uppercase tracking-widest text-white/50 mb-1">Nome Completo</label>
            <input
              type="text"
              name="name"
              autoComplete="name"
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
            autoComplete="email"
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
            autoComplete={isLogin ? 'current-password' : 'new-password'}
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

import { useEffect } from "react";
import { AuthForms } from "../components/AuthForms";
import { useAuth } from "../contexts/AuthContext";

export default function LoginPage() {
  const { user, loading } = useAuth();
  
  useEffect(() => {
    if (user && !loading) {
      window.location.href = '/dashboard';
    }
  }, [user, loading]);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-5 radial-bg">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.02] p-8 backdrop-blur shadow-2xl relative">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-gold-400/10 to-transparent rounded-3xl blur" />
        <a href="/" className="flex items-center justify-center mb-8">
            <img src="/logo-icon.png" alt="Do Zero ao Milhão" width={40} height={40} className="logo-float" />
        </a>
        <AuthForms />
      </div>
    </div>
  );
}

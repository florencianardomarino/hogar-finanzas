import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { LogIn, UserPlus, Home, Plus, Users, Landmark, Eye, EyeOff } from 'lucide-react';

export const AuthScreen: React.FC = () => {
  const { user, profile, households, loadingHouseholds, createHousehold, joinHousehold, showToast, logout } = useApp();

  // Estados de Auth
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Estados de Onboarding (Hogar)
  const [isJoining, setIsJoining] = useState<boolean | null>(null); // null = elegir, true = unirse, false = crear
  const [householdName, setHouseholdName] = useState('');
  const [billingDay, setBillingDay] = useState(10);
  const [inviteCode, setInviteCode] = useState('');

  // -------------------------------------------------------------------
  // ACCIONES DE AUTENTICACIÓN
  // -------------------------------------------------------------------
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      showToast('Por favor, completa todos los campos', 'error');
      return;
    }
    if (isSignUp && !displayName) {
      showToast('Por favor, indica tu nombre de usuario', 'error');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        // Registro
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName
            }
          }
        });

        if (error) throw error;
        showToast('Cuenta registrada. Revisa tu email para verificar la cuenta o inicia sesión.', 'info');
        setIsSignUp(false);
      } else {
        // Login
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;
        showToast('¡Bienvenido de vuelta!', 'success');
      }
    } catch (error: any) {
      console.error(error);
      showToast(error.message || 'Ocurrió un error en la autenticación', 'error');
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------------
  // ACCIONES DE HOGAR (ONBOARDING)
  // -------------------------------------------------------------------
  const handleCreateHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!householdName) {
      showToast('Por favor, introduce el nombre del hogar', 'error');
      return;
    }
    setLoading(true);
    try {
      await createHousehold(householdName, billingDay);
    } catch (e) {
      // Error manejado en el contexto
    } finally {
      setLoading(false);
    }
  };

  const handleJoinHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode) {
      showToast('Por favor, introduce el código de invitación', 'error');
      return;
    }
    setLoading(true);
    try {
      await joinHousehold(inviteCode);
    } catch (e) {
      // Error manejado en el contexto
    } finally {
      setLoading(false);
    }
  };

  // 1. SI NO ESTÁ AUTENTICADO: Mostrar login/registro
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center px-4 relative overflow-hidden bg-lux-bg py-10">
        {/* Adornos de fondo */}
        <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-lux-accent/10 rounded-full blur-3xl -z-10 animate-pulse-slow" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-brand-purple/10 rounded-full blur-3xl -z-10 animate-pulse-slow" />

        <div className="w-full max-w-md glass-panel p-8 rounded-3xl premium-card z-10">
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 bg-gradient-to-tr from-lux-accent to-brand-indigo rounded-2xl flex items-center justify-center shadow-lg shadow-lux-accent/20 mb-3">
              <Landmark size={28} className="text-white" />
            </div>
            <h1 className="text-2xl font-extrabold font-sans text-gradient-sky">Homeflow</h1>
            <p className="text-sm text-lux-muted mt-1 text-center">Tus finanzas familiares, sincronizadas y bajo control</p>
          </div>

          <h2 className="text-lg font-bold mb-6 text-center text-lux-text">
            {isSignUp ? 'Crear una cuenta nueva' : 'Iniciar Sesión'}
          </h2>

          <form onSubmit={handleAuth} className="flex flex-col gap-4">
            {isSignUp && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Nombre de Usuario</label>
                <input
                  type="text"
                  placeholder="Tu nombre (ej: Ana)"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-lux-bg border border-lux-border/60 hover:border-lux-border focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text transition-colors"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Correo Electrónico</label>
              <input
                type="email"
                placeholder="correo@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-lux-bg border border-lux-border/60 hover:border-lux-border focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Contraseña</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-lux-bg border border-lux-border/60 hover:border-lux-border focus:border-lux-accent rounded-2xl px-4 py-3 pr-10 text-sm text-lux-text transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-lux-muted hover:text-lux-text"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-lux-accent to-brand-indigo hover:from-blue-600 hover:to-indigo-600 text-white font-semibold py-3.5 rounded-2xl shadow-lg hover:shadow-lux-accent/20 transition-all duration-200 mt-2 active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : isSignUp ? (
                <>
                  <UserPlus size={18} />
                  <span>Registrarse</span>
                </>
              ) : (
                <>
                  <LogIn size={18} />
                  <span>Ingresar</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-lux-border/40 text-center">
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm font-semibold text-lux-accent hover:underline focus:outline-none"
            >
              {isSignUp ? '¿Ya tienes cuenta? Inicia Sesión' : '¿No tienes cuenta? Regístrate'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. SI ESTÁ AUTENTICADO PERO NO TIENE NINGÚN HOGAR VINCULADO: Flujo de Onboarding
  if (!loadingHouseholds && households.length === 0) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center px-4 relative overflow-hidden bg-lux-bg py-10">
        <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-lux-accent/10 rounded-full blur-3xl -z-10 animate-pulse-slow" />
        
        <div className="w-full max-w-md glass-panel p-8 rounded-3xl premium-card z-10">
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 bg-lux-accent/15 border border-lux-accent/30 text-lux-accent rounded-2xl flex items-center justify-center mb-3">
              <Home size={24} />
            </div>
            <h1 className="text-xl font-bold text-lux-text">Paso Inicial: Tu Hogar</h1>
            <p className="text-xs text-lux-muted text-center mt-1">
              Para empezar a gestionar tus gastos, necesitas crear un nuevo hogar o unirte a uno ya existente mediante una invitación.
            </p>
          </div>

          {isJoining === null && (
            <div className="flex flex-col gap-4 mt-6">
              <button
                onClick={() => setIsJoining(false)}
                className="w-full glass-panel hover:bg-lux-hover p-5 rounded-2xl text-left border-lux-border/50 hover:border-lux-accent/40 flex items-center gap-4 transition-all cursor-pointer"
              >
                <div className="p-3 bg-lux-accent/10 text-lux-accent rounded-xl shrink-0">
                  <Plus size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-lux-text">Crear un Nuevo Hogar</h3>
                  <p className="text-xs text-lux-muted mt-0.5">Comienza un espacio de cero y conviértete en Administrador</p>
                </div>
              </button>

              <button
                onClick={() => setIsJoining(true)}
                className="w-full glass-panel hover:bg-lux-hover p-5 rounded-2xl text-left border-lux-border/50 hover:border-brand-emerald/40 flex items-center gap-4 transition-all cursor-pointer"
              >
                <div className="p-3 bg-brand-emerald/10 text-brand-emerald rounded-xl shrink-0">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-lux-text">Unirse con Código</h3>
                  <p className="text-xs text-lux-muted mt-0.5">Ingresa el código proporcionado por tu pareja o familia</p>
                </div>
              </button>
            </div>
          )}

          {/* Formulario: CREAR HOGAR */}
          {isJoining === false && (
            <form onSubmit={handleCreateHousehold} className="flex flex-col gap-4 mt-4 animate-fade-in">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Nombre del Hogar</label>
                <input
                  type="text"
                  placeholder="Ej: Casa Flores o Familia Pérez"
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  className="w-full bg-lux-bg border border-lux-border/60 hover:border-lux-border focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text transition-colors"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Día de Inicio de Ciclo</label>
                  <span className="text-xs font-bold text-lux-accent">Día {billingDay}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="28"
                  value={billingDay}
                  onChange={(e) => setBillingDay(parseInt(e.target.value))}
                  className="w-full accent-lux-accent cursor-pointer my-2"
                />
                <p className="text-[10px] text-lux-muted">
                  Por ejemplo: si seleccionas 10, tus períodos financieros irán del día 10 del mes en curso al 9 del mes siguiente.
                </p>
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setIsJoining(null)}
                  className="flex-1 bg-lux-panel/40 border border-lux-border/50 text-lux-text font-semibold py-3 rounded-2xl hover:bg-lux-panel/60 transition-colors"
                >
                  Atrás
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-lux-accent to-brand-indigo text-white font-semibold py-3 rounded-2xl shadow-lg hover:shadow-lux-accent/25 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>Crear Hogar</span>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Formulario: UNIRSE A HOGAR */}
          {isJoining === true && (
            <form onSubmit={handleJoinHousehold} className="flex flex-col gap-4 mt-4 animate-fade-in">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Código de Invitación</label>
                <input
                  type="text"
                  placeholder="Ej: HOGAR-X7K2"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="w-full bg-lux-bg border border-lux-border/60 hover:border-lux-border focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text uppercase transition-colors"
                />
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setIsJoining(null)}
                  className="flex-1 bg-lux-panel/40 border border-lux-border/50 text-lux-text font-semibold py-3 rounded-2xl hover:bg-lux-panel/60 transition-colors"
                >
                  Atrás
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-brand-emerald to-emerald-600 text-white font-semibold py-3 rounded-2xl shadow-lg hover:shadow-brand-emerald/25 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>Unirse</span>
                  )}
                </button>
              </div>
            </form>
          )}

          <div className="mt-8 pt-6 border-t border-lux-border/40 text-center">
            <button
              type="button"
              onClick={logout}
              className="text-xs font-semibold text-brand-rose hover:underline cursor-pointer"
            >
              Cerrar sesión de {profile?.display_name || user.email}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. PANTALLA DE CARGA (Si está buscando hogares)
  return (
    <div className="min-h-screen flex justify-center items-center bg-lux-bg">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-lux-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-lux-muted font-medium">Cargando la configuración de tu hogar...</p>
      </div>
    </div>
  );
};

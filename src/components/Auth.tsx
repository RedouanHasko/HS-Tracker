import React, { useEffect, useState } from 'react';
import { auth } from '../lib/firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { authReady } from '../lib/firebase';
import { Mail, Lock, User, ArrowRight, Chrome, Globe, Moon, Sun } from 'lucide-react';
import { HSLogo } from './HSLogo';
import { AppFooter } from './AppFooter';
import InstallAppPrompt from './InstallAppPrompt';
import { getLanguage, saveLanguage } from '../utils/mockData';
import { Language } from '../types';

export const AuthBoard: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState<Language>(() => getLanguage());
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('buildtrack_theme') === 'dark' ? 'dark' : 'light');

  useEffect(() => {
    localStorage.setItem('buildtrack_theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.body.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const cycleLanguage = () => {
    const next = language === 'en' ? 'fr' : language === 'fr' ? 'ar' : 'en';
    setLanguage(next);
    saveLanguage(next);
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await authReady;
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        if (err.code === 'auth/internal-error' || err.code === 'auth/operation-not-allowed') {
          setError('Google Authentication is not enabled. Please go to your Firebase Console > Authentication > Sign-in method, and ensure the Google provider is enabled.');
        } else {
          setError('Failed to sign in with Google. Please try again.');
        }
        console.error(err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      await authReady;
      if (isSignUp) {
        const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(userCredential.user, {
          displayName: name.trim()
        });
        try {
          await sendEmailVerification(userCredential.user);
        } finally {
          await firebaseSignOut(auth);
        }
        setSuccess('Account created. Check your email and verify the address before signing in.');
        setIsSignUp(false);
        setPassword('');
      } else {
        const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
        const usesPassword = credential.user.providerData.some(
          (provider) => provider.providerId === 'password'
        );
        if (usesPassword && !credential.user.emailVerified) {
          try {
            await sendEmailVerification(credential.user);
          } finally {
            await firebaseSignOut(auth);
          }
          setSuccess('Verify your email before signing in. A new verification message was sent.');
        }
      }
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already in use.');
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setError('Invalid email or password.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password is too weak. Please use at least 6 characters.');
      } else if (err.code === 'auth/internal-error' || err.code === 'auth/operation-not-allowed') {
        setError('Authentication is not enabled. Please go to your Firebase Console > Authentication > Sign-in method, and ensure Email/Password and Google providers are enabled.');
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    setError(null);
    setSuccess(null);
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Enter your email address first.');
      return;
    }
    setLoading(true);
    try {
      await authReady;
      await sendPasswordResetEmail(auth, cleanEmail);
      setSuccess('If an account exists for this email, a password reset message has been sent.');
    } catch (error: any) {
      console.error('Password reset failed:', error);
      if (error?.code === 'auth/user-not-found') {
        setSuccess('If an account exists for this email, a password reset message has been sent.');
      } else {
        setError('Could not request a password reset. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-slate-50 dark:bg-slate-950 selection:bg-sky-500/30 selection:text-sky-900 dark:selection:text-sky-100">
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:right-4 sm:top-4">
        <button
          type="button"
          onClick={cycleLanguage}
          className="flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-2 text-[10px] font-bold text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          title="Change language"
          aria-label="Change language"
        >
          <Globe className="h-3.5 w-3.5" />
          <span className="font-mono">{language.toUpperCase()}</span>
        </button>
        <button
          type="button"
          onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          title={theme === 'light' ? 'Dark mode' : 'Light mode'}
          aria-label={theme === 'light' ? 'Dark mode' : 'Light mode'}
        >
          {theme === 'light' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5 text-amber-500" />}
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center px-3 pb-4 pt-16 sm:p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-5 flex flex-col items-center justify-center text-center sm:mb-8">
          <div className="mb-4 relative">
            <div className="absolute inset-0 blur-2xl bg-sky-500/20 dark:bg-sky-500/20 rounded-full scale-150"></div>
            <HSLogo className="w-48 max-w-[85vw] drop-shadow-xl relative z-10" />
          </div>
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            {isSignUp ? 'Create a secure workspace' : 'Sign in to your secure workspace'}
          </p>
        </div>

        {/* Card */}
        <div className="relative z-10 rounded-xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-200/50 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/50 sm:rounded-3xl sm:p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-sm font-medium">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400" role="status">
                {success}
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 bg-white dark:bg-[#0f1423] border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold px-4 py-3.5 rounded-xl transition-all disabled:opacity-70 group"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            <div className="flex items-center gap-3 my-2">
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800"></div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Or {isSignUp ? 'Sign Up' : 'Sign In'} With Email</span>
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800"></div>
            </div>

            {isSignUp && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-1">
                  Full Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="h-5 w-5" />
                  </div>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    maxLength={120}
                    className="w-full bg-slate-50 dark:bg-[#0f1423] border border-slate-200 dark:border-slate-800 rounded-xl leading-none px-4 py-3.5 pl-11 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                    placeholder="Jane Doe"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-1">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-5 w-5" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  maxLength={254}
                  className="w-full bg-slate-50 dark:bg-[#0f1423] border border-slate-200 dark:border-slate-800 rounded-xl leading-none px-4 py-3.5 pl-11 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                  placeholder="jane@example.com"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-1">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-5 w-5" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  minLength={isSignUp ? 10 : undefined}
                  maxLength={128}
                  className="w-full bg-slate-50 dark:bg-[#0f1423] border border-slate-200 dark:border-slate-800 rounded-xl leading-none px-4 py-3.5 pl-11 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 font-bold px-4 py-3.5 rounded-xl transition-all disabled:opacity-70 group"
            >
              {loading ? (
                <div className="w-5 h-5 rounded-full border-2 border-white/20 dark:border-slate-900/20 border-t-white dark:border-t-slate-900 animate-spin" />
              ) : (
                <>
                  {isSignUp ? 'Create Account' : 'Sign In'}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

            {!isSignUp && (
              <button
                type="button"
                onClick={handlePasswordReset}
                disabled={loading}
                className="self-end text-xs font-semibold text-sky-600 transition-colors hover:text-sky-500 disabled:opacity-50 dark:text-sky-400"
              >
                Forgot password?
              </button>
            )}
            
          </form>

          <div className="mt-8 text-center">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
                setPassword('');
              }}
              className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>
      </div>
      </div>
      <AppFooter variant="compact" />
      <InstallAppPrompt language={language} />
    </div>
  );
};

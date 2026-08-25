"use client";
import React, { useState } from 'react';
import { Bus, Lock, Mail, ArrowRight } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/api';
import { CONFIG } from '@/lib/config';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@voltava.app');
  const [password, setPassword] = useState('MeraStrongPass@2026');
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Array<{ path: string; message: string }>>([]);
  const router = useRouter();

  const [isResetMode, setIsResetMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setApiError(null);
    setIssues([]);
    
    try {
      const user = await login(email, password);

      if (user.mustResetPassword === true) {
        setIsResetMode(true);
      } else {
        router.push('/');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.name === 'ApiError') {
        if (error.status === 429) {
          setApiError('Too many attempts, please wait a minute.');
        } else {
          setApiError(error.message || 'Login failed.');
        }
        if (error.issues) {
          setIssues(error.issues);
        }
      } else {
        setApiError('Login failed. Please check your credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setApiError('Passwords do not match');
      return;
    }
    setIsLoading(true);
    setApiError(null);
    try {
      // Import updatePassword dynamically or import it at the top
      const { updatePassword, setToken, setUser, getUser } = await import('@/lib/api');
      await updatePassword(newPassword);
      
      // Update local storage user data to reflect mustResetPassword = false
      const user = getUser();
      if (user) {
        user.mustResetPassword = false;
        setUser(user);
        await setToken(localStorage.getItem('token') || '');
      }
      
      alert('Password updated successfully!');
      router.push('/');
    } catch (error: any) {
      setApiError(error.message || 'Failed to update password');
    } finally {
      setIsLoading(false);
    }
  };

  const emailIssue = issues.find(i => i.path === 'email')?.message;
  const passwordIssue = issues.find(i => i.path === 'password')?.message;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <Logo className="w-16 h-16" variant="light" />
        </div>
        <h2 className="mt-6 text-center text-2xl font-bold tracking-tight text-slate-900">
          {isResetMode ? 'Reset Default Password' : 'Sign in to your account'}
        </h2>
        <p className="mt-2 text-center text-sm text-slate-500">
          {isResetMode ? 'Please set a new strong password to continue' : 'Voltava Fleet Management System'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm border border-slate-200 sm:rounded-xl sm:px-10">
          {!isResetMode ? (
            <form className="space-y-6" onSubmit={handleLogin}>
              {apiError && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                  {apiError}
                </div>
              )}
              
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-slate-700">
                  Email address
                </label>
                <div className="mt-2 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`block w-full pl-10 pr-3 py-2 border ${emailIssue ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 'border-slate-200 focus:ring-orange-500 focus:border-orange-500'} rounded-md bg-slate-50 text-sm focus:outline-none focus:ring-1 transition-colors`}
                    placeholder="admin@fleet.com"
                  />
                </div>
                {emailIssue && <p className="mt-1 text-sm text-red-600">{emailIssue}</p>}
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
                  Password
                </label>
                <div className="mt-2 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`block w-full pl-10 pr-3 py-2 border ${passwordIssue ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 'border-slate-200 focus:ring-orange-500 focus:border-orange-500'} rounded-md bg-slate-50 text-sm focus:outline-none focus:ring-1 transition-colors`}
                    placeholder="••••••••"
                  />
                </div>
                {passwordIssue && <p className="mt-1 text-sm text-red-600">{passwordIssue}</p>}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500 bg-slate-50"
                  />
                  <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-700 font-medium">
                    Remember me
                  </label>
                </div>

                <div className="text-sm">
                  <a href="#" className="font-semibold text-orange-600 hover:text-orange-500 transition-colors">
                    Forgot your password?
                  </a>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex w-full justify-center items-center gap-2 rounded-md bg-orange-600 py-2 px-4 text-sm font-bold text-white shadow-sm hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <>
                      Sign in
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <form className="space-y-6" onSubmit={handleResetPassword}>
              {apiError && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                  {apiError}
                </div>
              )}
              
              <div>
                <label className="block text-sm font-semibold text-slate-700">
                  New Password
                </label>
                <div className="mt-2 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-slate-200 focus:ring-orange-500 focus:border-orange-500 rounded-md bg-slate-50 text-sm focus:outline-none focus:ring-1 transition-colors"
                    placeholder="Enter new password"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700">
                  Confirm New Password
                </label>
                <div className="mt-2 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-slate-200 focus:ring-orange-500 focus:border-orange-500 rounded-md bg-slate-50 text-sm focus:outline-none focus:ring-1 transition-colors"
                    placeholder="Confirm new password"
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isLoading || !newPassword || !confirmPassword}
                  className="flex w-full justify-center items-center gap-2 rounded-md bg-emerald-600 py-2 px-4 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Updating...' : 'Set Password & Continue'}
                </button>
              </div>
            </form>
          )}
        </div>
        <div className="mt-6 text-center text-xs text-slate-500 font-medium">
          Protected by Voltava Mobility India • <a href="#" className="text-slate-700 hover:underline">Privacy Policy</a>
          <div className="mt-2 text-slate-400">Proudly built in India 🇮🇳</div>
        </div>
      </div>
    </div>
  );
}

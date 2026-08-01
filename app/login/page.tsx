"use client";
import React from 'react';
import LoginHeader from '@/components/login/LoginHeader';
import LoginForm from '@/components/login/LoginForm';
import LoginFooter from '@/components/login/LoginFooter';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <LoginHeader />

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <LoginForm />
        <LoginFooter />
      </div>
    </div>
  );
}

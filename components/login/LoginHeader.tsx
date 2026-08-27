import React from 'react';
import { Bus } from 'lucide-react';

export default function LoginHeader() {
  return (
    <div className="sm:mx-auto sm:w-full sm:max-w-md">
      <div className="flex justify-center">
        <div className="w-12 h-12 bg-orange-600 rounded-xl flex items-center justify-center text-white shadow-lg">
          <Bus size={28} />
        </div>
      </div>
      <h2 className="mt-6 text-center text-2xl font-bold tracking-tight text-slate-900">
        Sign in to your account
      </h2>
      <p className="mt-2 text-center text-sm text-slate-500">
        Voltava Fleet Management System
      </p>
    </div>
  );
}

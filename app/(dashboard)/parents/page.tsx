import { ParentActivation } from '@/components/views/ParentActivation';
import { Suspense } from 'react';

export default function ParentsPage() {
  return <Suspense fallback={<p className="p-6" role="status">Loading parents…</p>}><ParentActivation /></Suspense>;
}

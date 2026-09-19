import { StudentsAttendance } from '@/components/views/StudentsAttendance';
import { Suspense } from 'react';

export default function StudentsPage() {
  return <Suspense fallback={<p className="p-6" role="status">Loading students…</p>}><StudentsAttendance /></Suspense>;
}

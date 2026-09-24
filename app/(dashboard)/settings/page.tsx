"use client";
import { AccountSettings } from '@/components/views/AccountSettings';
import { SchoolTransportSettings } from '@/components/views/SchoolTransportSettings';

export default function SettingsPage() {
  return (
    <>
      <AccountSettings />
      <SchoolTransportSettings />
    </>
  );
}

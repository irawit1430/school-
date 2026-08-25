import React from 'react';

export function Logo({ className = "w-8 h-8", variant = "light" }: { className?: string; variant?: "light" | "dark" }) {
  if (variant === "dark") {
    return (
      <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 15 L26 41 Q32 51 38 41" stroke="#FFFFFF" strokeWidth="8.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M38 41 L46 26" stroke="#E9A063" strokeWidth="8.5" strokeLinecap="round"/>
        <circle cx="51" cy="15" r="7" fill="#E9A063"/>
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 15 L26 41 Q32 51 38 41" stroke="#463A6B" strokeWidth="8.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M38 41 L46 26" stroke="#C9762F" strokeWidth="8.5" strokeLinecap="round"/>
      <circle cx="51" cy="15" r="7" fill="#C9762F"/>
    </svg>
  );
}

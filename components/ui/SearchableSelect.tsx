import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';
import { clsx } from 'clsx';

export interface Option {
  value: string;
  label: string;
  subLabel?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}

export function SearchableSelect({ options, value, onChange, placeholder, label }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt => 
    opt.label.toLowerCase().includes(query.toLowerCase()) || 
    (opt.subLabel && opt.subLabel.toLowerCase().includes(query.toLowerCase()))
  );

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className="relative flex flex-col gap-1" ref={wrapperRef}>
      {label && <label className="block text-sm font-semibold text-slate-700 mb-1">{label}</label>}
      <div 
        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-orange-500 focus-within:border-orange-500 outline-none transition-all flex items-center justify-between cursor-pointer bg-white"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={clsx("text-sm", !selectedOption && "text-slate-400")}>
          {selectedOption ? selectedOption.label : (placeholder || 'Select...')}
        </span>
        <ChevronDown size={16} className="text-slate-400" />
      </div>

      {isOpen && (
        <div className="absolute z-[100] top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100 flex items-center gap-2">
            <Search size={14} className="text-slate-400" />
            <input 
              autoFocus
              className="w-full outline-none text-sm p-1"
              placeholder="Search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-sm text-slate-500 text-center">No results found</div>
            ) : (
              filteredOptions.map(opt => (
                <div 
                  key={opt.value}
                  className="px-3 py-2 hover:bg-orange-50 cursor-pointer flex items-center justify-between"
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                    setQuery('');
                  }}
                >
                  <div>
                    <div className="text-sm font-medium text-slate-800">{opt.label}</div>
                    {opt.subLabel && <div className="text-xs text-slate-500">{opt.subLabel}</div>}
                  </div>
                  {value === opt.value && <Check size={16} className="text-orange-600" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

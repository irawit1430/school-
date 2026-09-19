import React, { useState, useRef, useEffect, useId, useCallback } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';
import { clsx } from 'clsx';

export interface Option {
  value: string;
  label: React.ReactNode | string;
  subLabel?: string;
  searchValue?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  /** Makes the hidden input required so native form validation fires */
  required?: boolean;
  /** Renders an error message below the trigger */
  error?: string;
  /** Shows a × button to clear the current selection */
  clearable?: boolean;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  label,
  disabled,
  required,
  error,
  clearable,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIdx, setHighlightedIdx] = useState(0);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const id = useId();
  const listboxId = `${id}-listbox`;
  const labelId = `${id}-label`;

  const filteredOptions = options.filter(opt => {
    const searchString = opt.searchValue || (typeof opt.label === 'string' ? opt.label : '');
    return (
      searchString.toLowerCase().includes(query.toLowerCase()) ||
      (opt.subLabel && opt.subLabel.toLowerCase().includes(query.toLowerCase()))
    );
  });

  const selectedOption = options.find(opt => opt.value === value);

  // Reset highlight when options change
  useEffect(() => {
    setHighlightedIdx(0);
  }, [query, isOpen]);

  // Click outside → close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const open = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    setQuery('');
    setTimeout(() => searchRef.current?.focus(), 0);
  }, [disabled]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    triggerRef.current?.focus();
  }, []);

  const select = useCallback((optValue: string) => {
    onChange(optValue);
    close();
  }, [onChange, close]);

  // Keyboard navigation on the trigger button
  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      open();
    }
  };

  // Keyboard navigation inside the dropdown
  const handleDropdownKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx(i => Math.min(i + 1, filteredOptions.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx(i => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions[highlightedIdx]) {
        select(filteredOptions[highlightedIdx].value);
      }
      return;
    }
    if (e.key === 'Tab') {
      close();
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const item = listRef.current.querySelector<HTMLButtonElement>(`[data-idx="${highlightedIdx}"]`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIdx, isOpen]);

  return (
    <div className="relative flex flex-col gap-1" ref={wrapperRef}>
      {label && (
        <label id={labelId} className="block text-sm font-semibold text-slate-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
        </label>
      )}

      <div className="flex items-center gap-1">
        {/* Trigger button */}
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-labelledby={label ? labelId : undefined}
          aria-label={!label ? (placeholder || 'Select option') : undefined}
          onClick={() => (isOpen ? close() : open())}
          onKeyDown={handleTriggerKeyDown}
          className={clsx(
            'flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all flex items-center justify-between text-left',
            error ? 'border-red-400' : 'border-slate-300',
            disabled ? 'bg-slate-50 cursor-not-allowed text-slate-500' : 'bg-white cursor-pointer',
          )}
        >
          <span className={clsx('text-sm', (!selectedOption || disabled) && 'text-slate-500', selectedOption && !disabled && 'text-slate-900')}>
            {selectedOption ? selectedOption.label : (placeholder || 'Select…')}
          </span>
          <ChevronDown
            size={16}
            className={clsx('text-slate-400 transition-transform shrink-0 ml-2', isOpen && 'rotate-180')}
          />
        </button>

        {/* Clear button */}
        {clearable && value && !disabled && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear selection"
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded focus:outline-none focus:ring-2 focus:ring-orange-500 shrink-0"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Hidden input for native form required validation */}
      <input
        tabIndex={-1}
        aria-hidden="true"
        required={required}
        value={value}
        onChange={() => {}}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
      />

      {/* Error message */}
      {error && (
        <p role="alert" className="text-xs text-red-600 mt-0.5">
          {error}
        </p>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div
          id={listboxId}
          className="absolute z-[200] top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden"
          onKeyDown={handleDropdownKeyDown}
        >
          {/* Search */}
          <div className="p-2 border-b border-slate-100 flex items-center gap-2">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              ref={searchRef}
              className="w-full outline-none text-sm p-1"
              placeholder="Search…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleDropdownKeyDown}
              aria-label="Search options"
            />
          </div>

          {/* Options list */}
          <div ref={listRef} role="listbox" aria-label={label || placeholder || 'Options'} className="max-h-48 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-sm text-slate-500 text-center">No results found</div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isHighlighted = idx === highlightedIdx;
                const isSelected = value === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-idx={idx}
                    onMouseEnter={() => setHighlightedIdx(idx)}
                    onClick={() => select(opt.value)}
                    className={clsx(
                      'w-full text-left px-3 py-2 flex items-center justify-between transition-colors focus:outline-none',
                      isHighlighted ? 'bg-orange-50' : 'hover:bg-orange-50',
                    )}
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-800">{opt.label}</div>
                      {opt.subLabel && <div className="text-xs text-slate-500">{opt.subLabel}</div>}
                    </div>
                    {isSelected && <Check size={16} className="text-orange-600 shrink-0 ml-2" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

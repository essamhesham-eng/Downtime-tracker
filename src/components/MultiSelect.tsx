import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: Option[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({ options, selectedValues, onChange, placeholder = 'Select...', className = '' }: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (value: string) => {
    const newSelected = selectedValues.includes(value)
      ? selectedValues.filter(v => v !== value)
      : [...selectedValues, value];
    onChange(newSelected);
  };

  const selectedLabels = options
    .filter(opt => selectedValues.includes(opt.value))
    .map(opt => opt.label);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div 
        className="p-2 border border-gray-300 rounded-lg cursor-pointer bg-white flex justify-between items-center text-sm min-h-[38px]"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex-1 truncate mr-2">
          {selectedValues.length === 0 
            ? <span className="text-gray-500">{placeholder}</span>
            : <span className="text-gray-800">{selectedLabels.join(', ')}</span>}
        </div>
        <ChevronDown size={16} className="text-gray-500 flex-shrink-0" />
      </div>
      
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {options.length === 0 ? (
            <div className="p-2 text-sm text-gray-500 text-center">No options available</div>
          ) : (
            options.map(opt => (
              <label key={opt.value} className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer text-sm">
                <input 
                  type="checkbox" 
                  checked={selectedValues.includes(opt.value)}
                  onChange={() => toggleOption(opt.value)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="truncate">{opt.label}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

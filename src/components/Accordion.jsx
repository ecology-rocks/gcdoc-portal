import React, { useState } from 'react';

export default function Accordion({ title, children, defaultOpen = false, color = "gray" }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Color classes mapping
  const colors = {
    gray: "bg-gray-100 text-gray-800 border-gray-300",
    blue: "bg-blue-50 text-blue-800 border-blue-200",
    red: "bg-red-50 text-red-800 border-red-200",
    orange: "bg-orange-50 text-orange-800 border-orange-200",
  };
  const headerClass = colors[color] || colors.gray;

  return (
    <div className="border rounded mb-4 bg-white shadow-sm overflow-hidden">
      <button
        className={`w-full flex justify-between items-center p-4 font-bold text-left border-b ${headerClass} hover:opacity-90 transition-opacity`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{title}</span>
        <span className="text-lg font-mono">{isOpen ? '−' : '+'}</span>
      </button>
      
      {/* Only show content if open */}
      {isOpen && (
        <div className="p-6">
          {children}
        </div>
      )}
    </div>
  );
}
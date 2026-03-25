'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Download, FileImage, Printer, Loader2 } from 'lucide-react';

interface ExportControlsProps {
  containerRef: React.RefObject<HTMLDivElement>;
  systemName: string;
}

export function ExportControls({
  containerRef,
  systemName,
}: ExportControlsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    },
    []
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, handleClickOutside]);

  const handleExportPNG = async () => {
    if (!containerRef.current) return;

    setIsExporting(true);
    setIsOpen(false);

    try {
      // Dynamic import html2canvas only when needed
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(containerRef.current, {
        backgroundColor: '#0f172a',
        scale: 2,
        useCORS: true,
        logging: false,
        // Limit the capture area to prevent freezing
        width: containerRef.current.scrollWidth,
        height: containerRef.current.scrollHeight,
        windowWidth: containerRef.current.scrollWidth,
        windowHeight: containerRef.current.scrollHeight,
      });

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const date = new Date().toISOString().split('T')[0];
        link.download = `traffic-flow-map-${systemName}-${date}.png`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 'image/png');
    } catch (error) {
      console.error('PNG export failed:', error);
      alert('PNG export failed. Try the Print option instead.');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    setIsOpen(false);
    // Simple: use browser's print dialog which can save as PDF
    window.print();
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={isExporting}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
          transition-all duration-200
          ${
            isExporting
              ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white'
          }
        `}
      >
        {isExporting ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Exporting...</span>
          </>
        ) : (
          <>
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </>
        )}
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-1 w-48 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl overflow-visible"
          style={{ zIndex: 9999, top: '100%' }}
        >
          <button
            onClick={handleExportPNG}
            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-white hover:bg-slate-700 transition-colors"
          >
            <FileImage className="w-4 h-4 text-blue-400" />
            Export as PNG
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-white hover:bg-slate-700 transition-colors"
          >
            <Printer className="w-4 h-4 text-green-400" />
            Print / Save as PDF
          </button>
        </div>
      )}
    </div>
  );
}

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
      // Export background follows the active theme (html2canvas needs a
      // concrete color, so resolve the body's computed background instead
      // of hardcoding the old dark-navy fill).
      const themeBg = (() => {
        const c = getComputedStyle(document.body).backgroundColor;
        return c && c !== 'rgba(0, 0, 0, 0)' ? c : '#ffffff';
      })();
      const canvas = await html2canvas(containerRef.current, {
        backgroundColor: themeBg,
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
              ? 'bg-muted/50 text-muted-foreground cursor-not-allowed border border-border'
              : 'bg-muted text-foreground hover:bg-accent border border-border'
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
          className="absolute right-0 mt-1 w-48 bg-card border border-border rounded-lg shadow-2xl overflow-visible"
          style={{ zIndex: 9999, top: '100%' }}
        >
          <button
            onClick={handleExportPNG}
            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-foreground hover:bg-accent transition-colors"
          >
            <FileImage className="w-4 h-4 text-blue-400" />
            Export as PNG
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-foreground hover:bg-accent transition-colors"
          >
            <Printer className="w-4 h-4 text-green-400" />
            Print / Save as PDF
          </button>
        </div>
      )}
    </div>
  );
}

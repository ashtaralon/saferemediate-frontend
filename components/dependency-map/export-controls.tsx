'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Download, FileImage, FileText, Loader2 } from 'lucide-react';

interface ExportControlsProps {
  containerRef: React.RefObject<HTMLDivElement>;
  systemName: string;
}

function getFormattedDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
}

async function captureCanvas(
  container: HTMLElement
): Promise<HTMLCanvasElement> {
  const html2canvas = (await import('html2canvas')).default;
  return html2canvas(container, {
    backgroundColor: '#0f172a',
    scale: 2,
    useCORS: true,
  });
}

export function ExportControls({
  containerRef,
  systemName,
}: ExportControlsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportType, setExportType] = useState<'png' | 'pdf' | null>(null);
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

  const triggerDownload = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPNG = async () => {
    if (!containerRef.current) return;

    setIsExporting(true);
    setExportType('png');
    setIsOpen(false);

    try {
      const canvas = await captureCanvas(containerRef.current);
      const dataUrl = canvas.toDataURL('image/png');
      const date = getFormattedDate();
      const safeName = sanitizeFilename(systemName);
      triggerDownload(dataUrl, `traffic-flow-map-${safeName}-${date}.png`);
    } catch (error) {
      console.error('PNG export failed:', error);
    } finally {
      setIsExporting(false);
      setExportType(null);
    }
  };

  const handleExportPDF = async () => {
    // PDF export: render as high-res PNG and open in new tab for printing to PDF
    if (!containerRef.current) return;

    setIsExporting(true);
    setExportType('pdf');
    setIsOpen(false);

    try {
      const canvas = await captureCanvas(containerRef.current);
      const dataUrl = canvas.toDataURL('image/png');
      // Open in new window for print-to-PDF
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html><head><title>Traffic Flow Map - ${systemName}</title>
          <style>body{margin:0;background:#0f172a;display:flex;justify-content:center;align-items:center;min-height:100vh}img{max-width:100%;height:auto}</style>
          </head><body><img src="${dataUrl}" /><script>setTimeout(()=>window.print(),500)<\/script></body></html>
        `);
        printWindow.document.close();
      }
    } catch (error) {
      console.error('PDF export failed:', error);
    } finally {
      setIsExporting(false);
      setExportType(null);
    }
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
            <span>
              Exporting{exportType ? ` ${exportType.toUpperCase()}` : ''}...
            </span>
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
          className="
            absolute right-0 mt-1 w-48
            bg-slate-800 border border-slate-600 rounded-lg
            shadow-2xl overflow-visible
          "
          style={{ zIndex: 9999, top: '100%' }}
        >
          <button
            onClick={handleExportPNG}
            className="
              flex items-center gap-2 w-full px-4 py-2
              text-sm text-white hover:bg-slate-700
              transition-colors duration-150
            "
          >
            <FileImage className="w-4 h-4 text-slate-400" />
            Export as PNG
          </button>
          <button
            onClick={handleExportPDF}
            className="
              flex items-center gap-2 w-full px-4 py-2
              text-sm text-white hover:bg-slate-700
              transition-colors duration-150
            "
          >
            <FileText className="w-4 h-4 text-slate-400" />
            Export as PDF
          </button>
        </div>
      )}
    </div>
  );
}

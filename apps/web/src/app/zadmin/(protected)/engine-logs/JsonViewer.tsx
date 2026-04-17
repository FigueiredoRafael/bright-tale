'use client';

import { useState } from 'react';

interface JsonViewerProps {
  label: string;
  data: unknown;
}

export function JsonViewer({ label, data }: JsonViewerProps) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);

  async function handleCopy() {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="border border-[#1E2E40] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-[#0D1117] border-b border-[#1E2E40]">
        <span className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">{label}</span>
        <button
          onClick={handleCopy}
          className="text-xs px-2.5 py-1 rounded bg-[#1E2E40] text-[#94A3B8] hover:text-[#2DD4A8] hover:bg-[rgba(45,212,168,0.1)] transition-all"
        >
          {copied ? '✓ Copied' : 'Copy JSON'}
        </button>
      </div>
      <pre className="p-4 text-xs text-[#E2E8F0] bg-[#0A0F16] overflow-auto max-h-[400px] font-mono leading-relaxed whitespace-pre-wrap break-words">
        {json}
      </pre>
    </div>
  );
}

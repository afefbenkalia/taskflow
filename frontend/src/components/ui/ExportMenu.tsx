import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';

import type { ExportFormat } from '../../types';
import { DropdownMenu } from './DropdownMenu';

export interface ExportMenuProps {
  /** Button text, e.g. "Export" or "Export report". */
  label: string;
  /** Format being downloaded, or null when idle. */
  exporting: ExportFormat | null;
  onExport: (format: ExportFormat) => void;
}

/** Secondary "Export" button that lets the admin pick CSV or PDF. */
export function ExportMenu({ label, exporting, onExport }: ExportMenuProps) {
  const busy = exporting !== null;
  return (
    <DropdownMenu
      ariaLabel={label}
      width={220}
      disabled={busy}
      triggerClassName="inline-flex h-10 items-center justify-center gap-2 rounded-field border border-line bg-white px-4 text-sm font-bold text-ink-label shadow-sm transition hover:bg-app focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
      trigger={
        <>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
          )}
          {label}
          <ChevronDown className="h-4 w-4 text-ink-muted" strokeWidth={1.8} aria-hidden="true" />
        </>
      }
      items={[
        { key: 'csv', label: 'CSV (spreadsheet)', icon: FileSpreadsheet, onSelect: () => onExport('csv') },
        { key: 'pdf', label: 'PDF (printable)', icon: FileText, onSelect: () => onExport('pdf') },
      ]}
    />
  );
}

export default ExportMenu;

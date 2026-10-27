import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { exportActivity } from '../src/api/activity';
import { exportProjects } from '../src/api/projects';
import { exportReport } from '../src/api/stats';
import { ExportMenu } from '../src/components/ui/ExportMenu';

const client = vi.hoisted(() => ({ downloadFile: vi.fn() }));
vi.mock('../src/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api/client')>()),
  downloadFile: client.downloadFile,
}));

describe('ExportMenu', () => {
  it('offers CSV and PDF', async () => {
    const onExport = vi.fn();
    const user = userEvent.setup();
    render(<ExportMenu label="Export" exporting={null} onExport={onExport} />);

    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(screen.getByRole('menuitem', { name: 'CSV (spreadsheet)' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'PDF (printable)' }));

    expect(onExport).toHaveBeenCalledWith('pdf');
  });

  it('is disabled while a file is being prepared', () => {
    render(<ExportMenu label="Export report" exporting="pdf" onExport={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Export report' })).toBeDisabled();
  });
});

describe('export API', () => {
  beforeEach(() => {
    client.downloadFile.mockReset().mockResolvedValue(undefined);
  });

  it('asks for the chosen format', async () => {
    await exportProjects('pdf');
    await exportReport('7d', 'pdf');
    await exportActivity({ user_id: 3, period: '7d' }, 'pdf');

    expect(client.downloadFile.mock.calls).toEqual([
      ['/admin/projects/export', { format: 'pdf' }, 'taskflow-projects.pdf'],
      ['/admin/stats/export', { period: '7d', format: 'pdf' }, 'taskflow-report-7d.pdf'],
      ['/admin/activity/export', { user_id: 3, period: '7d', format: 'pdf' }, 'taskflow-activity.pdf'],
    ]);
  });

  it('keeps CSV as the default', async () => {
    await exportProjects();

    expect(client.downloadFile).toHaveBeenCalledWith('/admin/projects/export', { format: 'csv' }, 'taskflow-projects.csv');
  });
});

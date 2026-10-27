import {
  Download,
  File as FileIcon,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Paperclip,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';

import { apiErrorMessage } from '../../../api/client';
import {
  deleteProjectFile,
  downloadProjectFile,
  getProjectFiles,
  uploadProjectFile,
} from '../../../api/projects';
import { Alert, Toast } from '../../../components/ui/Alert';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ConfirmDialog } from '../../../components/ui/Modal';
import { Table, type Column } from '../../../components/ui/Table';
import { fileSize, shortDate } from '../../../lib/format';
import type { ProjectFile } from '../../../types/project';

/** Mirrors MAX_UPLOAD_SIZE_MB (backend/.env); the API enforces it. */
export const MAX_UPLOAD_MB = 10;

function fileIcon(file: Pick<ProjectFile, 'name' | 'content_type'>): { icon: LucideIcon; bg: string; fg: string } {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (file.content_type.startsWith('image/')) return { icon: FileImage, bg: '#FCE7F6', fg: '#C11574' };
  if (['csv', 'xls', 'xlsx', 'ods'].includes(extension)) return { icon: FileSpreadsheet, bg: '#ECFDF3', fg: '#067647' };
  if (['zip', 'rar', '7z', 'gz', 'tar'].includes(extension)) return { icon: FileArchive, bg: '#FFFAEB', fg: '#B54708' };
  if (['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt'].includes(extension) || file.content_type.startsWith('text/')) {
    return { icon: FileText, bg: '#EFF8FF', fg: '#175CD3' };
  }
  return { icon: FileIcon, bg: '#F2F4F7', fg: '#475467' };
}

export interface FilesTabProps {
  projectId: number;
  currentUserId: number;
  canUpload: boolean;
  onCountChange: (count: number) => void;
}

export function FilesTab({ projectId, currentUserId, canUpload, onCountChange }: FilesTabProps) {
  const [files, setFiles] = useState<ProjectFile[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [deleting, setDeleting] = useState<ProjectFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;
  const closeToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    let cancelled = false;
    getProjectFiles(projectId)
      .then((rows) => !cancelled && setFiles(rows))
      .catch((reason) => !cancelled && setError(apiErrorMessage(reason, 'Unable to load the files.')));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (files) onCountChangeRef.current(files.length);
  }, [files]);

  const upload = async (selection: File[]) => {
    if (selection.length === 0) return;
    setError(null);
    const tooLarge = selection.filter((file) => file.size > MAX_UPLOAD_MB * 1024 * 1024);
    const accepted = selection.filter((file) => !tooLarge.includes(file));
    const problems = tooLarge.map((file) => `${file.name}: files must be ${MAX_UPLOAD_MB} MB or smaller.`);

    setUploading(true);
    const added: ProjectFile[] = [];
    // One at a time, so a failure only affects its own file.
    for (const file of accepted) {
      try {
        added.push(await uploadProjectFile(projectId, file));
      } catch (reason) {
        problems.push(`${file.name}: ${apiErrorMessage(reason, 'the upload failed.')}`);
      }
    }
    setUploading(false);

    if (added.length > 0) {
      setFiles((current) => [...added.reverse(), ...(current ?? [])]);
      setToast(added.length === 1 ? `“${added[0]!.name}” was uploaded.` : `${added.length} files were uploaded.`);
    }
    if (problems.length > 0) setError(problems.join(' '));
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (canUpload && !uploading) void upload(Array.from(event.dataTransfer.files));
  };

  const download = async (file: ProjectFile) => {
    setError(null);
    try {
      await downloadProjectFile(projectId, file);
    } catch (reason) {
      setError(apiErrorMessage(reason, `“${file.name}” couldn’t be downloaded.`));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    setDeleteError(null);
    try {
      await deleteProjectFile(projectId, deleting.id);
      setFiles((current) => current && current.filter((file) => file.id !== deleting.id));
      setToast(`“${deleting.name}” was deleted.`);
      setDeleting(null);
    } catch (reason) {
      setDeleteError(apiErrorMessage(reason, 'The file couldn’t be deleted.'));
    } finally {
      setBusy(false);
    }
  };

  const iconButton =
    'rounded-lg p-1.5 text-ink-muted transition focus-visible:outline-none focus-visible:ring-2';

  const columns: Column<ProjectFile>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (file) => {
        const { icon: Icon, bg, fg } = fileIcon(file);
        return (
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
              style={{ backgroundColor: bg, color: fg }}
              aria-hidden="true"
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </span>
            <button
              type="button"
              onClick={() => download(file)}
              className="min-w-0 truncate rounded text-left text-sm font-semibold text-ink hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              title={file.name}
            >
              {file.name}
            </button>
          </div>
        );
      },
    },
    {
      key: 'size',
      header: 'Size',
      width: 70,
      align: 'right',
      render: (file) => <span className="text-[13px] text-[#475467]">{fileSize(file.size_bytes)}</span>,
    },
    {
      key: 'uploader',
      header: 'Uploaded by',
      width: 170,
      render: (file) =>
        file.uploaded_by ? (
          <span className="flex min-w-0 items-center gap-2">
            <Avatar name={file.uploaded_by.full_name} size={26} />
            <span className="truncate text-[13px] font-medium text-[#475467]">
              {file.uploaded_by.id === currentUserId ? `${file.uploaded_by.first_name} (you)` : file.uploaded_by.full_name}
            </span>
          </span>
        ) : (
          <span className="text-[13px] text-ink-muted">Former member</span>
        ),
    },
    {
      key: 'date',
      header: 'Added',
      width: 70,
      render: (file) => <span className="text-[13px] text-[#475467]">{shortDate(file.created_at)}</span>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: 72,
      align: 'right',
      render: (file) => (
        <span className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => download(file)}
            aria-label={`Download ${file.name}`}
            title="Download"
            className={`${iconButton} hover:bg-[#F2F4F7] hover:text-ink-secondary focus-visible:ring-primary/30`}
          >
            <Download className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
          </button>
          {file.can_delete && (
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setDeleting(file);
              }}
              aria-label={`Delete ${file.name}`}
              title="Delete"
              className={`${iconButton} hover:bg-[#FEF3F2] hover:text-[#D92D20] focus-visible:ring-[#D92D20]/30`}
            >
              <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
            </button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink">Files</h2>
          <p className="mt-0.5 text-[13px] text-ink-secondary">Documents shared with everyone in this project.</p>
        </div>
        {canUpload && (
          <Button
            variant="secondary"
            onClick={() => inputRef.current?.click()}
            loading={uploading}
            leftIcon={<Upload className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />}
          >
            Upload files
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose files to upload"
          onChange={(event) => {
            void upload(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      </div>

      {canUpload && (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-1 rounded-card border-2 border-dashed px-6 py-6 text-center transition ${
            dragging ? 'border-primary bg-[#F5F6FF]' : 'border-line bg-white'
          }`}
        >
          <Paperclip className="h-5 w-5 text-ink-secondary" strokeWidth={1.8} aria-hidden="true" />
          <p className="text-[13px] font-semibold text-ink-label">
            {uploading ? 'Uploading…' : 'Drop files here to upload'}
          </p>
          <p className="text-xs text-ink-muted">Up to {MAX_UPLOAD_MB} MB per file</p>
        </div>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      <Table
        caption="Project files"
        columns={columns}
        rows={files ?? []}
        getRowKey={(file) => file.id}
        loading={files === null && !error}
        skeletonRows={3}
        minWidth={680}
        empty={<EmptyState icon={Paperclip} title="No files yet" description="Upload briefs, specs or exports to share them with the team." />}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete “${deleting?.name ?? ''}”?`}
        message="The file will be removed for everyone in this project. This can’t be undone."
        confirmLabel="Delete file"
        tone="danger"
        loading={busy}
        error={deleteError && <Alert variant="error">{deleteError}</Alert>}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
      <Toast message={toast} onClose={closeToast} />
    </div>
  );
}

export default FilesTab;

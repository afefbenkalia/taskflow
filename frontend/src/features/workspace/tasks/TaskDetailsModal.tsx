import { Calendar, Send, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { apiErrorMessage } from '../../../api/client';
import { addTaskComment, deleteTaskComment, getTaskComments } from '../../../api/tasks';
import { Alert } from '../../../components/ui/Alert';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { pluralize, relativeTime, shortDate } from '../../../lib/format';
import { COMMENT_MAX_LENGTH, type Task, type TaskComment } from '../../../types/task';
import { PriorityBadge, StatusDot, TASK_STATUS_META } from './StatusMenu';

export interface TaskDetailsModalProps {
  task: Task | null;
  onClose: () => void;
  /** Called with the new number of comments, so lists can update their counters. */
  onCommentsChange?: (task: Task, count: number) => void;
}

/** A task's details and its comment thread. */
export function TaskDetailsModal({ task, onClose, onCommentsChange }: TaskDetailsModalProps) {
  const [comments, setComments] = useState<TaskComment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  const taskId = task?.id;

  useEffect(() => {
    if (taskId === undefined) return undefined;
    let cancelled = false;
    setComments(null);
    setDraft('');
    setError(null);
    getTaskComments(taskId)
      .then((rows) => !cancelled && setComments(rows))
      .catch((reason) => !cancelled && setError(apiErrorMessage(reason, 'Unable to load the comments.')));
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [comments?.length]);

  if (!task) return null;

  const update = (next: TaskComment[]) => {
    setComments(next);
    onCommentsChange?.(task, next.length);
  };

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    try {
      const created = await addTaskComment(task.id, content);
      update([...(comments ?? []), created]);
      setDraft('');
    } catch (reason) {
      setError(apiErrorMessage(reason, 'Your comment couldn’t be posted.'));
    } finally {
      setSending(false);
    }
  };

  const remove = async (comment: TaskComment) => {
    setDeleting(comment.id);
    setError(null);
    try {
      await deleteTaskComment(task.id, comment.id);
      update((comments ?? []).filter((item) => item.id !== comment.id));
    } catch (reason) {
      setError(apiErrorMessage(reason, 'The comment couldn’t be deleted.'));
    } finally {
      setDeleting(null);
    }
  };

  const meta = TASK_STATUS_META[task.status];

  return (
    <Modal open onClose={onClose} busy={sending} width={600} title={task.title} description={`${task.key} · ${task.project.name}`}>
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-[#F9FAFB] p-4 text-[13px] sm:grid-cols-4">
          <div>
            <dt className="text-xs font-medium text-ink-muted">Status</dt>
            <dd className="mt-1 inline-flex items-center gap-1.5 font-semibold text-ink-label">
              <StatusDot status={task.status} />
              {meta.label}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-ink-muted">Priority</dt>
            <dd className="mt-1">
              <PriorityBadge priority={task.priority} />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-ink-muted">Due</dt>
            <dd className="mt-1 inline-flex items-center gap-1.5 font-semibold text-ink-label">
              <Calendar className="h-3.5 w-3.5 text-ink-muted" strokeWidth={1.8} aria-hidden="true" />
              {task.due_date ? shortDate(task.due_date) : 'No due date'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-medium text-ink-muted">Assignee</dt>
            <dd className="mt-1 flex min-w-0 items-center gap-1.5 font-semibold text-ink-label">
              {task.assignee ? (
                <>
                  <Avatar name={task.assignee.full_name} size={20} />
                  <span className="truncate">{task.assignee.full_name}</span>
                </>
              ) : (
                <span className="text-ink-muted">Unassigned</span>
              )}
            </dd>
          </div>
        </dl>

        {task.description && <p className="whitespace-pre-line text-sm leading-6 text-[#475467]">{task.description}</p>}

        <section aria-label="Comments">
          <h3 className="text-[15px] font-bold text-ink">
            Comments
            {comments && <span className="ml-2 text-[13px] font-semibold text-ink-secondary">{comments.length}</span>}
          </h3>

          {error && <Alert variant="error" className="mt-3">{error}</Alert>}

          <div className="mt-3 max-h-[300px] space-y-4 overflow-y-auto pr-1">
            {comments === null && !error ? (
              <Skeleton className="h-16 w-full" />
            ) : comments && comments.length === 0 ? (
              <p className="rounded-[10px] bg-[#F9FAFB] px-4 py-5 text-center text-[13px] text-ink-secondary">
                No comments yet. Start the conversation.
              </p>
            ) : (
              <ul className="space-y-4">
                {(comments ?? []).map((comment) => (
                  <li key={comment.id} className="flex items-start gap-3">
                    <Avatar name={comment.author?.full_name ?? 'Former member'} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[13px] font-semibold text-ink">{comment.author?.full_name ?? 'Former member'}</span>
                        <time dateTime={comment.created_at} className="text-xs text-ink-muted">
                          {relativeTime(comment.created_at)}
                        </time>
                      </p>
                      <p className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-[#344054]">{comment.content}</p>
                    </div>
                    {comment.can_delete && (
                      <button
                        type="button"
                        onClick={() => remove(comment)}
                        disabled={deleting === comment.id}
                        aria-label={`Delete comment by ${comment.author?.full_name ?? 'former member'}`}
                        title="Delete comment"
                        className="rounded-lg p-1.5 text-ink-muted transition hover:bg-[#FEF3F2] hover:text-[#D92D20] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D92D20]/30 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div ref={listEndRef} />
          </div>

          <form onSubmit={send} className="mt-4">
            <label htmlFor={`comment-${task.id}`} className="sr-only">
              Write a comment
            </label>
            <textarea
              id={`comment-${task.id}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void send();
              }}
              rows={3}
              maxLength={COMMENT_MAX_LENGTH}
              placeholder="Write a comment…"
              className="block w-full resize-y rounded-field border border-line bg-white px-3.5 py-2.5 text-sm text-ink shadow-[0_1px_2px_rgba(16,24,40,0.05)] outline-none transition placeholder:text-ink-muted focus:border-primary focus:ring-4 focus:ring-primary/15"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs text-ink-muted">
                {draft.length > COMMENT_MAX_LENGTH - 100
                  ? `${COMMENT_MAX_LENGTH - draft.length} characters left`
                  : 'Ctrl + Enter to send'}
              </span>
              <Button
                type="submit"
                size="sm"
                loading={sending}
                disabled={!draft.trim()}
                leftIcon={<Send className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />}
              >
                Comment
              </Button>
            </div>
          </form>
        </section>
      </div>
    </Modal>
  );
}

/** "3 comments" / "Comment": the link that opens the thread from a card or a row. */
export function commentsLabel(count: number): string {
  return count ? pluralize(count, 'comment') : 'Comment';
}

export default TaskDetailsModal;

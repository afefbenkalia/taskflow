import { zodResolver } from '@hookform/resolvers/zod';
import axios from 'axios';
import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { apiErrorMessage, type ApiErrorBody } from '../../../api/client';
import { createUser, updateUser } from '../../../api/users';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { email, name } from '../../../lib/validators';
import type { AdminUser, Role } from '../../../types/user';

const JOB_TITLE_MAX_LENGTH = 100;

const userSchema = z.object({
  first_name: name('First name'),
  last_name: name('Last name'),
  email,
  role: z.enum(['admin', 'user']),
  job_title: z
    .string()
    .trim()
    .max(JOB_TITLE_MAX_LENGTH, `Job title must be at most ${JOB_TITLE_MAX_LENGTH} characters.`),
});

type UserFormValues = z.infer<typeof userSchema>;
type FormField = keyof UserFormValues;

const ROLE_OPTIONS = [
  { value: 'user', label: 'Member' },
  { value: 'admin', label: 'Admin' },
];

/** Shows a temporary password once, with a Copy button. */
export function TemporaryPassword({ password }: { password: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-field border border-line bg-[#F9FAFB] p-1.5 pl-3.5">
        <code className="min-w-0 flex-1 select-all truncate font-mono text-[15px] font-medium text-ink">
          {password}
        </code>
        <Button
          size="sm"
          variant="secondary"
          onClick={copy}
          leftIcon={
            copied ? (
              <Check className="h-4 w-4 text-success" strokeWidth={2} aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            )
          }
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <Alert variant="warning">This password is shown only once. Share it securely.</Alert>
    </div>
  );
}

export interface InviteUserModalProps {
  open: boolean;
  /** "edit" reuses the form for First name, Last name, Email and Job title. */
  mode: 'invite' | 'edit';
  user?: AdminUser | null;
  onClose: () => void;
  onSaved: (user: AdminUser, message: string) => void;
}

export function InviteUserModal({ open, mode, user, onClose, onSaved }: InviteUserModalProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [invited, setInvited] = useState<{ user: AdminUser; password: string } | null>(null);
  const isEdit = mode === 'edit';

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({ resolver: zodResolver(userSchema) });

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setInvited(null);
    reset({
      first_name: user?.first_name ?? '',
      last_name: user?.last_name ?? '',
      email: user?.email ?? '',
      role: 'user',
      job_title: user?.job_title ?? '',
    });
  }, [open, user, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (isEdit && user) {
        const updated = await updateUser(user.id, {
          first_name: values.first_name,
          last_name: values.last_name,
          email: values.email,
          job_title: values.job_title || null,
        });
        onSaved(updated, `${updated.full_name}’s details were updated.`);
        onClose();
      } else {
        const result = await createUser({
          first_name: values.first_name,
          last_name: values.last_name,
          email: values.email,
          role: values.role as Role,
        });
        setInvited({ user: result.user, password: result.temporary_password });
        onSaved(result.user, `${result.user.full_name} was invited.`);
      }
    } catch (error) {
      const response = axios.isAxiosError<ApiErrorBody>(error) ? error.response : undefined;
      if (response?.status === 409) {
        setError('email', { message: response.data.detail }, { shouldFocus: true });
        return;
      }
      const fieldErrors = (response?.status === 422 ? response.data.errors ?? [] : []).filter(
        (fieldError) => fieldError.field && fieldError.field in userSchema.shape,
      );
      fieldErrors.forEach(({ field, message }) => setError(field as FormField, { message }));
      if (fieldErrors.length === 0) {
        setFormError(apiErrorMessage(error, 'Something went wrong. Please try again.'));
      }
    }
  });

  if (invited) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Invitation ready"
        description={`Share this temporary password with ${invited.user.full_name}. They can sign in right away.`}
        footer={<Button onClick={onClose}>Done</Button>}
      >
        <TemporaryPassword password={invited.password} />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={isSubmitting}
      title={isEdit ? 'Edit details' : 'Invite user'}
      description={isEdit ? undefined : 'The account is active immediately with a temporary password.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={isSubmitting}>
            {isEdit ? 'Save changes' : 'Send invite'}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert variant="error">{formError}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="First name" autoComplete="off" error={errors.first_name?.message} {...register('first_name')} />
          <Input label="Last name" autoComplete="off" error={errors.last_name?.message} {...register('last_name')} />
        </div>
        <Input label="Email" type="email" autoComplete="off" error={errors.email?.message} {...register('email')} />
        {isEdit ? (
          <Input label="Job title" error={errors.job_title?.message} {...register('job_title')} />
        ) : (
          <Select label="Role" options={ROLE_OPTIONS} error={errors.role?.message} {...register('role')} />
        )}
      </form>
    </Modal>
  );
}

export default InviteUserModal;

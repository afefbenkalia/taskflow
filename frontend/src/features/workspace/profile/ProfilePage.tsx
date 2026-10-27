import { zodResolver } from '@hookform/resolvers/zod';
import axios from 'axios';
import { KeyRound, ShieldCheck, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form';

import { apiErrorMessage, type ApiErrorBody } from '../../../api/client';
import { changePassword, getMe, updateMe, type MeUpdatePayload } from '../../../api/users';
import { Alert, Toast } from '../../../components/ui/Alert';
import { Avatar } from '../../../components/ui/Avatar';
import { Badge, type BadgeTone } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Card';
import { Tabs } from '../../../components/ui/Tabs';
import { useAuth } from '../../../hooks/useAuth';
import { toDate } from '../../../lib/format';
import {
  passwordChangeSchema,
  profileSchema,
  type PasswordChangeValues,
  type ProfileFormValues,
} from '../../../lib/validators';
import type { Me, Role } from '../../../types/user';
import { PasswordForm } from './PasswordForm';
import { ProfileForm } from './ProfileForm';

const MEMBER_SINCE = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const EMPTY_PASSWORD: PasswordChangeValues = { current_password: '', new_password: '', confirm_password: '' };

/** The same page serves members (/app/profile) and admins (/admin/profile). */
const ROLE_LOOK: Record<Role, { badge: string; tone: BadgeTone; icon: LucideIcon; banner: string; visibility: string }> = {
  user: {
    badge: 'Member',
    tone: 'indigo',
    icon: KeyRound,
    banner: 'from-[#4338CA] to-[#A855F7]',
    visibility: 'Visible to members of your projects.',
  },
  admin: {
    badge: 'Admin',
    tone: 'amber',
    icon: ShieldCheck,
    banner: 'from-[#0B1020] via-[#312E81] to-[#4F46E5]',
    visibility: 'Visible to everyone in the workspace.',
  },
};

function profileValues(me: Me): ProfileFormValues {
  return {
    first_name: me.first_name,
    last_name: me.last_name,
    email: me.email,
    phone: me.phone ?? '',
    job_title: me.job_title ?? '',
    timezone: me.timezone,
  };
}

/** Maps API field errors onto a form; returns whether any field matched. */
function applyFieldErrors<T extends FieldValues>(form: UseFormReturn<T>, error: unknown): boolean {
  const body = axios.isAxiosError<ApiErrorBody>(error) ? error.response?.data : undefined;
  const fields = Object.keys(form.getValues());
  const matched = (body?.errors ?? []).filter((item) => item.field && fields.includes(item.field));
  matched.forEach(({ field, message }) => form.setError(field as Path<T>, { message }, { shouldFocus: true }));
  if (axios.isAxiosError<ApiErrorBody>(error) && error.response?.status === 409 && fields.includes('email')) {
    form.setError('email' as Path<T>, { message: error.response.data.detail }, { shouldFocus: true });
    return true;
  }
  return matched.length > 0;
}

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const look = ROLE_LOOK[user?.role ?? 'user'];
  const RoleIcon = look.icon;
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const profileForm = useForm<ProfileFormValues>({ resolver: zodResolver(profileSchema) });
  const passwordForm = useForm<PasswordChangeValues>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: EMPTY_PASSWORD,
  });

  const { reset: resetProfile } = profileForm;
  const { reset: resetPassword } = passwordForm;

  /** Reloads /me; the password form keeps its values and errors unless asked otherwise. */
  const load = useCallback(
    async ({ clearPassword }: { clearPassword: boolean }) => {
      const data = await getMe();
      setMe(data);
      resetProfile(profileValues(data));
      if (clearPassword) resetPassword(EMPTY_PASSWORD);
    },
    [resetProfile, resetPassword],
  );

  useEffect(() => {
    load({ clearPassword: true }).catch((reason) =>
      setError(apiErrorMessage(reason, 'Unable to load your profile.')),
    );
  }, [load]);

  const passwordValues = passwordForm.watch();
  const passwordTouched = Object.values(passwordValues).some((value) => value !== '');
  const profileDirty = profileForm.formState.isDirty;
  const canSave = Boolean(me) && (profileDirty || passwordTouched) && !saving;

  const handleCancel = () => {
    if (!me) return;
    setError(null);
    profileForm.reset(profileValues(me));
    passwordForm.reset(EMPTY_PASSWORD);
  };

  const handleSave = async () => {
    setError(null);
    const profileValid = await profileForm.trigger();
    const passwordValid = passwordTouched ? await passwordForm.trigger() : true;
    if (!profileValid || !passwordValid) return;

    setSaving(true);
    try {
      if (profileDirty) {
        const values = profileForm.getValues();
        const dirty = profileForm.formState.dirtyFields;
        const payload: Partial<MeUpdatePayload> = {};
        (Object.keys(dirty) as (keyof ProfileFormValues)[]).forEach((key) => {
          const value = values[key].trim();
          (payload as Record<string, string | null>)[key] =
            key === 'phone' || key === 'job_title' ? value || null : value;
        });
        try {
          await updateMe(payload);
        } catch (reason) {
          if (!applyFieldErrors(profileForm, reason)) setError(apiErrorMessage(reason, 'Your profile could not be saved.'));
          return;
        }
      }
      if (passwordTouched) {
        try {
          await changePassword(passwordForm.getValues());
        } catch (reason) {
          // Personal information may already be saved: refresh it, keep the password errors.
          await load({ clearPassword: false });
          if (profileDirty) await refreshUser();
          if (!applyFieldErrors(passwordForm, reason)) setError(apiErrorMessage(reason, 'Your password could not be changed.'));
          return;
        }
      }
      await load({ clearPassword: true });
      await refreshUser();
      setToast(passwordTouched ? 'Profile and password updated.' : 'Profile updated.');
    } finally {
      setSaving(false);
    }
  };

  const closeToast = useCallback(() => setToast(null), []);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[20px] border border-line-soft bg-white shadow-card">
        <div className={`h-[124px] bg-gradient-to-r ${look.banner}`} aria-hidden="true" />
        <div className="-mt-11 flex flex-wrap items-end justify-between gap-x-8 gap-y-5 px-6 pb-7 sm:px-10">
          <div className="flex min-w-0 flex-1 flex-wrap items-end gap-x-5 gap-y-3">
            {me ? (
              <Avatar name={me.full_name} size={96} className="border-4 border-white" />
            ) : (
              <Skeleton className="h-24 w-24 rounded-full border-4 border-white" />
            )}
            <div className="min-w-0 ">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="break-words text-2xl font-extrabold tracking-[-0.02em] text-ink">{me?.full_name ?? ' '}</h1>
                <Badge tone={look.tone} icon={<RoleIcon className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />}>
                  {look.badge}
                </Badge>
              </div>
              <p className="mt-0.5 text-sm font-medium text-ink-secondary">
                {me
                  ? `${me.job_title ? `${me.job_title} · ` : ''}Member since ${MEMBER_SINCE.format(toDate(me.created_at))}`
                  : ' '}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-3 pb-2">
            <Button variant="secondary" onClick={handleCancel} disabled={!me || saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!canSave} loading={saving}>
              Save changes
            </Button>
          </div>
        </div>
      </section>

      {/* overflow-y-hidden: the tabs' 1px underline overlap would otherwise show a vertical scrollbar. */}
      <Tabs
        ariaLabel="Profile sections"
        value="general"
        items={[{ value: 'general', label: 'General' }]}
        className="overflow-y-hidden"
      />

      {error && <Alert variant="error">{error}</Alert>}

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) void handleSave();
        }}
        className="space-y-6"
      >
        <ProfileForm form={profileForm} currentTimezone={me?.timezone} description={look.visibility} />
        <PasswordForm form={passwordForm} passwordChangedAt={me?.password_changed_at ?? null} />
        {/* Enter submits like the header's "Save changes". */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
          Save changes
        </button>
      </form>

      <Toast message={toast} onClose={closeToast} />
    </div>
  );
}

export default ProfilePage;

import type { UseFormReturn } from 'react-hook-form';

import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { relativeTime } from '../../../lib/format';
import type { PasswordChangeValues } from '../../../lib/validators';

export interface PasswordFormProps {
  form: UseFormReturn<PasswordChangeValues>;
  passwordChangedAt: string | null;
}

export function PasswordForm({ form, passwordChangedAt }: PasswordFormProps) {
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <Card>
      <h2 className="text-base font-extrabold text-ink">Change password</h2>
      <p className="mt-0.5 text-[13px] font-medium text-ink-secondary">
        {passwordChangedAt ? `Last changed ${relativeTime(passwordChangedAt).toLowerCase()}.` : 'Never changed.'}
      </p>
      <div className="mt-5 grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-3">
        <Input
          label="Current password"
          type="password"
          autoComplete="current-password"
          error={errors.current_password?.message}
          {...register('current_password')}
        />
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          error={errors.new_password?.message}
          {...register('new_password')}
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat new password"
          error={errors.confirm_password?.message}
          {...register('confirm_password')}
        />
      </div>
    </Card>
  );
}

export default PasswordForm;

import { zodResolver } from '@hookform/resolvers/zod';
import axios from 'axios';
import { CheckCircle2, LinkIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { resetPassword } from '../../api/auth';
import { apiErrorCode, apiErrorMessage, type ApiErrorBody } from '../../api/client';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { resetPasswordSchema, type ResetPasswordValues } from '../../lib/validators';
import { PasswordStrengthMeter } from './RegisterPage';

type FieldName = keyof ResetPasswordValues;

function InvalidLink({ message }: { message: string }) {
  return (
    <div className="text-center" role="alert">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-danger-bg">
        <LinkIcon className="h-7 w-7 text-danger" aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-[28px] font-extrabold tracking-tight">Link no longer valid</h1>
      <p className="mt-2 text-[15px] text-ink-secondary">{message}</p>
      <Link
        to="/forgot-password"
        className="mt-8 flex h-12 w-full items-center justify-center rounded-field bg-gradient-btn text-[15px] font-bold text-white shadow-btn hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
      >
        Request a new link
      </Link>
      <p className="mt-8 text-center text-sm text-ink-secondary">
        <Link to="/login" className="font-bold text-primary hover:text-primary-700">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

/** Step 2 of "Forgot password?": the page opened from the emailed link (?token=…). */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [invalidLink, setInvalidLink] = useState<string | null>(
    token ? null : 'This reset link is incomplete. Open the link from the email again, or request a new one.',
  );
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { new_password: '', confirm_password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await resetPassword({ token, ...values });
      setDone(true);
    } catch (error) {
      if (apiErrorCode(error) === 'invalid_reset_token') {
        setInvalidLink(apiErrorMessage(error, 'This reset link is invalid or has expired.'));
        return;
      }
      const fields = axios.isAxiosError<ApiErrorBody>(error) ? (error.response?.data?.errors ?? []) : [];
      const mapped = fields.filter((item) => item.field === 'new_password' || item.field === 'confirm_password');
      mapped.forEach(({ field, message }) => setError(field as FieldName, { message }));
      if (mapped.length === 0) setFormError(apiErrorMessage(error, 'Something went wrong. Please try again.'));
    }
  });

  if (invalidLink) return <InvalidLink message={invalidLink} />;

  if (done) {
    return (
      <div className="text-center" role="status">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#ECFDF3]">
          <CheckCircle2 className="h-7 w-7 text-success" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-[28px] font-extrabold tracking-tight">Password updated</h1>
        <p className="mt-2 text-[15px] text-ink-secondary">
          Your password has been reset and you’ve been signed out everywhere. Sign in with your new password.
        </p>
        <Button size="lg" fullWidth className="mt-8" onClick={() => navigate('/login', { replace: true })}>
          Sign in
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-[32px] font-extrabold leading-tight tracking-tight">Choose a new password</h1>
      <p className="mt-2 text-[15px] text-ink-secondary">
        Use at least 8 characters, with one uppercase letter and one number.
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
        {formError && <Alert variant="error">{formError}</Alert>}
        <div>
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            autoFocus
            error={errors.new_password?.message}
            {...register('new_password')}
          />
          <PasswordStrengthMeter password={watch('new_password')} />
        </div>
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat new password"
          error={errors.confirm_password?.message}
          {...register('confirm_password')}
        />
        <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
          Reset password
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-ink-secondary">
        <Link to="/login" className="font-bold text-primary hover:text-primary-700">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export default ResetPasswordPage;

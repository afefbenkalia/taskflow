import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { forgotPassword } from '../../api/auth';
import { apiErrorMessage } from '../../api/client';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { forgotPasswordSchema, type ForgotPasswordValues } from '../../lib/validators';

function BackToSignIn() {
  return (
    <p className="mt-8 text-center text-sm text-ink-secondary">
      <Link to="/login" className="inline-flex items-center gap-1.5 font-bold text-primary hover:text-primary-700">
        <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        Back to sign in
      </Link>
    </p>
  );
}

/** Step 1 of "Forgot password?": ask for the email and send the reset link. */
export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });

  const send = async (email: string) => {
    setFormError(null);
    try {
      await forgotPassword(email);
      setSentTo(email);
    } catch (error) {
      setFormError(apiErrorMessage(error, 'Something went wrong. Please try again.'));
    }
  };

  const onSubmit = handleSubmit(({ email }) => send(email.trim()));

  if (sentTo) {
    return (
      <div className="text-center" role="status">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#EEF2FF]">
          <MailCheck className="h-7 w-7 text-primary" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-[28px] font-extrabold tracking-tight">Check your email</h1>
        <p className="mt-2 text-[15px] text-ink-secondary">
          If an account exists for <strong className="font-semibold text-ink">{sentTo}</strong>, we’ve sent a link to
          reset the password. The link expires in 30 minutes.
        </p>
        {formError && <Alert variant="error" className="mt-6 text-left">{formError}</Alert>}
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          className="mt-8"
          loading={isSubmitting}
          onClick={() => void send(getValues('email').trim())}
        >
          Resend the link
        </Button>
        <BackToSignIn />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-[32px] font-extrabold leading-tight tracking-tight">Forgot your password?</h1>
      <p className="mt-2 text-[15px] text-ink-secondary">
        Enter the email of your account and we’ll send you a link to choose a new password.
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
        {formError && <Alert variant="error">{formError}</Alert>}
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          autoFocus
          error={errors.email?.message}
          {...register('email')}
        />
        <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
          Send reset link
        </Button>
      </form>

      <BackToSignIn />
    </div>
  );
}

export default ForgotPasswordPage;

import { zodResolver } from '@hookform/resolvers/zod';
import axios from 'axios';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';

import { apiErrorMessage, type ApiErrorBody } from '../../api/client';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../hooks/useAuth';
import {
  PASSWORD_STRENGTH_LABELS,
  passwordStrength,
  registerSchema,
  type RegisterFormValues,
} from '../../lib/validators';

const STRENGTH_STYLES = {
  1: { bar: 'bg-danger', text: 'text-danger' },
  2: { bar: 'bg-[#F79009]', text: 'text-[#B54708]' },
  3: { bar: 'bg-primary', text: 'text-primary' },
  4: { bar: 'bg-success', text: 'text-[#067647]' },
} as const;

/** Also used on the reset-password page. */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const score = passwordStrength(password);
  const style = score ? STRENGTH_STYLES[score] : null;

  return (
    <div className="mt-2 flex items-center gap-3" aria-live="polite">
      <div className="grid flex-1 grid-cols-4 gap-1.5" aria-hidden="true">
        {[1, 2, 3, 4].map((segment) => (
          <span
            key={segment}
            className={`h-1.5 rounded-full transition-colors ${style && segment <= score ? style.bar : 'bg-line-soft'}`}
          />
        ))}
      </div>
      <span className={`w-12 text-right text-xs font-semibold ${style?.text ?? 'text-ink-muted'}`}>
        {score ? PASSWORD_STRENGTH_LABELS[score] : ''}
        {score ? <span className="sr-only"> password</span> : null}
      </span>
    </div>
  );
}

function RegisterSuccess() {
  const navigate = useNavigate();
  return (
    <div className="text-center" role="status">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#ECFDF3]">
        <CheckCircle2 className="h-7 w-7 text-success" aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-[28px] font-extrabold tracking-tight">Account created</h1>
      <p className="mt-2 text-[15px] text-ink-secondary">
        An administrator will review your account. You’ll be able to sign in once it’s approved.
      </p>
      <Button size="lg" fullWidth className="mt-8" onClick={() => navigate('/login')}>
        Back to sign in
      </Button>
    </div>
  );
}

const FORM_FIELDS = ['first_name', 'last_name', 'email', 'password'] as const;
type FormField = (typeof FORM_FIELDS)[number];

function isFormField(field: string | null): field is FormField {
  return FORM_FIELDS.includes(field as FormField);
}

export function RegisterPage() {
  const { register: registerAccount } = useAuth();
  const [created, setCreated] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { first_name: '', last_name: '', email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await registerAccount(values);
      setCreated(true);
    } catch (error) {
      const response = axios.isAxiosError<ApiErrorBody>(error) ? error.response : undefined;
      if (response?.status === 409) {
        setError('email', { message: response.data.detail }, { shouldFocus: true });
        return;
      }
      const fieldErrors = response?.status === 422 ? (response.data.errors ?? []) : [];
      const mapped = fieldErrors.filter((fieldError) => isFormField(fieldError.field));
      mapped.forEach(({ field, message }) => setError(field as FormField, { message }));
      if (mapped.length === 0) {
        setFormError(apiErrorMessage(error, 'Something went wrong. Please try again.'));
      }
    }
  });

  if (created) return <RegisterSuccess />;

  return (
    <div>
      <h1 className="text-[32px] font-extrabold leading-tight tracking-tight">Create your account</h1>
      <p className="mt-2 text-[15px] text-ink-secondary">Join your team in less than a minute.</p>

      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
        {formError && <Alert variant="error">{formError}</Alert>}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-3">
          <Input
            label="First name"
            autoComplete="given-name"
            placeholder="Sarah"
            error={errors.first_name?.message}
            {...register('first_name')}
          />
          <Input
            label="Last name"
            autoComplete="family-name"
            placeholder="Mansour"
            error={errors.last_name?.message}
            {...register('last_name')}
          />
        </div>

        <Input
          label="Work email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          error={errors.email?.message}
          {...register('email')}
        />

        <div>
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            error={errors.password?.message}
            {...register('password')}
          />
          <PasswordStrengthMeter password={watch('password')} />
        </div>

        <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
          Create account
        </Button>

        <Alert variant="warning">
          New accounts start with the Member role. An administrator approves the account and can
          grant admin access.
        </Alert>
      </form>

      <p className="mt-8 text-center text-sm text-ink-secondary">
        Already have an account?{' '}
        <Link to="/login" className="font-bold text-primary hover:text-primary-700">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default RegisterPage;

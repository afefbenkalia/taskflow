import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { apiErrorCode, apiErrorMessage } from '../../api/client';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../hooks/useAuth';
import { loginSchema, type LoginFormValues } from '../../lib/validators';
import type { RedirectState } from '../../routes/RequireAuth';
import { canAccessPath, homePathFor } from '../../routes/RoleRedirect';

const DEFAULT_ERROR = 'Incorrect email or password.';

interface FormAlert {
  variant: 'error' | 'warning';
  message: string;
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formAlert, setFormAlert] = useState<FormAlert | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', remember: false },
  });

  const onSubmit = handleSubmit(async ({ email, password, remember }) => {
    setFormAlert(null);
    try {
      const user = await login(email, password, remember);
      const from = (location.state as RedirectState | null)?.from;
      const target = from && canAccessPath(from, user.role) ? from : homePathFor(user.role);
      navigate(target, { replace: true });
    } catch (error) {
      setFormAlert({
        variant: apiErrorCode(error) === 'account_pending' ? 'warning' : 'error',
        message: apiErrorMessage(error, DEFAULT_ERROR),
      });
    }
  });

  return (
    <div>
      <h1 className="text-[32px] font-extrabold leading-tight tracking-tight">Welcome back</h1>
      <p className="mt-2 text-[15px] text-ink-secondary">Sign in to continue to your workspace.</p>

      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
        {formAlert && <Alert variant={formAlert.variant}>{formAlert.message}</Alert>}

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          error={errors.password?.message}
          {...register('password')}
        />

        <div className="flex items-center justify-between gap-3">
          <Checkbox label="Remember for 30 days" {...register('remember')} />
          <Link to="/forgot-password" className="text-[13px] font-bold text-primary hover:text-primary-700">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
          Sign in
        </Button>

        <Alert variant="info">
          You’ll be redirected automatically: administrators to the Admin console, members to their
          workspace.
        </Alert>
      </form>

      <p className="mt-8 text-center text-sm text-ink-secondary">
        Don’t have an account?{' '}
        <Link to="/register" className="font-bold text-primary hover:text-primary-700">
          Sign up
        </Link>
      </p>
    </div>
  );
}

export default LoginPage;

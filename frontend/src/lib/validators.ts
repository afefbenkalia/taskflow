import { z } from 'zod';

// Rules and messages mirror backend/app/schemas/auth.py.
export const NAME_MAX_LENGTH = 50;
export const PASSWORD_MIN_LENGTH = 8;

export const email = z
  .string()
  .trim()
  .min(1, 'Email is required.')
  .email('Enter a valid email address.');

export const name = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(NAME_MAX_LENGTH, `${label} must be at most ${NAME_MAX_LENGTH} characters.`);

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
  .regex(/\d/, 'Password must contain at least one number.');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required.'),
  remember: z.boolean(),
});

export const registerSchema = z.object({
  first_name: name('First name'),
  last_name: name('Last name'),
  email,
  password: passwordSchema,
});

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;

export type PasswordStrength = 0 | 1 | 2 | 3 | 4;

export const PASSWORD_STRENGTH_LABELS: Record<Exclude<PasswordStrength, 0>, string> = {
  1: 'Weak',
  2: 'Fair',
  3: 'Good',
  4: 'Strong',
};

/** 0 = empty, 1 = Weak, 2 = Fair, 3 = Good, 4 = Strong. */
export function passwordStrength(password: string): PasswordStrength {
  if (!password) return 0;
  const checks = [
    password.length >= PASSWORD_MIN_LENGTH,
    /[A-Z]/.test(password) && /[a-z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password) || password.length >= 12,
  ];
  const score = checks.filter(Boolean).length;
  return Math.max(1, score) as PasswordStrength;
}

// --- member workspace ----------------------------------------------------------------
// Mirrors backend/app/schemas/task.py and the /me schemas in backend/app/schemas/user.py.

export const TASK_TITLE_MAX_LENGTH = 200;
export const TASK_DESCRIPTION_MAX_LENGTH = 500;

export const taskFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required.')
    .max(TASK_TITLE_MAX_LENGTH, `Title must be at most ${TASK_TITLE_MAX_LENGTH} characters.`),
  description: z
    .string()
    .max(TASK_DESCRIPTION_MAX_LENGTH, `Description must be at most ${TASK_DESCRIPTION_MAX_LENGTH} characters.`),
  project_id: z.string().min(1, 'Choose a project.'),
  assignee_id: z.string(),
  priority: z.enum(['low', 'medium', 'high']),
  due_date: z.string(),
  status: z.enum(['todo', 'in_progress', 'done']),
});

export type TaskFormValues = z.infer<typeof taskFormSchema>;

const PHONE_PATTERN = /^[+0-9 ().-]{6,30}$/;

export const profileSchema = z.object({
  first_name: name('First name'),
  last_name: name('Last name'),
  email,
  phone: z
    .string()
    .trim()
    .refine((value) => value === '' || PHONE_PATTERN.test(value), 'Enter a valid phone number.'),
  job_title: z.string().trim().max(100, 'Job title must be at most 100 characters.'),
  timezone: z.string().min(1, 'Choose a time zone.'),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;

/** All three fields empty means "keep the current password". */
export const passwordChangeSchema = z
  .object({
    current_password: z.string(),
    new_password: z.string(),
    confirm_password: z.string(),
  })
  .superRefine((values, context) => {
    const touched = Object.values(values).some((value) => value !== '');
    if (!touched) return;
    const issue = (path: keyof typeof values, message: string) =>
      context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    if (!values.current_password) issue('current_password', 'Current password is required.');
    if (values.new_password.length < PASSWORD_MIN_LENGTH) {
      issue('new_password', `Must be at least ${PASSWORD_MIN_LENGTH} characters.`);
    } else if (!/[A-Z]/.test(values.new_password)) {
      issue('new_password', 'Must include at least one uppercase letter.');
    } else if (!/\d/.test(values.new_password)) {
      issue('new_password', 'Must include at least one number.');
    }
    if (values.confirm_password !== values.new_password) {
      issue('confirm_password', 'Passwords don’t match.');
    }
  });

export type PasswordChangeValues = z.infer<typeof passwordChangeSchema>;

// --- forgot password (mirrors ForgotPasswordRequest / ResetPasswordRequest) ------------

export const forgotPasswordSchema = z.object({ email });

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    new_password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Must be at least ${PASSWORD_MIN_LENGTH} characters.`)
      .regex(/[A-Z]/, 'Must include at least one uppercase letter.')
      .regex(/\d/, 'Must include at least one number.'),
    confirm_password: z.string(),
  })
  .refine((values) => values.confirm_password === values.new_password, {
    path: ['confirm_password'],
    message: 'Passwords don’t match.',
  });

export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

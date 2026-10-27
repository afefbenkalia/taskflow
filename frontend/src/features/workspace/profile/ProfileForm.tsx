import type { UseFormReturn } from 'react-hook-form';

import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Select, type SelectOption } from '../../../components/ui/Select';
import type { ProfileFormValues } from '../../../lib/validators';

let cachedTimezones: SelectOption[] | null = null;

function offsetLabel(timeZone: string, now: Date): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(now)
      .find((item) => item.type === 'timeZoneName');
    return part?.value ?? '';
  } catch {
    return '';
  }
}

/** "Africa/Tunis (GMT+1)" for every IANA zone the browser knows. */
export function timezoneOptions(current?: string): SelectOption[] {
  if (!cachedTimezones) {
    const now = new Date();
    const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
    cachedTimezones = zones.map((zone) => {
      const offset = offsetLabel(zone, now);
      return { value: zone, label: offset ? `${zone} (${offset})` : zone };
    });
  }
  if (current && !cachedTimezones.some((option) => option.value === current)) {
    return [{ value: current, label: current }, ...cachedTimezones];
  }
  return cachedTimezones;
}

export interface ProfileFormProps {
  form: UseFormReturn<ProfileFormValues>;
  currentTimezone?: string;
  /** Who can see these details. */
  description?: string;
}

export function ProfileForm({
  form,
  currentTimezone,
  description = 'Visible to members of your projects.',
}: ProfileFormProps) {
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <Card>
      <h2 className="text-base font-extrabold text-ink">Personal information</h2>
      <p className="mt-0.5 text-[13px] font-medium text-ink-secondary">{description}</p>
      <div className="mt-5 grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
        <Input label="First name" autoComplete="given-name" error={errors.first_name?.message} {...register('first_name')} />
        <Input label="Last name" autoComplete="family-name" error={errors.last_name?.message} {...register('last_name')} />
        <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <Input label="Phone" type="tel" autoComplete="tel" error={errors.phone?.message} {...register('phone')} />
        <Input label="Job title" autoComplete="organization-title" error={errors.job_title?.message} {...register('job_title')} />
        <Select
          label="Time zone"
          options={timezoneOptions(currentTimezone)}
          error={errors.timezone?.message}
          {...register('timezone')}
        />
      </div>
    </Card>
  );
}

export default ProfileForm;

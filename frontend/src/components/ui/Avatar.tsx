import { initials } from '../../lib/format';

export interface AvatarColors {
  bg: string;
  fg: string;
}

export const AVATAR_PALETTE: AvatarColors[] = [
  { bg: '#E0E7FF', fg: '#4338CA' },
  { bg: '#CCFBF1', fg: '#0F766E' },
  { bg: '#FEF0C7', fg: '#B54708' },
  { bg: '#FCE7F6', fg: '#C11574' },
  { bg: '#D1E9FF', fg: '#175CD3' },
  { bg: '#EBE9FE', fg: '#5925DC' },
  { bg: '#F2F4F7', fg: '#475467' },
];

/** Stable pastel colors derived from the name. */
export function avatarColors(name: string): AvatarColors {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]!;
}

export interface AvatarProps {
  name: string;
  size?: number;
  colors?: AvatarColors;
  className?: string;
}

export function Avatar({ name, size = 36, colors, className = '' }: AvatarProps) {
  const { bg, fg } = colors ?? avatarColors(name);
  return (
    <span
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: bg,
        color: fg,
        fontSize: Math.max(10, Math.round(size * 0.36)),
      }}
      title={name}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

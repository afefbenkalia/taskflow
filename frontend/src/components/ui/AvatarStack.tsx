import { Avatar } from './Avatar';

export interface AvatarStackProps {
  names: string[];
  size?: number;
  max?: number;
}

export function AvatarStack({ names, size = 26, max = 3 }: AvatarStackProps) {
  const shown = names.slice(0, max);
  const hidden = names.length - shown.length;

  return (
    <div className="flex items-center" aria-label={names.join(', ')} role="img">
      {shown.map((name, index) => (
        <Avatar
          key={`${name}-${index}`}
          name={name}
          size={size}
          className={`ring-2 ring-white ${index > 0 ? '-ml-2' : ''}`}
        />
      ))}
      {hidden > 0 && (
        <span
          className="-ml-2 inline-flex items-center justify-center rounded-full bg-[#F2F4F7] font-semibold text-[#475467] ring-2 ring-white"
          style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}
          aria-hidden="true"
        >
          +{hidden}
        </span>
      )}
    </div>
  );
}

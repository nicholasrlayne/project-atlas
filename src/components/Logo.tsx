import { clsx } from '@/lib/clsx';

interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 64, className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 160 160"
      width={size}
      height={size}
      className={clsx('shrink-0', className)}
      aria-label="ServiceShadow"
    >
      <polygon points="86,44 116,61 116,95 86,112 56,95 56,61" fill="var(--shadow)" opacity="0.6" transform="translate(10,8)" />
      <polygon points="76,34 106,51 106,85 76,102 46,85 46,51" fill="var(--amber)" />
      <path d="M30.295 8.475l-6.571 6.571-5.617-1.495-1.494-5.617 6.571-6.571c-3.298-0.851-6.953-0.005-9.534 2.577-2.737 2.737-3.544 6.678-2.422 10.126l-10.165 10.165v6.487h6.268l10.28-10.28c3.443 1.114 7.376 0.305 10.108-2.428 2.584-2.584 3.433-6.233 2.577-9.534z" fill="var(--ink)" transform="translate(50,42) scale(1.5)" />
    </svg>
  );
}

export function LogoLockup({ size = 56, className }: LogoProps) {
  return (
    <div className={clsx('flex items-center', className)} style={{ gap: size * 0.3 }}>
      <Logo size={size} />
      <span className="font-head font-extrabold text-chalk" style={{ fontSize: size * 0.32 }}>
        ServiceShadow
      </span>
    </div>
  );
}

export function NavIcon({ size = 15, className, active = false }: LogoProps & { active?: boolean }) {
  return (
    <svg
      viewBox="0 0 160 160"
      width={size}
      height={Math.round(size * (17 / 15))}
      className={clsx('shrink-0', className)}
      aria-hidden
    >
      <polygon points="86,44 116,61 116,95 86,112 56,95 56,61" fill="var(--shadow)" opacity={active ? 0.6 : 0.3} transform="translate(10,8)" />
      <polygon points="76,34 106,51 106,85 76,102 46,85 46,51" fill="currentColor" />
    </svg>
  );
}

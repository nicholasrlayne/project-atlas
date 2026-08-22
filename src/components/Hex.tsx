import { clsx } from '@/lib/clsx';

const HEX_CLIP = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';

type Variant = 'lg' | 'md' | 'sm' | 'tag' | 'tag-dusk' | 'avatar' | 'avatar-sm' | 'avatar-pin' | 'nav' | 'nav-active' | 'cta';

interface VariantStyle {
  size: string;
  borderBg: string;
  fillInset: string;
  fillBg: string;
  fillImg: string;
  fillSize: string;
  labelClass: string;
}

const VARIANT_STYLES: Record<Variant, VariantStyle> = {
  lg: {
    size: 'w-[150px] h-[150px]',
    borderBg: 'bg-amber',
    fillInset: 'inset-[2.5px]',
    fillBg: 'bg-amber',
    fillImg: 'linear-gradient(127deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.08) 24%, rgba(255,255,255,0) 46%, rgba(0,0,0,0.1) 78%, rgba(0,0,0,0.2) 100%), radial-gradient(rgba(0,0,0,0.12) 1px, transparent 1px)',
    fillSize: '100% 100%, 5px 5px',
    labelClass: 'font-head font-extrabold text-[18px] text-amber-ink leading-[1.15] text-center',
  },
  md: {
    size: 'w-[76px] h-[76px]',
    borderBg: 'bg-border-strong',
    fillInset: 'inset-[1.5px]',
    fillBg: 'bg-cell-2',
    fillImg: 'linear-gradient(127deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 40%, rgba(0,0,0,0.14) 100%), radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
    fillSize: '100% 100%, 5px 5px',
    labelClass: 'font-head font-bold text-[11px] text-chalk text-center',
  },
  sm: {
    size: 'w-[40px] h-[40px]',
    borderBg: 'bg-border-strong',
    fillInset: 'inset-[1.5px]',
    fillBg: 'bg-cell-2',
    fillImg: 'linear-gradient(127deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 45%, rgba(0,0,0,0.14) 100%)',
    fillSize: '100% 100%',
    labelClass: 'font-head font-bold text-[9px] text-chalk',
  },
  tag: {
    size: 'w-[22px] h-[22px]',
    borderBg: 'bg-amber',
    fillInset: 'inset-[2px]',
    fillBg: 'bg-amber-dim',
    fillImg: 'linear-gradient(127deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.12) 100%)',
    fillSize: '100% 100%',
    labelClass: '',
  },
  'tag-dusk': {
    size: 'w-[22px] h-[22px]',
    borderBg: 'bg-dusk',
    fillInset: 'inset-[2px]',
    fillBg: 'bg-dusk-dim',
    fillImg: 'linear-gradient(127deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.12) 100%)',
    fillSize: '100% 100%',
    labelClass: '',
  },
  avatar: {
    size: 'w-[52px] h-[52px]',
    borderBg: 'bg-amber',
    fillInset: 'inset-[2.5px]',
    fillBg: 'bg-amber',
    fillImg: 'linear-gradient(127deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.08) 26%, rgba(255,255,255,0) 48%, rgba(0,0,0,0.1) 80%, rgba(0,0,0,0.2) 100%), radial-gradient(rgba(0,0,0,0.12) 1px, transparent 1px)',
    fillSize: '100% 100%, 5px 5px',
    labelClass: 'font-head font-extrabold text-[15px] text-amber-ink',
  },
  'avatar-sm': {
    size: 'w-[40px] h-[40px]',
    borderBg: 'bg-amber',
    fillInset: 'inset-[2px]',
    fillBg: 'bg-amber',
    fillImg: 'linear-gradient(127deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.08) 26%, rgba(255,255,255,0) 48%, rgba(0,0,0,0.1) 80%, rgba(0,0,0,0.2) 100%), radial-gradient(rgba(0,0,0,0.12) 1px, transparent 1px)',
    fillSize: '100% 100%, 5px 5px',
    labelClass: 'font-head font-extrabold text-[12px] text-amber-ink',
  },
  'avatar-pin': {
    size: 'w-[40px] h-[40px]',
    borderBg: 'bg-dusk',
    fillInset: 'inset-[2px]',
    fillBg: 'bg-dusk-dim',
    fillImg: 'linear-gradient(127deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.12) 100%)',
    fillSize: '100% 100%',
    labelClass: 'text-[14px] text-dusk',
  },
  nav: {
    size: 'w-[34px] h-[34px]',
    borderBg: 'bg-border-strong',
    fillInset: 'inset-[1.5px]',
    fillBg: 'bg-transparent',
    fillImg: 'none',
    fillSize: '100% 100%',
    labelClass: '',
  },
  'nav-active': {
    size: 'w-[34px] h-[34px]',
    borderBg: 'bg-amber',
    fillInset: 'inset-[1.5px]',
    fillBg: 'bg-amber-dim',
    fillImg: 'linear-gradient(127deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.12) 100%)',
    fillSize: '100% 100%',
    labelClass: '',
  },
  cta: {
    size: '',
    borderBg: 'bg-amber',
    fillInset: 'inset-[3px]',
    fillBg: 'bg-amber',
    fillImg: 'linear-gradient(155deg, #F2C066 0%, #E8A33D 50%, #B8791E 100%)',
    fillSize: '100% 100%',
    labelClass: '',
  },
};

interface HexProps {
  variant?: Variant;
  className?: string;
  children?: React.ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
}

export function Hex({ variant = 'md', className, children, onClick, title, disabled }: HexProps) {
  const isButton = typeof onClick === 'function';
  const Comp = isButton ? 'button' : 'div';
  const vs = VARIANT_STYLES[variant];

  return (
    <Comp
      onClick={onClick}
      disabled={isButton ? disabled : undefined}
      title={title}
      className={clsx(
        'relative shrink-0',
        vs.size,
        isButton && 'cursor-pointer outline-none transition-all active:scale-95',
        className,
      )}
    >
      <div
        className={clsx('absolute inset-0', vs.borderBg)}
        style={{ clipPath: HEX_CLIP }}
      />
      <div
        className={clsx('absolute flex items-center justify-center', vs.fillInset, vs.fillBg)}
        style={{
          clipPath: HEX_CLIP,
          backgroundImage: vs.fillImg,
          backgroundSize: vs.fillSize,
        }}
      >
        {children}
      </div>
    </Comp>
  );
}

export { HEX_CLIP };

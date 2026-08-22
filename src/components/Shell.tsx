import { clsx } from '@/lib/clsx';
import { Hex } from '@/components/Hex';
import { NavIcon } from '@/components/Logo';
import { HomeGlyph, CustomersGlyph, TasksGlyph } from '@/components/NavIcons';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-ink">
      {children}
    </div>
  );
}

export type NavTab = 'home' | 'customers' | 'tasks' | 'ask';

const NAV_LABELS: Record<NavTab, string> = { home: 'Home', customers: 'Customers', tasks: 'Tasks', ask: 'Ask' };

export function NavBar({ active, onChange }: { active: NavTab; onChange: (t: NavTab) => void }) {
  const tabs: NavTab[] = ['home', 'customers', 'tasks', 'ask'];
  return (
    <div className="mt-auto flex items-center justify-around border-t border-border px-0 pt-3.5 pb-5">
      {tabs.map((t) => {
        const isActive = active === t;
        const iconClass = isActive ? 'text-amber' : 'text-mist';
        return (
          <div key={t} className="flex flex-col items-center gap-1">
            <Hex
              variant={isActive ? 'nav-active' : 'nav'}
              onClick={() => onChange(t)}
              title={NAV_LABELS[t]}
            >
              {t === 'home' && <HomeGlyph size={16} className={iconClass} />}
              {t === 'customers' && <CustomersGlyph size={16} className={iconClass} />}
              {t === 'tasks' && <TasksGlyph size={16} className={iconClass} />}
              {t === 'ask' && <NavIcon size={15} active={isActive} className={iconClass} />}
            </Hex>
            <span className={clsx('text-[10px]', isActive ? 'text-amber' : 'text-mist')}>
              {NAV_LABELS[t]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
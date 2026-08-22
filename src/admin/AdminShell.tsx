import { LogoLockup } from '@/components/Logo';
import { LayoutDashboard, Users, LogOut } from 'lucide-react';

export type AdminTab = 'overview' | 'users';

interface AdminShellProps {
  active: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  onSignOut: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS: { id: AdminTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'users', label: 'Users', icon: Users },
];

export function AdminShell({ active, onTabChange, onSignOut, children }: AdminShellProps) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-ink">
      {/* Sidebar */}
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-border bg-cell">
        <div className="px-5 py-6">
          <LogoLockup size={40} />
        </div>

        <div className="px-3">
          <span className="px-2 text-[10px] font-medium uppercase tracking-[0.08em] text-mist-dim">
            Admin
          </span>
        </div>

        <nav className="mt-2 flex-1 px-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`mb-1 flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium transition-colors ${
                  isActive
                    ? 'bg-amber-dim text-amber'
                    : 'text-mist hover:bg-cell-2 hover:text-chalk'
                }`}
              >
                <Icon size={17} className={isActive ? 'text-amber' : 'text-mist-dim'} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-border px-3 py-4">
          <button
            onClick={onSignOut}
            className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium text-mist transition-colors hover:bg-cell-2 hover:text-chalk"
          >
            <LogOut size={17} className="text-mist-dim" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

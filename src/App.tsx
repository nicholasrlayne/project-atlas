import { useState } from 'react';
import { AppShell, NavBar, type NavTab } from '@/components/Shell';
import { Home } from '@/screens/Home';
import { ActiveVisit } from '@/screens/ActiveVisit';
import { VisitSummary } from '@/screens/VisitSummary';
import { CustomersList } from '@/screens/CustomersList';
import { Tasks } from '@/screens/Tasks';
import { CustomerDetail } from '@/screens/CustomerDetail';
import { AskAtlas } from '@/screens/AskAtlas';
import { Stats } from '@/screens/Stats';
import { OutstandingBilling } from '@/screens/OutstandingBilling';
import { Onboarding } from '@/screens/Onboarding';
import { Walkthrough } from '@/screens/Walkthrough';
import { Settings } from '@/screens/Settings';
import { useAuth, type Profile } from '@/lib/useAuth';
import { startVisit } from '@/lib/api';
import { AdminApp } from '@/admin/AdminApp';

type Route =
  | { name: 'home' }
  | { name: 'active'; visitId: string }
  | { name: 'summary'; visitId: string }
  | { name: 'summary-readonly'; visitId: string }
  | { name: 'customers' }
  | { name: 'tasks'; initialStatus?: 'open' | 'done' }
  | { name: 'customer-detail'; scope: { kind: 'customer'; customerId: string } | { kind: 'property'; propertyId: string } }
  | { name: 'ask-atlas'; scopeCustomerId?: string; scopeCustomerName?: string }
  | { name: 'stats' }
  | { name: 'outstanding-billing' }
  | { name: 'settings' };

export default function App() {
  const isAdminSubdomain =
    typeof window !== 'undefined' &&
    window.location.hostname.startsWith('admin.');

  if (isAdminSubdomain) {
    return <AdminApp />;
  }

  const { state, signOut, updateEmail, updateAutoEmailSummary, markWalkthroughSeen } = useAuth();
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [nav, setNav] = useState<NavTab>('home');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  function handleSignOut() {
    setRoute({ name: 'home' });
    setNav('home');
    setStartError(null);
    setStarting(false);
    signOut();
  }

  async function handleStartVisit() {
    setStarting(true);
    setStartError(null);
    try {
      const v = await startVisit({});
      setRoute({ name: 'active', visitId: v.id });
    } catch (e) {
      setStartError(e instanceof Error ? e.message : 'Could not start visit');
    } finally {
      setStarting(false);
    }
  }

  function handleNav(tab: NavTab) {
    setNav(tab);
    if (tab === 'home') setRoute({ name: 'home' });
    if (tab === 'customers') setRoute({ name: 'customers' });
    if (tab === 'tasks') setRoute({ name: 'tasks' });
    if (tab === 'ask') setRoute({ name: 'ask-atlas' });
  }

  if (state.status === 'loading') {
    return (
      <AppShell>
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-amber" />
        </div>
      </AppShell>
    );
  }

  if (state.status === 'unauthenticated') {
    return (
      <AppShell>
        <Onboarding
          user={null as never}
          loginEmail=""
          onComplete={() => {}}
        />
      </AppShell>
    );
  }

  if (state.status === 'needsOnboarding') {
    return (
      <AppShell>
        <Onboarding
          user={state.user}
          loginEmail={state.user.email ?? ''}
          onComplete={() => {
            window.location.reload();
          }}
        />
      </AppShell>
    );
  }

  const profile = state.profile;

  if (profile && !profile.has_seen_walkthrough) {
    return (
      <AppShell>
        <Walkthrough onComplete={markWalkthroughSeen} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      {route.name === 'home' && (
        <Home
          onStartVisit={handleStartVisit}
          onOpenStats={() => setRoute({ name: 'stats' })}
          onOpenVisit={(visitId) => setRoute({ name: 'summary-readonly', visitId })}
          onOpenSettings={() => setRoute({ name: 'settings' })}
          onOpenOutstandingBilling={() => setRoute({ name: 'outstanding-billing' })}
          userName={profile?.full_name ?? 'there'}
        />
      )}

      {route.name === 'settings' && (
        <Settings
          onBack={() => setRoute({ name: 'home' })}
          onSignOut={handleSignOut}
          userEmail={state.user.email ?? ''}
          onUpdateEmail={updateEmail}
          autoEmailSummary={profile?.auto_email_summary ?? false}
          onUpdateAutoEmailSummary={updateAutoEmailSummary}
        />
      )}

      {route.name === 'active' && (
        <ActiveVisit
          visitId={route.visitId}
          onBack={() => setRoute({ name: 'home' })}
          onSummary={() => setRoute({ name: 'summary', visitId: route.visitId })}
        />
      )}

      {route.name === 'summary' && (
        <VisitSummary
          visitId={route.visitId}
          onBack={() => setRoute({ name: 'active', visitId: route.visitId })}
          autoEmailSummary={profile?.auto_email_summary ?? false}
          onSaved={() => {
            setRoute({ name: 'home' });
            setNav('home');
          }}
          onOpenCustomer={(customerId) =>
            setRoute({ name: 'customer-detail', scope: { kind: 'customer', customerId } })
          }
        />
      )}

      {route.name === 'summary-readonly' && (
        <VisitSummary
          visitId={route.visitId}
          readOnly
          onBack={() => {
            setRoute({ name: 'customers' });
            setNav('customers');
          }}
          onSaved={() => {
            setRoute({ name: 'home' });
            setNav('home');
          }}
          onOpenCustomer={(customerId) =>
            setRoute({ name: 'customer-detail', scope: { kind: 'customer', customerId } })
          }
        />
      )}

      {route.name === 'tasks' && (
        <Tasks
          initialStatus={route.initialStatus}
          onOpenVisit={(visitId) => setRoute({ name: 'summary-readonly', visitId })}
        />
      )}

      {route.name === 'stats' && (
        <Stats
          onBack={() => setRoute({ name: 'home' })}
          onOverdueTasks={() => { setNav('tasks'); setRoute({ name: 'tasks', initialStatus: 'open' }); }}
        />
      )}

      {route.name === 'outstanding-billing' && (
        <OutstandingBilling
          onBack={() => setRoute({ name: 'home' })}
          onOpenVisit={(visitId) => setRoute({ name: 'summary-readonly', visitId })}
        />
      )}

      {route.name === 'customers' && (
        <CustomersList
          onOpenCustomer={(customerId) =>
            setRoute({ name: 'customer-detail', scope: { kind: 'customer', customerId } })
          }
          onOpenProperty={(propertyId) =>
            setRoute({ name: 'customer-detail', scope: { kind: 'property', propertyId } })
          }
          onStartVisit={handleStartVisit}
        />
      )}

      {route.name === 'customer-detail' && (
        <CustomerDetail
          scope={route.scope}
          onBack={() => setRoute({ name: 'customers' })}
          onOpenVisit={(visitId) => setRoute({ name: 'summary-readonly', visitId })}
          onOpenCustomer={(customerId) =>
            setRoute({ name: 'customer-detail', scope: { kind: 'customer', customerId } })
          }
          onAskCustomer={(customerId, customerName) =>
            setRoute({ name: 'ask-atlas', scopeCustomerId: customerId, scopeCustomerName: customerName })
          }
        />
      )}

      {route.name === 'ask-atlas' && (
        <AskAtlas
          scopeCustomerId={route.scopeCustomerId}
          scopeCustomerName={route.scopeCustomerName}
          onBack={() => {
            if (route.scopeCustomerId) setRoute({ name: 'customers' });
            else { setNav('home'); setRoute({ name: 'home' }); }
          }}
          onOpenVisit={(visitId) => setRoute({ name: 'summary-readonly', visitId })}
        />
      )}

      {(route.name === 'home' || route.name === 'customers' || route.name === 'tasks') && <NavBar active={nav} onChange={handleNav} />}

      {(route.name === 'ask-atlas' && !route.scopeCustomerId) && <NavBar active={nav} onChange={handleNav} />}

      {startError && route.name === 'home' && (
        <div className="px-[18px] pb-3 text-[12px] text-coral">{startError}</div>
      )}

      {starting && route.name === 'home' && (
        <div className="px-[18px] pb-3 text-[12px] text-mist">Starting visit…</div>
      )}
    </AppShell>
  );
}

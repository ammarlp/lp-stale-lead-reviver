import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, ListChecks, LogOut, Settings as SettingsIcon, Zap } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/queue', label: 'Approval Queue', icon: ListChecks },
  { to: '/rules', label: 'Rules', icon: Zap },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 flex-col border-r bg-muted/30 p-4">
        <div className="mb-6">
          <div className="text-xl font-extrabold leading-tight text-primary">Launchpad Innovations</div>
          <div className="text-xs font-medium text-muted-foreground">Stale Lead Reviver</div>
        </div>
        <nav className="space-y-1">
          {navItems.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent',
                  isActive && 'bg-primary text-primary-foreground font-medium hover:bg-primary/90'
                )
              }
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-2 pt-4">
          {user?.email && (
            <div className="truncate px-3 text-xs text-muted-foreground" title={user.email}>
              {user.email}
            </div>
          )}
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}

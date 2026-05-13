import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LayoutDashboard, ListChecks, Settings as SettingsIcon, Zap } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/queue', label: 'Approval Queue', icon: ListChecks },
  { to: '/rules', label: 'Rules', icon: Zap },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function Layout() {
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r bg-muted/30 p-4">
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
      </aside>
      <main className="flex-1 p-6 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

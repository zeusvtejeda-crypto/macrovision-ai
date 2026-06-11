'use client';

import { useSession } from 'next-auth/react';
import { Bell, Search } from 'lucide-react';
import { usePathname } from 'next/navigation';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/users': 'Usuarios',
  '/analyses': 'Análisis IA',
  '/subscriptions': 'Suscripciones',
  '/health': 'Estado del sistema',
  '/settings': 'Configuración',
};

export function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const title = Object.entries(PAGE_TITLES).find(([key]) => pathname.startsWith(key))?.[1] ?? 'Admin';

  return (
    <header className="h-16 flex items-center justify-between px-6 border-b bg-card/50 backdrop-blur-sm flex-shrink-0">
      <div>
        <h1 className="text-base font-semibold text-foreground">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar..."
            className="pl-9 pr-3 py-1.5 text-sm rounded-lg border bg-background w-56 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Notifications */}
        <button className="relative p-2 rounded-lg hover:bg-accent transition-colors">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-destructive" />
        </button>

        {/* Avatar */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm">
            {session?.user?.name?.charAt(0).toUpperCase() ?? 'A'}
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-medium leading-tight">{session?.user?.name ?? 'Admin'}</p>
            <p className="text-xs text-muted-foreground">{(session?.user as any)?.role ?? 'ADMIN'}</p>
          </div>
        </div>
      </div>
    </header>
  );
}

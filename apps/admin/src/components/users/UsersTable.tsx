import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { adminApi } from '@/lib/api';
import { formatDate, formatRelative } from '@/lib/utils';
import { UserActions } from './UserActions';
import { Pagination } from '@/components/ui/Pagination';
import { ShieldCheck, Crown, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  SUPER_ADMIN: { label: 'Super Admin', color: 'bg-purple-500/15 text-purple-500', icon: ShieldCheck },
  ADMIN: { label: 'Admin', color: 'bg-blue-500/15 text-blue-500', icon: ShieldCheck },
  PREMIUM: { label: 'Premium', color: 'bg-amber-500/15 text-amber-500', icon: Crown },
  USER: { label: 'Usuario', color: 'bg-muted text-muted-foreground', icon: User },
};

const SUB_CONFIG: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Activo', color: 'bg-primary/15 text-primary' },
  TRIAL: { label: 'Trial', color: 'bg-blue-500/15 text-blue-500' },
  FREE: { label: 'Free', color: 'bg-muted text-muted-foreground' },
  EXPIRED: { label: 'Expirado', color: 'bg-destructive/15 text-destructive' },
  CANCELED: { label: 'Cancelado', color: 'bg-orange-500/15 text-orange-500' },
};

interface Props {
  page: number;
  query: string;
  role: string;
  subscription: string;
}

export async function UsersTable({ page, query, role, subscription }: Props) {
  const session = await getServerSession(authOptions);

  const data = await adminApi
    .getUsers(session?.accessToken as string, {
      page,
      limit: 20,
      ...(query && { q: query }),
      ...(role && { role }),
      ...(subscription && { subscription }),
    })
    .catch(() => ({ items: [], total: 0, totalPages: 1 }));

  const users = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Usuario</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Rol</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Suscripción</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Registro</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-muted-foreground">
                  No se encontraron usuarios
                </td>
              </tr>
            ) : (
              users.map((user: any) => {
                const roleCfg = ROLE_CONFIG[user.role] ?? ROLE_CONFIG.USER;
                const RoleIcon = roleCfg.icon;
                const subCfg = SUB_CONFIG[user.subscriptionStatus] ?? SUB_CONFIG.FREE;

                return (
                  <tr key={user.id} className="hover:bg-muted/20 transition-colors">
                    {/* User */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
                          {user.name?.charAt(0).toUpperCase() ?? '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{user.name ?? '—'}</p>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium', roleCfg.color)}>
                        <RoleIcon className="w-3 h-3" />
                        {roleCfg.label}
                      </span>
                    </td>

                    {/* Subscription */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className={cn('inline-flex items-center px-2 py-1 rounded-full text-xs font-medium', subCfg.color)}>
                        {subCfg.label}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-muted-foreground text-xs">
                        {formatDate(user.createdAt)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <UserActions user={user} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination currentPage={page} totalPages={totalPages} total={data?.total ?? 0} pageSize={20} />
    </div>
  );
}

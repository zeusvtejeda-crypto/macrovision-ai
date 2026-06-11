'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Users } from 'lucide-react';
import { createApiClient } from '@/lib/api';
import { formatDate } from '@/lib/utils';

export function UserGrowthChart() {
  const { data: session } = useSession();

  const { data, isLoading } = useQuery({
    queryKey: ['user-growth'],
    queryFn: async () => {
      const client = createApiClient(session?.accessToken as string);
      const res = await client.get('/admin/user-growth', { params: { days: 30 } });
      return res.data.data as Array<{ date: string; total: number; new: number }>;
    },
    enabled: !!session?.accessToken,
    staleTime: 5 * 60_000,
  });

  const chartData = data?.map((d) => ({
    ...d,
    dateLabel: formatDate(d.date, 'dd MMM'),
  })) ?? [];

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 mb-6">
        <div className="p-2 rounded-lg bg-blue-500/10">
          <Users className="w-4 h-4 text-blue-500" />
        </div>
        <div>
          <h3 className="font-semibold text-sm">Crecimiento de usuarios</h3>
          <p className="text-xs text-muted-foreground">Últimos 30 días</p>
        </div>
      </div>

      {isLoading ? (
        <div className="h-48 bg-muted/30 rounded-lg animate-pulse" />
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="dateLabel"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              interval={6}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
            />
            <Area
              type="monotone"
              dataKey="total"
              name="Total usuarios"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#colorUsers)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { DollarSign } from 'lucide-react';
import { createApiClient } from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/utils';

export function RevenueChart() {
  const { data: session } = useSession();

  const { data, isLoading } = useQuery({
    queryKey: ['revenue-series'],
    queryFn: async () => {
      const client = createApiClient(session?.accessToken as string);
      const res = await client.get('/admin/revenue', { params: { days: 30 } });
      return res.data.data as Array<{ date: string; amount: number; count: number }>;
    },
    enabled: !!session?.accessToken,
    staleTime: 5 * 60_000,
  });

  const chartData = data?.map((d) => ({
    ...d,
    dateLabel: formatDate(d.date, 'dd MMM'),
    amountDisplay: d.amount / 100,
  })) ?? [];

  const totalRevenue = data?.reduce((sum, d) => sum + d.amount, 0) ?? 0;

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <DollarSign className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Ingresos</h3>
            <p className="text-xs text-muted-foreground">Últimos 30 días</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">{formatCurrency(totalRevenue)}</p>
          <p className="text-xs text-muted-foreground">total</p>
        </div>
      </div>

      {isLoading ? (
        <div className="h-48 bg-muted/30 rounded-lg animate-pulse" />
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
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
              tickFormatter={(v) => `$${v}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value: number) => [formatCurrency(value * 100), 'Ingresos']}
            />
            <Bar dataKey="amountDisplay" name="Ingresos" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

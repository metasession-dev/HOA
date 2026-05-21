'use client';

import { Card, CardContent } from '@/components/ui/card';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  trend?: { value: number; positive: boolean };
  accent?: 'midnight' | 'ember' | 'meadow' | 'sky' | 'sunburst';
}

const accentBg: Record<string, string> = {
  midnight: 'bg-stone-surface text-graphite',
  ember: 'bg-ember-orange/15 text-ember-orange',
  meadow: 'bg-meadow-green/15 text-meadow-green',
  sky: 'bg-sky-blue/15 text-ocean-blue',
  sunburst: 'bg-sunburst-yellow/20 text-deep-amber',
};

export function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  accent = 'midnight',
}: StatCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-caption font-medium uppercase tracking-wider text-muted-foreground">
              {title}
            </p>
            <p className="mt-2 font-display text-[36px] leading-[1.1] font-medium tracking-tight text-charcoal-primary">
              {value}
            </p>
            {description && <p className="mt-1 text-caption text-muted-foreground">{description}</p>}
            {trend && (
              <p
                className={cn(
                  'mt-2 text-caption font-medium',
                  trend.positive ? 'text-valid-green' : 'text-coral-red',
                )}
              >
                {trend.positive ? '+' : ''}
                {trend.value}% from last month
              </p>
            )}
          </div>
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full',
              accentBg[accent],
            )}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

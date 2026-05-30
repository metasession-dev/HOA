'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Building2, Home, Users, FileText, CreditCard,
  BookOpen, BarChart3, MessageSquare, FolderOpen, Settings,
  KeyRound, ScanLine, ShieldAlert, Vote, ClipboardList, Gavel,
  Receipt, Truck, Wallet, PieChart, Landmark,
  Sparkles, AlertTriangle, Banknote, Lock,
  KeySquare, Webhook, Inbox,
  Repeat, Hourglass, Workflow, CalendarDays,
  ChevronLeft, ChevronRight, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { useEffect, useMemo, useState } from 'react';

const adminNav = [
  { title: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { title: 'Units', href: '/admin/units', icon: Home },
  { title: 'People', href: '/admin/people', icon: Users },
  { title: 'Team', href: '/admin/team', icon: Users },
  { title: 'Anomalies', href: '/admin/anomalies', icon: AlertTriangle },
  { title: 'Assistant', href: '/assistant', icon: Sparkles },
];

const financeNav = [
  { title: 'Invoices', href: '/finance/invoices', icon: FileText },
  { title: 'Recurring', href: '/finance/recurring', icon: Repeat },
  { title: 'Late fees', href: '/finance/late-fees', icon: Hourglass },
  { title: 'Payments', href: '/finance/payments', icon: CreditCard },
  { title: 'Payables', href: '/payables', icon: Receipt },
  { title: 'Vendors', href: '/payables/vendors', icon: Truck },
  { title: 'Funds', href: '/finance/funds', icon: Wallet },
  { title: 'Budgets', href: '/finance/budgets', icon: PieChart },
  { title: 'Banking', href: '/finance/banking', icon: Landmark },
  { title: 'Chart of Accounts', href: '/finance/gl', icon: BookOpen },
  { title: 'Reports', href: '/finance/reports', icon: BarChart3 },
];

const operationsNav = [
  { title: 'Requests', href: '/admin/requests', icon: Inbox },
  { title: 'Communications', href: '/communications', icon: MessageSquare },
  { title: 'Gate passes', href: '/passes', icon: KeyRound },
  { title: 'Violations', href: '/violations', icon: ShieldAlert },
  { title: 'Documents', href: '/documents', icon: FolderOpen },
  { title: 'Background jobs', href: '/admin/jobs', icon: Workflow },
  { title: 'Privacy & data', href: '/settings/privacy', icon: Lock },
  { title: 'Settings', href: '/settings', icon: Settings },
];

const governanceNav = [
  { title: 'Board view', href: '/board', icon: LayoutDashboard },
  { title: 'Meetings', href: '/meetings', icon: CalendarDays },
  { title: 'Votes', href: '/votes', icon: Vote },
  { title: 'Surveys', href: '/surveys', icon: ClipboardList },
  { title: 'Contracts', href: '/contracts', icon: Gavel },
];

const gateNav = [
  { title: 'Security gate', href: '/gate', icon: ScanLine },
];

const integrationsNav = [
  { title: 'API keys', href: '/admin/integrations/api-keys', icon: KeySquare },
  { title: 'Webhooks', href: '/admin/integrations/webhooks', icon: Webhook },
];

type NavItem = { title: string; href: string; icon: typeof LayoutDashboard };

export function Sidebar({ mobileOpen = false, onClose }: { mobileOpen?: boolean; onClose?: () => void } = {}) {
  const pathname = usePathname();
  const { primaryRole, organizationName } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const isAdmin = ['super_admin', 'hoa_admin', 'property_manager'].includes(primaryRole);
  const isFinance = ['super_admin', 'hoa_admin', 'finance_officer'].includes(primaryRole);
  const isGateOperator = ['super_admin', 'hoa_admin', 'property_manager', 'gate_security'].includes(primaryRole);
  const isGovernance = ['super_admin', 'hoa_admin', 'exco_member', 'exco_chairperson', 'communications_manager'].includes(primaryRole);

  /**
   * Compute the single active nav href via longest-prefix-wins. Without this,
   * `pathname.startsWith(item.href)` highlights both `/payables` AND
   * `/payables/vendors` when the user is on the vendors page. We collect every
   * href across all sections and pick the most specific match — exact pathname
   * match, or proper prefix `href + '/'`. The `/` boundary matters: it stops
   * `/admin` from matching `/administrators-fake`.
   */
  const activeHref = useMemo(() => {
    const allHrefs = [
      ...adminNav,
      ...financeNav,
      ...operationsNav,
      ...governanceNav,
      ...gateNav,
      ...integrationsNav,
    ].map((i) => i.href);
    let best: string | null = null;
    for (const href of allHrefs) {
      if (pathname === href || pathname.startsWith(href + '/')) {
        if (!best || href.length > best.length) best = href;
      }
    }
    return best;
  }, [pathname]);

  /**
   * Which section contains the active route — used to auto-expand that group
   * and collapse the others as the user navigates.
   */
  const activeSection = useMemo(() => {
    const lookup: Array<{ key: string; items: NavItem[] }> = [
      { key: 'management', items: adminNav },
      { key: 'finance', items: financeNav },
      { key: 'operations', items: operationsNav },
      { key: 'governance', items: governanceNav },
      { key: 'integrations', items: integrationsNav },
      { key: 'gate', items: gateNav },
    ];
    for (const s of lookup) {
      if (s.items.some((i) => i.href === activeHref)) return s.key;
    }
    return 'management'; // sensible default before any route matches
  }, [activeHref]);

  /**
   * Section open state. Only one section is open at a time by default — the
   * one containing the active route. User can click another section header
   * to peek into it (which collapses the previously open one). LocalStorage
   * persistence isn't worth it here — auto-driven by route is more
   * predictable for a multi-tab workflow.
   */
  const [openSection, setOpenSection] = useState<string>(activeSection);
  useEffect(() => {
    setOpenSection(activeSection);
  }, [activeSection]);

  const NavSection = ({ title, sectionKey, items }: { title: string; sectionKey: string; items: NavItem[] }) => {
    const isOpen = collapsed || openSection === sectionKey;
    const hasActive = items.some((i) => i.href === activeHref);
    return (
      <div className="space-y-1">
        {!collapsed && (
          <button
            type="button"
            onClick={() => setOpenSection((s) => (s === sectionKey ? '' : sectionKey))}
            aria-expanded={isOpen}
            className={cn(
              'group flex w-full items-center justify-between rounded-[10px] px-3 py-1.5 transition-colors',
              'text-[10px] font-semibold tracking-[0.12em] uppercase',
              hasActive ? 'text-charcoal-primary' : 'text-muted-foreground',
              'hover:bg-sidebar-accent/50 hover:text-charcoal-primary',
            )}
          >
            <span>{title}</span>
            <ChevronDown
              className={cn(
                'h-3 w-3 transition-transform duration-200',
                isOpen ? 'rotate-0' : '-rotate-90',
              )}
            />
          </button>
        )}
        {isOpen &&
          items.map((item) => {
            const isActive = activeHref === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onClose?.()}
                className={cn(
                  'group relative flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm transition-colors duration-200',
                  isActive
                    ? 'bg-sidebar-accent text-charcoal-primary font-medium'
                    : 'text-graphite hover:bg-sidebar-accent hover:text-charcoal-primary',
                  collapsed && 'justify-center px-2',
                )}
              >
                {isActive && (
                  <span
                    className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-ember-orange"
                    aria-hidden
                  />
                )}
                <item.icon
                  className={cn(
                    'h-[18px] w-[18px] shrink-0 transition-colors',
                    isActive ? 'text-ember-orange' : 'text-graphite/70 group-hover:text-graphite',
                  )}
                />
                {!collapsed && <span className="truncate">{item.title}</span>}
              </Link>
            );
          })}
      </div>
    );
  };

  return (
    <>
      {/* Mobile backdrop — tap to dismiss the drawer. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-midnight/30 backdrop-blur-[1px] lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          'flex flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-300 ease-spring',
          // Mobile: fixed off-canvas drawer that slides in/out.
          'fixed inset-y-0 left-0 z-50 w-64 lg:static lg:z-auto lg:translate-x-0 lg:transition-all',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          collapsed ? 'lg:w-16' : 'lg:w-64',
        )}
      >
      <div className={cn('flex items-center h-16 px-4', collapsed ? 'justify-center' : 'gap-3')}>
        {/* HOA.africa brand mark — green house + Africa silhouette with nodes. */}
        <img src="/icons/logo.png" alt="HOA.africa" className="h-9 w-9 shrink-0" />
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-charcoal-primary truncate leading-tight">
              {organizationName}
            </p>
            <p className="text-caption text-muted-foreground">HOA.africa</p>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="hidden h-8 w-8 shrink-0 lg:inline-flex"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-3">
        <NavSection title="Management" sectionKey="management" items={adminNav} />
        {(isFinance || isAdmin) && <NavSection title="Finance" sectionKey="finance" items={financeNav} />}
        <NavSection title="Operations" sectionKey="operations" items={operationsNav} />
        {isGovernance && <NavSection title="Governance" sectionKey="governance" items={governanceNav} />}
        {isAdmin && <NavSection title="Integrations" sectionKey="integrations" items={integrationsNav} />}
        {isGateOperator && <NavSection title="Gate" sectionKey="gate" items={gateNav} />}
      </nav>

      {!collapsed && (
        <div className="border-t border-sidebar-border p-4">
          <p className="text-caption text-muted-foreground">
            Need help? Reach the team at <span className="text-ember-orange">dev@metasession.co</span>
          </p>
        </div>
      )}
      </aside>
    </>
  );
}

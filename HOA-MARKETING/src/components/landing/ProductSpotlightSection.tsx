import { motion } from "framer-motion";
import {
  Check,
  LayoutDashboard,
  Home,
  Receipt,
  Gavel,
  Vote,
  KeyRound,
  Building2,
  FilePlus,
  User,
  CircleDollarSign,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Mock-UI primitives — styled to mirror the real admin & resident apps */
/* ------------------------------------------------------------------ */

type Tone = "primary" | "success" | "warning" | "accent" | "muted";
const toneClass: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  accent: "bg-accent/10 text-accent",
  muted: "bg-muted text-muted-foreground",
};

const Pill = ({ tone = "muted", children }: { tone?: Tone; children: React.ReactNode }) => (
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneClass[tone]}`}>
    {children}
  </span>
);

type NavItem = { label: string; icon: React.ElementType; active?: boolean };

const AppFrame = ({ title, nav, children }: { title: string; nav: NavItem[]; children: React.ReactNode }) => (
  <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
    {/* Window chrome */}
    <div className="flex items-center gap-2 border-b border-border bg-secondary/60 px-4 py-3">
      <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
      <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
      <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
      <span className="ml-3 truncate text-xs text-muted-foreground">{title}</span>
    </div>
    <div className="flex">
      {/* Sidebar */}
      <aside className="hidden w-44 shrink-0 flex-col gap-0.5 border-r border-border bg-secondary/30 p-3 sm:flex">
        <div className="mb-3 flex items-center gap-2 px-1">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Home className="h-3.5 w-3.5" />
          </span>
          <span className="text-xs font-semibold text-foreground">HOA.africa</span>
        </div>
        {nav.map((n) => (
          <div
            key={n.label}
            className={`relative flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] ${
              n.active ? "bg-card font-medium text-foreground shadow-soft" : "text-muted-foreground"
            }`}
          >
            {n.active && <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" />}
            <n.icon className={`h-3.5 w-3.5 ${n.active ? "text-accent" : "text-muted-foreground/70"}`} />
            {n.label}
          </div>
        ))}
      </aside>
      {/* Content */}
      <div className="min-w-0 flex-1 p-4 sm:p-5">{children}</div>
    </div>
  </div>
);

const StatTile = ({ label, value, tone = "primary" }: { label: string; value: string; tone?: Tone }) => (
  <div className="rounded-xl border border-border bg-background/60 p-3">
    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className={`mt-1 text-base font-semibold ${tone === "accent" ? "text-accent" : "text-foreground"}`}>{value}</p>
  </div>
);

/* ------------------------------------------------------------------ */
/* Three mock screens                                                  */
/* ------------------------------------------------------------------ */

const DashboardMock = () => (
  <AppFrame
    title="enterprise.hoa.africa/admin"
    nav={[
      { label: "Dashboard", icon: LayoutDashboard, active: true },
      { label: "Units", icon: Home },
      { label: "Finance", icon: Receipt },
      { label: "Contracts", icon: Gavel },
      { label: "Passes", icon: KeyRound },
    ]}
  >
    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Acacia Park Estate</p>
    <h4 className="mb-3 text-sm font-semibold text-foreground">Good morning, Thandi.</h4>
    <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
      <StatTile label="Outstanding" value="R 482,300" tone="accent" />
      <StatTile label="Collected · Apr" value="91%" />
      <StatTile label="Open passes" value="12" />
      <StatTile label="Bids to review" value="3" />
    </div>
    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Recent activity</p>
    <div className="space-y-1.5">
      {[
        { t: "Invoice INV-00231 sent · Unit 14B", tone: "primary" as Tone, b: "sent" },
        { t: "Gate pass used · Unit 7", tone: "warning" as Tone, b: "alert" },
        { t: "Bid received · Acacia Landscaping", tone: "success" as Tone, b: "new" },
      ].map((r) => (
        <div key={r.t} className="flex items-center justify-between rounded-lg border border-border bg-background/50 px-3 py-2">
          <span className="truncate text-[11px] text-foreground">{r.t}</span>
          <Pill tone={r.tone}>{r.b}</Pill>
        </div>
      ))}
    </div>
  </AppFrame>
);

const VendorPortalMock = () => (
  <AppFrame
    title="residents.hoa.africa/vendor/invoices"
    nav={[
      { label: "My invoices", icon: Receipt, active: true },
      { label: "Submit invoice", icon: FilePlus },
      { label: "Tenders", icon: Gavel },
      { label: "Profile", icon: User },
    ]}
  >
    <div className="mb-3 flex items-center justify-between">
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Acacia Landscaping</p>
        <h4 className="text-sm font-semibold text-foreground">My invoices</h4>
      </div>
      <span className="rounded-full bg-primary px-3 py-1 text-[10px] font-semibold text-primary-foreground">+ Submit invoice</span>
    </div>
    <div className="overflow-hidden rounded-xl border border-border">
      {[
        { n: "VINV-2026-00042", a: "R 18,400", tone: "success" as Tone, s: "Paid" },
        { n: "VINV-2026-00041", a: "R 7,250", tone: "warning" as Tone, s: "In review" },
        { n: "VINV-2026-00040", a: "R 12,900", tone: "primary" as Tone, s: "Received" },
      ].map((r, i) => (
        <div key={r.n} className={`flex items-center justify-between px-3 py-2.5 ${i > 0 ? "border-t border-border" : ""}`}>
          <span className="font-mono text-[11px] text-foreground">{r.n}</span>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-medium text-foreground">{r.a}</span>
            <Pill tone={r.tone}>{r.s}</Pill>
          </div>
        </div>
      ))}
    </div>
    <p className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <CircleDollarSign className="h-3.5 w-3.5 text-success" />
      You&apos;re emailed automatically when an invoice is approved or paid.
    </p>
  </AppFrame>
);

const ContractsMock = () => (
  <AppFrame
    title="enterprise.hoa.africa/contracts"
    nav={[
      { label: "Board view", icon: LayoutDashboard },
      { label: "Votes", icon: Vote },
      { label: "Contracts", icon: Gavel, active: true },
      { label: "Vendors", icon: Building2 },
    ]}
  >
    <div className="mb-3 flex items-center gap-2">
      <h4 className="text-sm font-semibold text-foreground">Estate landscaping</h4>
      <Pill tone="warning">Evaluating</Pill>
    </div>
    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Bids</p>
    <div className="space-y-1.5">
      {[
        { v: "Acacia Landscaping", a: "R 142,000", tone: "warning" as Tone, s: "Shortlisted" },
        { v: "GreenScape Co", a: "R 156,500", tone: "muted" as Tone, s: "Submitted" },
        { v: "Verdant Grounds", a: "R 138,900", tone: "warning" as Tone, s: "Shortlisted" },
      ].map((r) => (
        <div key={r.v} className="flex items-center justify-between rounded-lg border border-border bg-background/50 px-3 py-2">
          <span className="text-[11px] font-medium text-foreground">{r.v}</span>
          <div className="flex items-center gap-3">
            <span className="text-[11px] tabular-nums text-foreground">{r.a}</span>
            <Pill tone={r.tone}>{r.s}</Pill>
          </div>
        </div>
      ))}
    </div>
    <div className="mt-3 rounded-xl border border-border bg-primary/5 p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
          <Vote className="h-3.5 w-3.5 text-primary" /> Exco award vote
        </span>
        <span className="text-[10px] text-muted-foreground">4 of 6 voted</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full w-2/3 rounded-full bg-primary" />
      </div>
    </div>
  </AppFrame>
);

/* ------------------------------------------------------------------ */
/* Spotlight rows                                                      */
/* ------------------------------------------------------------------ */

const spotlights = [
  {
    eyebrow: "ONE HOME BASE",
    title: "Your whole estate, at a glance",
    body:
      "Levies, payments, passes, violations and bids — every moving part of your community in a single dashboard built for managers and boards.",
    bullets: [
      "Live arrears & collection tracking",
      "Real-time alerts the moment something needs you",
      "A clean, fast interface your team actually enjoys",
    ],
    mock: <DashboardMock />,
    reverse: false,
  },
  {
    eyebrow: "VENDORS & PAYABLES",
    title: "Vendor invoicing, fully self-service",
    body:
      "Vendors submit their own invoices and receipts through a secure portal, then watch them move through your approval chain to payment — with email and in-app updates at every step.",
    bullets: [
      "Rule-based, multi-step approvals",
      "Batch payment runs with a full audit trail",
      "Vendors notified at capture, approval & payment",
    ],
    mock: <VendorPortalMock />,
    reverse: true,
  },
  {
    eyebrow: "PROCUREMENT & GOVERNANCE",
    title: "Bid, vet & award — by the board",
    body:
      "Publish tenders, collect competitive vendor bids, shortlist the strongest, and let your Exco vote on the winner — a transparent, on-record award process from start to finish.",
    bullets: [
      "Open tenders with vendor bidding",
      "Formal Exco voting & vetting",
      "Every bidder notified of the outcome",
    ],
    mock: <ContractsMock />,
    reverse: false,
  },
];

const ProductSpotlightSection = () => {
  return (
    <section className="bg-gradient-subtle py-20 lg:py-32">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-4 inline-block font-semibold text-primary"
          >
            SEE IT IN ACTION
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-4 text-3xl font-bold text-foreground md:text-4xl"
          >
            Designed to feel effortless
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg text-muted-foreground"
          >
            A look at the actual screens your managers, residents and vendors use every day.
          </motion.p>
        </div>

        <div className="space-y-20 lg:space-y-28">
          {spotlights.map((s, idx) => (
            <div
              key={s.title}
              className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
            >
              {/* Copy */}
              <motion.div
                initial={{ opacity: 0, x: s.reverse ? 30 : -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className={s.reverse ? "lg:order-2" : ""}
              >
                <span className="mb-3 inline-block text-sm font-semibold text-accent">{s.eyebrow}</span>
                <h3 className="mb-4 text-2xl font-bold text-foreground md:text-3xl">{s.title}</h3>
                <p className="mb-6 text-muted-foreground">{s.body}</p>
                <ul className="space-y-3">
                  {s.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Check className="h-3 w-3 text-primary" />
                      </span>
                      <span className="text-sm text-foreground">{b}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>

              {/* Mock UI */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.15 }}
                className={s.reverse ? "lg:order-1" : ""}
              >
                {s.mock}
              </motion.div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProductSpotlightSection;

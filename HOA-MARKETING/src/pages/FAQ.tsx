import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, ArrowRight, MessageCircle, BookOpen, CreditCard, ShieldCheck, Users, Wallet, Building2, Vote, Bell, Settings2 } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const ENTERPRISE_URL =
  import.meta.env.VITE_ENTERPRISE_URL || "http://localhost:3002";
const BOOKING_URL = "https://metasession.thorstack.com/book/grey/30mins-hoa-demo";

/**
 * Frequently Asked Questions.
 *
 * Categorised rather than one long list — first-time visitors usually have
 * a specific question shape in mind ("how much does it cost", "is my data
 * safe", "what about residents who don't use smartphones") and category
 * headings let them jump straight there without reading 45 unrelated Q&As.
 *
 * The Q&A array is the single source of truth; categories are derived
 * from it. To add a question, append it to the right category block — no
 * other code needs to change.
 *
 * Free-text search filters by question + answer; useful once the list
 * grows past a single screen. Empty search renders the full categorised
 * view.
 */

interface FAQ {
  q: string;
  a: string;
}

interface FAQCategory {
  id: string;
  title: string;
  icon: typeof BookOpen;
  intro?: string;
  questions: FAQ[];
}

const categories: FAQCategory[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: BookOpen,
    intro: "The basics: what HOA.africa is and how to start using it.",
    questions: [
      {
        q: "What is HOA.africa?",
        a:
          "HOA.africa is a property-management platform purpose-built for African homeowners' associations, estates, and bodies corporate. We give your board, property manager, finance officer, and residents one place to handle levies, payments, gate passes, communications, votes, violations, and resale documents, without juggling spreadsheets, WhatsApp groups, and email threads.",
      },
      {
        q: "Who is the platform designed for?",
        a:
          "Residential estates, gated communities, sectional-title schemes, and homeowners' associations of any size, from 30-unit boutique developments to 5,000-unit master-planned communities. Property management companies that manage several estates can run them all from a single account with separate workspaces.",
      },
      {
        q: "What does each user role do?",
        a:
          "HOA admins and exco members run the operations side: levies, vendors, governance, communications. Property managers handle day-to-day estate operations and gate management. Finance officers focus on invoicing, payments, and reconciliation. Gate security uses a tablet view for visitor checks. Residents (owners, tenants, stakeholders) see their balance, pay levies, request gate passes, vote, and read notices. Each role only sees what it needs, and access is strictly scoped by the board.",
      },
      {
        q: "How do I sign up?",
        a:
          "If your HOA is starting fresh, the board chair or property manager registers the organisation at /register on our enterprise console. You add your estate, your units, and invite residents in. If your HOA is already on HOA.africa, ask your administrator to invite you. Residents can't self-register, for security reasons.",
      },
      {
        q: "How long does setup take?",
        a:
          "Most estates are live within a few hours: a board member completes the org setup, imports the unit list (CSV upload is supported), invites the management team, and announces the platform to residents. Migration from a previous system (bringing across opening balances and resident records) usually takes one to two working days with help from our onboarding team.",
      },
      {
        q: "Do residents need to download an app?",
        a:
          "No. The resident experience runs as a Progressive Web App (PWA), which means it works in any modern mobile browser. Residents can optionally 'Install to Home Screen' to get an app-like icon and offline access, but they don't have to.",
      },
    ],
  },
  {
    id: "pricing-billing",
    title: "Pricing, Billing & Plans",
    icon: CreditCard,
    intro: "How much, how often, and how flexibly.",
    questions: [
      {
        q: "How is HOA.africa priced?",
        a:
          "We charge a flat monthly fee per HOA, based on the plan you pick. Plans are listed on our pricing page. Larger estates and multi-estate operators are on Enterprise, so drop us a line for a custom quote.",
      },
      {
        q: "Is there a free trial?",
        a:
          "Yes. Every new HOA starts with a 14-day trial of the full feature set, no card required. Add your first unit and invite a resident inside the trial to see how the platform feels with real data.",
      },
      {
        q: "Can residents be charged for using the platform?",
        a:
          "No. Residents never pay HOA.africa directly. The estate subscribes; residents use the resident PWA at no cost to themselves. Payment-processing fees on levy payments are governed by Paystack's pricing and are charged to whichever party your HOA configures. By default the resident bears the gateway fee.",
      },
      {
        q: "Which currencies do you support?",
        a:
          "Subscription pricing is published in Nigerian Naira (₦) by default. Internally the platform supports every African currency for HOA levies and accounting (the org-wide currency setting governs every financial screen). USD, ZAR, KES, GHS, EGP, MAD, XOF, and XAF are commonly used by our customers.",
      },
      {
        q: "What happens if I upgrade or downgrade?",
        a:
          "Upgrades take effect immediately and are prorated, so you only pay the difference for the remainder of the current cycle. Downgrades take effect at the end of the current billing cycle. Either way, your data and history stay intact.",
      },
      {
        q: "Can I cancel anytime?",
        a:
          "Yes. Cancel from Settings → Billing. Access continues until the end of the period you've paid for. We don't refund partial periods, but you keep full access (and can re-activate without losing data) for 30 days after cancellation.",
      },
      {
        q: "What payment methods do you accept for your subscription?",
        a:
          "Cards (Visa, Mastercard, Verve) and bank transfer through Paystack. Annual plans can be paid by invoice on request.",
      },
    ],
  },
  {
    id: "for-managers",
    title: "For Property Managers & Boards",
    icon: Building2,
    intro: "Operational features that power the admin console.",
    questions: [
      {
        q: "How does billing work?",
        a:
          "You define one or more billing schemes (monthly levy, special assessment, water reconciliation, etc.) with rate cards. The system generates invoices on the configured cadence and writes a journal entry per invoice into the ledger. Residents see their balance update in real time and pay through the resident PWA. You can preview the next billing run before it executes.",
      },
      {
        q: "How are late fees handled?",
        a:
          "You configure late-fee rules per scheme (flat fee, percentage, or hybrid) with grace days and maximum caps. The Late Fee Sweep job runs daily and applies fees automatically to overdue invoices. Each application writes an audit log row, and residents receive an in-app notification when a fee is charged.",
      },
      {
        q: "Do you support multi-tier approvals for vendor payments?",
        a:
          "Yes. Define rules based on amount thresholds, currency, and GL accounts. A typical setup: under ₦500k requires the finance officer only, ₦500k to ₦5M needs any exco member, and above ₦5M needs the exco chairperson. Sequential mode requires earlier approvers before later ones; parallel mode lets any combination approve. The audit log captures every decision.",
      },
      {
        q: "Can I run an AGM through the platform?",
        a:
          "Yes. Votes support the full AGM flow: motions with a required seconder, notice periods, eligibility rules (e.g. paid-up owners only), quorum thresholds, proxy voting, and special-resolution gates (at least 75% threshold, at least 14 days notice, and a mandatory seconder who isn't the proposer). Results can be live or hidden until close. Anonymous ballots are supported with a verifiable hash, so we can prove a person voted without revealing how.",
      },
      {
        q: "How do you handle violations?",
        a:
          "The full state machine: capture (with photos) → notice (queues an email + in-app notification) → optional fine (creates a linked invoice) → resident acknowledges or appeals → board reviews appeal → close. Repeat-offender flagging surfaces units with ≥3 violations in 12 months. Every state change is audited.",
      },
      {
        q: "Can I issue a resale certificate / property-transfer pack?",
        a:
          "Yes. The Resale module generates a snapshot of the unit's financial standing, lets you attach the disclosure checklist and supporting documents, and produces a public attorney-facing link with its own audit log. The financial snapshot is frozen at the moment of issue, so re-pulling current balances doesn't change a certificate you've already issued.",
      },
      {
        q: "Can my external accountant access the books without seeing PII?",
        a:
          "Yes. The 'external accountant' role has read access to the ledger, GL accounts, and reports but no access to resident contact details, gate logs, or governance data. Useful for year-end audits.",
      },
    ],
  },
  {
    id: "for-residents",
    title: "For Residents",
    icon: Users,
    intro: "Everything residents see day to day.",
    questions: [
      {
        q: "What can I do in the resident PWA?",
        a:
          "Check your current balance and statement, pay levies and ad-hoc invoices, set up a payment plan, request gate passes for visitors, receive estate notices, file maintenance requests, vote in active polls, appeal violations, view documents the board has shared, and update your contact details.",
      },
      {
        q: "Does it work offline?",
        a:
          "Mostly. The PWA caches the data you've already loaded, so on a flaky connection you can still see your last balance, recent notices, and active gate passes. Anything that requires writing back to the server (payments, new gate passes) needs a connection.",
      },
      {
        q: "What about residents who only have a basic phone?",
        a:
          "Estates often have a small minority of residents who don't use smartphones. For them, the admin can issue and manage everything on their behalf, and SMS notices reach them just like the in-app notifications reach everyone else. Gate-pass SMS codes work on any phone.",
      },
      {
        q: "Can I have more than one HOA on the same account?",
        a:
          "Yes. If you own units in multiple estates or you're a board member for one HOA and a resident in another, your account holds all the relevant role assignments. The role switcher in the topbar moves you between them without re-authenticating.",
      },
      {
        q: "How do gate passes work?",
        a:
          "From your phone, you request a pass for a visitor: name, expected arrival, and vehicle plate if applicable. The system generates a QR code and (optionally) sends an SMS with a numeric code to the visitor. Gate security scans the QR or types the code; if valid, the gate opens and the entry is logged. Every visit is on the audit trail.",
      },
      {
        q: "How do I get notified about new notices or balances?",
        a:
          "In-app notifications appear in the bell icon at the top of the PWA. You can optionally enable push notifications (the browser will ask you once) for instant alerts about gate-pass approvals, payment confirmations, broadcast notices, and urgent estate communications.",
      },
    ],
  },
  {
    id: "payments-finance",
    title: "Payments & Finance",
    icon: Wallet,
    intro: "How money moves through the platform.",
    questions: [
      {
        q: "Who processes payments?",
        a:
          "Paystack is our primary payment processor. They handle card payments, bank transfers, USSD, and mobile-money rails across Nigeria, South Africa, Ghana, Kenya, and Côte d'Ivoire. We don't see, store, or process raw card data. Paystack returns a tokenised reference plus the last four digits of the card.",
      },
      {
        q: "How do you reconcile payments?",
        a:
          "Paystack sends us a webhook the moment a charge succeeds; the platform matches the payment to the invoice (by reference) and writes the ledger entries in the same transaction. The webhook signature is verified against Paystack's secret to prevent forgery. Manual reconciliation is also supported when a resident pays through an offline channel: a finance officer marks the invoice paid with the reference number.",
      },
      {
        q: "Can residents set up payment plans?",
        a:
          "Yes. From a resident's outstanding-invoice view, an admin (or the resident themselves, where allowed) can split the balance into instalments over 2 to 12 months. The system creates the schedule, generates an invoice for each instalment date, and applies late fees to missed instalments only.",
      },
      {
        q: "Do you handle VAT / tax reporting?",
        a:
          "Yes. Line items can carry VAT/GST rates per your jurisdiction. Reports break out tax totals and let you export the data for filing. Tax-exempt items (e.g. body-corporate levies in some jurisdictions) are flagged so the report excludes them correctly.",
      },
      {
        q: "Can I send statements to residents?",
        a:
          "Yes. Statements can be generated on-demand for any date range, exported as PDF, or emailed directly to the resident. Annual statements at year-end are common; we can schedule them automatically.",
      },
    ],
  },
  {
    id: "gate-security",
    title: "Gate, Access & Security",
    icon: ShieldCheck,
    intro: "Who comes in, who comes out, who knows about it.",
    questions: [
      {
        q: "Does the gate-pass system work with existing access-control hardware?",
        a:
          "QR codes are the lowest-friction option and work on any smartphone the security team has. For estates with boom-barrier integrations, we can integrate with selected access-control systems on request. Get in touch with your specifics.",
      },
      {
        q: "What happens if a visitor's pass expires while they're inside?",
        a:
          "Gate logs both entry and exit. If exit is recorded after the expiry, the system flags it for review on the next-day report. Security can extend a pass on the gate tablet if the resident hasn't responded.",
      },
      {
        q: "Can I block a contractor or recurring visitor across the estate?",
        a:
          "Yes. The blacklist is an estate-wide setting (admins manage it). When someone on the blacklist tries to enter, security gets a visible warning at the gate and the attempted visit is logged. Blacklist additions require an admin reason for the audit trail.",
      },
      {
        q: "What about emergency vehicles or contractors during off-hours?",
        a:
          "Standing passes can be issued for recurring visitors (cleaner, gardener, pool service) with defined day-of-week and time-of-day windows. Emergency-services passes can be issued instantly by any active resident and don't require admin approval.",
      },
    ],
  },
  {
    id: "governance",
    title: "Governance: Voting, Violations & Resale",
    icon: Vote,
    intro: "Estate decisions, enforcement, and property transfer.",
    questions: [
      {
        q: "Are anonymous ballots really anonymous?",
        a:
          "When a vote is marked anonymous, we store a SHA-256 hash of the voter's ID combined with the vote ID and an org-specific secret instead of the voter ID directly. This lets us verify that a specific person voted (so we can enforce one-vote-per-person and audit eligibility) without revealing how they voted.",
      },
      {
        q: "How do proxies work?",
        a:
          "A resident can delegate their vote to another eligible resident before the vote opens. Proxies expire when the vote closes or the grantor revokes them. We prevent proxy chains, so someone who already received a proxy can't delegate it further. That stops votes from piling up through cascading proxies.",
      },
      {
        q: "What's a special resolution and when do I need one?",
        a:
          "A special resolution is required by most jurisdictions for material changes (amending the constitution, levy structure changes, large expenditure, etc.). The platform enforces special-resolution rules automatically: pass threshold ≥75%, notice period ≥14 days, and a seconder different from the proposer. You can't accidentally open a special resolution without those guardrails.",
      },
      {
        q: "Who can see a resale certificate?",
        a:
          "Only people you share the access link with. Each access link is a long random token with its own expiry and revocation control. We log every access (IP, user agent, and time) so you can prove who viewed the certificate during a dispute. The links are tied to the certificate, so revoking the link works retroactively on link sharing.",
      },
      {
        q: "Can I appeal a violation?",
        a:
          "Yes. Residents have the grace period (set per category) to file an appeal directly from the violation detail page. The appeal triggers an in-app notification to the board, who can uphold the violation, dismiss it, or request more information. All decisions write to the audit trail.",
      },
    ],
  },
  {
    id: "communications",
    title: "Communications & Notifications",
    icon: Bell,
    intro: "How the estate talks to itself.",
    questions: [
      {
        q: "What channels can I broadcast on?",
        a:
          "In-app notification (always), email (via Resend), and optionally SMS for urgent notices. Future releases will add WhatsApp Business and push notifications to subscribed PWAs. You pick the channel mix per broadcast.",
      },
      {
        q: "Can I target specific groups?",
        a:
          "Yes. Broadcasts can be targeted by unit type, by occupancy (owner vs tenant), by paid-up status, by tags you maintain, or to specific units individually. The recipient list is previewed before send so you can confirm.",
      },
      {
        q: "Can residents opt out of estate broadcasts?",
        a:
          "Residents can mute non-urgent broadcasts but cannot opt out of operational notices the board considers essential (e.g. water-shutdown alerts, AGM notices, statutory communications). The board defines which categories are 'essential' in settings.",
      },
      {
        q: "How does the AI assistant work?",
        a:
          "Type a question (\"How much have we collected this month?\", \"Show me units with 3+ violations\", \"Draft a notice about the gate-arm repair on Saturday\") into the assistant box and it answers using the data your role has access to. The assistant uses OpenAI or Anthropic depending on your settings. Every assistant query is audited and never used to train external models.",
      },
    ],
  },
  {
    id: "privacy-security",
    title: "Privacy, Security & Compliance",
    icon: ShieldCheck,
    intro: "How we protect your data and meet regulation.",
    questions: [
      {
        q: "Where is my data hosted?",
        a:
          "Production data lives in encrypted Postgres on Railway's US infrastructure. We use Standard Contractual Clauses for the international transfer and apply encryption in transit (TLS 1.2+) and at rest (AES-256). You can request the full sub-processor list and our Data Processing Addendum from privacy@hoa.africa.",
      },
      {
        q: "Are you NDPA / POPIA / GDPR compliant?",
        a:
          "Yes. We've designed the platform around the practical requirements of all three: documented purpose limitation, lawful bases per processing activity, retention timelines per data class, audit trail for sensitive mutations, encryption of PII at rest, breach notification within statutory windows, and full subject-rights handling (access, erasure, portability, rectification, restriction, objection).",
      },
      {
        q: "How are passwords protected?",
        a:
          "We hash every password with bcrypt at cost factor 12, which is current best practice for password storage. We never store plain-text passwords, and even our engineers can't see your password during support. Forgotten yours? Use 'forgot password' to reset; we email a single-use, time-limited link.",
      },
      {
        q: "Do you support two-factor authentication?",
        a:
          "Yes. We support TOTP-based 2FA for any user (Google Authenticator, Authy, 1Password, etc.). Two-factor secrets are encrypted at rest with AES-256-GCM, with keys held outside the database. Recovery codes are issued when 2FA is enabled so you can sign in if you lose your phone.",
      },
      {
        q: "What happens to my data if I cancel?",
        a:
          "Your data stays accessible for 30 days after cancellation so you can re-activate without loss. After 30 days, personal data is deleted or anonymised on our retention schedule. Financial records are retained for seven years to satisfy tax law, but they're segregated from active accounts and only restored on legal request.",
      },
    ],
  },
  {
    id: "technical-support",
    title: "Technical & Support",
    icon: Settings2,
    intro: "Integrations, uptime, and where to get help.",
    questions: [
      {
        q: "Do you have an API?",
        a:
          "Yes. Our REST API powers the apps you see and is documented at /api/docs on every deployment. SDKs in JavaScript/TypeScript and Python ship official clients. Enterprise customers get an API token for external integrations (custom dashboards, syncing into an existing accounting system, etc.).",
      },
      {
        q: "What's your uptime track record?",
        a:
          "Our published target is 99.5% monthly uptime. Status page and incident history at status.hoa.africa (coming soon). Scheduled maintenance is announced at least 48 hours in advance; emergency maintenance is announced as soon as we know.",
      },
      {
        q: "Can I export my data?",
        a:
          "Yes. Every list in the platform has CSV / Excel export. Full account export (every record we hold, machine-readable) is available on request at privacy@hoa.africa under your data-portability right.",
      },
      {
        q: "How do I get support?",
        a:
          "Three options. (1) The in-app chat, which opens during business hours and stays attached to the relevant record. (2) Email hello@hoa.africa, with a first response within 4 working hours. (3) Book a call at our scheduling link, which is handy for setup help and rollouts.",
      },
      {
        q: "Do you offer training or onboarding?",
        a:
          "Yes. Every new HOA gets a 60-min onboarding session covering setup, billing schemes, gate passes, and your first broadcast. Property-management companies onboarding multiple estates can book a dedicated implementation plan with our team.",
      },
      {
        q: "Where is the change log?",
        a:
          "We post material changes inside the platform (Settings → What's new) and as a monthly digest by email. Breaking API changes carry a deprecation notice at least 60 days before removal.",
      },
    ],
  },
];

// Pre-build a flat list for search. Keeps the per-render cost of the
// search filter at O(n) instead of nested O(c × q) over categories.
const allQuestions: Array<{ category: string; categoryId: string; q: string; a: string }> =
  categories.flatMap((c) => c.questions.map((q) => ({ category: c.title, categoryId: c.id, ...q })));

const FAQ = () => {
  const [query, setQuery] = useState("");

  // Document title for the tab + history label. Restored on unmount.
  useEffect(() => {
    const previous = document.title;
    document.title = "FAQ | HOA Africa";
    return () => {
      document.title = previous;
    };
  }, []);

  const normalisedQuery = query.trim().toLowerCase();
  const filteredFlat = normalisedQuery
    ? allQuestions.filter(
        (item) =>
          item.q.toLowerCase().includes(normalisedQuery) ||
          item.a.toLowerCase().includes(normalisedQuery),
      )
    : [];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      {/* Hero — separate from the main content so it can claim its own
          visual rhythm without breaking the article container's typography. */}
      <section className="pt-24 lg:pt-28 pb-12 lg:pb-16 border-b border-border bg-gradient-to-b from-secondary/40 to-background">
        <div className="container mx-auto px-4 max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground mb-4">
              <MessageCircle className="w-3.5 h-3.5" />
              Help centre
            </div>
            <h1 className="font-bold text-4xl lg:text-5xl text-foreground mb-4 leading-tight">
              Frequently asked questions
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              Forty-odd answers grouped by topic. Use the search bar to jump
              straight to a specific question, or skim by category below.
            </p>

            {/* Search field. Wires to local state and filters across question
                + answer text — most users phrase the question their own way,
                so matching the body too is meaningfully better than
                matching the title only. */}
            <div className="mt-8 relative max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the FAQ (e.g. ‘gate passes’, ‘refund’, ‘2FA’)"
                className="pl-9"
                aria-label="Search FAQs"
              />
            </div>
          </motion.div>
        </div>
      </section>

      <main className="flex-1">
        <div className="container mx-auto px-4 py-12 lg:py-16 max-w-4xl">
          {normalisedQuery ? (
            // -------- Search results view --------
            <div>
              <p className="text-sm text-muted-foreground mb-6">
                {filteredFlat.length === 0
                  ? "No matches found. Try a different keyword, or "
                  : `${filteredFlat.length} result${filteredFlat.length === 1 ? "" : "s"} for `}
                {filteredFlat.length === 0 ? (
                  <a href={BOOKING_URL} className="text-primary hover:underline">
                    book a call
                  </a>
                ) : (
                  <code className="rounded bg-secondary px-1.5 py-0.5 text-foreground">
                    {query}
                  </code>
                )}
                .
              </p>
              {filteredFlat.length > 0 && (
                <Accordion type="single" collapsible className="w-full">
                  {filteredFlat.map((item, idx) => (
                    <AccordionItem key={`flat-${idx}`} value={`flat-${idx}`}>
                      <AccordionTrigger className="text-left">
                        <div>
                          <span className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
                            {item.category}
                          </span>
                          <span>{item.q}</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground leading-relaxed">
                        {item.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </div>
          ) : (
            // -------- Full categorised view --------
            <>
              {/* Category nav — anchor links jump to the section heading.
                  Useful on long pages where the user knows which category
                  they want. */}
              <nav className="mb-12 lg:mb-16 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {categories.map((cat) => (
                  <a
                    key={cat.id}
                    href={`#${cat.id}`}
                    className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-secondary/50 transition-colors"
                  >
                    <cat.icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{cat.title}</span>
                  </a>
                ))}
              </nav>

              {categories.map((category) => (
                <section
                  key={category.id}
                  id={category.id}
                  // scroll-mt accounts for the fixed header so anchor jumps
                  // don't bury the heading under the topbar.
                  className="mb-12 scroll-mt-24"
                >
                  <div className="mb-6 flex items-start gap-3">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary">
                      <category.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-bold text-2xl lg:text-3xl text-foreground">
                        {category.title}
                      </h2>
                      {category.intro && (
                        <p className="text-muted-foreground mt-1">
                          {category.intro}
                        </p>
                      )}
                    </div>
                  </div>

                  <Accordion type="single" collapsible className="w-full">
                    {category.questions.map((item, idx) => (
                      <AccordionItem
                        key={`${category.id}-${idx}`}
                        value={`${category.id}-${idx}`}
                      >
                        <AccordionTrigger className="text-left text-base font-medium">
                          {item.q}
                        </AccordionTrigger>
                        <AccordionContent className="text-muted-foreground leading-relaxed">
                          {item.a}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </section>
              ))}
            </>
          )}

          {/* Footer CTA — anyone who finished reading without finding their
              answer is exactly the audience we want to capture into a call. */}
          <div className="mt-16 rounded-2xl border border-border bg-secondary/40 p-8 lg:p-10 text-center">
            <h2 className="font-bold text-2xl lg:text-3xl text-foreground mb-3">
              Still have a question?
            </h2>
            <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
              Book a 30-minute call with our team. We'll answer your specific
              question and show you the part of the platform that's most
              relevant to your estate.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a href={BOOKING_URL}>
                <Button size="lg" variant="hero" className="group">
                  Book a demo
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </a>
              <a href={`${ENTERPRISE_URL}/register`}>
                <Button size="lg" variant="outline">
                  Start a free trial
                </Button>
              </a>
            </div>
            <p className="text-xs text-muted-foreground mt-6">
              Looking for our policies? See{" "}
              <Link to="/privacy" className="hover:text-foreground underline">Privacy</Link>,{" "}
              <Link to="/terms" className="hover:text-foreground underline">Terms</Link>, and{" "}
              <Link to="/cookies" className="hover:text-foreground underline">Cookies</Link>.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default FAQ;

/**
 * Per-page guidance for the in-app help assistant ("Aida").
 *
 * Keyed by route prefix; the assistant resolves the CURRENT pathname to the
 * longest-matching entry, so a detail route (/finance/invoices/123) inherits its
 * section's guidance. Add or refine entries here — no component changes needed.
 */
export interface HelpEntry {
  title: string;
  /** A one-line friendly intro the helper "says" first. */
  intro: string;
  /** Short, actionable tips shown as a checklist. */
  tips: string[];
  /** Optional Q&A the user can tap to expand. */
  faqs?: Array<{ q: string; a: string }>;
}

const HELP: Record<string, HelpEntry> = {
  '/admin': {
    title: 'Dashboard',
    intro: 'This is your community at a glance — money in, who owes what, and what needs attention.',
    tips: [
      'The cards up top summarise outstanding balances, residents and open items.',
      'Use the left sidebar to jump to Finance, People, Communications and more.',
      'Anything with a number is usually clickable — it drills into the detail.',
    ],
  },
  '/admin/units': {
    title: 'Units',
    intro: 'Every home in your estate lives here — ownership, occupants and billing.',
    tips: [
      'Click a unit to see its owner, occupants, billings and recent invoices.',
      'Use "New unit" to add one, or bulk-import from a spreadsheet.',
      'New units automatically pick up your default billing charges (set in Settings → Billing catalog).',
    ],
  },
  '/admin/people': {
    title: 'People',
    intro: 'Owners, tenants and stakeholders linked to your units.',
    tips: [
      'Click a person to view their units, history and household.',
      '"Add person" creates a record; "Add & invite" also emails them a login invite.',
      'Search by name, email or phone at the top.',
    ],
  },
  '/admin/team': {
    title: 'Team & invites',
    intro: 'Manage staff access and send resident/team invitations.',
    tips: [
      'Invite residents or colleagues and assign their role.',
      'Roles control what each person can see and do.',
    ],
  },
  '/finance/invoices': {
    title: 'Invoices',
    intro: 'Every levy, fine and ad-hoc charge across your community.',
    tips: [
      'Click any row to open the full invoice — line items, payments and actions.',
      'Search by invoice #, unit or estate; tick the boxes to delete unpaid invoices in bulk.',
      'Only unpaid invoices can be deleted — anything with a payment is protected.',
    ],
  },
  '/finance/recurring': {
    title: 'Recurring billing',
    intro: 'Schedules that issue invoices to residents automatically each period.',
    tips: [
      'Create a schedule with line items; invoices generate on the cadence you set.',
      'Use "Preview" to dry-run a period before it bills, and "Run now" to issue immediately.',
      'Every generated invoice carries itemised line items.',
    ],
  },
  '/finance/billing-activation': {
    title: 'Billing activation',
    intro: 'Switch a recurring charge on or off across many units at once.',
    tips: [
      'Pick the charge, choose all units or a selection, then Activate or Deactivate.',
      '"Attach to units that don’t have it yet" sets the charge up on units that never had it.',
      'Always Preview to see how many units will change before you apply.',
    ],
  },
  '/finance/billing-runs': {
    title: 'Generate charges',
    intro: 'Issue this period’s invoices for a charge across every unit that carries it.',
    tips: [
      'Pick a charge to preview how many units will be billed vs already billed.',
      'Generating is idempotent — re-running the same period won’t double-bill.',
      '"Generate all due" issues the current period for every scheduled charge.',
    ],
  },
  '/finance/payments': {
    title: 'Payments',
    intro: 'Every payment received, with how it was allocated to invoices.',
    tips: [
      'Record a manual payment (cash/EFT) or watch online payments land automatically.',
      'Balances are derived from the ledger, so they’re always accurate.',
    ],
  },
  '/finance/late-fees': {
    title: 'Late fees',
    intro: 'Automatically surcharge overdue invoices using tiered rules.',
    tips: [
      'Define tiers (e.g. 5% after 7 days), then Preview the sweep before running it.',
      'Late fees are added as separate invoices, never by changing the original amount.',
    ],
  },
  '/payables': {
    title: 'Payables & vendors',
    intro: 'Bills your HOA owes — vendor invoices, approvals and payments.',
    tips: [
      'Capture a vendor bill, route it through approval, then pay it.',
      'Manage vendors and approval rules from the sub-pages.',
    ],
  },
  '/communications': {
    title: 'Communications',
    intro: 'Broadcast notices and emails to your residents.',
    tips: [
      'Compose a broadcast, choose the audience, and attach files if needed.',
      'Sent broadcasts appear to residents as Notices.',
    ],
  },
  '/meetings': {
    title: 'Meetings',
    intro: 'Schedule AGMs and board meetings and send calendar invites.',
    tips: [
      'Schedule a meeting (it saves as a draft), then "Send invites" to your audience.',
      'Click a meeting to read its full details and description/agenda.',
      'Past meetings can’t be re-invited — send invites before the meeting ends.',
    ],
  },
  '/violations': {
    title: 'Violations',
    intro: 'Enforce community rules with notices, fines and appeals.',
    tips: [
      'Log a violation with photo evidence, then issue notices or a fine.',
      'Fines become invoices the resident can pay online.',
    ],
  },
  '/votes': {
    title: 'Votes',
    intro: 'Run community ballots and motions.',
    tips: [
      'Create a vote with options, open it, then close to tally results.',
      'Quorum and pass thresholds are enforced automatically.',
    ],
  },
  '/surveys': {
    title: 'Surveys',
    intro: 'Collect feedback from residents.',
    tips: ['Build a survey, open it for responses, and review results.'],
  },
  '/gate': {
    title: 'Gate & access',
    intro: 'Verify visitor passes at the gate.',
    tips: ['Scan or enter a pass code to confirm a visitor is expected.'],
  },
  '/contracts': {
    title: 'Contracts & tenders',
    intro: 'Run tenders, collect vendor bids, and award contracts.',
    tips: [
      'Open a tender for bids, evaluate them in the master/detail view, then award.',
      'Confirm before opening/closing bidding — these are committee actions.',
    ],
  },
  '/documents': {
    title: 'Documents',
    intro: 'Store and share rules, minutes and contracts.',
    tips: ['Upload a document; downloads are re-signed on click so links never expire.'],
  },
  '/settings/billing-catalog': {
    title: 'Billing catalog',
    intro: 'Define the recurring charges your units can carry (water, dues, etc.).',
    tips: [
      'Create a charge with a price and term; it always uses your org currency.',
      '"Attach to new units automatically" sets it up on every new unit.',
      'Use "Add water, service charge & dues" to seed the common set.',
    ],
  },
  '/settings': {
    title: 'Settings',
    intro: 'Configure your organisation — branding, payments and billing.',
    tips: [
      'Payment configuration connects Paystack so residents can pay online.',
      'Billing catalog defines the charges your units carry.',
    ],
  },
};

const DEFAULT_ENTRY: HelpEntry = {
  title: 'HOA.africa',
  intro: 'Hi! I’m Aida, your guide. I’ll explain whatever page you’re on.',
  tips: [
    'Use the left sidebar to move between sections.',
    'Most lists are searchable, and rows are clickable to see the detail.',
    'Open me again any time from the helper button.',
  ],
};

/** Resolve the best help entry for a pathname (longest matching prefix wins). */
export function helpFor(pathname: string): HelpEntry {
  let best: { len: number; entry: HelpEntry } | null = null;
  for (const [prefix, entry] of Object.entries(HELP)) {
    if (pathname === prefix || pathname.startsWith(prefix + '/') || pathname.startsWith(prefix)) {
      if (!best || prefix.length > best.len) best = { len: prefix.length, entry };
    }
  }
  return best?.entry ?? DEFAULT_ENTRY;
}

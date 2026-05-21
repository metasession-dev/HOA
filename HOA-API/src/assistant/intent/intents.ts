/**
 * Phase 7 intent catalog. Each intent the rule-based classifier can recognize
 * has a slug, a human label, role restrictions, and a list of phrase patterns
 * (regex strings — anchored loosely with word boundaries). Adding an intent
 * here makes it dispatchable by IntentClassifier + AssistantService.
 *
 * Format: { slug, label, allowedRoles, patterns }
 *
 * `allowedRoles` is the union of roles permitted to even RECEIVE this intent's
 * result. The classifier surfaces other intents to disallowed roles as
 * `intent: 'denied'` so admins can see what residents tried to ask.
 */

export const RESIDENT_ROLES = new Set(['owner', 'tenant']);
export const ADMIN_ROLES = new Set(['hoa_admin', 'super_admin', 'property_manager']);
export const FINANCE_ROLES = new Set(['finance_officer', 'external_accountant']);
export const BOARD_ROLES = new Set(['exco_member', 'exco_chairperson']);

export type Intent = {
  slug: string;
  label: string;
  allowedRoles: ReadonlySet<string>;
  patterns: RegExp[];
};

const ANY_ROLE = new Set<string>(); // empty = no role restriction (all authed)
const ALL_RESIDENTS = RESIDENT_ROLES;
const ALL_INSIDERS = new Set<string>([
  ...ADMIN_ROLES, ...FINANCE_ROLES, ...BOARD_ROLES, ...RESIDENT_ROLES,
  'communications_manager', 'gate_security', 'maintenance_coordinator',
]);

export const INTENTS: Intent[] = [
  {
    slug: 'check_balance',
    label: 'Check outstanding balance',
    allowedRoles: ALL_RESIDENTS,
    patterns: [
      /\b(balance|owe|outstanding|how much (do |would )?i (owe|pay|due))/i,
      /\b(what.?s|whats) (my|the) balance\b/i,
    ],
  },
  {
    slug: 'list_my_invoices',
    label: 'List my recent invoices',
    allowedRoles: ALL_RESIDENTS,
    patterns: [
      /\b(my|recent|latest|last) (invoice|invoices|bills?|levies)\b/i,
      /\bshow (me )?(my )?(invoices|bills?|levies)\b/i,
    ],
  },
  {
    slug: 'create_gate_pass',
    label: 'Issue a gate pass',
    allowedRoles: new Set<string>([...ALL_RESIDENTS, ...ADMIN_ROLES]),
    patterns: [
      /\b(create|new|issue|generate|make|open) (a )?(gate )?pass\b/i,
      /\b(visitor|guest) (pass|coming|arriving)\b/i,
      /\binvit(e|ing) (a |someone )?(visitor|guest)\b/i,
    ],
  },
  {
    slug: 'list_my_gate_passes',
    label: 'List my active gate passes',
    allowedRoles: ALL_RESIDENTS,
    patterns: [
      /\b(my|active|current|upcoming) (gate ?)?passes?\b/i,
    ],
  },
  {
    slug: 'submit_request',
    label: 'Submit a maintenance request',
    allowedRoles: ALL_RESIDENTS,
    patterns: [
      /\b(submit|file|log|log a|create|raise|open) (a )?(maintenance|service|repair|fix|complaint|issue) ?(request|ticket)?\b/i,
      /\b(maintenance|service|repair|fix)\b.*\b(needed|required|please|broken)\b/i,
    ],
  },
  {
    slug: 'list_notices',
    label: 'List recent community notices',
    allowedRoles: ALL_INSIDERS,
    patterns: [
      /\b(notices?|announcements?|broadcasts?)\b/i,
      /\bwhat.?s? (new|happening|going on)\b/i,
    ],
  },
  {
    slug: 'check_arrears',
    label: 'Check arrears across estate',
    allowedRoles: new Set<string>([...ADMIN_ROLES, ...FINANCE_ROLES, ...BOARD_ROLES]),
    patterns: [
      /\b(arrears|overdue|delinquen(t|cies)|who hasn.?t paid)\b/i,
    ],
  },
  {
    slug: 'view_anomalies',
    label: 'View flagged anomalies',
    allowedRoles: new Set<string>([...ADMIN_ROLES, ...FINANCE_ROLES, ...BOARD_ROLES]),
    patterns: [
      /\b(anomal(y|ies)|alerts?|flags?|exceptions?|red flags?)\b/i,
    ],
  },
  {
    slug: 'help',
    label: 'Help / what can you do',
    allowedRoles: ANY_ROLE, // all authed
    patterns: [
      /\b(help|what can (you|i) do|how do i)\b/i,
    ],
  },
  {
    slug: 'greeting',
    label: 'Greeting',
    allowedRoles: ANY_ROLE,
    patterns: [
      /^\s*(hi|hello|hey|good (morning|afternoon|evening))\b/i,
    ],
  },
];

/**
 * Find the highest-confidence intent for a free-text message. We score by
 * "first pattern that matches" + a tiny boost for shorter slugs that match
 * earlier text. For now, simple "first match wins, scored by position" is
 * enough — fancier scoring waits until we have real LLM confidence numbers.
 */
export function classifyByRules(text: string): { intent: Intent; confidence: number } | null {
  if (!text || text.length > 1000) return null;
  for (const intent of INTENTS) {
    for (const p of intent.patterns) {
      const m = text.match(p);
      if (m) {
        // Confidence: higher if the match starts near the beginning + covers
        // a larger fraction of the text. Capped at 0.9 — only LLMs claim >0.9.
        const coverage = Math.min(0.9, (m[0].length / Math.max(1, text.length)) * 1.5);
        const positional = m.index !== undefined ? Math.max(0, 1 - m.index / 60) : 0.5;
        const score = 0.4 + 0.3 * coverage + 0.2 * positional;
        return { intent, confidence: Math.min(0.9, score) };
      }
    }
  }
  return null;
}

export function findIntent(slug: string): Intent | undefined {
  return INTENTS.find((i) => i.slug === slug);
}

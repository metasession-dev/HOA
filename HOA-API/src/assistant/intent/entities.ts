/**
 * Lightweight entity extraction over user text. The goal is high-precision
 * deterministic structure recovery for the obvious fields we route on
 * (amounts, dates, unit numbers, durations). Phase 7 keeps this rule-based;
 * Phase 7.2 plans an ML extractor — wire that as a fallback later.
 *
 * All extractors return arrays so multi-entity queries ("R500 + R250") work.
 */

export type Entities = {
  amounts: Array<{ value: number; currency: string; rawText: string }>;
  dates: Array<{ iso: string; rawText: string }>;
  unitNumbers: string[];
  durations: Array<{ minutes: number; rawText: string }>;
  emails: string[];
  phones: string[];
};

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export function extractEntities(text: string): Entities {
  if (!text) {
    return { amounts: [], dates: [], unitNumbers: [], durations: [], emails: [], phones: [] };
  }
  const lc = text;

  return {
    amounts: extractAmounts(lc),
    dates: extractDates(lc),
    unitNumbers: extractUnitNumbers(lc),
    durations: extractDurations(lc),
    emails: extractEmails(lc),
    phones: extractPhones(lc),
  };
}

function extractAmounts(text: string): Entities['amounts'] {
  const out: Entities['amounts'] = [];
  // Catches: R 1,000.50 / R1000 / ZAR 250 / USD 50.00 / 500 rand / $20
  const re = /(?:(R|ZAR|USD|EUR|GBP|NGN|KES|GHS|XOF|\$)\s?)?([0-9]{1,3}(?:[ ,][0-9]{3})*(?:\.[0-9]{1,2})?|\d+(?:\.\d{1,2})?)\s?(?:(rand|naira|shilling|cedis?|dollars?|euros?|pounds?))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!m[1] && !m[3]) continue; // require a currency hint to avoid false positives on stray numbers
    const value = parseFloat((m[2] || '').replace(/[ ,]/g, ''));
    if (!Number.isFinite(value)) continue;
    const symbol = (m[1] || '').toUpperCase();
    const word = (m[3] || '').toLowerCase();
    const currency = symbol === '$' ? 'USD' : symbol === 'R' ? 'ZAR' : symbol
      || ({ rand: 'ZAR', naira: 'NGN', shilling: 'KES', cedi: 'GHS', cedis: 'GHS', dollar: 'USD', dollars: 'USD', euro: 'EUR', euros: 'EUR', pound: 'GBP', pounds: 'GBP' } as any)[word] || 'ZAR';
    out.push({ value, currency, rawText: m[0].trim() });
  }
  return out;
}

function extractDates(text: string): Entities['dates'] {
  const out: Entities['dates'] = [];
  const now = new Date();

  // Relative
  const rels: Array<{ re: RegExp; offsetDays: number }> = [
    { re: /\btoday\b/i, offsetDays: 0 },
    { re: /\btomorrow\b/i, offsetDays: 1 },
    { re: /\byesterday\b/i, offsetDays: -1 },
    { re: /\bnext week\b/i, offsetDays: 7 },
    { re: /\bnext month\b/i, offsetDays: 30 },
  ];
  for (const r of rels) {
    const m = text.match(r.re);
    if (m) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() + r.offsetDays);
      out.push({ iso: d.toISOString().slice(0, 10), rawText: m[0] });
    }
  }
  // "Monday/Friday this week or next"
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    const r = new RegExp(`\\b(this |next )?(${days[i]})\\b`, 'i');
    const m = text.match(r);
    if (m) {
      const target = i;
      const today = now.getUTCDay();
      let diff = (target - today + 7) % 7;
      if (diff === 0) diff = 7; // "monday" said on monday → next monday
      if (/next/i.test(m[1] || '')) diff += diff === 7 ? 0 : 7;
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() + diff);
      out.push({ iso: d.toISOString().slice(0, 10), rawText: m[0] });
    }
  }
  // ISO yyyy-mm-dd
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) out.push({ iso: `${iso[1]}-${iso[2]}-${iso[3]}`, rawText: iso[0] });

  // "12 May" / "May 12" — try to anchor to current year
  for (let i = 0; i < MONTHS.length; i++) {
    const monthRe = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS[i]})\\b|\\b(${MONTHS[i]})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i');
    const m = text.match(monthRe);
    if (m) {
      const day = parseInt(m[1] || m[4], 10);
      const year = now.getUTCFullYear();
      const iso = new Date(Date.UTC(year, i, day)).toISOString().slice(0, 10);
      out.push({ iso, rawText: m[0] });
    }
  }
  return dedupe(out, (a, b) => a.iso === b.iso);
}

function extractUnitNumbers(text: string): string[] {
  // "Unit 12", "unit B14", "block A flat 3"
  const out = new Set<string>();
  const re1 = /\bunit\s*([A-Z]?\d{1,4}[A-Z]?)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re1.exec(text)) !== null) out.add(m[1].toUpperCase());
  const re2 = /\bblock\s+([A-Z])\s+(flat|unit|apt|apartment)\s+(\d{1,4}[A-Z]?)\b/gi;
  while ((m = re2.exec(text)) !== null) out.add(`${m[1]}-${m[3].toUpperCase()}`);
  return Array.from(out);
}

function extractDurations(text: string): Entities['durations'] {
  const out: Entities['durations'] = [];
  const re = /\b(\d{1,3})\s?(hour|hr|minute|min|day|week)s?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = parseInt(m[1], 10);
    const unit = m[2].toLowerCase();
    let minutes = n;
    if (/hour|hr/.test(unit)) minutes = n * 60;
    else if (/day/.test(unit)) minutes = n * 60 * 24;
    else if (/week/.test(unit)) minutes = n * 60 * 24 * 7;
    out.push({ minutes, rawText: m[0] });
  }
  return out;
}

function extractEmails(text: string): string[] {
  return Array.from(new Set((text.match(/\b[^\s@]{1,64}@[^\s@]+\.[a-z]{2,}\b/gi) || []).map((e) => e.toLowerCase())));
}

function extractPhones(text: string): string[] {
  // Permissive: 7+ digits with optional '+', spaces, dashes. Strip noise to normalize.
  const out = new Set<string>();
  const re = /\+?\d[\d\s\-()]{6,}\d/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const digits = m[0].replace(/[^\d+]/g, '');
    if (digits.replace('+', '').length >= 7) out.add(digits);
  }
  return Array.from(out);
}

function dedupe<T>(arr: T[], eq: (a: T, b: T) => boolean): T[] {
  const out: T[] = [];
  for (const x of arr) if (!out.some((y) => eq(x, y))) out.push(x);
  return out;
}

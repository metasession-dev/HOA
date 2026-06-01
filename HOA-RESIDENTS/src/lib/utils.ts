import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Module-level org settings cache. The OrgSettingsProvider sets these on
 * login so every legacy `formatCurrency(amount)` call automatically picks up
 * the right currency + timezone — kept in sync with the admin app's util.
 */
// Platform defaults when the org hasn't set them yet — USD (never ZAR/R),
// Africa/Lagos, English.
let _orgCurrency = 'USD';
let _orgTimezone = 'Africa/Lagos';
let _orgLanguage = 'en';

export function setOrgSettings(opts: { currency?: string; timezone?: string; language?: string }) {
  if (opts.currency) _orgCurrency = opts.currency;
  if (opts.timezone) _orgTimezone = opts.timezone;
  if (opts.language) _orgLanguage = opts.language;
}

export function getOrgCurrency() { return _orgCurrency; }
export function getOrgTimezone() { return _orgTimezone; }
export function getOrgLanguage() { return _orgLanguage; }

export function formatCurrency(amount: number | string, currency?: string) {
  const code = currency || _orgCurrency;
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) return `${code} —`;
  const symbols: Record<string, string> = {
    ZAR: 'R', NGN: '₦', KES: 'KSh', GHS: 'GH₵', USD: '$', EUR: '€', GBP: '£',
    XOF: 'CFA', XAF: 'FCFA', EGP: 'E£', MAD: 'DH', TZS: 'TSh', UGX: 'USh',
    RWF: 'RF', ETB: 'Br', ZMW: 'ZK',
  };
  const symbol = symbols[code] || `${code} `;
  return `${symbol}${value.toLocaleString(_orgLanguage || 'en', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(date: string | Date, opts: { timezone?: string; locale?: string } = {}) {
  const tz = opts.timezone || _orgTimezone;
  const locale = opts.locale || _orgLanguage || 'en';
  return new Date(date).toLocaleDateString(locale, {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: tz,
  });
}

export function formatDateTime(date: string | Date, opts: { timezone?: string; locale?: string } = {}) {
  const tz = opts.timezone || _orgTimezone;
  const locale = opts.locale || _orgLanguage || 'en';
  return new Date(date).toLocaleString(locale, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: tz,
  });
}

export function getInitials(firstName: string, lastName: string) {
  return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
}

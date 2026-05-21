/**
 * African ISO-4217 currencies + major reference currencies used as quote pairs.
 *
 * `region` groups the dropdown into "African currencies" first then
 * "Reference" so an HOA admin doesn't have to scroll past USD/EUR to find
 * their local currency.
 *
 * `country` is the ISO-3166 alpha-2 of the country/zone the currency
 * primarily serves — used to render a flag emoji prefix in the select.
 */
export interface CurrencyEntry {
  code: string;       // ISO-4217
  name: string;       // English name
  symbol: string;     // common symbol or short prefix
  country: string;    // ISO-3166-1 alpha-2 for flag rendering
  region: 'african' | 'reference';
}

export const CURRENCIES: CurrencyEntry[] = [
  // North Africa
  { code: 'DZD', name: 'Algerian Dinar',                  symbol: 'DA',   country: 'DZ', region: 'african' },
  { code: 'EGP', name: 'Egyptian Pound',                  symbol: 'E£',   country: 'EG', region: 'african' },
  { code: 'LYD', name: 'Libyan Dinar',                    symbol: 'LD',   country: 'LY', region: 'african' },
  { code: 'MAD', name: 'Moroccan Dirham',                 symbol: 'DH',   country: 'MA', region: 'african' },
  { code: 'SDG', name: 'Sudanese Pound',                  symbol: 'SDG',  country: 'SD', region: 'african' },
  { code: 'SSP', name: 'South Sudanese Pound',            symbol: 'SSP',  country: 'SS', region: 'african' },
  { code: 'TND', name: 'Tunisian Dinar',                  symbol: 'DT',   country: 'TN', region: 'african' },

  // West Africa
  { code: 'CVE', name: 'Cape Verdean Escudo',             symbol: '$',    country: 'CV', region: 'african' },
  { code: 'GHS', name: 'Ghanaian Cedi',                   symbol: 'GH₵',  country: 'GH', region: 'african' },
  { code: 'GMD', name: 'Gambian Dalasi',                  symbol: 'D',    country: 'GM', region: 'african' },
  { code: 'GNF', name: 'Guinean Franc',                   symbol: 'FG',   country: 'GN', region: 'african' },
  { code: 'LRD', name: 'Liberian Dollar',                 symbol: 'L$',   country: 'LR', region: 'african' },
  { code: 'MRU', name: 'Mauritanian Ouguiya',             symbol: 'UM',   country: 'MR', region: 'african' },
  { code: 'NGN', name: 'Nigerian Naira',                  symbol: '₦',    country: 'NG', region: 'african' },
  { code: 'SLE', name: 'Sierra Leonean Leone',            symbol: 'Le',   country: 'SL', region: 'african' },
  { code: 'STN', name: 'São Tomé and Príncipe Dobra',     symbol: 'Db',   country: 'ST', region: 'african' },
  { code: 'XOF', name: 'West African CFA Franc',          symbol: 'CFA',  country: 'SN', region: 'african' },

  // Central Africa
  { code: 'AOA', name: 'Angolan Kwanza',                  symbol: 'Kz',   country: 'AO', region: 'african' },
  { code: 'CDF', name: 'Congolese Franc',                 symbol: 'FC',   country: 'CD', region: 'african' },
  { code: 'XAF', name: 'Central African CFA Franc',       symbol: 'FCFA', country: 'CM', region: 'african' },

  // East Africa
  { code: 'BIF', name: 'Burundian Franc',                 symbol: 'FBu',  country: 'BI', region: 'african' },
  { code: 'DJF', name: 'Djiboutian Franc',                symbol: 'Fdj',  country: 'DJ', region: 'african' },
  { code: 'ERN', name: 'Eritrean Nakfa',                  symbol: 'Nfk',  country: 'ER', region: 'african' },
  { code: 'ETB', name: 'Ethiopian Birr',                  symbol: 'Br',   country: 'ET', region: 'african' },
  { code: 'KES', name: 'Kenyan Shilling',                 symbol: 'KSh',  country: 'KE', region: 'african' },
  { code: 'KMF', name: 'Comorian Franc',                  symbol: 'CF',   country: 'KM', region: 'african' },
  { code: 'MGA', name: 'Malagasy Ariary',                 symbol: 'Ar',   country: 'MG', region: 'african' },
  { code: 'MUR', name: 'Mauritian Rupee',                 symbol: '₨',    country: 'MU', region: 'african' },
  { code: 'RWF', name: 'Rwandan Franc',                   symbol: 'FRw',  country: 'RW', region: 'african' },
  { code: 'SCR', name: 'Seychellois Rupee',               symbol: '₨',    country: 'SC', region: 'african' },
  { code: 'SOS', name: 'Somali Shilling',                 symbol: 'Sh',   country: 'SO', region: 'african' },
  { code: 'TZS', name: 'Tanzanian Shilling',              symbol: 'TSh',  country: 'TZ', region: 'african' },
  { code: 'UGX', name: 'Ugandan Shilling',                symbol: 'USh',  country: 'UG', region: 'african' },

  // Southern Africa
  { code: 'BWP', name: 'Botswana Pula',                   symbol: 'P',    country: 'BW', region: 'african' },
  { code: 'LSL', name: 'Lesotho Loti',                    symbol: 'L',    country: 'LS', region: 'african' },
  { code: 'MWK', name: 'Malawian Kwacha',                 symbol: 'MK',   country: 'MW', region: 'african' },
  { code: 'MZN', name: 'Mozambican Metical',              symbol: 'MT',   country: 'MZ', region: 'african' },
  { code: 'NAD', name: 'Namibian Dollar',                 symbol: 'N$',   country: 'NA', region: 'african' },
  { code: 'SZL', name: 'Eswatini Lilangeni',              symbol: 'L',    country: 'SZ', region: 'african' },
  { code: 'ZAR', name: 'South African Rand',              symbol: 'R',    country: 'ZA', region: 'african' },
  { code: 'ZMW', name: 'Zambian Kwacha',                  symbol: 'ZK',   country: 'ZM', region: 'african' },
  { code: 'ZWG', name: 'Zimbabwe Gold',                   symbol: 'ZiG',  country: 'ZW', region: 'african' },

  // Reference currencies (most-quoted bases for daily rates)
  { code: 'USD', name: 'US Dollar',                       symbol: '$',    country: 'US', region: 'reference' },
  { code: 'EUR', name: 'Euro',                            symbol: '€',    country: 'EU', region: 'reference' },
  { code: 'GBP', name: 'British Pound',                   symbol: '£',    country: 'GB', region: 'reference' },
  { code: 'CNY', name: 'Chinese Yuan',                    symbol: '¥',    country: 'CN', region: 'reference' },
  { code: 'CHF', name: 'Swiss Franc',                     symbol: 'CHF',  country: 'CH', region: 'reference' },
  { code: 'AED', name: 'UAE Dirham',                      symbol: 'AED',  country: 'AE', region: 'reference' },
  { code: 'SAR', name: 'Saudi Riyal',                     symbol: 'SAR',  country: 'SA', region: 'reference' },
];

/** Convenience indexes for fast lookup. */
export const CURRENCY_BY_CODE: Record<string, CurrencyEntry> = Object.fromEntries(
  CURRENCIES.map((c) => [c.code, c]),
);

export const AFRICAN_CURRENCIES: CurrencyEntry[] = CURRENCIES.filter((c) => c.region === 'african');
export const REFERENCE_CURRENCIES: CurrencyEntry[] = CURRENCIES.filter((c) => c.region === 'reference');

/**
 * Country code → flag emoji. Most browsers render the regional indicator
 * pair correctly; falls back to "🌍" for unknown codes.
 */
export function flagFor(country: string): string {
  if (country.length !== 2) return '🌍';
  const codePoints = country.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0));
  try {
    return String.fromCodePoint(...codePoints);
  } catch {
    return '🌍';
  }
}

/** Render-ready label like "🇿🇦 ZAR — South African Rand". */
export function currencyLabel(c: CurrencyEntry): string {
  return `${flagFor(c.country)} ${c.code} — ${c.name}`;
}

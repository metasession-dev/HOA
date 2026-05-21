/**
 * Canonical Africa/* IANA timezone list, grouped by region for the settings
 * dropdown. Sourced from the IANA tzdata 2024a release; new zones (e.g.
 * Africa/Sao_Tome being moved from WAT to GMT) update automatically through
 * the runtime's Intl.DateTimeFormat — the list itself is stable.
 *
 * Each entry exposes a friendly label (city + offset) so the dropdown shows
 * "Johannesburg (UTC+2)" rather than the bare zone id.
 */

export interface AfricaTimezone {
  id: string;     // e.g. "Africa/Johannesburg"
  city: string;   // e.g. "Johannesburg"
  region: string; // e.g. "Southern Africa"
}

export const AFRICA_TIMEZONES: AfricaTimezone[] = [
  // North Africa (UTC+0 to +2)
  { id: 'Africa/Cairo',        city: 'Cairo',        region: 'North Africa' },
  { id: 'Africa/Casablanca',   city: 'Casablanca',   region: 'North Africa' },
  { id: 'Africa/El_Aaiun',     city: 'El Aaiún',     region: 'North Africa' },
  { id: 'Africa/Algiers',      city: 'Algiers',      region: 'North Africa' },
  { id: 'Africa/Tunis',        city: 'Tunis',        region: 'North Africa' },
  { id: 'Africa/Tripoli',      city: 'Tripoli',      region: 'North Africa' },
  { id: 'Africa/Khartoum',     city: 'Khartoum',     region: 'North Africa' },
  { id: 'Africa/Juba',         city: 'Juba',         region: 'North Africa' },

  // West Africa (UTC+0 / +1)
  { id: 'Africa/Lagos',        city: 'Lagos',        region: 'West Africa' },
  { id: 'Africa/Accra',        city: 'Accra',        region: 'West Africa' },
  { id: 'Africa/Abidjan',      city: 'Abidjan',      region: 'West Africa' },
  { id: 'Africa/Dakar',        city: 'Dakar',        region: 'West Africa' },
  { id: 'Africa/Bamako',       city: 'Bamako',       region: 'West Africa' },
  { id: 'Africa/Ouagadougou',  city: 'Ouagadougou',  region: 'West Africa' },
  { id: 'Africa/Conakry',      city: 'Conakry',      region: 'West Africa' },
  { id: 'Africa/Bissau',       city: 'Bissau',       region: 'West Africa' },
  { id: 'Africa/Banjul',       city: 'Banjul',       region: 'West Africa' },
  { id: 'Africa/Freetown',     city: 'Freetown',     region: 'West Africa' },
  { id: 'Africa/Monrovia',     city: 'Monrovia',     region: 'West Africa' },
  { id: 'Africa/Nouakchott',   city: 'Nouakchott',   region: 'West Africa' },
  { id: 'Africa/Lome',         city: 'Lomé',         region: 'West Africa' },
  { id: 'Africa/Porto-Novo',   city: 'Porto-Novo',   region: 'West Africa' },
  { id: 'Africa/Niamey',       city: 'Niamey',       region: 'West Africa' },
  { id: 'Africa/Sao_Tome',     city: 'São Tomé',     region: 'West Africa' },

  // Central Africa (UTC+1 / +2)
  { id: 'Africa/Douala',       city: 'Douala',       region: 'Central Africa' },
  { id: 'Africa/Brazzaville',  city: 'Brazzaville',  region: 'Central Africa' },
  { id: 'Africa/Kinshasa',     city: 'Kinshasa',     region: 'Central Africa' },
  { id: 'Africa/Lubumbashi',   city: 'Lubumbashi',   region: 'Central Africa' },
  { id: 'Africa/Bangui',       city: 'Bangui',       region: 'Central Africa' },
  { id: 'Africa/Libreville',   city: 'Libreville',   region: 'Central Africa' },
  { id: 'Africa/Malabo',       city: 'Malabo',       region: 'Central Africa' },
  { id: 'Africa/Ndjamena',     city: "N'Djamena",    region: 'Central Africa' },
  { id: 'Africa/Luanda',       city: 'Luanda',       region: 'Central Africa' },

  // East Africa (UTC+3)
  { id: 'Africa/Nairobi',      city: 'Nairobi',      region: 'East Africa' },
  { id: 'Africa/Dar_es_Salaam',city: 'Dar es Salaam',region: 'East Africa' },
  { id: 'Africa/Kampala',      city: 'Kampala',      region: 'East Africa' },
  { id: 'Africa/Kigali',       city: 'Kigali',       region: 'East Africa' },
  { id: 'Africa/Bujumbura',    city: 'Bujumbura',    region: 'East Africa' },
  { id: 'Africa/Addis_Ababa',  city: 'Addis Ababa',  region: 'East Africa' },
  { id: 'Africa/Asmara',       city: 'Asmara',       region: 'East Africa' },
  { id: 'Africa/Djibouti',     city: 'Djibouti',     region: 'East Africa' },
  { id: 'Africa/Mogadishu',    city: 'Mogadishu',    region: 'East Africa' },
  { id: 'Indian/Comoro',       city: 'Moroni',       region: 'East Africa' },
  { id: 'Indian/Antananarivo', city: 'Antananarivo', region: 'East Africa' },
  { id: 'Indian/Mauritius',    city: 'Port Louis',   region: 'East Africa' },
  { id: 'Indian/Mayotte',      city: 'Mamoudzou',    region: 'East Africa' },
  { id: 'Indian/Reunion',      city: 'Saint-Denis',  region: 'East Africa' },
  { id: 'Indian/Mahe',         city: 'Victoria',     region: 'East Africa' },

  // Southern Africa (UTC+2)
  { id: 'Africa/Johannesburg', city: 'Johannesburg', region: 'Southern Africa' },
  { id: 'Africa/Maputo',       city: 'Maputo',       region: 'Southern Africa' },
  { id: 'Africa/Harare',       city: 'Harare',       region: 'Southern Africa' },
  { id: 'Africa/Lusaka',       city: 'Lusaka',       region: 'Southern Africa' },
  { id: 'Africa/Blantyre',     city: 'Blantyre',     region: 'Southern Africa' },
  { id: 'Africa/Gaborone',     city: 'Gaborone',     region: 'Southern Africa' },
  { id: 'Africa/Mbabane',      city: 'Mbabane',      region: 'Southern Africa' },
  { id: 'Africa/Maseru',       city: 'Maseru',       region: 'Southern Africa' },
  { id: 'Africa/Windhoek',     city: 'Windhoek',     region: 'Southern Africa' },
];

/** Format a zone as `"City (UTC+2)"` using the runtime's Intl support. */
export function formatTimezoneLabel(tz: AfricaTimezone): string {
  let offset = '';
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz.id, timeZoneName: 'shortOffset' });
    const part = fmt.formatToParts(new Date()).find((p) => p.type === 'timeZoneName');
    offset = part?.value ? ` (${part.value.replace(/^GMT/, 'UTC')})` : '';
  } catch {
    /* Older Node.js may not support shortOffset; fall back to no suffix. */
  }
  return `${tz.city}${offset}`;
}

export const AFRICA_REGIONS: string[] = Array.from(
  new Set(AFRICA_TIMEZONES.map((z) => z.region)),
);

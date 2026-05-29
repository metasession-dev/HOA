import { redirect } from 'next/navigation';

// Estates management has been folded into the single Units page — an enterprise
// has exactly one estate (set at sign-up), so a separate estates surface was
// redundant. Old links land on Units.
export default function EstatesPage() {
  redirect('/admin/units');
}

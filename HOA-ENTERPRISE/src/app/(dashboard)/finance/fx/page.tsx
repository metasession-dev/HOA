import { redirect } from 'next/navigation';

// Exchange-rates management has been retired from the console. Any old links
// land on the finance reports overview.
export default function FxPage() {
  redirect('/finance/reports');
}

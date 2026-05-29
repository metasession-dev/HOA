import { redirect } from 'next/navigation';

// The per-estate detail (with its own unit add/manage drawers) is superseded by
// the Units page, which is the single place to manage units. Redirect any old
// estate-detail links to it.
export default function EstateDetailPage() {
  redirect('/admin/units');
}

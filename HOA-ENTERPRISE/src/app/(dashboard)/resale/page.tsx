import { redirect } from 'next/navigation';

// Resale documents are temporarily removed from the console. Existing
// certificates remain accessible by direct link (/resale/[id]); the list and
// creation entry points redirect to the dashboard for now.
export default function ResalePage() {
  redirect('/admin');
}

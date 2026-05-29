import { redirect } from 'next/navigation';

// Resale documents are temporarily removed from the console — new resale
// certificates can't be created for now.
export default function NewResalePage() {
  redirect('/admin');
}

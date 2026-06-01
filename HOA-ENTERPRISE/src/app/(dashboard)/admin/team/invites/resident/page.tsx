import { redirect } from 'next/navigation';

// Resident invites moved to the People domain to keep staff and resident
// invitations clearly separated. Preserve old links/bookmarks.
export default function MovedResidentInvitePage() {
  redirect('/admin/people/invites/new');
}

'use client';

import { useParams } from 'next/navigation';
import { TenderForm } from '@/components/tender-form';

export default function EditTenderPage() {
  const { id } = useParams<{ id: string }>();
  return <TenderForm tenderId={id} />;
}

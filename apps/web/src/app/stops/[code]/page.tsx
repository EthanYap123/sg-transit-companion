import type { Metadata } from 'next';
import { StopArrivalsView } from '@/components/StopArrivalsView';

interface Props {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  return { title: `Stop ${code} arrivals · SG Transit Companion` };
}

export default async function StopPage({ params }: Props) {
  const { code } = await params;
  return <StopArrivalsView key={code} code={code} />;
}

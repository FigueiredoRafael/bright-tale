import { IdeaPageClient } from './page.client';

export const metadata = {
  title: 'Idea | BrightCurios',
  description: 'Idea detail and actions',
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <IdeaPageClient ideaId={id} />;
}

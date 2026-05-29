import { redirect } from 'next/navigation';

export default async function DocumentRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = process.env.NEXT_PUBLIC_API_URL ?? '';
  const docsBase = api.replace('portal.', 'docs.').replace(/\/api$/, '');
  redirect(`${docsBase}/documents/${id}/`);
}

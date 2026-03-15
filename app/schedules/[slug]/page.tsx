import { SchedulePage } from "@/components/schedule-page";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <SchedulePage slug={slug} />;
}

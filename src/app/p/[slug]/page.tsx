import { GroupApp } from "@/components/group/GroupApp";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <GroupApp slug={slug} />;
}

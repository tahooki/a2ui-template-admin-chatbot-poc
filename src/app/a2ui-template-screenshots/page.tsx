import { A2UITemplateScreenshotLab } from "@/features/a2ui-template-poc/screenshot-lab";

type SearchParams = Promise<{ shot?: string | string[] }>;

export default async function A2UITemplateScreenshotsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const shot = Array.isArray(params.shot) ? params.shot[0] : params.shot;
  return <A2UITemplateScreenshotLab shotId={shot ?? null} />;
}

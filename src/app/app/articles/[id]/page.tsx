import { Suspense } from "react";
import { ArticleEditor } from "@/components/editor/editor";
import { aiMode } from "@/lib/ai/run";
import { loadBundle } from "@/lib/server/load-article";

export const metadata = { title: "記事エディタ" };

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { viewer, bundle } = await loadBundle(id);
  return (
    <Suspense>
      <ArticleEditor
        key={bundle.article.id}
        bundle={bundle}
        ctx={{ role: viewer.role, tenantSlug: viewer.tenant.slug, tenantName: viewer.tenant.name, aiProvider: aiMode().provider }}
      />
    </Suspense>
  );
}

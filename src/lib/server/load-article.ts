import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import type { EditorBundle } from "@/components/editor/types";
import { requireTenantViewer } from "@/lib/auth/session";
import { getArticleBundle } from "./articles";
import { ApiError } from "./errors";
import { plain } from "./serialize";

export async function loadBundle(id: string) {
  const viewer = await requireTenantViewer();
  if (!z.string().uuid().safeParse(id).success) notFound();
  try {
    return { viewer, bundle: plain<EditorBundle>(await getArticleBundle(viewer, id)) };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}

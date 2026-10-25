/** RLS context for a viewer. Kept free of Next.js request APIs so background jobs can use it too. */
export function dbCtx(v: { userId: string; tenant?: { id: string } | null }) {
  return { userId: v.userId, tenantId: v.tenant?.id ?? null };
}

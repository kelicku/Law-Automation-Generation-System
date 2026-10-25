/** Converts DB rows (Dates, bigint-free) into plain JSON for client components. */
export function plain<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

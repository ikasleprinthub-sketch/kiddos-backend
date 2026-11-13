/**
 * Read ?page= and ?limit= safely. Missing, non-numeric or negative values fall back to the defaults,
 * and limit is capped so one request can't ask the database for an unbounded number of rows.
 */
export function parsePagination(
  searchParams: URLSearchParams,
  { defaultLimit = 20, maxLimit = 100 }: { defaultLimit?: number; maxLimit?: number } = {}
) {
  const rawPage = Number.parseInt(searchParams.get("page") || "", 10);
  const rawLimit = Number.parseInt(searchParams.get("limit") || "", 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.min(rawPage, 100000) : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.min(rawLimit, maxLimit) : defaultLimit;
  return { page, limit, skip: (page - 1) * limit };
}

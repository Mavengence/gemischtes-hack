import type { APIRoute } from "astro";
import { supabase } from "@/lib/supabase";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 100);
  const search = url.searchParams.get("q");
  const offset = (page - 1) * limit;

  let query = supabase
    .from("episodes")
    .select("*", { count: "exact" })
    .order("pub_date", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      episodes: data,
      total: count,
      page,
      limit,
      pages: Math.ceil((count ?? 0) / limit),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};

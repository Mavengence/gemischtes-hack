import type { APIRoute } from "astro";
import { supabase } from "@/lib/supabase";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const { data: episodes, error } = await supabase
      .from("episodes")
      .select("episode_number, title, pub_date, duration_seconds")
      .order("pub_date", { ascending: true });

    if (error) throw error;

    // Group by year
    const byYear = new Map<number, { count: number; totalMinutes: number; avgMinutes: number }>();
    for (const ep of episodes ?? []) {
      const year = new Date(ep.pub_date).getFullYear();
      const existing = byYear.get(year) ?? { count: 0, totalMinutes: 0, avgMinutes: 0 };
      existing.count++;
      existing.totalMinutes += Math.round(ep.duration_seconds / 60);
      byYear.set(year, existing);
    }

    for (const [, stats] of byYear) {
      stats.avgMinutes = Math.round(stats.totalMinutes / stats.count);
    }

    const yearStats = Array.from(byYear.entries())
      .map(([year, stats]) => ({ year, ...stats }))
      .sort((a, b) => a.year - b.year);

    // Episode duration timeline (all episodes)
    const timeline = (episodes ?? []).map((ep) => ({
      episode_number: ep.episode_number,
      title: ep.title,
      pub_date: ep.pub_date,
      minutes: Math.round(ep.duration_seconds / 60),
    }));

    return new Response(
      JSON.stringify({ yearStats, timeline }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stats fetch failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

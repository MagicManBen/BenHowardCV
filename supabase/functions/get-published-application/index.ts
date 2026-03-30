// supabase/functions/get-published-application/index.ts
//
// Edge Function: accepts a `ref` query parameter, returns one published
// application record. Uses the service_role key server-side so that
// public/anonymous callers never need direct table access.
//
// No Supabase secrets beyond the built-in SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are needed.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Only return the fields needed by cv.html — never expose raw_job_advert etc.
const PUBLIC_FIELDS = [
  "ref",
  "company_name",
  "role_title",
  "location",
  "sector",
  "salary",
  "employment_type",
  "short_company_reason",
  "short_role_reason",
  "tone_keywords",
  "probable_priorities",
  "advert_summary",
  "personalised_intro",
  "why_this_role",
  "key_focus_areas",
].join(",");

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const ref = (url.searchParams.get("ref") || "").trim().toLowerCase();

  if (!ref) {
    return new Response(JSON.stringify({ error: "Missing ref parameter" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validate ref format — only allow URL-safe characters
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(ref) && !/^[a-z0-9]$/.test(ref)) {
    return new Response(JSON.stringify({ error: "Invalid ref format" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Use service_role key to bypass RLS (this function is the gatekeeper)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data, error } = await supabase
      .from("applications")
      .select(PUBLIC_FIELDS)
      .eq("ref", ref)
      .eq("is_published", true)
      .maybeSingle();

    if (error) {
      console.error("Supabase query error:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch application" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!data) {
      return new Response(JSON.stringify({ error: "Application not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Transform snake_case DB columns to camelCase for the frontend
    const application = {
      ref: data.ref,
      companyName: data.company_name,
      roleTitle: data.role_title,
      location: data.location,
      sector: data.sector,
      salary: data.salary,
      employmentType: data.employment_type,
      shortCompanyReason: data.short_company_reason,
      shortRoleReason: data.short_role_reason,
      toneKeywords: data.tone_keywords || [],
      probablePriorities: data.probable_priorities || [],
      advertSummary: data.advert_summary,
      personalisedIntro: data.personalised_intro,
      whyThisRole: data.why_this_role,
      keyFocusAreas: data.key_focus_areas || [],
    };

    return new Response(JSON.stringify({ data: application }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("Edge function error:", message);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// supabase/functions/extract-job-advert/index.ts
//
// Edge Function: accepts raw job advert text, calls OpenAI server-side,
// returns structured personalisation JSON.
//
// Supabase secrets required:
//   OPENAI_API_KEY — your OpenAI API key (set via `supabase secrets set`)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";

const EXTRACTION_SYSTEM_PROMPT = [
  "You extract structured personalisation data from a job advert for a personalised CV page.",
  "Return JSON only.",
  "Never wrap the JSON in markdown or code fences.",
  "Use this exact schema:",
  "{",
  '  "ref": "",',
  '  "companyName": "",',
  '  "roleTitle": "",',
  '  "location": "",',
  '  "sector": "",',
  '  "salary": "",',
  '  "employmentType": "",',
  '  "shortCompanyReason": "",',
  '  "shortRoleReason": "",',
  '  "toneKeywords": [],',
  '  "probablePriorities": [],',
  '  "advertSummary": "",',
  '  "slug": "",',
  '  "personalisedIntro": "",',
  '  "whyThisRole": "",',
  '  "keyFocusAreas": []',
  "}",
  "Rules:",
  "- ref: lowercase URL-friendly reference, usually matching slug",
  "- companyName: employer or organisation name",
  "- roleTitle: job title",
  "- location: best available location string",
  "- sector: inferred sector if obvious, otherwise empty string",
  "- salary: short salary string if present, otherwise empty string",
  "- employmentType: full-time / part-time / permanent / fixed-term etc if present",
  "- shortCompanyReason: one short line explaining why the company may appeal to a candidate",
  "- shortRoleReason: one short line explaining why the role may appeal to a candidate with operations / transformation / leadership strengths",
  "- toneKeywords: 3 to 6 short descriptive words if clear, otherwise []",
  "- probablePriorities: 3 to 6 likely employer priorities inferred from the advert if clear, otherwise []",
  "- advertSummary: concise summary in 1 to 3 sentences",
  "- slug: lowercase URL-friendly hyphenated slug based on company + role + location",
  "- personalisedIntro: a short first-person intro paragraph for a tailored CV page",
  "- whyThisRole: a short first-person paragraph explaining why the role is a strong fit",
  "- keyFocusAreas: 3 to 5 short phrases for the most relevant focus areas, otherwise []",
  "- If a field is unknown, use an empty string",
  "- If list values are unclear, return []",
  "- Do not add extra keys",
].join("\n");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Parse request body
  let body: { jobAdvertText?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON request body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const jobAdvertText = typeof body.jobAdvertText === "string" ? body.jobAdvertText.trim() : "";
  if (!jobAdvertText) {
    return new Response(JSON.stringify({ error: "jobAdvertText is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Read OpenAI key from Supabase secrets (never exposed to browser)
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiApiKey) {
    return new Response(JSON.stringify({ error: "OpenAI API key is not configured on the server" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Call OpenAI
  try {
    const openaiResponse = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              "Extract personalisation data from the following job advert.",
              "Return JSON only and follow the schema exactly.",
              "",
              "Job advert text:",
              jobAdvertText,
            ].join("\n"),
          },
        ],
      }),
    });

    const openaiPayload = await openaiResponse.json();

    if (!openaiResponse.ok) {
      const apiMessage = openaiPayload?.error?.message || "OpenAI returned an error.";
      return new Response(JSON.stringify({ error: apiMessage }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content = openaiPayload?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return new Response(JSON.stringify({ error: "OpenAI returned an empty response." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse and return the structured data
    const parsed = JSON.parse(content.trim());

    return new Response(JSON.stringify({ data: parsed, raw: content }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed.";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

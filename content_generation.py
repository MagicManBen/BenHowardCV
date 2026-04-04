"""
Local content generation utilities.

Provides:
  - Advert extraction into structured application fields
  - Personalised content generation using OpenAI + evidence bank
  - A combined end-to-end local pipeline for local-admin
"""

import csv
import json
import socket
import traceback
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


# ---------------------------------------------------------------------------
# Evidence bank loading and selection
# ---------------------------------------------------------------------------

EVIDENCE_BANK_PATH = Path(__file__).resolve().parent / "ben_evidence_bank_template.csv"

# Fields used for matching from the application
APP_MATCH_FIELDS = [
    "sector", "roleTitle", "keyFocusAreas", "probablePriorities",
    "essentialRequirements", "preferredRequirements", "skillsWanted",
    "matchCategories",
]

CV_CONTEXT_FIELDS = [
    "cvText", "cvSummary", "candidateCv", "candidateCvText",
    "candidateCvSummary",
]

# Fields used for matching from each evidence row
EVIDENCE_MATCH_FIELDS = [
    "Proof Tags", "Sector Tags", "Role Tags", "Example Title",
    "Short Version", "Headline Version", "Why It Matters",
]


def load_evidence_bank():
    """Load the CSV evidence bank and return a list of row dicts."""
    if not EVIDENCE_BANK_PATH.exists():
        return [], f"Evidence bank not found at {EVIDENCE_BANK_PATH.name}"

    try:
        with open(EVIDENCE_BANK_PATH, newline="", encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            rows = list(reader)
        return rows, None
    except Exception as exc:
        return [], f"Could not read evidence bank: {exc}"


def _tokenise(text):
    """Lowercase split into meaningful tokens (len >= 3)."""
    return set(
        t for t in str(text).lower().replace(",", " ").replace(";", " ").split()
        if len(t) >= 3
    )


def _build_app_tokens(application):
    """Build a combined token set from the application's matching fields."""
    tokens = set()
    for field in APP_MATCH_FIELDS:
        val = application.get(field, "")
        if isinstance(val, list):
            for item in val:
                tokens |= _tokenise(item)
        elif isinstance(val, str):
            tokens |= _tokenise(val)
    return tokens


def _build_cv_tokens(application):
    """Build a token set from CV context fields."""
    tokens = set()
    for field in CV_CONTEXT_FIELDS:
        val = application.get(field, "")
        if isinstance(val, list):
            for item in val:
                tokens |= _tokenise(item)
        elif isinstance(val, str):
            tokens |= _tokenise(val)
    return tokens


def _build_cv_context_section(application):
    """Format any available CV context for the prompt."""
    sections = []
    for field in CV_CONTEXT_FIELDS:
        value = application.get(field, "")
        if isinstance(value, str) and value.strip():
            if field == "cvText":
                label = "CV text"
            elif field == "cvSummary":
                label = "CV summary"
            elif field == "candidateCv":
                label = "Candidate CV"
            elif field == "candidateCvText":
                label = "Candidate CV text"
            elif field == "candidateCvSummary":
                label = "Candidate CV summary"
            else:
                label = field
            sections.append(f"{label}:")
            sections.append(value.strip())
            sections.append("")
    return "\n".join(sections).strip()


def _score_evidence_row(row, app_tokens, cv_tokens=None):
    """Score a single evidence row against the application tokens.

    Returns a float. Higher = more relevant.
    """
    row_tokens = set()
    for field in EVIDENCE_MATCH_FIELDS:
        row_tokens |= _tokenise(row.get(field, ""))

    if not row_tokens or not app_tokens:
        return 0.0

    overlap = row_tokens & app_tokens
    # Jaccard-style overlap, weighted toward application coverage
    score = len(overlap) / max(len(app_tokens), 1)

    if cv_tokens:
        cv_overlap = row_tokens & cv_tokens
        cv_score = len(cv_overlap) / max(len(cv_tokens), 1)
        score = (score * 0.8) + (cv_score * 0.2)

    # Bonus for public-safe entries
    if str(row.get("Safe for Public Use?", "")).strip().lower() in ("yes", "true"):
        score += 0.05

    # Small bias toward examples with clearer proof language.
    if any(clean := str(row.get(field, "")).strip() for field in ("Metric / Number", "Headline Version", "Result / Outcome")):
        score += 0.02

    return round(score, 4)


def _split_tags(value):
    return {
        token.strip().lower()
        for token in str(value or "").replace(";", ",").replace("|", ",").split(",")
        if token.strip()
    }


def _evidence_diversity_bonus(row, seen_employers, seen_sectors, seen_proof_tags):
    """Reward rows that broaden the shortlist across context and proof type."""
    bonus = 0.0

    employer = str(row.get("Employer / Organisation", "")).strip().lower()
    sector = str(row.get("Sector", "")).strip().lower()
    proof_tags = _split_tags(row.get("Proof Tags", ""))

    if employer and employer not in seen_employers:
        bonus += 0.08
    if sector and sector not in seen_sectors:
        bonus += 0.035
    if proof_tags:
        unseen_tags = proof_tags - seen_proof_tags
        if unseen_tags:
            bonus += min(0.05, 0.015 * len(unseen_tags))

    return round(bonus, 4)


def select_evidence_examples(application, max_examples=5):
    """Select the most relevant evidence-bank examples for the application.

    Returns (selected_rows, error_message_or_none).
    Each row is the original CSV dict plus a _matchScore field.
    """
    rows, err = load_evidence_bank()
    if err:
        return [], err
    if not rows:
        return [], "Evidence bank is empty."

    app_tokens = _build_app_tokens(application)
    cv_tokens = _build_cv_tokens(application)
    if not app_tokens and not cv_tokens:
        # If application has no matching tokens, return top rows by default
        for r in rows[:max_examples]:
            r["_matchScore"] = 0.01
        return rows[:max_examples], None

    scored = []
    for row in rows:
        s = _score_evidence_row(row, app_tokens, cv_tokens)
        row["_matchScore"] = s
        scored.append((s, row))

    scored.sort(key=lambda x: x[0], reverse=True)

    # Greedy pick: stay relevant, but widen employer / sector / proof-angle variety.
    remaining = [row for _score, row in scored]
    selected = []
    seen_employers = set()
    seen_sectors = set()
    seen_proof_tags = set()

    while remaining and len(selected) < max_examples:
        best_row = None
        best_total = None
        for row in remaining:
            base_score = float(row.get("_matchScore", 0) or 0)
            total = base_score + _evidence_diversity_bonus(
                row, seen_employers, seen_sectors, seen_proof_tags,
            )
            if best_total is None or total > best_total:
                best_total = total
                best_row = row

        if best_row is None:
            break

        selected.append(best_row)
        remaining.remove(best_row)

        employer = str(best_row.get("Employer / Organisation", "")).strip().lower()
        sector = str(best_row.get("Sector", "")).strip().lower()
        proof_tags = _split_tags(best_row.get("Proof Tags", ""))
        if employer:
            seen_employers.add(employer)
        if sector:
            seen_sectors.add(sector)
        seen_proof_tags |= proof_tags

    return selected, None


def _format_evidence_for_prompt(rows):
    """Format selected evidence rows into a readable prompt section."""
    lines = []
    for i, row in enumerate(rows, 1):
        lines.append(f"Evidence Example {i}:")
        lines.append(f"  ID: {row.get('ID', '?')}")
        lines.append(f"  Title: {row.get('Example Title', '')}")
        lines.append(f"  Employer: {row.get('Employer / Organisation', '')}")
        lines.append(f"  Role: {row.get('Job Title', '')}")
        lines.append(f"  Sector: {row.get('Sector', '')}")
        lines.append(f"  Role Type: {row.get('Role Type', '')}")
        lines.append(f"  Situation: {row.get('Situation / Context', '')}")
        lines.append(f"  Problem: {row.get('Problem / Challenge', '')}")
        lines.append(f"  What I Did: {row.get('What I Did', '')}")
        lines.append(f"  Result: {row.get('Result / Outcome', '')}")
        lines.append(f"  Metric: {row.get('Metric / Number', '')}")
        lines.append(f"  Proof Tags: {row.get('Proof Tags', '')}")
        lines.append(f"  Role Tags: {row.get('Role Tags', '')}")
        lines.append(f"  Short Version: {row.get('Short Version', '')}")
        lines.append(f"  Headline Version: {row.get('Headline Version', '')}")
        lines.append(f"  Why It Matters: {row.get('Why It Matters', '')}")
        lines.append(f"  Match Score: {row.get('_matchScore', 0)}")
        lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# OpenAI structured generation
# ---------------------------------------------------------------------------

DEFAULT_OPENAI_GENERATION_MODEL = "gpt-5.4-mini"
OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses"
OPENAI_REQUEST_TIMEOUT_SECONDS = 120

# Estimated pricing per 1M tokens (USD). Update when OpenAI changes prices.
OPENAI_PRICING = {
    "gpt-5.4-mini": {"input": 0.40, "output": 1.60},
    "gpt-5.4":      {"input": 2.00, "output": 8.00},
    "gpt-4.1-mini": {"input": 0.40, "output": 1.60},
    "gpt-4.1":      {"input": 2.00, "output": 8.00},
    "gpt-4.1-nano": {"input": 0.10, "output": 0.40},
    "gpt-4o-mini":  {"input": 0.15, "output": 0.60},
    "gpt-4o":       {"input": 2.50, "output": 10.00},
}


def _extract_usage(response_data):
    """Extract token usage dict from an OpenAI Responses API response."""
    usage = response_data.get("usage") if isinstance(response_data, dict) else None
    if not isinstance(usage, dict):
        return {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
    return {
        "input_tokens": int(usage.get("input_tokens", 0)),
        "output_tokens": int(usage.get("output_tokens", 0)),
        "total_tokens": int(usage.get("total_tokens", 0)),
    }


def _estimate_cost(usage, model):
    """Return estimated cost in USD for a usage dict and model name."""
    prices = OPENAI_PRICING.get(model, OPENAI_PRICING.get(DEFAULT_OPENAI_GENERATION_MODEL, {}))
    input_cost = usage.get("input_tokens", 0) * prices.get("input", 0) / 1_000_000
    output_cost = usage.get("output_tokens", 0) * prices.get("output", 0) / 1_000_000
    return round(input_cost + output_cost, 6)


def _merge_usage(a, b):
    """Sum two usage dicts."""
    return {
        "input_tokens": a.get("input_tokens", 0) + b.get("input_tokens", 0),
        "output_tokens": a.get("output_tokens", 0) + b.get("output_tokens", 0),
        "total_tokens": a.get("total_tokens", 0) + b.get("total_tokens", 0),
    }

ADVERT_EXTRACTION_SYSTEM_PROMPT = """You are extracting structured application data from a raw job advert.

Return ONLY valid JSON.
No markdown. No code fences. No commentary.

RULES:
- Use only information present or strongly implied in the advert text.
- Do not invent named people, org structure, strategic initiatives, benefits, tools, or requirements.
- Be concise and practical.
- Keep list items short and non-duplicative.
- Keep salary and location wording clean.
- If data is missing, use "" for string fields and [] for list fields.
- Ensure companyName and roleTitle are populated when reasonably extractable.

Return this exact JSON structure:
{
  "companyName": "",
  "roleTitle": "",
  "location": "",
  "sector": "",
  "salary": "",
  "employmentType": "",
  "hours": "",
  "workplaceType": "",
  "shortCompanyReason": "",
  "shortRoleReason": "",
  "companySummary": "",
  "roleSummary": "",
  "advertSummary": "",
  "toneKeywords": [],
  "probablePriorities": [],
  "keyFocusAreas": [],
  "companyPridePoints": [],
  "headlineAttraction": "",
  "rolePurpose": "",
  "coreResponsibilities": [],
  "essentialRequirements": [],
  "preferredRequirements": [],
  "skillsWanted": [],
  "toolsMethodsMentioned": [],
  "stakeholderGroups": [],
  "teamTypesMentioned": [],
  "senioritySignals": [],
  "cultureSignals": [],
  "likelyBusinessNeeds": [],
  "impliedStrategicGoals": [],
  "deliverablesLikely": [],
  "travelRequired": "",
  "possibleHeadlineFacts": [],
  "matchCategories": []
}"""

SYSTEM_PROMPT = """You are writing personalised CV page content for Ben Howard, a UK-based senior operations and transformation leader. The content will appear on a tailored employer-facing web page that sits alongside his CV.

You will receive:
1. Parsed job advert data (company name, role title, sector, requirements, and other fields).
2. Ben's CV or CV summary, which should be used to shape fit, tone, and evidence selection.
3. A shortlist of Ben's evidence-bank examples (real achievements from his career).

CORE OBJECTIVE:
- Build a persuasive, selective first-person case for Ben.
- Do NOT produce a polished restatement of the advert.
- The page should feel like a real candidate making a credible case to an employer: clear fit, strong proof, and likely value.

VOICE AND TONE RULES (strict):
- Write EVERYTHING in first person as Ben: "I", "my", "I've".
- NEVER refer to Ben in the third person.
- Write to the hiring manager or recruitment team.
- Sound human, deliberate, and grounded.
- Avoid robotic, over-polished, or AI-sounding phrasing.
- Avoid filler such as "I am excited to apply", "I am uniquely positioned", "dynamic professional", "leveraging", "driving excellence", or similar.
- Prefer direct, practical language over corporate wording.
- Prefer short, clean paragraphs and lines that will render well on a premium one-page site.

SOURCE DISCIPLINE RULES (strict):
- The advert is the source of truth for company, role, and requirement facts.
- The evidence bank is the source of truth for Ben's achievements, environments, and examples.
- Use the CV context to better match language, seniority, and the strongest supporting examples.
- NEVER invent company facts, team structures, strategic initiatives, or role details not supported by the advert.
- NEVER invent achievements, tools, responsibilities, sectors, or outcomes not supported by the evidence bank.
- If either source is thin, write less.

HANDLING SPARSE ADVERTS:
- If key advert fields are missing (e.g. companySummary, sector, cultureSignals), do not pad with generic filler.
- Focus on what IS known: the role title, responsibilities, requirements, and any direct signals.
- Write shorter, more focused content rather than longer, vaguer content.
- For companyHighlights: return fewer items (even zero) rather than unsupported claims.
- For likelyContributionSummary: frame contribution around what the advert describes the role needing, not made-up promises. Use phrases like "Based on what the brief describes…" or "The role seems focused on…".

EVIDENCE BANK RULES:
- Only reference examples from the provided evidence bank.
- Prefer 3 strong, varied examples when the evidence supports it.
- Do not include extra examples just to fill space.
- Prefer variety across employer/context/contribution type.
- Use evidence to prove fit, not to decorate the page.
- Make evidence choices selective and useful: each example should earn its place.
- If CV context is present, use it to choose evidence examples that align with the candidate's background and the role's likely priorities.

DISTINCT FIELD PURPOSES (strict):
- heroPositioning: one short, high-value positioning line for the hero. This should frame the kind of contribution I make. It is NOT a repeat of the role title, sector, or opening paragraph.
- personalisedOpening: my opening case for why this opportunity fits me. It should introduce me in relation to the role, not summarise the advert.
- whyThisCompany: about the organisation, environment, brand, direction, scale, or culture signals in the advert. Do NOT drift into describing the duties of the role. ALWAYS refer to the company by its actual name (from companyName) — never write "a named employer", "this company", or similar generic references.
- whyThisRole: about the work itself, the operational challenge, and where I would contribute. Do NOT drift into generic praise of the company.
- roleNeedsSummary: my interpretation of what the role really needs beyond the advert bullets.
- fitSummary: why my background lines up overall. This is broader than any single requirement.
- likelyContributionSummary: what I would realistically help move or improve if appointed. This should look forward, not recap fit.
- cultureFitSummary: only about working style and environment fit. Keep it brief.
- closingSummary: a final employer-facing case in one sentence. It must not sound like a recap of the advert or a description of the webpage.
- closingProofPoints: 2-3 very short proof-led lines that support the closing section. These should feel like evidence anchors, not generic highlights.

ANTI-REPETITION RULES (strict):
- Do not repeat the role title, location, sector, contract details, or workplace type across multiple fields unless genuinely useful. The company name SHOULD appear naturally where needed — especially in whyThisCompany.
- Do not paraphrase the same idea in heroPositioning, personalisedOpening, fitSummary, likelyContributionSummary, and closingSummary.
- Avoid overusing recurring theme words such as "digital transformation", "inclusive culture", "structured operations", "operational backbone", "cross-functional", and similar. Use them only where needed.
- Do not simply convert advert bullets into polished prose.
- Do not describe the page itself. Never write "this page shows", "the section above", or similar meta commentary.

SELECTIVITY RULES:
- Fewer stronger points beat broad generic coverage.
- Return only material that adds value to the page.
- If a list would be weak or repetitive, keep it shorter.
- companyHighlights can be empty.
- first90DaysPlan can be empty if the brief is too thin, otherwise return exactly 3 items.

Return ONLY valid JSON with this exact structure:
{
  "heroPositioning": "A short premium positioning line for the hero. Usually 8-18 words.",
  "personalisedOpening": "A first-person opening statement for this specific application (2-3 sentences). Grounded in the role and company context. Not a biography.",
  "whyThisCompany": "Why I'm drawn to [companyName] and this opportunity (2-3 sentences). Use the actual company name, not generic descriptions. Only use facts from the advert. Keep this clearly about the organisation or environment.",
  "whyThisRole": "Why this specific role fits my experience and what I'm looking for (2-3 sentences). Keep this clearly about the work and where I would contribute.",
  "selectedEvidenceExamples": [
    {
      "exampleId": "the ID from the evidence bank",
      "exampleTitle": "the title of the example",
      "bestMatchedRoleNeed": "the role need this example best supports",
      "proofAngle": "a short proof label such as service turnaround, delivery control, workload visibility, stakeholder coordination, operational improvement",
      "whyChosen": "why this example is relevant to this role (first person)",
      "suggestedUsage": "how this should be featured on the CV page (e.g. hero metric, supporting point, culture fit)",
      "shortLine": "a punchy first-person one-liner tailored to this application"
    }
  ],
  "roleNeedsSummary": "A concise first-person summary of what I understand this role really needs beyond the literal advert bullets (2-3 sentences).",
  "experienceMappings": [
    {
      "roleNeed": "one clear capability or requirement the role needs",
      "evidenceExampleId": "the exampleId that best supports this row if relevant, otherwise empty string",
      "myEvidence": "the most relevant part of my experience for that need, in first person",
      "relevance": "a short line on why that evidence matters for this role",
      "proofAngle": "a short proof label if helpful, otherwise empty string"
    }
  ],
  "focusAreasToBring": [
    {
      "title": "a short focus area heading",
      "summary": "how I would approach or add value in that area, in first person"
    }
  ],
  "fitSummary": "A 2-3 sentence first-person summary of why I'm a strong fit for this role overall.",
  "likelyContributionSummary": "What I'd expect to focus on in the first 6-12 months based on what the brief describes (2-3 sentences). Grounded in the advert, not invented promises.",
  "companyHighlights": ["Only include company facts clearly supported by the advert. Return fewer items or an empty array if reliable facts are limited."],
  "cultureFitSummary": "How my working style connects to the culture signals in the advert (1-2 sentences, first person).",
  "first90DaysPlan": [
    {
      "phase": "First 30 days / Days 30-60 / Days 60-90",
      "focus": "a short focus label for that phase",
      "detail": "what I would concentrate on in that phase based on the brief"
    }
  ],
  "closingSummary": "A confident first-person closing line for the page (1 sentence).",
  "closingProofPoints": ["2-3 short proof-led supporting lines for the closing section."],
  "contentNotes": ["Any notes about content choices, gaps, thin data, or caveats for review."]
}

QUALITY CHECK BEFORE YOU RESPOND:
- Make every field earn its place.
- Keep sections distinct.
- Keep evidence varied and relevant.
- If content is starting to sound like advert notes, rewrite it as a candidate case.
- Return valid JSON only."""


def _build_user_prompt(application, evidence_rows):
    """Assemble the user prompt from the application and evidence bank."""
    sections = []

    # Application data
    app_fields = [
        "companyName", "roleTitle", "location", "sector", "salary",
        "employmentType", "hours", "workplaceType",
        "companySummary", "roleSummary", "headlineAttraction", "rolePurpose",
        "shortCompanyReason", "shortRoleReason",
        "personalisedIntro", "whyThisRole", "advertSummary",
        "keyFocusAreas", "probablePriorities",
        "coreResponsibilities", "essentialRequirements", "preferredRequirements",
        "skillsWanted", "toolsMethodsMentioned",
        "stakeholderGroups", "teamTypesMentioned",
        "senioritySignals", "cultureSignals",
        "likelyBusinessNeeds", "impliedStrategicGoals",
        "deliverablesLikely", "companyPridePoints",
    ]
    sections.append("=== JOB ADVERT DATA ===")
    for field in app_fields:
        val = application.get(field, "")
        if isinstance(val, list) and val:
            sections.append(f"{field}: {', '.join(val)}")
        elif isinstance(val, str) and val.strip():
            sections.append(f"{field}: {val}")

    sections.append("")
    sections.append("=== WRITING INSTRUCTIONS ===")
    sections.append("- Treat shortCompanyReason, shortRoleReason, companySummary, roleSummary, and advertSummary as internal notes, not final copy to repeat verbatim.")
    sections.append("- Build a persuasive first-person case for fit, proof, and likely contribution.")
    sections.append("- Prefer 3 evidence examples when possible; only return more if each adds something materially different.")
    sections.append("- Keep sections distinct and do not reuse the same idea across hero, fit, contribution, and closing.")

    cv_context = _build_cv_context_section(application)
    if cv_context:
        sections.append("")
        sections.append("=== BEN CV CONTEXT ===")
        sections.append(cv_context)

    raw_advert = str(application.get("rawAdvertText", "")).strip()
    if raw_advert:
        sections.append("")
        sections.append("=== RAW ADVERT TEXT (REFERENCE) ===")
        sections.append(raw_advert[:12000])

    # Evidence bank
    sections.append("")
    sections.append("=== BEN'S EVIDENCE BANK (SHORTLISTED) ===")
    if evidence_rows:
        sections.append(_format_evidence_for_prompt(evidence_rows))
    else:
        sections.append("No evidence examples available.")

    return "\n".join(sections)


def _extract_json_object(text):
    """Extract a JSON object from plain text or fenced output."""
    if not isinstance(text, str):
        raise ValueError("Model response content was not text.")

    text = text.strip()
    if not text:
        raise ValueError("Model returned empty content.")

    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("No JSON object found in model response.")

    return text[start:end + 1]


def _str(value):
    return str(value).strip() if isinstance(value, str) else ""


def _str_list(value):
    if not isinstance(value, list):
        return []
    clean = []
    seen = set()
    for item in value:
        if not isinstance(item, str):
            continue
        text = item.strip()
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        clean.append(text)
    return clean


def _normalise_extracted_application(payload, advert_text):
    if not isinstance(payload, dict):
        payload = {}

    return {
        "companyName": _str(payload.get("companyName")),
        "roleTitle": _str(payload.get("roleTitle")),
        "location": _str(payload.get("location")),
        "sector": _str(payload.get("sector")),
        "salary": _str(payload.get("salary")),
        "employmentType": _str(payload.get("employmentType")),
        "hours": _str(payload.get("hours")),
        "workplaceType": _str(payload.get("workplaceType")),
        "shortCompanyReason": _str(payload.get("shortCompanyReason")),
        "shortRoleReason": _str(payload.get("shortRoleReason")),
        "companySummary": _str(payload.get("companySummary")),
        "roleSummary": _str(payload.get("roleSummary")),
        "advertSummary": _str(payload.get("advertSummary")),
        "headlineAttraction": _str(payload.get("headlineAttraction")),
        "rolePurpose": _str(payload.get("rolePurpose")),
        "travelRequired": _str(payload.get("travelRequired")),
        "toneKeywords": _str_list(payload.get("toneKeywords")),
        "probablePriorities": _str_list(payload.get("probablePriorities")),
        "keyFocusAreas": _str_list(payload.get("keyFocusAreas")),
        "companyPridePoints": _str_list(payload.get("companyPridePoints")),
        "coreResponsibilities": _str_list(payload.get("coreResponsibilities")),
        "essentialRequirements": _str_list(payload.get("essentialRequirements")),
        "preferredRequirements": _str_list(payload.get("preferredRequirements")),
        "skillsWanted": _str_list(payload.get("skillsWanted")),
        "toolsMethodsMentioned": _str_list(payload.get("toolsMethodsMentioned")),
        "stakeholderGroups": _str_list(payload.get("stakeholderGroups")),
        "teamTypesMentioned": _str_list(payload.get("teamTypesMentioned")),
        "senioritySignals": _str_list(payload.get("senioritySignals")),
        "cultureSignals": _str_list(payload.get("cultureSignals")),
        "likelyBusinessNeeds": _str_list(payload.get("likelyBusinessNeeds")),
        "impliedStrategicGoals": _str_list(payload.get("impliedStrategicGoals")),
        "deliverablesLikely": _str_list(payload.get("deliverablesLikely")),
        "possibleHeadlineFacts": _str_list(payload.get("possibleHeadlineFacts")),
        "matchCategories": _str_list(payload.get("matchCategories")),
        "rawAdvertText": advert_text.strip(),
    }


def _build_extraction_user_prompt(advert_text):
    return (
        "Extract the structured advert data from this job advert text.\n"
        "Return JSON only.\n\n"
        "=== JOB ADVERT TEXT ===\n"
        f"{advert_text.strip()}\n"
    )


def _string_schema():
    return {"type": "string"}


def _string_array_schema():
    return {"type": "array", "items": {"type": "string"}}


def _object_schema(properties):
    return {
        "type": "object",
        "properties": properties,
        "required": list(properties.keys()),
        "additionalProperties": False,
    }


def _object_array_schema(properties):
    return {"type": "array", "items": _object_schema(properties)}


ADVERT_EXTRACTION_RESPONSE_SCHEMA = _object_schema({
    "companyName": _string_schema(),
    "roleTitle": _string_schema(),
    "location": _string_schema(),
    "sector": _string_schema(),
    "salary": _string_schema(),
    "employmentType": _string_schema(),
    "hours": _string_schema(),
    "workplaceType": _string_schema(),
    "shortCompanyReason": _string_schema(),
    "shortRoleReason": _string_schema(),
    "companySummary": _string_schema(),
    "roleSummary": _string_schema(),
    "advertSummary": _string_schema(),
    "toneKeywords": _string_array_schema(),
    "probablePriorities": _string_array_schema(),
    "keyFocusAreas": _string_array_schema(),
    "companyPridePoints": _string_array_schema(),
    "headlineAttraction": _string_schema(),
    "rolePurpose": _string_schema(),
    "coreResponsibilities": _string_array_schema(),
    "essentialRequirements": _string_array_schema(),
    "preferredRequirements": _string_array_schema(),
    "skillsWanted": _string_array_schema(),
    "toolsMethodsMentioned": _string_array_schema(),
    "stakeholderGroups": _string_array_schema(),
    "teamTypesMentioned": _string_array_schema(),
    "senioritySignals": _string_array_schema(),
    "cultureSignals": _string_array_schema(),
    "likelyBusinessNeeds": _string_array_schema(),
    "impliedStrategicGoals": _string_array_schema(),
    "deliverablesLikely": _string_array_schema(),
    "travelRequired": _string_schema(),
    "possibleHeadlineFacts": _string_array_schema(),
    "matchCategories": _string_array_schema(),
})


PERSONALISED_CONTENT_RESPONSE_SCHEMA = _object_schema({
    "heroPositioning": _string_schema(),
    "personalisedOpening": _string_schema(),
    "whyThisCompany": _string_schema(),
    "whyThisRole": _string_schema(),
    "selectedEvidenceExamples": _object_array_schema({
        "exampleId": _string_schema(),
        "exampleTitle": _string_schema(),
        "bestMatchedRoleNeed": _string_schema(),
        "proofAngle": _string_schema(),
        "whyChosen": _string_schema(),
        "suggestedUsage": _string_schema(),
        "shortLine": _string_schema(),
    }),
    "roleNeedsSummary": _string_schema(),
    "experienceMappings": _object_array_schema({
        "roleNeed": _string_schema(),
        "evidenceExampleId": _string_schema(),
        "myEvidence": _string_schema(),
        "relevance": _string_schema(),
        "proofAngle": _string_schema(),
    }),
    "focusAreasToBring": _object_array_schema({
        "title": _string_schema(),
        "summary": _string_schema(),
    }),
    "fitSummary": _string_schema(),
    "likelyContributionSummary": _string_schema(),
    "companyHighlights": _string_array_schema(),
    "cultureFitSummary": _string_schema(),
    "first90DaysPlan": _object_array_schema({
        "phase": _string_schema(),
        "focus": _string_schema(),
        "detail": _string_schema(),
    }),
    "closingSummary": _string_schema(),
    "closingProofPoints": _string_array_schema(),
    "contentNotes": _string_array_schema(),
})


def _validate_openai_schema_node(node, path="$"):
    if not isinstance(node, dict):
        raise ValueError(f"{path}: schema node must be an object/dict")

    node_type = node.get("type")

    if node_type == "object":
        properties = node.get("properties")
        if properties is None:
            raise ValueError(f"{path}: object schema missing properties")
        if not isinstance(properties, dict):
            raise ValueError(f"{path}: object schema properties must be a dict")
        for key, child in properties.items():
            _validate_openai_schema_node(child, f"{path}.properties.{key}")

    if node_type == "array":
        if "items" not in node:
            raise ValueError(f"{path}: array schema missing items")
        _validate_openai_schema_node(node["items"], f"{path}.items")


def validate_openai_response_schema(schema, schema_name):
    if not isinstance(schema_name, str) or not schema_name.strip():
        raise ValueError("schema_name must be a non-empty string")
    _validate_openai_schema_node(schema, f"{schema_name}")


def _extract_openai_output_text(response_data):
    if isinstance(response_data.get("output_text"), str) and response_data.get("output_text", "").strip():
        return response_data.get("output_text", "")

    output = response_data.get("output")
    if isinstance(output, list):
        parts = []
        for item in output:
            if not isinstance(item, dict):
                continue
            content = item.get("content")
            if not isinstance(content, list):
                continue
            for chunk in content:
                if not isinstance(chunk, dict):
                    continue
                if chunk.get("type") in ("output_text", "text") and isinstance(chunk.get("text"), str):
                    parts.append(chunk["text"])
        if parts:
            return "\n".join(parts)

    choices = response_data.get("choices")
    if isinstance(choices, list) and choices:
        maybe_text = (
            ((choices[0] or {}).get("message") or {}).get("content", "")
            if isinstance(choices[0], dict)
            else ""
        )
        if isinstance(maybe_text, str) and maybe_text.strip():
            return maybe_text

    raise ValueError("No assistant output text found in OpenAI response.")


def call_openai_responses_json(api_key, model, system_prompt, user_prompt, schema, schema_name, temperature=0.3):
    """Call OpenAI Responses API and return parsed JSON.

    Returns (result_dict, error_message_or_none, usage_dict).
    """
    empty_usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
    if not api_key:
        return None, "OpenAI API key is missing.", empty_usage
    if not model:
        return None, "OpenAI model is missing.", empty_usage
    try:
        validate_openai_response_schema(schema, schema_name)
    except ValueError as exc:
        return None, f"Local schema validation failed: {exc}", empty_usage

    request_body = {
        "model": model,
        "input": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": float(temperature),
        "max_output_tokens": 3500,
        "text": {
            "format": {
                "type": "json_schema",
                "name": schema_name,
                "strict": True,
                "schema": schema,
            }
        },
    }

    body_bytes = json.dumps(request_body).encode("utf-8")
    req = Request(
        OPENAI_RESPONSES_ENDPOINT,
        data=body_bytes,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "User-Agent": "BenHowardCV-ContentGen/1.0",
        },
        method="POST",
    )

    try:
        with urlopen(req, timeout=OPENAI_REQUEST_TIMEOUT_SECONDS) as resp:
            response_data = json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        try:
            err_json = json.loads(error_body)
            err_obj = err_json.get("error") if isinstance(err_json, dict) else None
            if isinstance(err_obj, dict):
                message = err_obj.get("message") or json.dumps(err_obj)
            else:
                message = err_json.get("message") if isinstance(err_json, dict) else error_body[:500]
        except json.JSONDecodeError:
            message = error_body[:500]
        return None, f"OpenAI API error ({exc.code}): {message}", empty_usage
    except URLError as exc:
        return None, f"Could not reach OpenAI: {exc.reason}", empty_usage
    except TimeoutError:
        return None, f"OpenAI request timed out after {OPENAI_REQUEST_TIMEOUT_SECONDS}s.", empty_usage
    except socket.timeout:
        return None, f"OpenAI request timed out after {OPENAI_REQUEST_TIMEOUT_SECONDS}s.", empty_usage
    except json.JSONDecodeError as exc:
        return None, f"Invalid JSON from OpenAI: {exc}", empty_usage

    usage = _extract_usage(response_data)

    try:
        content_str = _extract_openai_output_text(response_data)
        json_str = _extract_json_object(content_str)
        result = json.loads(json_str)
    except (KeyError, ValueError, json.JSONDecodeError) as exc:
        return None, f"Could not parse OpenAI response JSON: {exc}", usage

    return result, None, usage


def call_openai_personalised_content(api_key, model, application, evidence_rows):
    """Generate personalised-content JSON from advert + evidence context."""
    user_prompt = _build_user_prompt(application, evidence_rows)
    result, error, usage = call_openai_responses_json(
        api_key=api_key,
        model=model,
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        schema=PERSONALISED_CONTENT_RESPONSE_SCHEMA,
        schema_name="personalised_content",
        temperature=0.4,
    )
    return result, error, usage, {"system_prompt": SYSTEM_PROMPT, "user_prompt": user_prompt}


# ---------------------------------------------------------------------------
# Orchestrator – full generation pipeline
# ---------------------------------------------------------------------------

def generate_application_from_advert(advert_text, config):
    """Generate a full application object from raw advert text.

    Pipeline:
    1. Extract structured advert fields via OpenAI
    2. Generate personalised content via OpenAI + evidence bank
    3. Return merged application ready for preview/publish
    """
    advert_text = str(advert_text or "").strip()
    if not advert_text:
        return {
            "application": None,
            "generatedContent": None,
            "evidenceSelection": {"count": 0, "error": "No advert text supplied.", "examples": []},
            "meta": {"success": False, "stage": "extract", "error": "No advert text supplied."},
        }

    openai_api_key = (config.get("openaiApiKey") or "").strip()
    openai_model = (config.get("openaiGenerationModel") or "").strip() or DEFAULT_OPENAI_GENERATION_MODEL
    if not openai_api_key:
        return {
            "application": None,
            "generatedContent": None,
            "evidenceSelection": {"count": 0, "error": "No OpenAI API key configured.", "examples": []},
            "meta": {
                "success": False,
                "stage": "extract",
                "error": "No OpenAI API key configured. Add openaiApiKey to local-admin/secrets.local.json or OPENAI_API_KEY.",
                "model": openai_model,
                "provider": "openai",
            },
        }

    extracted_raw, extraction_error, extraction_usage = call_openai_responses_json(
        api_key=openai_api_key,
        model=openai_model,
        system_prompt=ADVERT_EXTRACTION_SYSTEM_PROMPT,
        user_prompt=_build_extraction_user_prompt(advert_text),
        schema=ADVERT_EXTRACTION_RESPONSE_SCHEMA,
        schema_name="advert_extraction",
        temperature=0.2,
    )
    if extraction_error:
        return {
            "application": None,
            "generatedContent": None,
            "evidenceSelection": {"count": 0, "error": "Generation skipped: advert extraction failed.", "examples": []},
            "meta": {
                "success": False,
                "stage": "extract",
                "error": extraction_error,
                "model": openai_model,
                "provider": "openai",
                "usage": extraction_usage,
                "estimated_cost_usd": _estimate_cost(extraction_usage, openai_model),
            },
        }

    application = _normalise_extracted_application(extracted_raw, advert_text)
    if not application.get("companyName") or not application.get("roleTitle"):
        return {
            "application": application,
            "generatedContent": None,
            "evidenceSelection": {"count": 0, "error": "Generation skipped: missing companyName or roleTitle after extraction.", "examples": []},
            "meta": {
                "success": False,
                "stage": "extract",
                "error": "Advert extraction did not return companyName and roleTitle.",
                "model": openai_model,
                "provider": "openai",
            },
        }

    personalised = generate_personalised_content(application, config)
    generated_content = personalised.get("generatedContent")
    evidence_selection = personalised.get("evidenceSelection") or {"count": 0, "error": None, "examples": []}
    prompts_used = personalised.get("prompts")
    personalised_usage = (personalised.get("meta") or {}).get("usage") or {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
    total_usage = _merge_usage(extraction_usage, personalised_usage)

    if not generated_content:
        return {
            "application": application,
            "generatedContent": None,
            "evidenceSelection": evidence_selection,
            "prompts": prompts_used,
            "meta": {
                "success": False,
                "stage": "personalise",
                "error": (personalised.get("meta") or {}).get("error") or "Personalised generation failed.",
                "model": openai_model,
                "provider": "openai",
                "companyName": application.get("companyName", ""),
                "roleTitle": application.get("roleTitle", ""),
                "usage": total_usage,
                "estimated_cost_usd": _estimate_cost(total_usage, openai_model),
            },
        }

    application["personalisedContent"] = generated_content
    application["generatedContent"] = generated_content
    application["evidenceSelection"] = evidence_selection
    application["personalisedIntro"] = generated_content.get("personalisedOpening", "")
    application["whyThisRole"] = generated_content.get("whyThisRole", "")
    application["shortCompanyReason"] = application.get("shortCompanyReason") or generated_content.get("whyThisCompany", "")
    application["closingSummary"] = generated_content.get("closingSummary", "")

    return {
        "application": application,
        "generatedContent": generated_content,
        "evidenceSelection": evidence_selection,
        "prompts": prompts_used,
        "meta": {
            "error": None,
            "model": openai_model,
            "provider": "openai",
            "companyName": application.get("companyName", ""),
            "roleTitle": application.get("roleTitle", ""),
            "usage": total_usage,
            "estimated_cost_usd": _estimate_cost(total_usage, openai_model),
        },
    }


def generate_personalised_content(application, config):
    """Run the full Stage 3 generation pipeline.

    1. Select relevant evidence-bank examples
    2. Call OpenAI with structured prompt
    3. Return the generated content + metadata

    Args:
        application: parsed application/job dict
        config: dict with OpenAI settings and other options

    Returns:
        dict with generatedContent, evidenceSelection metadata, and debug info.
    """
    openai_api_key = (config.get("openaiApiKey") or "").strip()
    openai_model = (config.get("openaiGenerationModel") or "").strip() or DEFAULT_OPENAI_GENERATION_MODEL

    # Step 1: Select evidence
    evidence_rows, evidence_error = select_evidence_examples(application)
    evidence_selection = {
        "count": len(evidence_rows),
        "error": evidence_error,
        "examples": [
            {
                "id": row.get("ID", ""),
                "title": row.get("Example Title", ""),
                "employer": row.get("Employer / Organisation", ""),
                "sector": row.get("Sector", ""),
                "matchScore": row.get("_matchScore", 0),
            }
            for row in evidence_rows
        ],
    }

    if not openai_api_key:
        return {
            "generatedContent": None,
            "evidenceSelection": evidence_selection,
            "meta": {
                "success": False,
                "error": "No OpenAI API key configured. Add openaiApiKey to local-admin/secrets.local.json or OPENAI_API_KEY.",
                "model": openai_model,
                "provider": "openai",
            },
        }

    # Step 2: Call OpenAI
    generated, generation_error, gen_usage, prompts_used = call_openai_personalised_content(
        openai_api_key, openai_model, application, evidence_rows,
    )

    if generation_error:
        return {
            "generatedContent": None,
            "evidenceSelection": evidence_selection,
            "prompts": prompts_used,
            "meta": {
                "success": False,
                "error": generation_error,
                "model": openai_model,
                "provider": "openai",
                "usage": gen_usage,
                "estimated_cost_usd": _estimate_cost(gen_usage, openai_model),
            },
        }

    # Step 3: Return structured result
    return {
        "generatedContent": generated,
        "evidenceSelection": evidence_selection,
        "prompts": prompts_used,
        "meta": {
            "success": True,
            "error": None,
            "model": openai_model,
            "provider": "openai",
            "companyName": application.get("companyName", ""),
            "roleTitle": application.get("roleTitle", ""),
            "usage": gen_usage,
            "estimated_cost_usd": _estimate_cost(gen_usage, openai_model),
        },
    }

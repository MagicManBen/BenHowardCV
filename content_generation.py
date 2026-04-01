"""
Personalised content generation for Stage 3.

Combines:
  - Parsed application/job data
  - Filtered company research findings
  - Ben evidence-bank examples (selected deterministically)

Then calls OpenAI to produce structured personalised CV content.

Future refinement:
  - Tweak the system prompt for tone/style
  - Adjust evidence-selection weights
  - Add iterative regeneration support
"""

import csv
import json
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


def _score_evidence_row(row, app_tokens):
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

    # Bonus for public-safe entries
    if str(row.get("Safe for Public Use?", "")).strip().lower() in ("yes", "true"):
        score += 0.05

    return round(score, 4)


def select_evidence_examples(application, max_examples=6):
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
    if not app_tokens:
        # If application has no matching tokens, return top rows by default
        for r in rows[:max_examples]:
            r["_matchScore"] = 0.01
        return rows[:max_examples], None

    scored = []
    for row in rows:
        s = _score_evidence_row(row, app_tokens)
        row["_matchScore"] = s
        scored.append((s, row))

    scored.sort(key=lambda x: x[0], reverse=True)

    # Pick top scorers but try to keep variety (different employers)
    selected = []
    seen_employers = set()
    for _score, row in scored:
        employer = str(row.get("Employer / Organisation", "")).strip().lower()
        # Allow one repeat employer if needed, but prefer variety
        if employer in seen_employers and len(selected) < max_examples - 1:
            continue
        selected.append(row)
        seen_employers.add(employer)
        if len(selected) >= max_examples:
            break

    # If we didn't fill up due to variety constraint, backfill
    if len(selected) < max_examples:
        for _score, row in scored:
            if row not in selected:
                selected.append(row)
                if len(selected) >= max_examples:
                    break

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
        lines.append(f"  Short Version: {row.get('Short Version', '')}")
        lines.append(f"  Headline Version: {row.get('Headline Version', '')}")
        lines.append(f"  Why It Matters: {row.get('Why It Matters', '')}")
        lines.append(f"  Match Score: {row.get('_matchScore', 0)}")
        lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# OpenAI structured generation
# ---------------------------------------------------------------------------

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
OPENAI_MODEL = "gpt-4o"

SYSTEM_PROMPT = """You are an expert CV content advisor. You help a UK-based senior operations and transformation professional named Ben Howard create personalised CV content for specific job applications.

You will receive:
1. A parsed job advert with company name, role title, sector, requirements, and other fields.
2. Filtered company research findings with a structured company profile.
3. A shortlist of Ben's evidence-bank examples (real achievements from his career).

Your task is to produce structured JSON content that can feed a personalised online CV page. The content should be:
- Professional, confident, and specific
- Grounded in Ben's real evidence (do not invent achievements)
- Tailored to the specific company and role
- Written in third person where describing Ben, or first person where natural for a personal statement
- Concise and impactful

Return ONLY valid JSON with this exact structure:
{
  "personalisedOpening": "A brief personalised opening statement for this specific application (2-3 sentences)",
  "whyThisCompany": "Why Ben is drawn to this specific company (2-3 sentences, grounded in research findings)",
  "whyThisRole": "Why this specific role fits Ben's experience and ambitions (2-3 sentences)",
  "selectedEvidenceExamples": [
    {
      "exampleId": "the ID from the evidence bank",
      "exampleTitle": "the title of the example",
      "whyChosen": "why this example is relevant to this role",
      "suggestedUsage": "how this should be featured on the CV (e.g. hero metric, supporting point, culture fit)",
      "shortLine": "a punchy one-liner version tailored to this application"
    }
  ],
  "fitSummary": "A 2-3 sentence summary of why Ben is a strong fit overall",
  "likelyContributionSummary": "What Ben would likely contribute in the first 6-12 months (2-3 sentences)",
  "companyHighlights": ["key company facts worth featuring, from research"],
  "cultureFitSummary": "How Ben's style matches the company culture signals (1-2 sentences)",
  "closingSummary": "A confident closing line for the CV page (1 sentence)",
  "contentNotes": ["any notes about content choices, gaps, or caveats for Ben to review"]
}

Select 3-5 evidence examples that best demonstrate fit. Prefer variety across different employers and competency areas. Only use examples from the provided evidence bank."""


def _build_user_prompt(application, filtered_findings, evidence_rows):
    """Assemble the user prompt combining all three data sources."""
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
    sections.append("=== JOB APPLICATION DATA ===")
    for field in app_fields:
        val = application.get(field, "")
        if isinstance(val, list) and val:
            sections.append(f"{field}: {', '.join(val)}")
        elif isinstance(val, str) and val.strip():
            sections.append(f"{field}: {val}")

    # Filtered research
    sections.append("")
    sections.append("=== COMPANY RESEARCH (FILTERED) ===")
    if filtered_findings:
        for key in ["canonicalCompanyName", "bestEntityDescription", "officialWebsite",
                     "companyType", "industry", "headquarters"]:
            val = filtered_findings.get(key, "")
            if val:
                sections.append(f"{key}: {val}")
        for key in ["notableFacts", "strategicSignals", "credibilityNotes"]:
            items = filtered_findings.get(key, [])
            if items:
                sections.append(f"{key}: {'; '.join(items)}")
    else:
        sections.append("No filtered research available.")

    # Evidence bank
    sections.append("")
    sections.append("=== BEN'S EVIDENCE BANK (SHORTLISTED) ===")
    if evidence_rows:
        sections.append(_format_evidence_for_prompt(evidence_rows))
    else:
        sections.append("No evidence examples available.")

    return "\n".join(sections)


def call_openai(api_key, application, filtered_findings, evidence_rows):
    """Call OpenAI chat completions and return the parsed JSON response.

    Returns (result_dict, error_message_or_none).
    """
    if not api_key:
        return None, "OpenAI API key not configured in secrets.local.json"

    user_prompt = _build_user_prompt(application, filtered_findings, evidence_rows)

    request_body = {
        "model": OPENAI_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.4,
        "max_tokens": 2000,
        "response_format": {"type": "json_object"},
    }

    body_bytes = json.dumps(request_body).encode("utf-8")
    req = Request(
        OPENAI_CHAT_URL,
        data=body_bytes,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "User-Agent": "BenHowardCV-ContentGen/1.0",
        },
        method="POST",
    )

    try:
        with urlopen(req, timeout=60) as resp:
            resp_data = json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        error_body = exc.read().decode("utf-8") if exc.fp else ""
        try:
            err_json = json.loads(error_body)
            msg = err_json.get("error", {}).get("message", error_body[:300])
        except json.JSONDecodeError:
            msg = error_body[:300]
        return None, f"OpenAI API error ({exc.code}): {msg}"
    except URLError as exc:
        return None, f"Could not reach OpenAI: {exc.reason}"
    except json.JSONDecodeError as exc:
        return None, f"Invalid JSON from OpenAI: {exc}"

    # Extract the content from the response
    try:
        content_str = resp_data["choices"][0]["message"]["content"]
        result = json.loads(content_str)
    except (KeyError, IndexError, json.JSONDecodeError) as exc:
        return None, f"Could not parse OpenAI response: {exc}"

    return result, None


# ---------------------------------------------------------------------------
# Orchestrator – full generation pipeline
# ---------------------------------------------------------------------------

def generate_personalised_content(application, filtered_findings, config):
    """Run the full Stage 3 generation pipeline.

    1. Select relevant evidence-bank examples
    2. Call OpenAI with structured prompt
    3. Return the generated content + metadata

    Args:
        application: parsed application/job dict
        filtered_findings: Stage 2 filtered company profile dict
        config: dict with openaiApiKey and other settings

    Returns:
        dict with generatedContent, evidenceSelection metadata, and debug info.
    """
    api_key = (config.get("openaiApiKey") or "").strip()

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

    # Step 2: Call OpenAI
    generated, openai_error = call_openai(
        api_key, application, filtered_findings, evidence_rows,
    )

    if openai_error:
        return {
            "generatedContent": None,
            "evidenceSelection": evidence_selection,
            "meta": {
                "success": False,
                "error": openai_error,
                "model": OPENAI_MODEL,
            },
        }

    # Step 3: Return structured result
    return {
        "generatedContent": generated,
        "evidenceSelection": evidence_selection,
        "meta": {
            "success": True,
            "error": None,
            "model": OPENAI_MODEL,
            "companyName": application.get("companyName", ""),
            "roleTitle": application.get("roleTitle", ""),
        },
    }

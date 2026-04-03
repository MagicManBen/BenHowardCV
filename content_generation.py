"""
Personalised content generation for Stage 3.

Combines:
  - Parsed application/job data
  - Ben evidence-bank examples (selected deterministically)

Then calls Ollama to produce structured personalised CV content.

Future refinement:
  - Tweak the system prompt for tone/style
  - Adjust evidence-selection weights
  - Add iterative regeneration support
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
# Ollama structured generation
# ---------------------------------------------------------------------------

DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"
DEFAULT_OLLAMA_MODEL = "llama3.2"
OLLAMA_REQUEST_TIMEOUT_SECONDS = 180

SYSTEM_PROMPT = """You are writing personalised CV page content for Ben Howard, a UK-based senior operations and transformation leader. The content will appear on a tailored employer-facing web page that sits alongside his CV.

You will receive:
1. Parsed job advert data.
2. A shortlist of Ben's evidence-bank examples drawn from his real career achievements.

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
- NEVER invent company facts, team structures, strategic initiatives, or role details not supported by the advert.
- NEVER invent achievements, tools, responsibilities, sectors, or outcomes not supported by the evidence bank.
- If either source is thin, write less.

EVIDENCE BANK RULES:
- Only reference examples from the provided evidence bank.
- Prefer 3 strong, varied examples when the evidence supports it.
- Do not include extra examples just to fill space.
- Prefer variety across employer/context/contribution type.
- Use evidence to prove fit, not to decorate the page.
- Make evidence choices selective and useful: each example should earn its place.

DISTINCT FIELD PURPOSES (strict):
- heroPositioning: one short, high-value positioning line for the hero. This should frame the kind of contribution I make. It is NOT a repeat of the role title, sector, or opening paragraph.
- personalisedOpening: my opening case for why this opportunity fits me. It should introduce me in relation to the role, not summarise the advert.
- whyThisCompany: about the organisation, environment, brand, direction, scale, or culture signals in the advert. Do NOT drift into describing the duties of the role.
- whyThisRole: about the work itself, the operational challenge, and where I would contribute. Do NOT drift into generic praise of the company.
- roleNeedsSummary: my interpretation of what the role really needs beyond the advert bullets.
- fitSummary: why my background lines up overall. This is broader than any single requirement.
- likelyContributionSummary: what I would realistically help move or improve if appointed. This should look forward, not recap fit.
- cultureFitSummary: only about working style and environment fit. Keep it brief.
- closingSummary: a final employer-facing case in one sentence. It must not sound like a recap of the advert or a description of the webpage.
- closingProofPoints: 2-3 very short proof-led lines that support the closing section. These should feel like evidence anchors, not generic highlights.

ANTI-REPETITION RULES (strict):
- Do not repeat the company name, role title, location, sector, contract details, or workplace type across multiple fields unless genuinely useful.
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
  "whyThisCompany": "Why I'm drawn to this company and opportunity (2-3 sentences). Only use facts from the advert. Keep this clearly about the organisation or environment.",
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


def call_ollama(base_url, model, application, evidence_rows):
    """Call Ollama chat and return the parsed JSON response.

    Returns (result_dict, error_message_or_none).
    """
    if not base_url:
        return None, "Ollama base URL not configured."
    if not model:
        return None, "Ollama model not configured."

    user_prompt = _build_user_prompt(application, evidence_rows)
    chat_url = base_url.rstrip("/") + "/api/chat"

    request_body = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
        "options": {
            "temperature": 0.4,
        },
    }

    body_bytes = json.dumps(request_body).encode("utf-8")
    req = Request(
        chat_url,
        data=body_bytes,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "BenHowardCV-ContentGen/1.0",
        },
        method="POST",
    )

    try:
        with urlopen(req, timeout=OLLAMA_REQUEST_TIMEOUT_SECONDS) as resp:
            resp_data = json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        error_body = exc.read().decode("utf-8") if exc.fp else ""
        try:
            err_json = json.loads(error_body)
            msg = err_json.get("error") or error_body[:300]
        except json.JSONDecodeError:
            msg = error_body[:300]
        return None, f"Ollama API error ({exc.code}): {msg}"
    except URLError as exc:
        return None, f"Could not reach Ollama: {exc.reason}"
    except TimeoutError:
        return None, f"Ollama request timed out after {OLLAMA_REQUEST_TIMEOUT_SECONDS}s."
    except socket.timeout:
        return None, f"Ollama request timed out after {OLLAMA_REQUEST_TIMEOUT_SECONDS}s."
    except json.JSONDecodeError as exc:
        return None, f"Invalid JSON from Ollama: {exc}"

    try:
        content_str = resp_data["message"]["content"]
        json_str = _extract_json_object(content_str)
        result = json.loads(json_str)
    except (KeyError, ValueError, json.JSONDecodeError) as exc:
        return None, f"Could not parse Ollama response: {exc}"

    return result, None


# ---------------------------------------------------------------------------
# Orchestrator – full generation pipeline
# ---------------------------------------------------------------------------

def generate_personalised_content(application, config):
    """Run the full Stage 3 generation pipeline.

    1. Select relevant evidence-bank examples
    2. Call Ollama with structured prompt
    3. Return the generated content + metadata

    Args:
        application: parsed application/job dict
        config: dict with Ollama settings and other options

    Returns:
        dict with generatedContent, evidenceSelection metadata, and debug info.
    """
    ollama_base_url = (config.get("ollamaBaseUrl") or "").strip() or DEFAULT_OLLAMA_BASE_URL
    ollama_model = (config.get("ollamaModel") or "").strip() or DEFAULT_OLLAMA_MODEL

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

    # Step 2: Call Ollama
    generated, generation_error = call_ollama(
        ollama_base_url, ollama_model, application, evidence_rows,
    )

    if generation_error:
        return {
            "generatedContent": None,
            "evidenceSelection": evidence_selection,
            "meta": {
                "success": False,
                "error": generation_error,
                "model": ollama_model,
                "baseUrl": ollama_base_url,
            },
        }

    # Step 3: Return structured result
    return {
        "generatedContent": generated,
        "evidenceSelection": evidence_selection,
        "meta": {
            "success": True,
            "error": None,
            "model": ollama_model,
            "baseUrl": ollama_base_url,
            "companyName": application.get("companyName", ""),
            "roleTitle": application.get("roleTitle", ""),
        },
    }

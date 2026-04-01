"""
Company research source adapters and filtering for Stages 1–2.

Calls external APIs server-side and normalises results into a common
raw-finding structure, then deterministically filters/ranks them.

Sources implemented:
  - Google Knowledge Graph Search API
  - Wikidata entity search
  - SEC EDGAR company lookup

Stage 3 will feed filtered findings + evidence bank into OpenAI generation.
"""

import json
import traceback
from urllib.error import HTTPError, URLError
from urllib.parse import quote_plus, urlencode
from urllib.request import Request, urlopen


# ---------------------------------------------------------------------------
# Common raw-finding shape
# ---------------------------------------------------------------------------

def make_finding(
    source_name="",
    source_type="",
    query="",
    title="",
    snippet="",
    description="",
    url="",
    entity_id="",
    confidence=0,
    relevance_score=0,
    match_reason="",
    raw=None,
):
    return {
        "sourceName": source_name,
        "sourceType": source_type,
        "query": query,
        "title": title,
        "snippet": snippet,
        "description": description,
        "url": url,
        "entityId": entity_id,
        "confidence": confidence,
        "relevanceScore": relevance_score,
        "matchReason": match_reason,
        "raw": raw or {},
    }


# ---------------------------------------------------------------------------
# Google Knowledge Graph Search API
# ---------------------------------------------------------------------------

GOOGLE_KG_ENDPOINT = "https://kgsearch.googleapis.com/v1/entities:search"


def search_google_knowledge_graph(company_name, api_key, *, limit=5):
    """Return a list of raw findings from Google Knowledge Graph."""
    if not api_key:
        return [], "Google Knowledge Graph API key not configured."

    params = urlencode({
        "query": company_name,
        "key": api_key,
        "limit": limit,
        "indent": "true",
    })
    url = f"{GOOGLE_KG_ENDPOINT}?{params}"

    try:
        req = Request(url, headers={"User-Agent": "BenHowardCV-Research/1.0"})
        with urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (HTTPError, URLError, json.JSONDecodeError) as exc:
        return [], f"Google KG request failed: {exc}"

    findings = []
    for element in data.get("itemListElement", []):
        result = element.get("result", {})
        score = element.get("resultScore", 0)

        name = result.get("name", "")
        desc = result.get("description", "")
        detailed = result.get("detailedDescription", {})
        article_body = detailed.get("articleBody", "")
        article_url = detailed.get("url", "")
        kg_id = result.get("@id", "")
        types = result.get("@type", [])

        findings.append(make_finding(
            source_name="Google Knowledge Graph",
            source_type="knowledge-graph",
            query=company_name,
            title=name,
            snippet=article_body[:300] if article_body else desc,
            description=desc,
            url=article_url,
            entity_id=kg_id,
            confidence=min(round(score / 1000, 2), 1.0) if score else 0,
            relevance_score=round(score, 2),
            match_reason=f"KG types: {', '.join(types)}" if types else "KG result",
            raw=element,
        ))

    return findings, None


# ---------------------------------------------------------------------------
# Wikidata entity search
# ---------------------------------------------------------------------------

WIKIDATA_SEARCH_ENDPOINT = "https://www.wikidata.org/w/api.php"


def search_wikidata(company_name, *, limit=5):
    """Return a list of raw findings from Wikidata search."""
    params = urlencode({
        "action": "wbsearchentities",
        "search": company_name,
        "language": "en",
        "format": "json",
        "limit": limit,
    })
    url = f"{WIKIDATA_SEARCH_ENDPOINT}?{params}"

    try:
        req = Request(url, headers={"User-Agent": "BenHowardCV-Research/1.0"})
        with urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (HTTPError, URLError, json.JSONDecodeError) as exc:
        return [], f"Wikidata request failed: {exc}"

    findings = []
    for item in data.get("search", []):
        qid = item.get("id", "")
        label = item.get("label", "")
        desc = item.get("description", "")
        wiki_url = f"https://www.wikidata.org/wiki/{qid}" if qid else ""

        findings.append(make_finding(
            source_name="Wikidata",
            source_type="knowledge-base",
            query=company_name,
            title=label,
            snippet=desc,
            description=desc,
            url=wiki_url,
            entity_id=qid,
            confidence=0.6 if label.lower() == company_name.lower() else 0.3,
            relevance_score=0,
            match_reason="Exact label match" if label.lower() == company_name.lower() else "Partial match",
            raw=item,
        ))

    return findings, None


# ---------------------------------------------------------------------------
# SEC EDGAR company search
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# SEC EDGAR company search
# ---------------------------------------------------------------------------


def search_sec_edgar(company_name, *, limit=5):
    """Return a list of raw findings from SEC EDGAR company tickers JSON.

    SEC EDGAR is US-centric. Non-US or private companies will return nothing,
    which is expected and handled gracefully.
    """
    # The company tickers JSON is public, no API key needed
    tickers_url = "https://www.sec.gov/files/company_tickers.json"

    try:
        req = Request(tickers_url, headers={
            "User-Agent": "BenHowardCV ben@example.com",
            "Accept": "application/json",
        })
        with urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (HTTPError, URLError, json.JSONDecodeError) as exc:
        return [], f"SEC EDGAR request failed: {exc}"

    # company_tickers.json is a dict of {index: {cik_str, ticker, title}}
    findings = []
    search_lower = company_name.lower()
    matches = []

    for _key, entry in data.items():
        title = entry.get("title", "")
        if search_lower in title.lower():
            matches.append(entry)
            if len(matches) >= limit:
                break

    for entry in matches:
        cik = str(entry.get("cik_str", ""))
        ticker = entry.get("ticker", "")
        title = entry.get("title", "")
        edgar_url = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=&dateb=&owner=include&count=40" if cik else ""

        is_exact = title.lower() == search_lower
        findings.append(make_finding(
            source_name="SEC EDGAR",
            source_type="regulatory-filing",
            query=company_name,
            title=f"{title} ({ticker})" if ticker else title,
            snippet=f"SEC CIK: {cik}, Ticker: {ticker}",
            description=f"SEC-registered entity: {title}",
            url=edgar_url,
            entity_id=f"CIK:{cik}" if cik else "",
            confidence=0.8 if is_exact else 0.4,
            relevance_score=0,
            match_reason="Exact SEC title match" if is_exact else "Partial SEC title match",
            raw=entry,
        ))

    return findings, None


# ---------------------------------------------------------------------------
# Orchestrator – runs all sources and collects results
# ---------------------------------------------------------------------------

def run_company_research(application, config):
    """Run all Stage 1 research sources for the given application.

    Args:
        application: dict with at least companyName; also uses sector, location, roleTitle.
        config: dict with optional keys like googleKgApiKey.

    Returns:
        dict with rawFindings list, meta info, and per-source errors.

    Stage 2 hook: after this function returns, a filtering step should
    rank/select the best findings into application.research.filteredFindings.

    Stage 3 hook: after filtering, pass filteredFindings + evidence bank
    to OpenAI for personalised content generation.
    """
    company_name = (application.get("companyName") or "").strip()
    if not company_name:
        return {
            "rawFindings": [],
            "meta": {"error": "No companyName in application.", "sourcesRun": []},
        }

    sector = (application.get("sector") or "").strip()
    location = (application.get("location") or "").strip()
    role_title = (application.get("roleTitle") or "").strip()

    # Build a disambiguated query for sources that benefit from extra context
    disambiguated_query = company_name
    if sector:
        disambiguated_query += f" {sector}"
    if location:
        disambiguated_query += f" {location}"

    all_findings = []
    source_errors = {}
    sources_run = []

    # --- Google Knowledge Graph ---
    google_api_key = (config.get("googleKgApiKey") or "").strip()
    try:
        kg_findings, kg_error = search_google_knowledge_graph(company_name, google_api_key)
        sources_run.append("Google Knowledge Graph")
        if kg_error:
            source_errors["Google Knowledge Graph"] = kg_error
        all_findings.extend(kg_findings)
    except Exception as exc:
        source_errors["Google Knowledge Graph"] = f"Unexpected error: {exc}"
        sources_run.append("Google Knowledge Graph")

    # --- Wikidata ---
    try:
        wiki_findings, wiki_error = search_wikidata(company_name)
        sources_run.append("Wikidata")
        if wiki_error:
            source_errors["Wikidata"] = wiki_error
        all_findings.extend(wiki_findings)
    except Exception as exc:
        source_errors["Wikidata"] = f"Unexpected error: {exc}"
        sources_run.append("Wikidata")

    # --- SEC EDGAR ---
    try:
        sec_findings, sec_error = search_sec_edgar(company_name)
        sources_run.append("SEC EDGAR")
        if sec_error:
            source_errors["SEC EDGAR"] = sec_error
        all_findings.extend(sec_findings)
    except Exception as exc:
        source_errors["SEC EDGAR"] = f"Unexpected error: {exc}"
        sources_run.append("SEC EDGAR")

    return {
        "rawFindings": all_findings,
        "filteredFindings": {},   # Stage 2: populated by filtering step
        "meta": {
            "companyName": company_name,
            "disambiguatedQuery": disambiguated_query,
            "sector": sector,
            "location": location,
            "roleTitle": role_title,
            "sourcesRun": sources_run,
            "sourceErrors": source_errors,
            "totalFindings": len(all_findings),
        },
    }


# ===========================================================================
# Stage 2 – Deterministic filtering / ranking
# ===========================================================================

# Source credibility tiers (higher = more trustworthy for company facts)
SOURCE_TRUST = {
    "Google Knowledge Graph": 0.9,
    "Wikidata": 0.7,
    "SEC EDGAR": 0.8,
}


def _normalise(text):
    """Lowercase, strip, collapse whitespace for comparison."""
    return " ".join(str(text).lower().split())


def _name_similarity(a, b):
    """Simple token-overlap ratio between two strings."""
    a_tokens = set(_normalise(a).split())
    b_tokens = set(_normalise(b).split())
    if not a_tokens or not b_tokens:
        return 0.0
    overlap = a_tokens & b_tokens
    return len(overlap) / max(len(a_tokens), len(b_tokens))


def _score_finding(finding, company_name, sector, location):
    """Compute a composite relevance score for a single finding.

    Returns a float 0–1. Higher is better.
    """
    score = 0.0

    # --- Name match (most important) ---
    title_sim = _name_similarity(finding.get("title", ""), company_name)
    if title_sim >= 1.0:
        score += 0.45  # exact match
    elif title_sim >= 0.5:
        score += 0.25  # partial match
    else:
        score += title_sim * 0.15

    # --- Original confidence from source ---
    raw_conf = float(finding.get("confidence", 0))
    score += raw_conf * 0.25

    # --- Source trust tier ---
    source_trust = SOURCE_TRUST.get(finding.get("sourceName", ""), 0.4)
    score += source_trust * 0.15

    # --- Sector/location alignment (bonus) ---
    text_blob = _normalise(
        f"{finding.get('snippet', '')} {finding.get('description', '')} "
        f"{finding.get('matchReason', '')}"
    )
    if sector and _normalise(sector) in text_blob:
        score += 0.08
    if location:
        for token in _normalise(location).split():
            if len(token) > 2 and token in text_blob:
                score += 0.04
                break

    # --- Has useful content (bonus) ---
    if finding.get("url"):
        score += 0.03

    return min(round(score, 4), 1.0)


def _deduplicate_findings(scored_findings):
    """Remove near-duplicate findings, keeping the highest-scored version.

    Two findings are considered duplicates if they share the same normalised
    title, or the same entityId (when present).
    """
    seen_titles = {}    # normalised title → index in result
    seen_entities = {}  # entityId → index in result
    result = []

    for item in scored_findings:
        f = item["finding"]
        norm_title = _normalise(f.get("title", ""))
        eid = (f.get("entityId") or "").strip()

        # Check entity-level duplicate
        if eid and eid in seen_entities:
            continue

        # Check title-level duplicate
        if norm_title and norm_title in seen_titles:
            continue

        idx = len(result)
        result.append(item)
        if norm_title:
            seen_titles[norm_title] = idx
        if eid:
            seen_entities[eid] = idx

    return result


def _extract_website_from_findings(findings):
    """Try to pick the most official-looking URL from top findings."""
    for f in findings:
        url = (f.get("url") or "").strip()
        if not url:
            continue
        # Prefer Wikipedia/Wikidata links for now — they're descriptive
        # Official website would come from KG detailedDescription url
        if "wikipedia.org" in url or "wikidata.org" in url:
            continue
        # Skip SEC links
        if "sec.gov" in url:
            continue
        return url
    return ""


def _extract_field(findings, field, company_name):
    """Extract the best non-empty value for a field from sorted findings."""
    for f in findings:
        val = (f.get(field, "") or "").strip()
        if val and _normalise(val) != _normalise(company_name):
            return val
    return ""


def _collect_snippets_as_facts(scored_items, max_items=8):
    """Collect the most relevant non-empty snippets as notable facts."""
    facts = []
    seen = set()
    for item in scored_items:
        f = item["finding"]
        snippet = (f.get("snippet") or f.get("description") or "").strip()
        if not snippet:
            continue
        norm = _normalise(snippet)
        if norm in seen or len(norm) < 15:
            continue
        seen.add(norm)
        facts.append(snippet)
        if len(facts) >= max_items:
            break
    return facts


def _build_source_items(scored_items):
    """Build the sourceItems list for the filtered output."""
    items = []
    for item in scored_items:
        f = item["finding"]
        items.append({
            "sourceName": f.get("sourceName", ""),
            "sourceType": f.get("sourceType", ""),
            "title": f.get("title", ""),
            "snippet": f.get("snippet", ""),
            "url": f.get("url", ""),
            "confidence": round(item["score"], 2),
            "relevanceReason": f.get("matchReason", ""),
        })
    return items


def filter_research_findings(application, raw_findings):
    """Deterministically filter and structure raw findings.

    Args:
        application: dict with companyName, sector, location, roleTitle.
        raw_findings: list of raw finding dicts from Stage 1.

    Returns:
        dict with the filtered/structured company profile.

    Stage 3 hook: pass the returned filteredFindings + evidence bank
    to OpenAI for final personalised content selection/generation.
    """
    company_name = (application.get("companyName") or "").strip()
    sector = (application.get("sector") or "").strip()
    location = (application.get("location") or "").strip()

    if not raw_findings:
        return _empty_filtered(company_name, "No raw findings to filter.")

    # --- Score every finding ---
    scored = []
    for f in raw_findings:
        s = _score_finding(f, company_name, sector, location)
        scored.append({"finding": f, "score": s})

    # Sort by score descending
    scored.sort(key=lambda x: x["score"], reverse=True)

    # --- Deduplicate ---
    scored = _deduplicate_findings(scored)

    # --- Drop very weak matches (score < 0.15) ---
    # Keep them in sourceItems but flag them
    strong = [item for item in scored if item["score"] >= 0.15]

    if not strong:
        return _empty_filtered(company_name, "All findings scored below relevance threshold.")

    top = strong[0]["finding"]

    # --- Build filtered profile ---
    # Canonical company name: prefer the highest-scored title that closely
    # matches the input name
    canonical = company_name
    for item in strong:
        title = (item["finding"].get("title") or "").strip()
        if title and _name_similarity(title, company_name) >= 0.5:
            canonical = title
            break

    # Best entity description: first good snippet/description
    best_desc = ""
    for item in strong:
        f = item["finding"]
        desc = (f.get("snippet") or f.get("description") or "").strip()
        if desc and len(desc) > 20:
            best_desc = desc
            break

    # Official website
    official_website = _extract_website_from_findings(
        [item["finding"] for item in strong]
    )

    # Company type from KG types or SEC
    company_type = ""
    for item in strong:
        reason = item["finding"].get("matchReason", "")
        if "KG types:" in reason:
            company_type = reason.replace("KG types:", "").strip()
            break
        if item["finding"].get("sourceName") == "SEC EDGAR":
            company_type = "SEC-registered public company"
            break

    # Industry: prefer sector from application, enrich from findings
    industry = sector
    if not industry:
        for item in strong:
            desc = _normalise(
                f"{item['finding'].get('description', '')} {item['finding'].get('snippet', '')}"
            )
            # Simple heuristic: if description mentions common industry words
            for keyword in ["technology", "automotive", "transport", "finance",
                            "healthcare", "energy", "manufacturing", "retail",
                            "construction", "logistics", "engineering", "software"]:
                if keyword in desc:
                    industry = keyword.capitalize()
                    break
            if industry:
                break

    # Headquarters
    headquarters = location  # default to job location
    # Notable facts from snippets
    notable_facts = _collect_snippets_as_facts(strong)

    # Strategic signals: extract from higher-confidence findings
    strategic_signals = []
    for item in strong[:5]:
        f = item["finding"]
        if f.get("sourceName") == "SEC EDGAR" and item["score"] >= 0.3:
            strategic_signals.append(f"Publicly traded (SEC CIK: {f.get('entityId', 'unknown')})")
        reason = (f.get("matchReason") or "").strip()
        if reason and reason not in strategic_signals and "KG types" not in reason:
            strategic_signals.append(reason)

    # Credibility notes
    credibility = []
    sources_used = set()
    for item in strong:
        src = item["finding"].get("sourceName", "")
        if src and src not in sources_used:
            sources_used.add(src)
            credibility.append(f"Found in {src} (confidence {item['score']:.0%})")

    return {
        "canonicalCompanyName": canonical,
        "bestEntityDescription": best_desc,
        "officialWebsite": official_website,
        "companyType": company_type,
        "industry": industry,
        "headquarters": headquarters,
        "regions": [],  # Stage 3: could be enriched by OpenAI
        "parentCompany": "",  # Stage 3: could be enriched by OpenAI
        "notableProductsOrServices": [],  # Stage 3: could be enriched by OpenAI
        "notableFacts": notable_facts,
        "strategicSignals": strategic_signals,
        "credibilityNotes": credibility,
        "sourceItems": _build_source_items(strong),
        "meta": {
            "totalRawFindings": len(raw_findings),
            "scoredAboveThreshold": len(strong),
            "duplicatesRemoved": len(raw_findings) - len(scored) - (len(scored) - len(strong)),
            "topScore": strong[0]["score"] if strong else 0,
        },
    }


def _empty_filtered(company_name, reason=""):
    """Return an empty filtered-findings structure."""
    return {
        "canonicalCompanyName": company_name,
        "bestEntityDescription": "",
        "officialWebsite": "",
        "companyType": "",
        "industry": "",
        "headquarters": "",
        "regions": [],
        "parentCompany": "",
        "notableProductsOrServices": [],
        "notableFacts": [],
        "strategicSignals": [],
        "credibilityNotes": [],
        "sourceItems": [],
        "meta": {
            "totalRawFindings": 0,
            "scoredAboveThreshold": 0,
            "duplicatesRemoved": 0,
            "topScore": 0,
            "note": reason,
        },
    }

import json
import re

with open("uk.indeed.com.har", "r") as f:
    har = json.load(f)

for e in har["log"]["entries"]:
    if "uk.indeed.com/jobs" in e["request"]["url"] and e["response"]["status"] == 200:
        text = e["response"]["content"].get("text", "")
        
        job_matches = re.findall(r'"jobTitle"\s*:\s*"([^"]+)"', text)
        company_matches = re.findall(r'"company"\s*:\s*"([^"]+)"', text)
        location_matches = re.findall(r'"formattedLocation"\s*:\s*"([^"]+)"', text)
        jobkey_matches = re.findall(r'"jobkey"\s*:\s*"([^"]+)"', text)
        salary_matches = re.findall(r'"salarySnippet"\s*:\s*\{[^}]*"text"\s*:\s*"([^"]+)"', text)
        
        print(f"Jobs found: {len(job_matches)}")
        print()
        for i, t in enumerate(job_matches[:25]):
            c = company_matches[i] if i < len(company_matches) else "?"
            l = location_matches[i] if i < len(location_matches) else "?"
            k = jobkey_matches[i] if i < len(jobkey_matches) else "?"
            s = salary_matches[i] if i < len(salary_matches) else "not listed"
            print(f"  {i+1:2d}. {t}")
            print(f"      Company:  {c}")
            print(f"      Location: {l}")
            print(f"      Salary:   {s}")
            print(f"      Key:      {k}")
            print()
        break

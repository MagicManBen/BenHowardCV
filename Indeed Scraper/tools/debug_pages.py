"""Quick debug: check if pagination returns different jobs."""
import re
import json
import time
from curl_cffi import requests

s = requests.Session(impersonate="chrome")
s.get("https://uk.indeed.com/", timeout=15)

for start in [0, 10, 20]:
    resp = s.get(f"https://uk.indeed.com/jobs?q=&l=staffordshire&radius=25&start={start}", timeout=20)
    print(f"\nstart={start}: status={resp.status_code}, length={len(resp.text)}")
    
    m = re.search(
        r'window\.mosaic\.providerData\["mosaic-provider-jobcards"\]\s*=\s*(\{.+?\});\s*</script>',
        resp.text, re.DOTALL,
    )
    if m:
        data = json.loads(m.group(1))
        results = data.get("metaData", {}).get("mosaicProviderJobCardsModel", {}).get("results", [])
        keys = [j.get("jobkey", "?") for j in results]
        print(f"  mosaic: {len(results)} jobs, keys={keys[:4]}")
    else:
        has_challenge = "challenge" in resp.text[:5000].lower()
        title = re.search(r"<title>(.*?)</title>", resp.text[:5000], re.IGNORECASE)
        print(f"  NO mosaic. challenge={has_challenge}, title={title.group(1) if title else 'none'}")
    
    time.sleep(1)

#!/usr/bin/env bash
# Measures Lighthouse scores for the main screens against a running server.
# Usage: BASE=http://localhost:3000 CHROME_PATH=/path/to/chrome bash scripts/lighthouse.sh
set -euo pipefail
BASE=${BASE:-http://localhost:3000}
OUT=docs/lighthouse
mkdir -p "$OUT"
# DEMO_CODE: value of DEMO_ACCESS_CODE when the server requires one
COOKIE=$(curl -s -i -X POST "$BASE/api/auth/demo" -H "origin: $BASE" -H 'content-type: application/json' -d "{\"persona\":\"seiran-lawyer\",\"code\":\"${DEMO_CODE:-}\"}" | grep -i set-cookie | sed 's/^[Ss]et-[Cc]ookie: //; s/;.*//')
ART=$(curl -s "$BASE/app/articles" -H "cookie: $COOKIE" | grep -o '/app/articles/[0-9a-f-]\{36\}' | head -1)
HDR="{\"Cookie\":\"$COOKIE\"}"
run() {
  local name=$1 url=$2 preset=$3 auth=$4
  local args=(--quiet --chrome-flags="--headless=new --no-sandbox" --only-categories=performance,accessibility,best-practices,seo --output=json --output=html --output-path="$OUT/$name-$preset")
  [ "$preset" = desktop ] && args+=(--preset=desktop)
  [ "$auth" = yes ] && args+=("--extra-headers=$HDR")
  npx --yes lighthouse@11.7.1 "$url" "${args[@]}" >/dev/null 2>&1 || true
  node -e "const r=require('./$OUT/$name-$preset.report.json');const c=r.categories;console.log([\"$name\",\"$preset\",...['performance','accessibility','best-practices','seo'].map(k=>Math.round(c[k].score*100))].join('\t'))"
}
printf 'page\tprofile\tperf\ta11y\tbest\tseo\n'
for preset in mobile desktop; do
  run landing "$BASE/" $preset no
  run public-article "$BASE/sites/seiran-law/minato-seiki-data-breach" $preset no
  run dashboard "$BASE/app" $preset yes
  run radar "$BASE/app/radar" $preset yes
  run editor "$BASE$ART" $preset yes
done

#!/usr/bin/env bash
# check-tools.sh — verify all external tool dependencies for MonMon

TOOLS=(
  "subfinder:subdomain"
  "httpx:subdomain"
  "bbscope:bbscope"
)

ALL_OK=true

printf "%-14s %-10s %-44s %s\n" "TOOL" "STATUS" "PATH" "USED BY"
printf "%-14s %-10s %-44s %s\n" "----" "------" "----" "-------"

for entry in "${TOOLS[@]}"; do
  tool="${entry%%:*}"
  used="${entry##*:}"
  path=$(command -v "$tool" 2>/dev/null)
  if [ -n "$path" ]; then
    status="found"
  else
    status="MISSING"
    path="—"
    ALL_OK=false
  fi
  printf "%-14s %-10s %-44s %s\n" "$tool" "$status" "$path" "$used"
done

echo ""
if $ALL_OK; then
  echo "All tools found."
else
  echo "ERROR: Some tools are missing. Install them before running the affected task types."
  exit 1
fi

#!/usr/bin/env bash
set -e

AGENT_DIR="scripts/agents"
FAIL=0

# Invariant 1: No "Before Finishing" customSection anywhere (merged into rules.validation)
if grep -rn "'Before Finishing'\|\"Before Finishing\"" "$AGENT_DIR" --include='*.ts' | grep -v "_helpers.ts"; then
  echo "FAIL: 'Before Finishing' still present — merge into rules.validation"
  FAIL=1
fi

# Invariant 2: STANDARD_JSON_RULES contents not duplicated outside _helpers.ts
for phrase in "No em-dashes" "No curly quotes" "JSON parseable" "parseable by JSON.parse"; do
  if grep -rn "$phrase" "$AGENT_DIR" --include='*.ts' | grep -v "_helpers.ts"; then
    echo "FAIL: '$phrase' appears outside _helpers.ts — should live only in STANDARD_JSON_RULES"
    FAIL=1
  fi
done

# Invariant 3: No inline content_warning str() declarations (must use helper)
INLINE=$(grep -rn "str('content_warning'" "$AGENT_DIR" --include='*.ts' || true)
if [ -n "$INLINE" ]; then
  echo "FAIL: inline content_warning declarations found — use contentWarningField() helper:"
  echo "$INLINE"
  FAIL=1
fi

if [ $FAIL -eq 0 ]; then
  echo "All prompt invariants PASS"
fi

exit $FAIL

#!/usr/bin/env bash
set -e
echo ""
echo "⚠️  PRODUCTION DATABASE PUSH"
echo "   Project: mzdtknroizehxrjptlwd (bright-tale prod)"
echo ""
read -p "Type 'yes-prod' to confirm: " CONFIRM
if [ "$CONFIRM" != "yes-prod" ]; then
  echo "Aborted."
  exit 1
fi
supabase db push
echo "✓ Production migration applied."

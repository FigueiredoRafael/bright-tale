#!/usr/bin/env bash
set -e
ENV=$1
if [ "$ENV" = "prod" ]; then
  echo "⚠️  You are about to operate on PRODUCTION Supabase (mzdtknroizehxrjptlwd)"
  echo "   Press Ctrl+C within 5 seconds to cancel..."
  sleep 5
fi

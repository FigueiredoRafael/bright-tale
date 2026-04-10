#!/usr/bin/env bash
if [ -f supabase/.temp/project-ref ]; then
  echo "Linked to: $(cat supabase/.temp/project-ref)"
else
  echo "Not linked to any remote project"
fi

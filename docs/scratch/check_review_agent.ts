
import { createServiceClient } from './apps/api/src/lib/supabase/index.js';

async function main() {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from('agent_prompts')
    .select('slug, instructions, sections_json')
    .eq('slug', 'review')
    .maybeSingle();

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  if (!data) {
    console.log('No agent found with slug "review"');
    process.exit(0);
  }

  console.log('Slug:', data.slug);
  console.log('--- Instructions ---');
  console.log(data.instructions);
  console.log('--- Sections JSON ---');
  console.log(JSON.stringify(data.sections_json, null, 2));
}

main();

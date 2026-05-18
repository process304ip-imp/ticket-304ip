import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hnbrnidqkuqglbahpjqr.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // I'll use service role if available or just anon

async function testJoin() {
  const supabase = createClient(supabaseUrl, supabaseKey!);
  
  const { data, error } = await supabase
    .from('tickets')
    .select('id, creator:user_profiles!tickets_created_by_fkey(full_name)')
    .limit(1);
    
  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('Success:', data);
  }
}

testJoin();

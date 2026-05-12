import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userId, newPassword, companyId, phoneLast4 } = await req.json() as {
      userId?: string;
      newPassword?: string;
      companyId?: string;
      phoneLast4?: string;
    };

    if (!userId || !newPassword || !companyId || !phoneLast4) {
      return json({ success: false, error: 'Missing reset verification data' }, 400);
    }

    if (newPassword.length < 6) {
      return json({ success: false, error: 'Password must be at least 6 characters' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ success: false, error: 'Missing Supabase service configuration' }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: profile, error: profileError } = await admin
      .from('user_profiles')
      .select('id, company_id, phone')
      .eq('id', userId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (profileError || !profile) {
      return json({ success: false, error: 'ไม่พบข้อมูลบัญชีนี้ในบริษัทที่ระบุ' }, 404);
    }

    const cleanPhone = String(profile.phone || '').replace(/[^0-9]/g, '');
    if (cleanPhone.slice(-4) !== String(phoneLast4)) {
      return json({ success: false, error: 'ยืนยันตัวตนไม่สำเร็จ' }, 403);
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (updateError) {
      return json({ success: false, error: updateError.message }, 500);
    }

    return json({ success: true });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

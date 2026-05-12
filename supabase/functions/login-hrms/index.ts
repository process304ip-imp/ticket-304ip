import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type EmployeeData = {
  ID_Emp?: string;
  EmpName?: string;
  EMail?: string;
  Sim_Number?: string;
  Position?: string;
  Department?: string;
  CompanyName?: string;
};

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
    const { username, password, empId, employeeData } = await req.json() as {
      username?: string;
      password?: string;
      empId?: string;
      employeeData?: EmployeeData;
    };

    if (!username || !password || !empId) {
      return json({ success: false, step: 'validate-input', error: 'Missing username, password, or empId' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ success: false, step: 'env', error: 'Missing Supabase service configuration' }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const profile = employeeData ?? {};
    const email = profile.EMail || `${username}@304ip.local`;
    const fullName = profile.EmpName || username;
    const department = profile.Department || profile.Position || 'pending';
    const phone = profile.Sim_Number || null;

    const { data: existingProfile, error: profileLookupError } = await admin
      .from('user_profiles')
      .select('id, role, status')
      .eq('emp_id', empId)
      .maybeSingle();
    if (profileLookupError) {
      return json({ success: false, step: 'profile-lookup', error: profileLookupError.message }, 500);
    }

    let userId = existingProfile?.id;
    if (!userId) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, emp_id: empId },
      });
      if (createError) {
        return json({ success: false, step: 'create-auth-user', error: createError.message }, 500);
      }
      userId = created.user?.id;
    } else {
      const { error: updateAuthError } = await admin.auth.admin.updateUserById(userId, {
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, emp_id: empId },
      });
      if (updateAuthError) {
        return json({ success: false, step: 'update-auth-user', error: updateAuthError.message }, 500);
      }
    }

    if (!userId) {
      return json({ success: false, step: 'auth-user-id', error: 'Unable to resolve auth user id' }, 500);
    }

    const role = existingProfile?.role || 'pending';
    const status = existingProfile?.status || 'pending';

    const { error: upsertError } = await admin
      .from('user_profiles')
      .upsert({
        id: userId,
        email,
        emp_id: empId,
        full_name: fullName,
        phone,
        department,
        role,
        status,
      }, { onConflict: 'id' });
    if (upsertError) {
      return json({ success: false, step: 'upsert-profile', error: upsertError.message }, 500);
    }

    return json({ success: true, email, userId, role, status });
  } catch (error) {
    return json({ success: false, step: 'exception', error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

interface Env {
  R2_BUCKET: R2Bucket;
  R2_PUBLIC_DOMAIN: string;
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
    },
  });
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const body: any = await context.request.json().catch(() => ({}));
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing url in request body' }), {
        status: 400,
        headers,
      });
    }

    const publicDomain = context.env.R2_PUBLIC_DOMAIN || '';
    const key = url.startsWith(publicDomain + '/')
      ? url.slice(publicDomain.length + 1)
      : url.replace(/^https?:\/\/[^/]+\//, '');

    if (!key) {
      return new Response(JSON.stringify({ error: 'Could not extract key from URL' }), {
        status: 400,
        headers,
      });
    }

    await context.env.R2_BUCKET.delete(key);
    console.log(`[R2 Delete] Deleted key: ${key}`);

    return new Response(JSON.stringify({ success: true, key }), {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error('[R2 Delete] Error:', error.message);
    return new Response(
      JSON.stringify({ error: 'Delete failed', detail: error.message }),
      {
        status: 500,
        headers,
      }
    );
  }
};

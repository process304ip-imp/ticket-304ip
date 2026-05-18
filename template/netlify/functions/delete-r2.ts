import type { Handler } from '@netlify/functions';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true, // Required for R2
});

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing url in request body' }) };
    }

    // Extract key from full public URL
    // e.g. https://pub-xxx.r2.dev/T260515-0001/uuid-1234.mp4 → T260515-0001/uuid-1234.mp4
    const publicDomain = process.env.R2_PUBLIC_DOMAIN || '';
    const key = url.startsWith(publicDomain + '/')
      ? url.slice(publicDomain.length + 1)
      : url.replace(/^https?:\/\/[^/]+\//, '');

    if (!key) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Could not extract key from URL' }) };
    }

    await r2.send(new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
    }));

    console.log(`[R2 Delete] Deleted key: ${key}`);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, key }) };

  } catch (error: any) {
    console.error('[R2 Delete] Error:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Delete failed', detail: error.message }),
    };
  }
};

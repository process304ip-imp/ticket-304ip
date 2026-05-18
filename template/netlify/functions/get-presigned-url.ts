import type { Handler } from '@netlify/functions';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true, // Required for R2
  requestChecksumCalculation: 'WHEN_REQUIRED' as any,
  responseChecksumValidation: 'WHEN_REQUIRED' as any,
});

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
];

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { contentType, originalName, ticketId } = body;

    if (!contentType || !originalName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing contentType or originalName' }),
      };
    }

    if (!ALLOWED_TYPES.includes(contentType)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: `Unsupported content type: ${contentType}` }),
      };
    }

    // Generate safe filename: {ticketId || 'temp'}/{uuid}-{timestamp}.{ext}
    const ext = originalName.includes('.') ? originalName.split('.').pop()!.toLowerCase() : 'bin';
    const rawFolder = ticketId ? ticketId.trim() : 'temp';
    const folder = rawFolder.startsWith('draft-') ? `drafts/${rawFolder}` : rawFolder;
    const fileName = `${folder}/${randomUUID()}-${Date.now()}.${ext}`;

    // Create Presigned URL for PUT
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: fileName,
      ContentType: contentType,
    });

    // URL expires in 15 minutes (900 seconds)
    const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 900 });
    const publicUrl = `${process.env.R2_PUBLIC_DOMAIN}/${fileName}`;

    console.log(`[R2 Presigned] Generated upload URL for ${fileName} (${contentType})`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ uploadUrl, publicUrl }),
    };

  } catch (error: any) {
    console.error('[R2 Presigned] Error:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to generate upload URL', detail: error.message }),
    };
  }
};

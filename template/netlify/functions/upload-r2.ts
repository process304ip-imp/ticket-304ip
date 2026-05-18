import type { Handler } from '@netlify/functions';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true, // Required for R2 — ขาดไม่ได้
  requestChecksumCalculation: 'WHEN_REQUIRED' as any,
  responseChecksumValidation: 'WHEN_REQUIRED' as any,
});

const ALLOWED_TYPES: Record<string, number> = {
  'image/jpeg':      20 * 1024 * 1024,   // 20 MB
  'image/png':       20 * 1024 * 1024,
  'image/webp':      20 * 1024 * 1024,
  'image/gif':       20 * 1024 * 1024,
  'video/mp4':      100 * 1024 * 1024,  // 100 MB
  'video/quicktime': 100 * 1024 * 1024,
  'video/webm':     100 * 1024 * 1024,
};

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Health check
  if (event.httpMethod === 'GET' && event.queryStringParameters?.health === '1') {
    try {
      const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
      await r2.send(new ListObjectsV2Command({
        Bucket: process.env.R2_BUCKET_NAME!,
        MaxKeys: 1,
      }));
      return { statusCode: 200, headers, body: JSON.stringify({ status: 'ok', provider: 'r2' }) };
    } catch (e: any) {
      return { statusCode: 503, headers, body: JSON.stringify({ status: 'error', message: e.message }) };
    }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    // Parse multipart form data
    if (!event.body) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No body provided' }) };
    }

    const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Expected multipart/form-data' }) };
    }

    // Extract boundary
    const boundaryMatch = contentType.match(/boundary=([^;]+)/);
    if (!boundaryMatch) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No boundary in content-type' }) };
    }
    const boundary = boundaryMatch[1].trim();

    // Decode base64 body if needed
    const bodyBuffer = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body, 'binary');

    // Parse multipart parts
    const parts = parseMultipart(bodyBuffer, boundary);

    const filePart = parts.find(p => p.name === 'file');
    const ticketIdPart = parts.find(p => p.name === 'ticketId');

    if (!filePart) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No file in request' }) };
    }

    const ticketId = ticketIdPart?.value?.toString().trim() || 'unknown';
    const mimeType = filePart.contentType || 'application/octet-stream';
    const originalName = filePart.filename || 'upload';
    const fileBuffer = filePart.data;

    // Validate type
    if (!ALLOWED_TYPES[mimeType]) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: `Unsupported file type: ${mimeType}` }),
      };
    }

    // Validate size
    const maxSize = ALLOWED_TYPES[mimeType];
    if (fileBuffer.length > maxSize) {
      const maxMB = Math.round(maxSize / 1024 / 1024);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: `File too large. Max ${maxMB} MB for ${mimeType}` }),
      };
    }

    // Generate safe filename: {ticketId}/{uuid}-{timestamp}.{ext}
    const ext = originalName.includes('.') ? originalName.split('.').pop()!.toLowerCase() : 'bin';
    const rawFolder = ticketId ? ticketId.trim() : 'unknown';
    const folder = rawFolder.startsWith('draft-') ? `drafts/${rawFolder}` : rawFolder;
    const fileName = `${folder}/${randomUUID()}-${Date.now()}.${ext}`;

    // Upload to R2
    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: fileName,
      Body: fileBuffer,
      ContentType: mimeType,
    }));

    const url = `${process.env.R2_PUBLIC_DOMAIN}/${fileName}`;
    console.log(`[R2 Upload] ${mimeType} ${Math.round(fileBuffer.length / 1024)}KB → ${url}`);

    return { statusCode: 200, headers, body: JSON.stringify({ url }) };

  } catch (error: any) {
    console.error('[R2 Upload] Error:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Upload failed', detail: error.message }),
    };
  }
};

// ── Minimal multipart parser ─────────────────────────────────────────────────
interface Part {
  name: string;
  filename?: string;
  contentType?: string;
  value?: Buffer;
  data: Buffer;
}

function parseMultipart(body: Buffer, boundary: string): Part[] {
  const parts: Part[] = [];
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const CRLF = Buffer.from('\r\n');

  let pos = 0;

  const indexOf = (buf: Buffer, search: Buffer, start: number): number => {
    for (let i = start; i <= buf.length - search.length; i++) {
      let found = true;
      for (let j = 0; j < search.length; j++) {
        if (buf[i + j] !== search[j]) { found = false; break; }
      }
      if (found) return i;
    }
    return -1;
  };

  while (pos < body.length) {
    const boundaryPos = indexOf(body, boundaryBuf, pos);
    if (boundaryPos === -1) break;

    pos = boundaryPos + boundaryBuf.length;

    // Check for terminal --
    if (body[pos] === 45 && body[pos + 1] === 45) break;

    // Skip CRLF after boundary
    if (body[pos] === 13 && body[pos + 1] === 10) pos += 2;

    // Parse headers
    const headerEnd = indexOf(body, Buffer.from('\r\n\r\n'), pos);
    if (headerEnd === -1) break;

    const headerStr = body.slice(pos, headerEnd).toString('utf8');
    pos = headerEnd + 4;

    // Find next boundary
    const nextBoundary = indexOf(body, boundaryBuf, pos);
    const dataEnd = nextBoundary === -1 ? body.length : nextBoundary - 2; // -2 for CRLF before boundary
    const data = body.slice(pos, dataEnd);
    pos = nextBoundary === -1 ? body.length : nextBoundary;

    // Parse Content-Disposition
    const dispositionMatch = headerStr.match(/Content-Disposition:[^\r\n]*/i);
    if (!dispositionMatch) continue;

    const disposition = dispositionMatch[0];
    const nameMatch = disposition.match(/name="([^"]+)"/);
    const filenameMatch = disposition.match(/filename="([^"]+)"/);
    const ctMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);

    if (!nameMatch) continue;

    parts.push({
      name: nameMatch[1],
      filename: filenameMatch?.[1],
      contentType: ctMatch?.[1]?.trim(),
      data,
      value: data,
    });
  }

  return parts;
}

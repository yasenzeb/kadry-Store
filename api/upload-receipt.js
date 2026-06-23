export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } }
};

const ALLOWED_ORIGIN = 'https://kadry1.com';

// In-memory rate limiter: max 10 receipt uploads per IP per 10 minutes.
const uploadTracker = new Map();
const MAX_UPLOADS   = 10;
const UPLOAD_WINDOW = 10 * 60 * 1000; // 10 minutes

function checkUploadLimit(ip) {
  const now   = Date.now();
  const entry = uploadTracker.get(ip) || { count: 0, resetAt: now + UPLOAD_WINDOW };

  if (now > entry.resetAt) {
    uploadTracker.set(ip, { count: 1, resetAt: now + UPLOAD_WINDOW });
    return true;
  }

  entry.count += 1;
  uploadTracker.set(ip, entry);
  return entry.count <= MAX_UPLOADS;
}

// Allowed image MIME types via data URL prefix
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Max decoded size: 5 MB
const MAX_BYTES = 5 * 1024 * 1024;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';

  if (!checkUploadLimit(ip)) {
    return res.status(429).json({ success: false, error: 'تجاوزت الحد المسموح به من الرفعات. حاول لاحقاً.' });
  }

  try {
    const { data: base64Data, fileName } = req.body;

    if (!base64Data) {
      return res.status(400).json({ success: false, error: 'لم يتم إرسال بيانات الصورة.' });
    }

    // Validate MIME type from data URL prefix
    const mimeMatch = base64Data.match(/^data:([^;]+);base64,/);
    if (!mimeMatch || !ALLOWED_MIMES.includes(mimeMatch[1])) {
      return res.status(400).json({ success: false, error: 'نوع الملف غير مسموح. يُقبل JPG و PNG و GIF و WebP فقط.' });
    }

    // Validate decoded size
    const base64Payload = base64Data.split(',')[1] || '';
    const decodedBytes  = Math.floor((base64Payload.length * 3) / 4);
    if (decodedBytes > MAX_BYTES) {
      return res.status(400).json({ success: false, error: 'حجم الصورة يتجاوز 5 ميجابايت.' });
    }

    const cloudName  = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey     = process.env.CLOUDINARY_API_KEY;
    const apiSecret  = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(500).json({ success: false, error: 'إعدادات Cloudinary غير مكتملة.' });
    }

    const timestamp = Math.round(Date.now() / 1000);
    const folder    = 'kadry-store/receipts';

    const { createHash } = await import('crypto');
    const sig = createHash('sha1')
      .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
      .digest('hex');

    const formData = new URLSearchParams();
    formData.append('file',      base64Data);
    formData.append('api_key',   apiKey);
    formData.append('timestamp', timestamp.toString());
    formData.append('folder',    folder);
    formData.append('signature', sig);

    const cloudinaryRes = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: 'POST', body: formData }
    );

    const cloudinaryData = await cloudinaryRes.json();

    if (!cloudinaryRes.ok || cloudinaryData.error) {
      throw new Error(cloudinaryData.error?.message || 'Cloudinary upload failed');
    }

    return res.status(200).json({
      success:   true,
      url:       cloudinaryData.secure_url,
      public_id: cloudinaryData.public_id
    });

  } catch (err) {
    console.error('[API /upload-receipt]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

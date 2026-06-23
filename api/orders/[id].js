import { createClient } from '@supabase/supabase-js';

const ALLOWED_ORIGIN = 'https://kadry1.com';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function requireAdmin(req) {
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  if (!ADMIN_PASSWORD) return false;
  return req.headers['x-admin-password'] === ADMIN_PASSWORD;
}

const ALLOWED_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'PUT,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-password');
    return res.status(204).end();
  }

  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);

  if (!requireAdmin(req)) {
    return res.status(403).json({ success: false, error: 'غير مصرح.' });
  }

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ success: false, error: 'Order ID is required.' });
  }

  if (req.method !== 'PUT') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { status } = req.body || {};

    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `الحالة غير صحيحة. القيم المسموح بها: ${ALLOWED_STATUSES.join(', ')}.`,
      });
    }

    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'الطلب غير موجود.' });

    return res.status(200).json({ success: true, order: data });
  } catch (err) {
    console.error(`[API /orders/${id} PUT]`, err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

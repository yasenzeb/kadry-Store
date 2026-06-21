import { createClient } from '@supabase/supabase-js';

const DEFAULT_REVIEWS = [
  { id: '1', name: 'محمد أحمد', rating: 5, text: 'جودة الخامات تتجاوز التوقعات، وتجربة التسوق كانت سلسة ومهنية للغاية.' },
  { id: '2', name: 'سارة علي',  rating: 5, text: 'اشتريت سليبرز والخامة فاخرة جداً. التغليف محترم والتوصيل كان في الميعاد.' },
  { id: '3', name: 'عمر حسن',   rating: 5, text: 'أحسن متجر أحذية جربته. الاستبدال سهل وخدمة العملاء ممتازة وسريعة الرد.' },
];

function getSupabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function requireAdmin(req) {
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '147258';
  const pw = req.headers['x-admin-password'];
  return pw === ADMIN_PASSWORD;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-password');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const supabase = getSupabase();

  /* ── GET /api/reviews ── */
  if (req.method === 'GET') {
    if (!supabase) {
      return res.status(200).json({ success: true, reviews: DEFAULT_REVIEWS });
    }
    try {
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const reviews = data && data.length > 0 ? data : DEFAULT_REVIEWS;
      return res.status(200).json({ success: true, reviews });
    } catch (err) {
      console.error('[api/reviews GET]', err.message);
      return res.status(200).json({ success: true, reviews: DEFAULT_REVIEWS });
    }
  }

  /* ── POST /api/reviews ── (admin only) */
  if (req.method === 'POST') {
    if (!requireAdmin(req)) {
      return res.status(403).json({ success: false, error: 'غير مصرح.' });
    }

    const { name, text, rating } = req.body || {};

    if (!name || !text || !rating) {
      return res.status(400).json({ success: false, error: 'name, text, and rating are required.' });
    }

    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Supabase not configured.' });
    }

    try {
      const { data, error } = await supabase
        .from('reviews')
        .insert([{ name: name.trim(), text: text.trim(), rating: parseInt(rating) }])
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json({ success: true, review: data });
    } catch (err) {
      console.error('[api/reviews POST]', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /* ── DELETE /api/reviews?id=xxx ── (admin only) */
  if (req.method === 'DELETE') {
    if (!requireAdmin(req)) {
      return res.status(403).json({ success: false, error: 'غير مصرح.' });
    }

    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ success: false, error: 'id مطلوب.' });
    }

    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Supabase not configured.' });
    }

    try {
      const { error } = await supabase.from('reviews').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('[api/reviews DELETE]', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}

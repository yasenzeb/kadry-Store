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

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-password');
    return res.status(204).end();
  }

  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);

  try {
    if (req.method === 'GET') {
      const { type } = req.query;
      let query = supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (type && type !== 'all') {
        query = query.eq('type', type);
      }

      const { data, error } = await query;
      if (error) throw error;

      const products = (data || []).map(p => ({
        ...p,
        discount_type:    p.discount_type    || 'none',
        discount_value:   p.discount_value   || 0,
        sizes:            p.sizes            || [],
        colors:           p.colors           || [],
        gallery:          p.gallery          || [],
        main_image_index: p.main_image_index || 0,
      }));

      return res.status(200).json({ success: true, products });
    }

    if (req.method === 'POST') {
      if (!requireAdmin(req)) {
        return res.status(403).json({ success: false, error: 'غير مصرح.' });
      }

      const {
        name, type, price, image_url,
        discount_type, discount_value,
        sizes, colors, gallery, main_image_index
      } = req.body;

      if (!name || !type || !price) {
        return res.status(400).json({ success: false, error: 'name, type, and price are required.' });
      }

      const parsedPrice = parseFloat(price);
      if (!isFinite(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ success: false, error: 'السعر يجب أن يكون رقماً صحيحاً أكبر من أو يساوي صفر.' });
      }

      const parsedDiscountType  = discount_type || 'none';
      const parsedDiscountValue = parseFloat(discount_value) || 0;
      if (parsedDiscountType !== 'none' && (!isFinite(parsedDiscountValue) || parsedDiscountValue < 0)) {
        return res.status(400).json({ success: false, error: 'قيمة الخصم يجب أن تكون رقماً صحيحاً أكبر من أو يساوي صفر.' });
      }

      const { data, error } = await supabase
        .from('products')
        .insert([{
          name,
          type,
          price:            parsedPrice,
          image_url:        image_url              || null,
          discount_type:    parsedDiscountType,
          discount_value:   parsedDiscountType === 'none' ? 0 : parsedDiscountValue,
          sizes:            sizes            || [],
          colors:           colors           || [],
          gallery:          gallery          || [],
          main_image_index: main_image_index || 0,
        }])
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json({ success: true, product: data });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (err) {
    console.error('[API /products]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

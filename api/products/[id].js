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
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-password');
    return res.status(204).end();
  }

  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ success: false, error: 'Product ID is required.' });
  }

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) return res.status(404).json({ success: false, error: 'Product not found.' });

      return res.status(200).json({
        success: true,
        product: {
          ...data,
          discount_type:    data.discount_type    || 'none',
          discount_value:   data.discount_value   || 0,
          sizes:            data.sizes            || [],
          colors:           data.colors           || [],
          gallery:          data.gallery          || [],
          main_image_index: data.main_image_index || 0,
        }
      });
    }

    if (req.method === 'PUT') {
      if (!requireAdmin(req)) {
        return res.status(403).json({ success: false, error: 'غير مصرح.' });
      }

      const {
        name, type, price, image_url,
        discount_type, discount_value,
        sizes, colors, gallery, main_image_index
      } = req.body || {};

      const updates = {};

      if (name      !== undefined) updates.name = name;
      if (type      !== undefined) updates.type = type;
      if (image_url !== undefined) updates.image_url = image_url;

      if (price !== undefined) {
        const parsedPrice = parseFloat(price);
        if (!isFinite(parsedPrice) || parsedPrice < 0) {
          return res.status(400).json({ success: false, error: 'السعر يجب أن يكون رقماً صحيحاً أكبر من أو يساوي صفر.' });
        }
        updates.price = parsedPrice;
      }

      if (discount_type !== undefined) {
        updates.discount_type = discount_type;
      }
      if (discount_value !== undefined) {
        const resolvedType = discount_type !== undefined ? discount_type : undefined;
        if (resolvedType !== 'none' && discount_value !== undefined) {
          const parsedDV = parseFloat(discount_value);
          if (!isFinite(parsedDV) || parsedDV < 0) {
            return res.status(400).json({ success: false, error: 'قيمة الخصم يجب أن تكون رقماً صحيحاً أكبر من أو يساوي صفر.' });
          }
          updates.discount_value = parsedDV;
        } else {
          updates.discount_value = 0;
        }
      }
      if (sizes            !== undefined) updates.sizes            = sizes;
      if (colors           !== undefined) updates.colors           = colors;
      if (gallery          !== undefined) updates.gallery          = gallery;
      if (main_image_index !== undefined) updates.main_image_index = main_image_index;

      // Ensure discount_value is zero when discount_type is 'none'
      if (updates.discount_type === 'none') updates.discount_value = 0;

      const { data, error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, product: data });
    }

    if (req.method === 'DELETE') {
      if (!requireAdmin(req)) {
        return res.status(403).json({ success: false, error: 'غير مصرح.' });
      }

      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return res.status(200).json({ success: true, message: 'Product deleted.' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (err) {
    console.error(`[API /products/${id}]`, err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

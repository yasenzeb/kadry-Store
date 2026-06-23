import { createClient } from '@supabase/supabase-js';

const ALLOWED_ORIGIN = 'https://kadry1.com';

// ── Supabase client (service role — bypasses RLS) ──────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Shipping rates (source of truth lives server-side too) ─────────────────
const SHIPPING_RATES = {
  'الإسكندرية': 90, 'أسوان': 155, 'أسيوط': 105, 'البحيرة': 90,
  'بني سويف': 105, 'القاهرة': 70, 'الدقهلية': 90, 'دمياط': 90,
  'الفيوم': 105, 'الغربية': 90, 'الجيزة': 70, 'البحر الأحمر': 155,
  'الإسماعيلية': 95, 'كفر الشيخ': 90, 'الأقصر': 155, 'مطروح': 155,
  'المنيا': 105, 'المنوفية': 90, 'الوادي الجديد': 155,
  'بورسعيد': 95, 'القليوبية': 90, 'قنا': 155,
  'الشرقية': 90, 'سوهاج': 105, 'جنوب سيناء': 155, 'السويس': 95,
  'شمال سيناء': 155,
};

// ── In-memory rate limiter: max 20 checkouts per IP per 10 minutes ──────────
const notifyTracker = new Map();
const MAX_NOTIFY    = 20;
const NOTIFY_WINDOW = 10 * 60 * 1000;

function checkNotifyLimit(ip) {
  const now   = Date.now();
  const entry = notifyTracker.get(ip) || { count: 0, resetAt: now + NOTIFY_WINDOW };
  if (now > entry.resetAt) {
    notifyTracker.set(ip, { count: 1, resetAt: now + NOTIFY_WINDOW });
    return true;
  }
  entry.count += 1;
  notifyTracker.set(ip, entry);
  return entry.count <= MAX_NOTIFY;
}

// ── Egyptian phone number validation ──────────────────────────────────────
function isValidEgyptPhone(phone) {
  return /^(010|011|012|015)\d{8}$/.test(String(phone).trim().replace(/\s/g, ''));
}

// ── Generate unique order number ───────────────────────────────────────────
function genOrderNumber() {
  return 'K-' + Math.floor(100000 + Math.random() * 900000);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';

  if (!checkNotifyLimit(ip)) {
    return res.status(200).json({ success: true, notified: false });
  }

  const {
    customerName,
    customerPhone,
    governorate,
    address,
    notes,
    paymentMethod,
    items,
    paymentProofUrl,
  } = req.body || {};

  // ── Validate required fields ───────────────────────────────────────────────
  const errors = [];

  if (!customerName || !String(customerName).trim()) {
    errors.push('الاسم مطلوب.');
  }
  if (!customerPhone || !isValidEgyptPhone(customerPhone)) {
    errors.push('رقم الهاتف غير صحيح. يجب أن يبدأ بـ 010 أو 011 أو 012 أو 015 ويتكون من 11 رقماً.');
  }
  if (!governorate || !SHIPPING_RATES[governorate]) {
    errors.push('المحافظة غير صحيحة أو غير مدعومة.');
  }
  if (!address || !String(address).trim()) {
    errors.push('العنوان مطلوب.');
  }
  if (!paymentMethod || !['cod', 'transfer'].includes(paymentMethod)) {
    errors.push('طريقة الدفع غير صحيحة.');
  }
  if (!Array.isArray(items) || items.length === 0) {
    errors.push('يجب أن يحتوي الطلب على منتج واحد على الأقل.');
  }

  if (errors.length) {
    return res.status(400).json({ success: false, error: errors.join(' ') });
  }

  try {
    // ── Fetch authoritative prices from DB ──────────────────────────────────
    const productIds = [...new Set(items.map(i => i.productId).filter(Boolean))];

    let dbProducts = [];
    if (productIds.length > 0) {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, price, discount_type, discount_value')
        .in('id', productIds);
      if (error) throw error;
      dbProducts = data || [];
    }

    const productMap = {};
    dbProducts.forEach(p => { productMap[p.id] = p; });

    // ── Build validated items list and compute totals ───────────────────────
    const validatedItems = [];
    let subtotal = 0;

    for (const item of items) {
      const { productId, size, color, qty } = item;
      const qtyNum = parseInt(qty, 10);

      if (!productId || isNaN(qtyNum) || qtyNum < 1) {
        return res.status(400).json({ success: false, error: 'بيانات منتج غير صحيحة في الطلب.' });
      }

      const dbProduct = productMap[productId];
      if (!dbProduct) {
        return res.status(400).json({ success: false, error: `المنتج ${productId} غير موجود.` });
      }

      // Compute final price server-side
      let unitPrice = Number(dbProduct.price);
      if (dbProduct.discount_type === 'percent' && dbProduct.discount_value > 0) {
        unitPrice = Math.round(unitPrice * (1 - dbProduct.discount_value / 100));
      } else if (dbProduct.discount_type === 'amount' && dbProduct.discount_value > 0) {
        unitPrice = Math.max(0, unitPrice - Number(dbProduct.discount_value));
      }

      const lineTotal = unitPrice * qtyNum;
      subtotal += lineTotal;

      validatedItems.push({
        product_id: productId,
        name:       dbProduct.name,
        size:       size   || null,
        color:      color  || null,
        qty:        qtyNum,
        unit_price: unitPrice,
      });
    }

    const shippingCost  = SHIPPING_RATES[governorate];
    const total         = subtotal + shippingCost;
    const orderNumber   = genOrderNumber();

    // ── Insert into orders table ───────────────────────────────────────────
    const { error: insertError } = await supabase
      .from('orders')
      .insert([{
        order_number:      orderNumber,
        customer_name:     String(customerName).trim(),
        customer_phone:    String(customerPhone).trim(),
        governorate,
        address:           String(address).trim(),
        notes:             notes ? String(notes).trim() : null,
        payment_method:    paymentMethod,
        items:             validatedItems,
        subtotal,
        shipping_cost:     shippingCost,
        total,
        payment_proof_url: paymentProofUrl || null,
        status:            'pending',
      }]);

    if (insertError) throw insertError;

    // ── Send Pushover notification ────────────────────────────────────────
    const P_USER  = process.env.PUSHOVER_USER;
    const P_TOKEN = process.env.PUSHOVER_TOKEN;

    if (P_USER && P_TOKEN) {
      const paymentLabel = paymentMethod === 'cod' ? 'الدفع عند الاستلام' : 'تحويل إلكتروني';
      const itemsText = validatedItems.map(i => {
        const parts = [];
        if (i.size)  parts.push(`مقاس: ${i.size}`);
        if (i.color) parts.push(`لون: ${i.color}`);
        const detail = parts.length ? ` [${parts.join(' — ')}]` : '';
        return `• ${i.name}${detail}\n  الكمية: ${i.qty} | السعر: EGP ${i.unit_price * i.qty}`;
      }).join('\n\n');

      const adminMsg =
`━━━━━━━━━━━━━━ 🛒 طلب جديد KADRY ━━━━━━━━━━━━━━
🆔 رقم الطلب  : ${orderNumber}
👤 الاسم      : ${String(customerName).trim()}
📞 الهاتف     : ${String(customerPhone).trim()}
📍 المحافظة   : ${governorate}
🏠 العنوان    : ${String(address).trim()}
💳 طريقة الدفع: ${paymentLabel}
📝 ملاحظات    : ${notes ? String(notes).trim() : 'لا يوجد'}

📦 المنتجات:
${itemsText}

💰 المجموع   : EGP ${subtotal}
🚚 الشحن     : EGP ${shippingCost}
✅ الإجمالي  : EGP ${total}`;

      try {
        const fd = new URLSearchParams();
        fd.append('token',    P_TOKEN);
        fd.append('user',     P_USER);
        fd.append('title',    String('🛒 طلب جديد من الموقع!').slice(0, 250));
        fd.append('message',  adminMsg.slice(0, 1024));
        fd.append('priority', '1');
        fd.append('sound',    'cashregister');

        await fetch('https://api.pushover.net/1/messages.json', {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body:    fd.toString(),
        });
      } catch (pushErr) {
        // Notification failure must not block order completion
        console.error('[api/checkout] pushover failed:', pushErr.message);
      }
    }

    return res.status(200).json({ success: true, orderNumber, total });

  } catch (err) {
    console.error('[api/checkout]', err);
    return res.status(500).json({ success: false, error: 'خطأ داخلي في الخادم.' });
  }
}

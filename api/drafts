// Order Drafts - one work-in-progress draft per customer, stored in a Softr table.
// This table is SEPARATE from the Zigaflow Sync customer table, so the hourly
// sync can never touch it.
//
//   GET    /drafts?customerName=NAME   -> { success, data: <draft blob>|null, updatedAt, id }
//   PUT    /drafts?customerName=NAME   -> upsert the draft (body = draft blob)  (POST also accepted)
//   DELETE /drafts?customerName=NAME   -> delete the customer's draft (idempotent)
//
// SETUP (one-time, in Softr):
//   1. Create a table called "Order Drafts" with three columns:
//        - "Customer Name" (Single line text)   <- key
//        - "Draft Data"    (Long text)           <- JSON blob of the in-progress order
//        - "Updated At"    (Single line text)    <- ISO timestamp (optional but recommended)
//   2. Copy that table's ID and paste it into DRAFTS_TABLE_ID below.

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // >>> PASTE YOUR "Order Drafts" TABLE ID HERE <<<
  const DRAFTS_TABLE_ID = 'HNfEXNwBvCzLj6';

  const DB = process.env.SOFTR_DATABASE_ID;
  const KEY = process.env.SOFTR_API_KEY;
  const base = `https://tables-api.softr.io/api/v1/databases/${DB}/tables/${DRAFTS_TABLE_ID}`;

  try {
    if (DRAFTS_TABLE_ID === 'PASTE_YOUR_DRAFTS_TABLE_ID_HERE') {
      return res.status(500).json({ success: false, error: 'DRAFTS_TABLE_ID not set in drafts.js' });
    }

    const customerName = (req.query.customerName || '').trim();
    if (!customerName) {
      return res.status(400).json({ success: false, error: 'customerName is required' });
    }

    // --- Fetch the table schema once and map field name -> field id ---
    const schemaResp = await fetch(base, { headers: { 'Softr-Api-Key': KEY } });
    if (!schemaResp.ok) {
      const t = await schemaResp.text();
      console.error('Drafts schema fetch failed:', schemaResp.status, t);
      throw new Error('Failed to fetch drafts table schema (check DRAFTS_TABLE_ID)');
    }
    const schema = await schemaResp.json();
    const fields = (schema.data && schema.data.fields) || [];
    const map = {};
    fields.forEach(function (f) { map[f.name] = f.id; });

    const nameFieldId = map['Customer Name'];
    const dataFieldId = map['Draft Data'];
    const updatedFieldId = map['Updated At']; // optional

    if (!nameFieldId || !dataFieldId) {
      return res.status(200).json({
        success: false,
        error: 'Drafts table must have "Customer Name" and "Draft Data" columns.'
      });
    }

    // --- Helper: find this customer's existing draft record (case-insensitive) ---
    async function findRecord() {
      const r = await fetch(base + '/records?limit=1000', { headers: { 'Softr-Api-Key': KEY } });
      if (!r.ok) throw new Error('Failed to fetch draft records');
      const d = await r.json();
      const all = d.data || [];
      const search = customerName.toLowerCase();
      return all.find(function (rec) {
        const n = rec.fields[nameFieldId];
        return n && n.toString().trim().toLowerCase() === search;
      }) || null;
    }

    // ---------- GET ----------
    if (req.method === 'GET') {
      const rec = await findRecord();
      if (!rec) return res.status(200).json({ success: true, data: null });
      let blob = null;
      try { blob = JSON.parse(rec.fields[dataFieldId] || 'null'); } catch (e) { blob = null; }
      return res.status(200).json({
        success: true,
        data: blob,
        updatedAt: updatedFieldId ? (rec.fields[updatedFieldId] || null) : null,
        id: rec.id
      });
    }

    // ---------- PUT / POST (upsert) ----------
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = req.body || {};
      const jsonStr = typeof body === 'string' ? body : JSON.stringify(body);

      const fieldsPayload = {};
      fieldsPayload[nameFieldId] = customerName;
      fieldsPayload[dataFieldId] = jsonStr;
      if (updatedFieldId) fieldsPayload[updatedFieldId] = new Date().toISOString();

      const existing = await findRecord();
      let resp;
      if (existing) {
        resp = await fetch(base + '/records/' + existing.id, {
          method: 'PATCH',
          headers: { 'Softr-Api-Key': KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: fieldsPayload })
        });
      } else {
        resp = await fetch(base + '/records', {
          method: 'POST',
          headers: { 'Softr-Api-Key': KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: fieldsPayload })
        });
      }

      if (!resp.ok) {
        const t = await resp.text();
        console.error('Draft save failed:', resp.status, t);
        throw new Error('Failed to save draft: ' + resp.status);
      }
      const saved = await resp.json();
      return res.status(200).json({ success: true, id: (saved && saved.id) || (existing && existing.id) });
    }

    // ---------- DELETE ----------
    if (req.method === 'DELETE') {
      const rec = await findRecord();
      if (rec) {
        const resp = await fetch(base + '/records/' + rec.id, {
          method: 'DELETE',
          headers: { 'Softr-Api-Key': KEY }
        });
        if (!resp.ok) {
          const t = await resp.text();
          console.error('Draft delete failed:', resp.status, t);
          throw new Error('Failed to delete draft: ' + resp.status);
        }
      }
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Drafts error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

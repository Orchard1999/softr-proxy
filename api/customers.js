// Customer endpoint (Zigaflow Sync table)
//  GET  = look up a customer by name (unchanged behaviour)
//  PUT  = save the customer's default ship-to details (write-back for "save as default")
//         Only ever writes the five Ship* fields — never touches Zigaflow-synced columns.

const ZIGAFLOW_SYNC_TABLE = 'hqfMbliV2UtsY2';

// The only fields this endpoint is ever allowed to write.
const SHIP_FIELDS = ['Ship Contact', 'Ship Company', 'Ship Address', 'Ship Number', 'Ship Email'];

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      return await getCustomer(req, res);
    }
    if (req.method === 'PUT') {
      return await saveShipDefaults(req, res);
    }
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// Helper: fetch the table schema and return a { fieldName: fieldId } map
async function getFieldMap() {
  const schemaResponse = await fetch(
    `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/${ZIGAFLOW_SYNC_TABLE}`,
    { headers: { 'Softr-Api-Key': process.env.SOFTR_API_KEY } }
  );
  if (!schemaResponse.ok) {
    const errorText = await schemaResponse.text();
    console.error('Schema error:', errorText);
    throw new Error('Failed to fetch table schema');
  }
  const schemaData = await schemaResponse.json();
  const fields = schemaData.data.fields || [];
  const mapping = {};
  fields.forEach(field => { mapping[field.name] = field.id; });
  return mapping;
}

// ============================================
// GET — look up a customer by name  (unchanged)
// ============================================
async function getCustomer(req, res) {
  const { customerName } = req.query;

  if (!customerName) {
    return res.status(400).json({ error: 'customerName is required' });
  }

  console.log('Looking up customer:', customerName);

  const mapping = await getFieldMap();

  const customersResponse = await fetch(
    `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/${ZIGAFLOW_SYNC_TABLE}/records?limit=1000`,
    { headers: { 'Softr-Api-Key': process.env.SOFTR_API_KEY } }
  );

  if (!customersResponse.ok) {
    throw new Error('Failed to fetch customers');
  }

  const customersData = await customersResponse.json();
  const allCustomers = customersData.data || [];

  const customerNameFieldId = mapping['Customer Name'];
  const searchName = customerName.trim().toLowerCase();

  const customerRecord = allCustomers.find(record => {
    const recordName = record.fields[customerNameFieldId];
    if (!recordName) return false;
    return recordName.toString().trim().toLowerCase() === searchName;
  });

  if (customerRecord) {
    const customer = { id: customerRecord.id };
    Object.entries(mapping).forEach(([name, id]) => {
      if (customerRecord.fields[id] !== undefined) {
        customer[name] = customerRecord.fields[id];
      }
    });
    console.log('Found customer:', customer['Customer Name']);
    return res.status(200).json({ success: true, data: customer, exists: true });
  }

  console.log('Customer not found:', customerName);
  return res.status(200).json({ success: true, data: null, exists: false, message: 'Customer not found' });
}

// ============================================
// PUT — save default ship-to details
// Body: { 'Ship Contact', 'Ship Company', 'Ship Address', 'Ship Number', 'Ship Email' }
// Target: ?id=<recordId>  (preferred)  OR  ?customerName=<name>
// ============================================
async function saveShipDefaults(req, res) {
  const { id, customerName } = req.query;
  const body = req.body || {};

  if (!id && !customerName) {
    return res.status(400).json({ success: false, error: 'id or customerName is required' });
  }

  const mapping = await getFieldMap();

  // Build the update payload from ONLY the Ship* fields that (a) were sent and (b) exist on the table.
  const updateFields = {};
  const missingColumns = [];
  SHIP_FIELDS.forEach(name => {
    if (body[name] === undefined) return;              // not sent — ignore
    if (!mapping[name]) { missingColumns.push(name); return; } // column not on table yet
    updateFields[mapping[name]] = body[name];
  });

  if (missingColumns.length > 0 && Object.keys(updateFields).length === 0) {
    // None of the Ship columns exist yet — tell the caller clearly rather than silently doing nothing.
    return res.status(200).json({
      success: false,
      error: 'Ship columns not found on the customer table. Add them first: ' + missingColumns.join(', ')
    });
  }

  if (Object.keys(updateFields).length === 0) {
    return res.status(400).json({ success: false, error: 'No ship fields provided to save' });
  }

  // Resolve the target record id
  let recordId = id;
  if (!recordId) {
    const customersResponse = await fetch(
      `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/${ZIGAFLOW_SYNC_TABLE}/records?limit=1000`,
      { headers: { 'Softr-Api-Key': process.env.SOFTR_API_KEY } }
    );
    if (!customersResponse.ok) throw new Error('Failed to fetch customers');
    const customersData = await customersResponse.json();
    const allCustomers = customersData.data || [];
    const customerNameFieldId = mapping['Customer Name'];
    const searchName = customerName.trim().toLowerCase();
    const match = allCustomers.find(record => {
      const recordName = record.fields[customerNameFieldId];
      return recordName && recordName.toString().trim().toLowerCase() === searchName;
    });
    if (!match) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    recordId = match.id;
  }

  // PATCH only the Ship* fields — partial update, leaves Zigaflow-synced columns untouched.
  const updateResponse = await fetch(
    `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/${ZIGAFLOW_SYNC_TABLE}/records/${recordId}`,
    {
      method: 'PATCH',
      headers: {
        'Softr-Api-Key': process.env.SOFTR_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields: updateFields })
    }
  );

  if (!updateResponse.ok) {
    const errorText = await updateResponse.text();
    console.error('Ship defaults update failed:', errorText);
    throw new Error('Failed to save default address');
  }

  console.log('✅ Saved default ship-to for record:', recordId);
  return res.status(200).json({ success: true, updatedId: recordId, savedFields: Object.keys(body).filter(k => SHIP_FIELDS.includes(k)) });
}

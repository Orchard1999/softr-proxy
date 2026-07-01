// Product Admin - Combined add, update, delete operations
// POST = add product(s)
//        - single object  -> adds one product (with optional Set_Components)  [unchanged behaviour]
//        - { products: [] } or a raw array -> batch add, schema fetched ONCE, per-item results
// PUT = update product
// DELETE = delete product

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const PRODUCT_TABLE_ID = 'NRuw736MZMbayi';
  const SET_COMPONENTS_TABLE_ID = 'OfhywH1KfcbZ7s';

  try {
    switch (req.method) {
      case 'POST':
        return await addProduct(req, res, PRODUCT_TABLE_ID, SET_COMPONENTS_TABLE_ID);
      case 'PUT':
        return await updateProduct(req, res, PRODUCT_TABLE_ID);
      case 'DELETE':
        return await deleteProduct(req, res, PRODUCT_TABLE_ID);
      default:
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ============================================
// Helper: fetch with retry on 429 rate limiting
// ============================================
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch(url, options);
    if (resp.status === 429 && attempt < maxRetries) {
      const delay = Math.pow(2, attempt) * 500;
      console.log(`Rate limited (429), retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    return resp;
  }
}

// ============================================
// Helper: fetch a table schema and return { name: fieldId } map
// ============================================
async function getFieldMap(tableId) {
  const resp = await fetchWithRetry(
    `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/${tableId}`,
    { headers: { 'Softr-Api-Key': process.env.SOFTR_API_KEY } }
  );

  if (!resp.ok) {
    const errorText = await resp.text();
    console.error('Failed to get schema:', resp.status, errorText);
    throw new Error(`Failed to get field IDs: ${resp.status}`);
  }

  const data = await resp.json();
  const fields = data.data.fields || [];
  const map = {};
  fields.forEach(field => { map[field.name] = field.id; });
  return map;
}

// ============================================
// ADD PRODUCT(S) (POST)
// Detects single vs batch. Fetches schema once.
// ============================================
async function addProduct(req, res, tableId, setComponentsTableId) {
  const body = req.body;

  // Normalise into a list of product objects, remembering whether this was a batch call
  const isBatch = Array.isArray(body) || (body && Array.isArray(body.products));
  const items = Array.isArray(body)
    ? body
    : (body && Array.isArray(body.products) ? body.products : [body]);

  if (!items || items.length === 0) {
    return res.status(400).json({ success: false, error: 'No products provided' });
  }

  console.log(`=== ADD PRODUCT REQUEST === (${isBatch ? 'batch of ' + items.length : 'single'})`);

  // Fetch the product table schema ONCE for the whole request
  const fieldMap = await getFieldMap(tableId);
  console.log('✅ Got field mapping:', Object.keys(fieldMap).length, 'fields');

  // Fetch the Set_Components schema once, only if any item is a set
  const anySets = items.some(p =>
    p && p.Is_Set === true && Array.isArray(p.Set_Components) && p.Set_Components.length > 0
  );
  let setFieldMap = null;
  if (anySets) {
    try {
      setFieldMap = await getFieldMap(setComponentsTableId);
      console.log('✅ Got Set_Components field mapping:', Object.keys(setFieldMap).length, 'fields');
    } catch (e) {
      console.error('Failed to get Set_Components schema, sets will be created without components:', e.message);
      setFieldMap = null;
    }
  }

  // Process each product sequentially (keeps API load steady, gives clean per-item results)
  const results = [];
  for (const productData of items) {
    try {
      const created = await createProductRecord(
        productData, fieldMap, setFieldMap, tableId, setComponentsTableId
      );
      results.push({
        design: productData && productData.Design,
        success: true,
        isSet: created.isSet,
        componentsCreated: created.componentsCreated,
        record: created.record
      });
    } catch (err) {
      console.error('Failed to add "' + (productData && productData.Design) + '":', err.message);
      results.push({
        design: productData && productData.Design,
        success: false,
        error: err.message
      });
    }
  }

  // ---- Single call: preserve the original response shape exactly ----
  if (!isBatch) {
    const r = results[0];
    if (!r.success) {
      return res.status(500).json({ success: false, error: r.error });
    }
    return res.status(200).json({
      success: true,
      message: r.isSet
        ? `Set added to catalogue with ${r.componentsCreated} components`
        : 'Product added to catalogue successfully',
      record: r.record,
      componentsCreated: r.componentsCreated
    });
  }

  // ---- Batch call: return per-item results ----
  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const statusCode = (failed.length > 0 && succeeded.length === 0) ? 500 : 200;

  return res.status(statusCode).json({
    success: failed.length === 0,
    total: results.length,
    created: succeeded.length,
    failedCount: failed.length,
    results: results.map(r => ({
      design: r.design,
      success: r.success,
      componentsCreated: r.componentsCreated,
      error: r.error
    }))
  });
}

// ============================================
// Create a single product record (+ set components).
// Throws on failure so the caller can record it per-item.
// ============================================
async function createProductRecord(productData, fieldMap, setFieldMap, tableId, setComponentsTableId) {
  const setComponents = (productData && productData.Set_Components) || [];
  const isSet = productData && productData.Is_Set === true;

  // Validate required fields
  if (!productData || !productData['Customer Name']) throw new Error('Customer Name is required');
  if (!productData['Product Code']) throw new Error('Product Code is required');
  if (!productData['Design']) throw new Error('Design is required');

  // Map incoming data to Softr field structure
  const softrRecord = {};

  const fieldMappings = {
    'Customer Name': 'Customer Name',
    'Product Code': 'Product Code',
    'Design': 'Design',
    'Product Range': 'Product Range',
    'Size': 'Size',
    'Thickness': 'Thickness',
    'Finish': 'Finish',
    'Backing': 'Backing',
    'Packaging Requirement 1': 'Packaging Requirement 1',
    'Packaging Requirement 2': 'Packaging Requirement 2',
    'Packaging Requirement 3': 'Packaging Requirement 3',
    'Bespoke Backing Design': 'Bespoke Backing',
    'JigID': 'JigID',
    'BackJigID': 'BackJigID',
    'PdfSectionStyle': 'PdfSectionStyle'
  };

  Object.entries(fieldMappings).forEach(([formField, softrField]) => {
    if (productData[formField] && fieldMap[softrField]) {
      softrRecord[fieldMap[softrField]] = productData[formField];
    }
  });

  // Is_Set
  if (fieldMap['Is_Set']) {
    softrRecord[fieldMap['Is_Set']] = isSet;
  }

  // Set_Size
  if (isSet && setComponents.length > 0 && fieldMap['Set_Size']) {
    softrRecord[fieldMap['Set_Size']] = setComponents.length;
  }

  // Auto-generate Description
  if (fieldMap['Description']) {
    const descParts = [];
    if (productData['Product Range']) descParts.push(productData['Product Range']);
    if (productData['Size']) descParts.push(productData['Size']);
    if (productData['Finish']) descParts.push(productData['Finish']);
    if (productData['Backing']) descParts.push(productData['Backing']);
    softrRecord[fieldMap['Description']] = descParts.join(', ');
  }

  // Auto-generate Design Description
  if (fieldMap['Design Description']) {
    const designDescParts = [productData['Design']];
    if (productData['Product Range']) designDescParts.push(productData['Product Range']);
    if (productData['Size']) designDescParts.push(productData['Size']);
    if (productData['Finish']) designDescParts.push(productData['Finish']);
    if (productData['Backing']) designDescParts.push(productData['Backing']);
    designDescParts.push(productData['Customer Name']);
    softrRecord[fieldMap['Design Description']] = designDescParts.join(' - ');
  }

  // Auto-generate JoinedName
  if (fieldMap['JoinedName']) {
    const joinedParts = [];
    if (productData['Product Range']) joinedParts.push(productData['Product Range'].replace(/\s/g, ''));
    if (productData['Size']) joinedParts.push(productData['Size'].replace(/\s/g, ''));
    if (productData['Finish']) joinedParts.push(productData['Finish'].replace(/\s/g, ''));
    if (productData['Backing']) joinedParts.push(productData['Backing'].replace(/\s/g, ''));
    softrRecord[fieldMap['JoinedName']] = joinedParts.join('');
  }

  // Create the product record
  const createResponse = await fetchWithRetry(
    `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/${tableId}/records`,
    {
      method: 'POST',
      headers: {
        'Softr-Api-Key': process.env.SOFTR_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields: softrRecord })
    }
  );

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    throw new Error(`Failed to create record: ${createResponse.status} - ${errorText}`);
  }

  const createdRecord = await createResponse.json();
  console.log('✅ Product added:', productData['Design']);

  // Create set components (if applicable and schema available)
  let componentsCreated = 0;

  if (isSet && setComponents.length > 0 && setFieldMap) {
    for (const component of setComponents) {
      try {
        const componentRecord = {};

        const componentMappings = {
          'Design': 'Design',
          'Qty_Per_Set': 'Qty_Per_Set',
          'Set_Description': 'Set_Description',
          'Customer Name': 'Customer Name',
          'Product Code': 'Product Code',
          'Product Range': 'Product Range',
          'Size': 'Size',
          'Thickness': 'Thickness',
          'Finish': 'Finish',
          'Backing': 'Backing',
          'Packaging Requirement 1': 'Packaging Requirement 1',
          'Packaging Requirement 2': 'Packaging Requirement 2',
          'Packaging Requirement 3': 'Packaging Requirement 3',
          'JigID': 'JigID',
          'BackJigID': 'BackJigID',
          'PdfSectionStyle': 'PdfSectionStyle'
        };

        Object.entries(componentMappings).forEach(([formField, softrField]) => {
          if (component[formField] !== undefined && setFieldMap[softrField]) {
            componentRecord[setFieldMap[softrField]] = component[formField];
          }
        });

        // Auto-generate Design Description for component
        if (setFieldMap['Design Description']) {
          const compDescParts = [component['Design']];
          if (component['Product Range']) compDescParts.push(component['Product Range']);
          if (component['Size']) compDescParts.push(component['Size']);
          if (component['Finish']) compDescParts.push(component['Finish']);
          if (component['Backing']) compDescParts.push(component['Backing']);
          compDescParts.push(component['Customer Name']);
          componentRecord[setFieldMap['Design Description']] = compDescParts.join(' - ');
        }

        // Auto-generate Description for component
        if (setFieldMap['Description']) {
          const descParts = [];
          if (component['Product Range']) descParts.push(component['Product Range']);
          if (component['Size']) descParts.push(component['Size']);
          if (component['Finish']) descParts.push(component['Finish']);
          if (component['Backing']) descParts.push(component['Backing']);
          componentRecord[setFieldMap['Description']] = descParts.join(', ');
        }

        // Auto-generate JoinedName for component
        if (setFieldMap['JoinedName']) {
          const joinedParts = [];
          if (component['Product Range']) joinedParts.push(component['Product Range'].replace(/\s/g, ''));
          if (component['Size']) joinedParts.push(component['Size'].replace(/\s/g, ''));
          if (component['Finish']) joinedParts.push(component['Finish'].replace(/\s/g, ''));
          if (component['Backing']) joinedParts.push(component['Backing'].replace(/\s/g, ''));
          componentRecord[setFieldMap['JoinedName']] = joinedParts.join('');
        }

        // Is_Set on the component
        if (setFieldMap['Is_Set']) {
          componentRecord[setFieldMap['Is_Set']] = true;
        }

        const componentResponse = await fetchWithRetry(
          `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/${setComponentsTableId}/records`,
          {
            method: 'POST',
            headers: {
              'Softr-Api-Key': process.env.SOFTR_API_KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fields: componentRecord })
          }
        );

        if (componentResponse.ok) {
          componentsCreated++;
        } else {
          const errorText = await componentResponse.text();
          console.error('Failed to create component:', component['Design'], errorText);
        }
      } catch (compError) {
        console.error('Error creating component:', component['Design'], compError.message);
      }
    }
    console.log(`✅ Created ${componentsCreated}/${setComponents.length} components for "${productData['Design']}"`);
  }

  return { record: createdRecord, componentsCreated, isSet };
}

// ============================================
// UPDATE PRODUCT (PUT)  — unchanged
// ============================================
async function updateProduct(req, res, tableId) {
  const { id } = req.query;
  const { Design, 'Bespoke Backing': BespokeBacking, JigID, BackJigID, PdfSectionStyle } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, error: 'Product ID is required' });
  }

  if (!Design || Design.trim() === '') {
    return res.status(400).json({ success: false, error: 'Design name is required' });
  }

  console.log('Updating product:', id);
  console.log('New design:', Design);
  if (BespokeBacking !== undefined) console.log('New bespoke backing:', BespokeBacking);
  if (JigID !== undefined) console.log('New JigID:', JigID);
  if (BackJigID !== undefined) console.log('New BackJigID:', BackJigID);
  if (PdfSectionStyle !== undefined) console.log('New PdfSectionStyle:', PdfSectionStyle);

  const schemaResponse = await fetch(
    `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/${tableId}`,
    { headers: { 'Softr-Api-Key': process.env.SOFTR_API_KEY } }
  );

  if (!schemaResponse.ok) {
    throw new Error('Failed to fetch table schema');
  }

  const schemaData = await schemaResponse.json();
  const fields = schemaData.data.fields || [];

  const mapping = {};
  fields.forEach(field => { mapping[field.name] = field.id; });

  const designFieldId = mapping['Design'];
  if (!designFieldId) {
    throw new Error('Design field not found in table');
  }

  const updateFields = {
    [designFieldId]: Design.trim()
  };

  if (BespokeBacking !== undefined && mapping['Bespoke Backing']) {
    updateFields[mapping['Bespoke Backing']] = BespokeBacking.trim();
  }
  if (JigID !== undefined && mapping['JigID']) {
    updateFields[mapping['JigID']] = JigID.trim();
  }
  if (BackJigID !== undefined && mapping['BackJigID']) {
    updateFields[mapping['BackJigID']] = BackJigID.trim();
  }
  if (PdfSectionStyle !== undefined && mapping['PdfSectionStyle']) {
    updateFields[mapping['PdfSectionStyle']] = PdfSectionStyle.trim();
  }

  const updateData = { fields: updateFields };

  const updateResponse = await fetch(
    `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/${tableId}/records/${id}`,
    {
      method: 'PATCH',
      headers: {
        'Softr-Api-Key': process.env.SOFTR_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateData)
    }
  );

  if (!updateResponse.ok) {
    const errorText = await updateResponse.text();
    console.error('Update failed:', errorText);
    throw new Error('Failed to update product');
  }

  const result = await updateResponse.json();
  console.log('✅ Product updated successfully');

  return res.status(200).json({
    success: true,
    data: result.data
  });
}

// ============================================
// DELETE PRODUCT (DELETE)  — unchanged
// ============================================
async function deleteProduct(req, res, tableId) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ success: false, error: 'Product ID is required' });
  }

  console.log('Deleting product:', id);

  const deleteResponse = await fetch(
    `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/${tableId}/records/${id}`,
    {
      method: 'DELETE',
      headers: { 'Softr-Api-Key': process.env.SOFTR_API_KEY }
    }
  );

  if (!deleteResponse.ok) {
    const errorText = await deleteResponse.text();
    console.error('Delete failed:', errorText);
    throw new Error('Failed to delete product');
  }

  console.log('✅ Product deleted successfully');

  return res.status(200).json({
    success: true,
    message: 'Product deleted successfully'
  });
}

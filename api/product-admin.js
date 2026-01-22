// Product Admin - Combined add, update, delete operations
// POST = add product
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

  try {
    // Route based on HTTP method
    switch (req.method) {
      case 'POST':
        return await addProduct(req, res, PRODUCT_TABLE_ID);
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
// ADD PRODUCT (POST) - Using Tables API
// ============================================
async function addProduct(req, res, tableId) {
  console.log('=== ADD PRODUCT REQUEST ===');
  console.log('Body:', JSON.stringify(req.body, null, 2));

  const productData = req.body;

  // Validate required fields
  if (!productData['Customer Name']) {
    throw new Error('Customer Name is required');
  }
  if (!productData['Product Code']) {
    throw new Error('Product Code is required');
  }
  if (!productData['Design']) {
    throw new Error('Design is required');
  }

  // Get table schema to get field IDs (using Tables API)
  console.log('Fetching field IDs from Tables API...');
  const schemaResponse = await fetch(
    `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/${tableId}`,
    {
      headers: {
        'Softr-Api-Key': process.env.SOFTR_API_KEY
      }
    }
  );

  if (!schemaResponse.ok) {
    const errorText = await schemaResponse.text();
    console.error('Failed to get schema:', schemaResponse.status, errorText);
    throw new Error(`Failed to get field IDs: ${schemaResponse.status}`);
  }

  const schemaData = await schemaResponse.json();
  const fields = schemaData.data.fields || [];
  
  // Create field name to ID mapping
  const fieldMap = {};
  fields.forEach(field => {
    fieldMap[field.name] = field.id;
  });

  console.log('✅ Got field mapping:', Object.keys(fieldMap).length, 'fields');

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
    'Bespoke Backing Design': 'Bespoke Backing'
  };

  Object.entries(fieldMappings).forEach(([formField, softrField]) => {
    if (productData[formField] && fieldMap[softrField]) {
      softrRecord[fieldMap[softrField]] = productData[formField];
    }
  });

  // Auto-generate Description field
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

  console.log('Creating record with fields:', Object.keys(softrRecord).length);

  // Create record using Tables API
  const createResponse = await fetch(
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
    console.error('Failed to create record:', createResponse.status, errorText);
    throw new Error(`Failed to create record: ${createResponse.status} - ${errorText}`);
  }

  const createdRecord = await createResponse.json();
  console.log('✅ Product added successfully');

  return res.status(200).json({
    success: true,
    message: 'Product added to catalogue successfully',
    record: createdRecord
  });
}

// ============================================
// UPDATE PRODUCT (PUT)
// ============================================
async function updateProduct(req, res, tableId) {
  const { id } = req.query;
  const { Design } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, error: 'Product ID is required' });
  }

  if (!Design || Design.trim() === '') {
    return res.status(400).json({ success: false, error: 'Design name is required' });
  }

  console.log('Updating product:', id, 'New design:', Design);

  // Get table schema to find Design field ID
  const schemaResponse = await fetch(
    `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/${tableId}`,
    {
      headers: {
        'Softr-Api-Key': process.env.SOFTR_API_KEY
      }
    }
  );

  if (!schemaResponse.ok) {
    throw new Error('Failed to fetch table schema');
  }

  const schemaData = await schemaResponse.json();
  const fields = schemaData.data.fields || [];
  
  const mapping = {};
  fields.forEach(field => {
    mapping[field.name] = field.id;
  });

  const designFieldId = mapping['Design'];
  if (!designFieldId) {
    throw new Error('Design field not found in table');
  }

  // Update the record
  const updateData = {
    fields: {
      [designFieldId]: Design.trim()
    }
  };

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
// DELETE PRODUCT (DELETE)
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
      headers: {
        'Softr-Api-Key': process.env.SOFTR_API_KEY
      }
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

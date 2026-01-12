// Add product to Softr Product Catalogue
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
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

    // Get field IDs from Softr (cache this in production)
    console.log('Fetching field IDs...');
    const fieldsResponse = await fetch(
      `https://studio-api.softr.io/v1/api/databases/${process.env.SOFTR_DATABASE_ID}/collections/NRuw736MZMbayi/fields`,
      {
        headers: {
          'Softr-Api-Key': process.env.SOFTR_API_KEY,
          'Softr-Domain': 'customer.orchard-melamine.co.uk'
        }
      }
    );

    if (!fieldsResponse.ok) {
      const errorText = await fieldsResponse.text();
      console.error('Failed to get field IDs:', fieldsResponse.status, errorText);
      throw new Error(`Failed to get field IDs: ${fieldsResponse.status}`);
    }

    const fields = await fieldsResponse.json();
    console.log('✅ Got', fields.length, 'fields');

    // Create field name to ID mapping
    const fieldMap = {};
    fields.forEach(field => {
      fieldMap[field.name] = field.field_id;
    });

    console.log('Field mapping:', fieldMap);

    // Map incoming data to Softr field structure
    const softrRecord = {};

    // Map all the fields from the form
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
      'Bespoke Backing Design': 'Bespoke Backing' // Form field → Softr field
    };

    // Add data for each field that exists in the form data
    Object.entries(fieldMappings).forEach(([formField, softrField]) => {
      if (productData[formField] && fieldMap[softrField]) {
        softrRecord[fieldMap[softrField]] = productData[formField];
      }
    });

    // Auto-generate Description field (if it exists in Softr)
    if (fieldMap['Description']) {
      const descParts = [];
      if (productData['Product Range']) descParts.push(productData['Product Range']);
      if (productData['Size']) descParts.push(productData['Size']);
      if (productData['Finish']) descParts.push(productData['Finish']);
      if (productData['Backing']) descParts.push(productData['Backing']);
      
      softrRecord[fieldMap['Description']] = descParts.join(', ');
    }

    // Auto-generate Design Description (if it exists in Softr)
    if (fieldMap['Design Description']) {
      const designDescParts = [productData['Design']];
      if (productData['Product Range']) designDescParts.push(productData['Product Range']);
      if (productData['Size']) designDescParts.push(productData['Size']);
      if (productData['Finish']) designDescParts.push(productData['Finish']);
      if (productData['Backing']) designDescParts.push(productData['Backing']);
      designDescParts.push(productData['Customer Name']);
      
      softrRecord[fieldMap['Design Description']] = designDescParts.join(' - ');
    }

    // Auto-generate JoinedName (if it exists in Softr)
    if (fieldMap['JoinedName']) {
      const joinedParts = [];
      if (productData['Product Range']) joinedParts.push(productData['Product Range'].replace(/\s/g, ''));
      if (productData['Size']) joinedParts.push(productData['Size'].replace(/\s/g, ''));
      if (productData['Finish']) joinedParts.push(productData['Finish'].replace(/\s/g, ''));
      if (productData['Backing']) joinedParts.push(productData['Backing'].replace(/\s/g, ''));
      
      softrRecord[fieldMap['JoinedName']] = joinedParts.join('');
    }

    console.log('Softr record to create:', JSON.stringify(softrRecord, null, 2));

    // Create record in Softr
    console.log('Creating record in Softr...');
    const createResponse = await fetch(
      `https://studio-api.softr.io/v1/api/databases/${process.env.SOFTR_DATABASE_ID}/collections/NRuw736MZMbayi/records`,
      {
        method: 'POST',
        headers: {
          'Softr-Api-Key': process.env.SOFTR_API_KEY,
          'Softr-Domain': 'customer.orchard-melamine.co.uk',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(softrRecord)
      }
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('Failed to create record:', createResponse.status, errorText);
      throw new Error(`Failed to create record: ${createResponse.status} - ${errorText}`);
    }

    const createdRecord = await createResponse.json();
    console.log('✅ Record created:', createdRecord);

    return res.status(200).json({
      success: true,
      message: 'Product added to catalogue successfully',
      record: createdRecord
    });

  } catch (error) {
    console.error('❌ Error:', error);
    return res.status(500).json({
      error: error.message,
      details: 'Failed to add product to catalogue'
    });
  }
}

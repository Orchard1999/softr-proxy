// Get customer data from Zigaflow Sync table
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { customerName } = req.query;
    
    if (!customerName) {
      return res.status(400).json({ error: 'customerName is required' });
    }
    
    console.log('Looking up customer:', customerName);
    
    // Zigaflow Sync table
    const ZIGAFLOW_SYNC_TABLE = 'hqfMbliV2UtsY2';
    
    // Get table schema
    const schemaResponse = await fetch(
      `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/${ZIGAFLOW_SYNC_TABLE}`,
      {
        headers: {
          'Softr-Api-Key': process.env.SOFTR_API_KEY
        }
      }
    );
    
    if (!schemaResponse.ok) {
      const errorText = await schemaResponse.text();
      console.error('Schema error:', errorText);
      throw new Error('Failed to fetch table schema');
    }
    
    const schemaData = await schemaResponse.json();
    const fields = schemaData.data.fields || [];
    
    const mapping = {};
    fields.forEach(field => {
      mapping[field.name] = field.id;
    });
    
    console.log('Available fields:', Object.keys(mapping));
    
    // Get all customers
    const customersResponse = await fetch(
      `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/${ZIGAFLOW_SYNC_TABLE}/records?limit=1000`,
      {
        headers: {
          'Softr-Api-Key': process.env.SOFTR_API_KEY
        }
      }
    );
    
    if (!customersResponse.ok) {
      throw new Error('Failed to fetch customers');
    }
    
    const customersData = await customersResponse.json();
    const allCustomers = customersData.data || [];
    
    console.log('Total customers:', allCustomers.length);
    
    // Find customer - case insensitive, trimmed
    const customerNameFieldId = mapping['Customer Name'];
    const searchName = customerName.trim().toLowerCase();
    
    const customerRecord = allCustomers.find(record => {
      const recordName = record.fields[customerNameFieldId];
      if (!recordName) return false;
      return recordName.toString().trim().toLowerCase() === searchName;
    });
    
    if (customerRecord) {
      // Build response with friendly field names
      const customer = { id: customerRecord.id };
      
      Object.entries(mapping).forEach(([name, id]) => {
        if (customerRecord.fields[id] !== undefined) {
          customer[name] = customerRecord.fields[id];
        }
      });
      
      console.log('Found customer:', customer['Customer Name']);
      console.log('Price List:', customer['Price List'] || 'NOT SET');
      console.log('Price List Name:', customer['Price List Name'] || 'NOT SET');
      
      return res.status(200).json({
        success: true,
        data: customer,
        exists: true
      });
    } else {
      console.log('Customer not found:', customerName);
      
      return res.status(200).json({
        success: true,
        data: null,
        exists: false,
        message: 'Customer not found'
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
}

// api/prices.js
// Fetches prices for a customer based on their price list

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { priceListId } = req.query;

  if (!priceListId) {
    return res.status(400).json({ 
      success: false, 
      error: 'priceListId is required' 
    });
  }

  // Helper: fetch with retry on 429 rate limiting
  async function fetchWithRetry(url, options, maxRetries = 3) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const resp = await fetch(url, options);
      if (resp.status === 429 && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 500;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      return resp;
    }
  }

  // Helper: paginate through all records
  async function fetchAllRecords(tableId) {
    let allRecords = [];
    let offset = 0;
    let total = Infinity;

    while (offset < total) {
      const resp = await fetchWithRetry(
        `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/${tableId}/records?limit=100&offset=${offset}`,
        { headers: { 'Softr-Api-Key': process.env.SOFTR_API_KEY } }
      );

      if (!resp.ok) throw new Error(`Failed to fetch records from ${tableId} at offset ${offset}`);

      const json = await resp.json();
      const records = json.data || [];
      allRecords = allRecords.concat(records);
      total = json.metadata?.total || records.length;
      offset += 100;
      if (offset > 50000) break;
    }
    return allRecords;
  }

  // Helper: search records with filter
  async function searchRecords(tableId, fieldId, value) {
    let allRecords = [];
    let offset = 0;
    let total = Infinity;

    while (offset < total) {
      const resp = await fetchWithRetry(
        `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/${tableId}/records/search`,
        {
          method: 'POST',
          headers: {
            'Softr-Api-Key': process.env.SOFTR_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            filter: {
              condition: {
                leftSide: fieldId,
                operator: "IS",
                rightSide: value
              }
            },
            paging: { offset: offset, limit: 100 }
          })
        }
      );

      if (!resp.ok) throw new Error(`Failed to search records from ${tableId} at offset ${offset}`);

      const json = await resp.json();
      const records = json.data || [];
      allRecords = allRecords.concat(records);
      total = json.metadata?.total || records.length;
      offset += 100;
      if (offset > 10000) break;
    }
    return allRecords;
  }

  try {
    const priceListsTableId = process.env.PRICELISTS_TABLE_ID;
    const pricesTableId = process.env.PRICES_TABLE_ID;
    
    console.log('Looking up price list:', priceListId);

    // Step 1: Get Price Lists schema and find matching price list
    const schemaResponse = await fetch(
      `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/${priceListsTableId}`,
      { headers: { 'Softr-Api-Key': process.env.SOFTR_API_KEY } }
    );

    if (!schemaResponse.ok) throw new Error('Failed to fetch price lists schema');

    const schemaData = await schemaResponse.json();
    const plFields = schemaData.data.fields || [];
    const plFieldMap = {};
    plFields.forEach(field => { plFieldMap[field.name] = field.id; });

    // Fetch all price lists (small table, no need to search)
    const priceLists = await fetchAllRecords(priceListsTableId);

    const zigaflowIdField = plFieldMap['Zigaflow ID'];
    const nameField = plFieldMap['Name'];

    const matchingPriceList = priceLists.find(pl => 
      pl.fields[zigaflowIdField] === priceListId
    );

    if (!matchingPriceList) {
      console.log('Price list not found for ID:', priceListId);
      return res.status(200).json({
        success: true,
        priceListName: null,
        prices: {},
        message: 'Price list not found - using default prices'
      });
    }

    const priceListName = matchingPriceList.fields[nameField];
    console.log('Found price list:', priceListName);

    // Step 2: Get Prices schema
    const pricesSchemaResponse = await fetch(
      `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/${pricesTableId}`,
      { headers: { 'Softr-Api-Key': process.env.SOFTR_API_KEY } }
    );

    if (!pricesSchemaResponse.ok) throw new Error('Failed to fetch prices schema');

    const pricesSchemaData = await pricesSchemaResponse.json();
    const pricesFields = pricesSchemaData.data.fields || [];
    const pricesFieldMap = {};
    pricesFields.forEach(field => { pricesFieldMap[field.name] = field.id; });

    const itemCodeField = pricesFieldMap['ItemCode'];
    const priceListField = pricesFieldMap['PriceList'];
    const priceField = pricesFieldMap['Price'];

    // Step 3: Search for only this price list's prices (instead of fetching all 2200+)
    const matchingPrices = await searchRecords(pricesTableId, priceListField, priceListName);

    console.log('Prices found for', priceListName + ':', matchingPrices.length);

    // Build lookup object
    const prices = {};
    matchingPrices.forEach(priceRecord => {
      const itemCode = priceRecord.fields[itemCodeField];
      const price = parseFloat(priceRecord.fields[priceField]) || 0;
      if (itemCode) {
        prices[itemCode] = price;
      }
    });

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(200).json({
      success: true,
      priceListId: priceListId,
      priceListName: priceListName,
      priceCount: Object.keys(prices).length,
      prices: prices
    });

  } catch (error) {
    console.error('Error fetching prices:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

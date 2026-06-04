
function buildAlterTableQuery({ input, libs }){
// Get the table name from the Define Table Name step
const tableName = input.mapC3SQ?.[0]?.tableName;

// Get NetSuite records to extract current column names
const netsuiteRecords = input.netsuiteGetSavedSearchA3JT || [];

// Get existing table columns from MSSQL query
const existingColumnsResult = input.mssqlQueryH34B || [];

// Helper function to convert camelCase to snake_case
function camelToSnake(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

// Extract NetSuite column names (excluding __meta)
const netsuiteColumns = netsuiteRecords.length > 0
  ? Object.keys(netsuiteRecords[0]).filter(key => key !== '__meta')
  : [];

// Convert NetSuite columns to snake_case
const netsuiteColumnsSnakeCase = netsuiteColumns.map(col => camelToSnake(col));

// Extract existing column names from MSSQL result (case-insensitive)
const existingColumnNames = existingColumnsResult.map(col => 
  col?.COLUMN_NAME?.toLowerCase()
);

// Find new columns that don't exist in the table yet
const newColumns = netsuiteColumnsSnakeCase.filter(col => 
  !existingColumnNames.includes(col.toLowerCase())
);

// Build ALTER TABLE statement if there are new columns
const hasNewColumns = newColumns.length > 0;
const alterTableQuery = hasNewColumns
  ? `ALTER TABLE ${tableName} ADD ${newColumns.map(col => `${col} NVARCHAR(255)`).join(', ')};`
  : '';

// Return the result
return [{
  alterTableQuery,
  hasNewColumns,
  newColumns
  }];
}
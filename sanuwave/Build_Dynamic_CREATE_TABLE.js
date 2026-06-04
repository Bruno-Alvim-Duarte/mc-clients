const records = input.netsuiteGetSavedSearchA3JT;
const tableConfig = input.mapC3SQ;

// Handle empty array edge case
if (!records || records.length === 0) {
  return [{ createTableQuery: '' }];
}

// Get the dynamic table name from the Define Table Name step
const tableName = tableConfig?.[0]?.tableName || 'default_table';

// Helper function to convert camelCase to snake_case
function camelToSnake(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

// Get the first record and extract all keys except __meta
const firstRecord = records[0];
const keys = Object.keys(firstRecord).filter(key => key !== '__meta');

// Convert keys to snake_case
const snakeCaseKeys = keys.map(key => camelToSnake(key));

// Build column definitions (all NVARCHAR(255))
const columnDefinitions = snakeCaseKeys.map(key => `  ${key} NVARCHAR(255)`).join(',\n');

// Build the CREATE TABLE statement with dynamic table name
const createTableQuery = `CREATE TABLE ${tableName} (\n${columnDefinitions}\n);`;

// Return the result
return [{ createTableQuery }];
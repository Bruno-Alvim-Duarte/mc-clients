const records = input.netsuiteGetSavedSearchA3JT;
const tableNameData = input.mapC3SQ;

// Helper function to convert camelCase to snake_case
const camelToSnake = (str) => {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
};

// Helper function to escape single quotes in SQL strings
const escapeSqlString = (value) => {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
};

// If no records, return empty result
if (!records || records.length === 0) {
  return [{ bulkInsertTempQuery: '', tempTableName: '' }];
}

// Get the table name and prefix with # for temp table
const baseTableName = tableNameData?.[0]?.tableName || 'default_table';
const tempTableName = `#${baseTableName}`;

// Get all keys from the first record, excluding __meta
const firstRecord = records[0];
const camelCaseKeys = Object.keys(firstRecord).filter((key) => key !== '__meta');

// Convert keys to snake_case for SQL column names
const snakeCaseColumns = camelCaseKeys.map((key) => camelToSnake(key));

// Build CREATE TABLE statement with all columns as NVARCHAR(255)
const columnDefinitions = snakeCaseColumns.map((col) => `${col} NVARCHAR(255)`);
const createTableQuery = `CREATE TABLE ${tempTableName} (${columnDefinitions.join(', ')})`;

// Build VALUES clauses for each record
const valuesClauses = records.map((record) => {
  const values = camelCaseKeys.map((key) => escapeSqlString(record?.[key]));
  return `(${values.join(', ')})`;
});

// Build INSERT statement
const insertQuery = `INSERT INTO ${tempTableName} (${snakeCaseColumns.join(', ')}) VALUES ${valuesClauses.join(', ')}`;

// Combine both statements
const bulkInsertTempQuery = `${createTableQuery};\n${insertQuery};`;

return [{ bulkInsertTempQuery, tempTableName }];
# Gravity Code Snippets

Use these files as the source snippets for the Gravity workflow `Amazon Settlement Reports to NetSuite Journal Entries`.

## Map Steps

- `maps/00_build_runtime_config.js`: centralizes workflow constants, NetSuite IDs, account IDs, behavior flags, recipients, and the shared failure-array memory key.
- `maps/01_filter_completed_settlement_reports.js`: filters Amazon report list output to completed settlement reports after the cutoff date, merges unresolved failed settlements from `amazon_settlement_failures`, and dedupes the loop input.
- `maps/02_parse_settlement_report_tsv.js`: parses the downloaded tab-delimited settlement report, validates totals/tax, and aggregates category totals.
- `maps/03_build_financial_event_group_search_request.js`: builds the Amazon Financial Event Group date window around the settlement end date.
- `maps/04_apply_settlement_currency_conversion.js`: matches the Financial Event Group by `fundTransferDate`, calculates Amazon's exchange rate, and converts configured source currencies such as MXN to USD.
- `maps/05_build_journal_entry_payload.js`: builds the NetSuite Journal Entry payload and verifies that the JE balances.
- `maps/06_build_failure_memory_payload.js`: adds or replaces the current settlement in the shared failure array for retryable settlement failures.
- `maps/07_build_resolved_failure_memory_payload.js`: removes the current settlement from the shared failure array after a successful retry.

## NetSuite Execute Custom Code Steps

- `netsuite/01_search_existing_journal_entry.js`: searches for an existing Journal Entry by settlement external ID.
- `netsuite/02_create_journal_entry.js`: creates the NetSuite Journal Entry.
- `netsuite/03_attach_settlement_csv.js`: saves the settlement file to File Cabinet and attaches it to the Journal Entry.

## Required Replacements Before Production

- Do not configure a tax account. Tax rows are validated only; if tax and withheld tax do not net to zero, skip the settlement and alert.
- Do not configure a clearing/balancing account. Cash account `1113` is the clearing line, using the settlement header `total-amount`.
- Replace sandbox File Cabinet folder ID `701790` in `maps/00_build_runtime_config.js`, or pass `amazonSettlementFileCabinetFolderId` as a workflow argument before go-live.
- Replace placeholder Gravity step keys such as `amazonListFbmReports`, `mapParseSettlementReportTsv`, and `netsuiteCreateJournalEntry` with the actual step keys Cloudy creates.

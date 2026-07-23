# Gravity Code Snippets

Use these files as the source snippets for the Gravity workflow `Amazon Settlement Reports to NetSuite Journal Entries`.

## Map Steps

- `maps/00_build_runtime_config.js`: centralizes workflow constants, NetSuite IDs, account IDs, behavior flags, recipients, and memory key prefix.
- `maps/01_filter_completed_settlement_reports.js`: filters Amazon report list output to completed settlement reports after the cutoff date.
- `maps/02_parse_settlement_report_tsv.js`: parses the downloaded tab-delimited settlement report, validates totals/tax, and aggregates category totals.
- `maps/03_build_journal_entry_payload.js`: builds the NetSuite Journal Entry payload and verifies that the JE balances.
- `maps/04_build_failure_memory_payload.js`: builds the memory/KV payload for retryable settlement failures.
- `maps/05_build_resolved_failure_memory_payload.js`: marks a previous failure as resolved when delete is not available.

## NetSuite Execute Custom Code Steps

- `netsuite/01_search_existing_journal_entry.js`: searches for an existing Journal Entry by settlement external ID.
- `netsuite/02_create_journal_entry.js`: creates the NetSuite Journal Entry.
- `netsuite/03_attach_settlement_csv.js`: saves the settlement file to File Cabinet and attaches it to the Journal Entry.

## Required Replacements Before Production

- Replace `TODO_TAX_ACCOUNT_ID` in `maps/00_build_runtime_config.js`, or pass `amazonSettlementTaxAccountId` as a workflow argument.
- Set `netsuite.balancingAccountId` in `maps/00_build_runtime_config.js`, or pass `amazonSettlementBalancingAccountId` as a workflow argument, only if Lionel confirms a balancing account is required.
- Replace sandbox File Cabinet folder ID `701790` in `maps/00_build_runtime_config.js`, or pass `amazonSettlementFileCabinetFolderId` as a workflow argument before go-live.
- Replace placeholder Gravity step keys such as `amazonListFbmReports`, `mapParseSettlementReportTsv`, and `netsuiteCreateJournalEntry` with the actual step keys Cloudy creates.

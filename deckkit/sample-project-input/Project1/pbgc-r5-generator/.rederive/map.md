# Decision map
repo: pbgc-r5-generator | built from: 4da03b5 | date: 2026-11-22
root problem: A reviewer must summarize a plan's provisions across many plan documents and amendments into one R5 table, and must be able to prove where every value came from.

## D1. Keep one answer per provision per document
- Problem: Amendments change some provisions and say nothing about others. The summary must show what each document says.
- Given: A list of plan documents in date order, and a list of provisions to summarize.
- Constraints, in order:
  1. A reader must see which document each value came from -> breaks: one merged value per provision
  2. A later document may change a value -> breaks: keeping only the newest value
- Decision: Per-document answer table. Each provision holds one answer for each document column, in document order.
- Options: One merged value: simple, loses history. Per-document answers: more data, keeps the trail. Event log of changes: complete, hard to read.
- Evidence: code only
- Where: packages/module-1-r5/src/types.ts::ProvisionAnswer - one answer with value, citation and lifecycle
- Where: packages/module-1-r5/src/types.ts::R5Json - holds provisions per field and per document

## D2. Carry the governing rule forward when an amendment is silent
- Problem: An amendment says nothing about a provision. The old rule still applies. The table must not show a blank.
- Given: Per-document answers (D1).
- Constraints, in order:
  1. Silence is not a change -> breaks: marking the cell missing
  2. Silence is not proof that no provision exists -> breaks: marking the cell not applicable
  3. A later amendment may replace the rule -> breaks: carrying the first value forever
- Decision: Lifecycle states (unchanged, amended, superseded, missing, notApplicable) and a carried-forward trace that names the source document.
- Options: Leave blank: honest, but hides the rule that governs. Copy value silently: looks complete, hides the source. Carry forward with a trace: complete and checkable.
- Evidence: code only
- Where: packages/module-1-r5/src/review.ts::reconcileProvision - walks documents in order and tracks the governing rule
- Where: packages/module-1-r5/src/types.ts::CarriedForward - names the document the value came from

## D3. A missing value is safer than a guessed value
- Problem: The extractor may not find a value. A wrong value in a regulatory filing costs more than a blank.
- Given: Extraction results with a status.
- Constraints, in order:
  1. Do not guess -> breaks: filling with the most likely value
  2. Not applicable needs proof -> breaks: treating "not found" as "does not exist"
- Decision: Not applicable only with affirmative evidence: a quoted sentence, or a full-document search on a full plan document.
- Options: Trust the extractor: fast, unsafe. Require evidence: slower, defensible.
- Evidence: code only
- Where: packages/module-1-r5/src/review.ts::hasAffirmativeAbsenceEvidence - tests the evidence rule
- Where: packages/module-1-r5/src/types.ts::NaBasis - records the basis for not applicable

## D4. A final gate before publication
- Problem: A draft with unresolved items must not leave the tool as a final document.
- Given: Reviewed answers and approvals.
- Constraints, in order:
  1. Any edit invalidates earlier approval -> breaks: approving once and editing freely
  2. Case number must be exactly 8 digits -> breaks: free-text case numbers
- Decision: Draft and final states. Only the publish step can set final. Any edit reopens draft.
- Options: Warn only: easy, ignored. Hard gate: blocks until blockers are clear.
- Evidence: code only
- Where: packages/module-1-r5/src/generate.ts::finalBlockers - lists every reason to block
- Where: packages/module-1-r5/src/generate.ts::publishFinal - sets final only when no blockers
- Where: packages/module-1-r5/src/generate.ts::reopenDraft - returns to draft

## D5. One self-contained file with no network
- Problem: The tool runs where there is no server and no network. Plan documents are sensitive.
- Given: A set of source modules.
- Constraints, in order:
  1. No runtime network -> breaks: loading libraries from a CDN
  2. Easy to deliver -> breaks: a folder of files
- Decision: Build step joins modules into one HTML file. A content security policy blocks all connections.
- Options: Hosted app: easy updates, needs network. Installed app: needs install rights. Single file: runs anywhere.
- Evidence: code only
- Where: scripts/build_single_file.py::main - joins modules into one file
- Where: r5-generator.html::Content-Security-Policy - connect-src 'none'

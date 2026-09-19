# Student page fixes

Implemented 9 September 2026 against the findings in [the original audit](<C:/Users/ANURAG TIWARI/Desktop/school/STUDENT_PAGE_REVIEW.md>). The audit's line references describe the pre-fix code; use the files below for the current implementation.

**Changes by audit finding**

| Findings | Implemented changes |
| --- | --- |
| 1, 8, 9, 19 | Message drafts reset when opening/closing a recipient; missing parent accounts cannot send. Names/messages are trimmed and validated. Saving locks dialog dismissal and fields; API errors stay inline without clearing the form. |
| 2, 14, 15, 16 | Assignment loads full routes independently of roster refresh, displays the flattened `routeStopName`, and distinguishes loading, error, missing-route, and empty-stop states. POST is create-only: a student who is already assigned cannot open or submit another assignment, and successful creates remain blocked if roster refresh fails. **Finding 14 (replacement) is now closed** — Change Route & Stop moves an existing mapping through a single atomic PUT, including across routes, and a child with separate morning and afternoon stops chooses which leg moves. |
| 3, 11, 12, 13, 18 | Visible pages refresh every 30 seconds and on focus, with manual Refresh and a last-updated time. Slow requests are coalesced; optional panels cannot lock roster refresh. Failed refresh preserves the last roster and operation credentials. URL search changes reset filters, and pagination clamps when results shrink. |
| 4, 5, 6, 7 | CSV uses explicit header aliases and proper quoted-record parsing. The dialog provides a downloadable template, paginated preview, physical line numbers, errors, and ignored-column warnings. Invalid files are blocked as a whole; no rows are silently discarded. |
| 10, 20, 21 | Chart, badges, counts, and legend share one status definition. All five chart segments render correctly. Late statistics distinguish unavailable data from zero; the inactive Route Flags action was removed. |
| 17, 24 | Credentials use explicit create/import wording, wait for clipboard completion, retain manual-copy fields on failure, and require explicit Done. |
| 22, 23 | Alerts include timestamps and applicable incident status. Exports use the snapshot's IST attendance date and identify all/filtered scope. |
| 25, 26, 27, 28, 29 | Table and alerts rail align independently, eliminating height-driven blank table space. Header actions wrap, the rail moves below the table on narrower screens, charts preserve aspect ratio, and modal bodies scroll within the viewport. Long profile and credential values have responsive layouts. |
| 30, 31 | All six dialogs share a native modal foundation with named titles, focus restoration, busy guards, and associated form labels. Filters expose their selected state, search and pagination have labels, and row icon actions identify the student. |

Also added status/grade/route filtering, Clear filters, sorting, page-size selection, filtered exports, and separate first-use/no-match empty states.

**Current files**

- [Student page](<C:/Users/ANURAG TIWARI/Desktop/school/components/views/StudentsAttendance.tsx>) and [refresh hook](<C:/Users/ANURAG TIWARI/Desktop/school/components/views/students/useStudentsData.ts>).
- [Student processing, dates, and chart/status definitions](<C:/Users/ANURAG TIWARI/Desktop/school/lib/students.ts>).
- [CSV parser](<C:/Users/ANURAG TIWARI/Desktop/school/lib/studentImport.ts>) and [import preview](<C:/Users/ANURAG TIWARI/Desktop/school/components/views/students/ImportStudentsModal.tsx>).
- [Shared dialog](<C:/Users/ANURAG TIWARI/Desktop/school/components/views/students/StudentDialog.tsx>).

**Verification**

- 55 focused Node/jsdom tests pass using `node node_modules/vitest/vitest.mjs run --config vitest.students.config.mts`.
- Changed student code, API helper, and tests pass ESLint.
- TypeScript checking passes. Production build and static export pass.
- No browser testing, live API requests, dependency installation, or deployment was performed. Unrelated existing workspace changes were preserved.

Regression tests cover message-recipient isolation, consecutive assignments, URL search, failed refresh, slow-response polling, pending optional panels, credentials after successful creation plus failed refresh, pagination shrinkage, dialog busy/dismissal behavior, clipboard failures, import preview, invalid-row handling, CSV quoting/header mapping, API error propagation, status processing, and date boundaries. Native browser focus containment and visual appearance were not exercised in jsdom.

**Backend/product boundaries**

- `POST /student-route-mappings` never replaces an existing mapping: a different stop on the same route returns 409, and a different route creates an *additional* mapping, putting the child on two driver rosters. **Verified live 11 September 2026** — the earlier "server-side replacement semantics have not been verified live" caveat is resolved, and the answer was no replacement. That is why the PUT exists; do not re-derive this.
- **Reassignment shipped 11 September 2026.** `GET /schools/:schoolId/students` now returns `mappings[]` per student, and `PUT /api/student-route-mappings/:id` moves one mapping in a single call. Change Route & Stop uses the PUT, so a failed move leaves the original mapping untouched — there is no unassigned-on-failure window. `direction` is omitted on the move, which preserves the leg the mapping already served; sending `null` would widen a one-leg mapping back to both.
- Conflicts: a 409 carrying `code: "MAPPING_EXISTS"` means the child already holds another mapping pointing at the target stop, and a 404 means someone else changed the child first — both get their own message, and the 404 also refetches the roster. Every other 409 shares the create conflict's shape and is shown as the server wrote it.
- `DELETE /api/student-route-mappings/:id` exists and returns 204. It is now callable, since `mappings[]` supplies the id, but no unassign action has been added to the page — assignments can be moved, not removed.
- A payload carrying only the flattened `assignedRoute`/`routeStopName` names the stop but not the mapping row, so such a student can be neither changed nor reassigned: the page says "Refresh to change this assignment" rather than offering an assign action that would create a duplicate. `assignedRoute` and `routeStopName` remain the display fields and may represent only one of several mappings; `mappings[]` is what the page acts on.
- The student endpoint's recognized boarding summary remains authoritative. Fallback logs now use the latest valid timestamp within the school day. Leave/no-show precedence and the server's summary contract remain unchanged.
- Optional historical attendance, student archive/edit/RFID replacement, and phone-only registration were not added: they need supported backend operations or an explicit product-rule decision.

The query integration follows [Next.js search-parameter guidance](https://nextjs.org/docs/app/api-reference/functions/use-search-params), including a Suspense boundary for static export. Modal behavior uses the native [dialog showModal API](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal).

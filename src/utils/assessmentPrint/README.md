# Accounts assessment printing

This module is used only by `AccountsMarksService.getPrintDocument`. It builds
one HTML document shared by the preview and the print action. Excel downloads,
normal result screens, saved marks and exam configuration do not use this policy.

The API's `format=print&renderer=client` response is a versioned, read-only
payload of original marks, configured papers, attendance and required FA sources.
It retains the whole class cohort so ranks and visible Science/EVS alternatives
are determined before applying the result-status filter. Deploy the API support
before or alongside the frontend; older clients can still request server HTML.

Printing creates fresh rows and floors each numeric mark to a multiple of 0.5
before deriving component totals, FA contributions, subject totals and grand
totals. Percentages and GPA keep their usual precision. In passing-criteria mode,
only entered Slip Test/direct marks receive the smallest half mark satisfying
the 36% minimum; nulls and absences are preserved. No adjusted marks are sent to
an API write endpoint or assigned to the source payload.

Classes 6–10 FAs use full component columns for every subject, including mixed
component/direct configurations. A direct-only subject shows its saved score in
Total and leaves component cells empty. Its configured schema remains authoritative;
leftover component fields must not override a deliberate direct assessment.

For a secondary FA print, an inconsistent legacy direct paper is recovered for
one section only when at least one saved total exceeds its configured maximum,
and every scored row matches all four valid saved components. The print then
uses the component maximum and reports the recovery in its legend. A section
with genuine direct scores keeps its configured schema. This runs before
rounding, ranking and filtering, and never changes database configuration or marks.
Column widths reserve room for the longest printed decimals across all pages.

`totals.js`, `ranking.js` and `componentMaximums.js` adapt print rows to the
existing frontend arithmetic and validation. The renderer keeps the photographed
register's separate A2-inclusive grade policy. Tests exercise frozen inputs,
rounding boundaries, result filters, mixed layouts, split Science and API reads.

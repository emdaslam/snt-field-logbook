# S&T Field Logbook — Change Timeline

Version history of the offline Android app. Newest first.
For build / signing / Drive-setup details see [ANDROID_APK_GUIDE.md](ANDROID_APK_GUIDE.md).

## 1.7.6.83 — 2026-08-23

**Minor: TA Journal export — one centred TRAIN NO heading, TOTAL lines up before the equals, tighter header spacing and a sentence-case certification line**

- **TRAIN NO is one centred heading over the train column.** TRAIN and NO previously hung on two separate header tiers; the header now shows a single TRAIN NO cell spanning both rows, centred over the train legs — in the PDF, Word and Excel exports.
- **The summary TOTAL word sits right before the "=" sign.** The line now reads "TOTAL = 12 DAYS" instead of TOTAL floating in its own column at the far left, aligned with the 100/70/30% rows above it. Applies to the PDF/Word body and the Excel summaries.
- **The TA heading sits closer to the line under it.** The separator now follows "SOUTH COAST RAILWAY. GUNTAKAL DIVISION" at the same tighter spacing the Diary export already used.
- **The certification line stays in sentence case with "employee" underlined.** The "I here certify …" line no longer prints in capitals like the rest of the report; "employee" is underlined in the PDF, Word and Excel exports.

## 1.7.6.82 — 2026-08-23

**Minor: Export polish — plain PDFs carry no generated footer, TA totals align, diary signature inset**

- **Plain (black-and-white) PDF exports no longer print the generated footer**
  ("Railway S&T Field Logbook · generated …" and "Page i of N"). The footer now
  only appears on the coloured export — the plain report matches the reference
  sheet exactly, even when it runs to several pages.
- **The TA Journal's bottom TOTAL row aligns with the 100/70/30% rows above it.**
  The "=" sign now lands under the same column as the upper amounts' equals, in
  the PDF, Word and Excel exports.
- **The diary's signing designation is set slightly in from the right edge**
  instead of sitting flush in the corner — it reads as an intentional signature
  block rather than a stray corner label. Applies to PDF and Word exports.

## 1.7.6.81 — 2026-08-23

**Minor: Diary table cells fit their content — tighter rows, and the work text left-aligned**

- **The Diary table rows are no taller than their content.** The cell padding is
  halved, so a row holding a single line (e.g. "ROAD") is just tall enough to
  hold it, and the whole month's table takes visibly less vertical space.
- **When a day has two rows and the NATURE OF WORK text is long, both rows grow
  equally** so the merged work cell always fits — one leg never grows while the
  other stays short.
- **NATURE OF WORK content is now left-aligned** in the Diary and TA Journal
  exports — the heading stays centred, but the work text lines up on the left
  like a written description instead of floating in the middle. Applies to the
  PDF, Word and Excel exports.

## 1.7.6.80 — 2026-08-23

**Minor: Diary export — tighter heading gap and slimmer train-no / time / station columns**

- **The gap between the Diary heading and the separator line under it is smaller.**
  The line now sits close to the "DIARY OF SRI …" heading instead of a full line-height below it.
- **The TRAIN NO, TIME DEP, TIME ARR, FROM and TO columns are now just wide enough
  for their content** — in the PDF, Word and Excel exports. The space they free up
  goes to the NATURE OF WORK column, which gets more room for the work text.

## 1.7.6.79 — 2026-08-23

**Minor: Diary and TA Journal exports print everything in capitals**

- **All text in the Diary and TA Journal exports is now in capital letters.**
  Work descriptions, station names, the profile block, the certification line and
  every note are shown in capitals in the PDF, Word and Excel exports — even when
  typed in small letters. Headings, dates, times, amounts and the header row are
  unaffected (they were already uppercase).

## 1.7.6.78 — 2026-08-22

**Minor: plain Diary / TA Journal exports fixed — table heading boxes and even TA profile spacing**

- **The table heading now shows its boundary boxes in the plain black-and-white exports.** The PDF grid drew the header row without any cell borders — invisible while the heading was coloured, but in the plain layout the DATE / TRAIN NO / TIME / … heading floated without its boxes. The Diary and TA Journal header cells now print with the same black grid lines as the rest of the table.
- **The TA profile block sits on even spacing.** Name / Designation / P.F.NO / Pay Metric and Headquarters / Month / B.U.No / Pay are now spaced evenly across the width, and the Pay Metric field keeps the same space after its colon as the other fields.

## 1.7.6.77 — 2026-08-22

**Major: plain black-and-white Diary and TA Journal exports, with the coloured style one tap away**

- **The Diary and TA Journal now export in the plain reference layout.** Both
  exports default to the simple black-and-white look of the reference sheets —
  no shaded table headers, no navy/green headings, no alternating row colours.
  Word (.docx) exports follow the same plain styling.
- **Keep the colours when you want them.** The export sheet that opens when you
  tap **Generate Diary / Generate TA Journal** now has a **Colour / Plain (no
  colour)** style selector. Pick **Colour** for the earlier branded look. Each
  export type remembers its own choice, so your next export of the same report
  uses the style you picked.

## 1.7.6.76 — 2026-08-22

**Major: travel details on daily logs, and exact TA amounts in the exports**

- **Daily logs ask how you travelled.** On a station or footplate movement (away
  from HQ) the form now has a **Travel Details** block that asks about both the
  on-board journey (HQ → station / boarding station) and the return journey
  (station / boarding station → HQ). **By Road** is the default; choose **By
  Train** to enter the train number. The choice and train number are stored per
  log.
- **Printed in the Diary and TA Journal.** Both exports show **ROAD** or the
  train number in the train column for each leg, and the entry detail view shows
  the travel summary too. Logs made before this version show **ROAD**.
- **TA amounts keep their paise.** TA Journal amounts and totals are no longer
  rounded to whole rupees — a 192.85 amount stays 192.85, and totals are exact
  to the paisa. (The daily-log times and the TA Journal format are unchanged.)

## 1.7.6.75 — 2026-08-22

**Minor: low-stock alerts and station delete fixed for station-wise materials**

- **Low-stock alerts now name only the right stations.** A material kept at one
  station used to raise a low-stock alert at every station that held any
  material stock. Alerts are now raised only at the stations where the material
  itself is present — where it has stock or a requirement override — so adding a
  material to one station no longer flags the others.
- **Deleting a material from one station no longer deletes it everywhere.** The
  Delete action in a station's list used to remove the material from every
  station. It now removes the material, its requirement and its receipts / usage
  from that station only; other stations keep it, and the material itself is
  deleted only when no other station needs it.

## 1.7.6.74 — 2026-08-22

**Minor: older materials stay visible, and equipment groups collapse like stations**

- **Unassigned materials no longer vanish.** Materials created before station-wise
  tracking (they were never assigned to a station and have no stock recorded) used
  to be missing from the list — they only showed up in the low-stock banner. They
  now appear under an **Unassigned** group at the top of the Materials list, with
  their requirement and minimum spare, ready to be assigned via Edit.
- **Equipment groups hide and expand.** Inside a station, the equipment sub-groups
  (point, signal, general, …) now collapse and expand on tap, just like the station
  headers — handy for long station lists.

## 1.7.6.73 — 2026-08-22

**Major: materials assigned to stations — equipment-wise lists and a station picker when adding**

- **New materials need a station.** When you add a material you now pick the
  station(s) it belongs to. A material saved without a station used to vanish —
  it counted in the totals but never appeared in the station-wise list. Now the
  Add / Edit form has a station checklist, and a material shows under every
  station you assign it to.
- **Equipment-wise sub-sections.** Inside each station, the materials are
  grouped by equipment — point, signal, block instrument, general and your own
  custom groups — each with its own heading, so the required list reads like
  the maintenance stock books.
- **Assignments stay editable.** Edit a material any time to add or remove the
  stations it belongs to; the per-station requirement and minimum spare you set
  with the "Req" / "+ Req" buttons are never touched.
- A "What's New" tutorial introduces the change.

## 1.7.6.72 — 2026-08-22

**Minor: Diary and TA Journal table cells aligned like the reference forms**

- Every table heading in the Diary and TA Journal exports is now centred both
  horizontally and vertically (PDF, Word and Excel).
- The content under the headings is centred too, except the "NATURE OF WORK"
  column, which stays left aligned while its heading is centred and its text
  is vertically centred across a day's merged rows.

## 1.7.6.71 — 2026-08-22

**Major: station-wise materials — per-station requirements, low-stock alerts and three export types**

- **Materials tracked station by station.** The Materials tab now groups
  everything by station. Each station's list shows how many of a material were
  received, used and are still in hand there, with per-material detail expandable
  to every receipt and issue.
- **Requirement per station.** Every material has a default requirement. From a
  station's own list you can set a different requirement for that station (the
  "Req" button) or add more to it (the "+ Req" button). Station requirements are
  remembered and restored with your backup.
- **Low-stock alert per station.** Each station can have a minimum spare for a
  material. When a station's in-hand quantity falls below its minimum, the app
  raises a low-stock alert naming the station. Stations without a minimum set are
  never alerted, and a station that has a minimum but is out of stock is flagged.
- **Three export types.** The Materials export menu now offers **In-Hand
  Materials**, **Required Materials** and the full report. The first two give an
  overall and a station-wise summary; the full report keeps the existing detailed
  output (required list, every receipt and issue with running balances).
- A "What's New" tutorial introduces the feature.

## 1.7.6.70 — 2026-08-22

**Minor: station entry asks for all station details and onboarding requires at least one station**

- **Onboarding now needs at least one station.** The "Continue" button on the
  first setup step stays disabled until you add at least one station — it no
  longer lets you proceed with an empty list.
- **Onboarding station form asks for the full details.** Alongside name and
  code it now collects the distance from HQ (below / above / variable with the
  KMs marker) and the travel time range from HQ, exactly like Settings. The
  new stations are saved with those details, so the TA journal has the data it
  needs.
- **Daily-log quick add asks for all station details.** The green "+ Add"
  button next to the movement selector used to create a station from just a
  name; it now shows the full station form (code, distance, travel time) before
  saving. Stations created earlier with only a name keep working as before.

## 1.7.6.69 — 2026-08-21

**Major: one-page Diary export with a single-line heading**

- **Fit on one page.** The Diary export now offers the same **"Fit on one page"**
  toggle as the TA Journal. When selected, the whole month's diary — heading,
  table and signature line — is scaled down to fit on a single A4 page, with
  trimmed margins and no page footer.
- **Single-line heading.** The *"DIARY OF SRI … FOR THE MONTH OF …"* title now
  always stays on one line; if it would wrap, the heading font shrinks slightly
  to fit the page width. This also applies to the regular multi-page output and
  the TA Journal header.
- A "What's New" tutorial introduces the feature.

## 1.7.6.68 — 2026-08-21

**Minor: Google Drive sign-in no longer fails after switching accounts**

- After signing out, signing in again could fail with *"Could not determine the
  signed-in Google account"* whenever the phone held more than one Google
  account: the sign-in result came back as a cached/partial account (no email)
  that could not be matched to a device account.
- When that happens the app now shows the Android **account picker** and lets
  you choose the Google account to use explicitly, instead of failing. The
  picked account is remembered, so later syncs stay silent.
- The ID-token email decoder also tolerates cached tokens that use standard
  base64 characters.

## 1.7.6.67 — 2026-08-20

**Minor: TA journal export — fit-on-one-page option and date column fix**

- **"Fit on one page" export option.** When exporting the TA Journal, you can
  now choose **Fit on one page** or **Earlier output (font size)**. The one-page
  mode trims the page margins, drops the "generated …" / "Page X of Y" footer
  and auto-shrinks the text until the whole report fits on a single page. The
  choice is remembered for next time.
- **DATE column widened** in the PDF/Word TA table so the dd-mm-yyyy date
  ("01-06-2026") stays on one line instead of wrapping.

## 1.7.6.66 — 2026-08-20

**Minor: TA journal export fixes**

- **Pay metric and pay now save and appear in the Excel export.** The TA
  journal's XLSX output now carries the pay metric and pay alongside the name,
  designation, P.F. no and B.U. no, matching the PDF/Word header.
- **TA percentage shown as "100%"** instead of "100.00%" in the PDF/Word DAYS
  column.
- **Dates zero-padded** as dd-mm-yyyy ("01-06-2026") in the PDF/Word table.
- **Column widths rebalanced** in the PDF/Word TA table: a wider AMOUNT column,
  tighter TIME DEPT / TIME ARR columns and a DATE column that just fits the date.

## 1.7.6.65 — 2026-08-20

**Feat: minimum spare alerts — the app warns when a station's in-hand stock runs low**

- **Set a minimum spare per material.** When adding or editing a material you
  can now set a **Minimum required spare** (e.g. 10). It is the level of in-hand
  stock you want to keep available at every station; leave it empty or 0 to
  disable alerts for that material.
- **Low-stock alerts.** As soon as a station's in-hand quantity (received minus
  used) drops **below** the minimum, the material appears in a red **Low stock**
  section at the top of the Materials tab — *"only X in hand at STATION, minimum
  required Y"* — and the item is added to the **Alerts** bell in the header.
  Tapping the alert opens the Materials tab.
- **Daily reminders too.** Low-stock items are included in the daily reminder
  notifications (8/12/16/20 h), so the phone alerts you even when the app is
  closed.
- A "What's New" tutorial introduces the feature.

## 1.7.6.64 — 2026-08-20

**Feat: a WhatsApp feedback group and safer Google Drive sync when you switch accounts**

- **WhatsApp feedback group.** Settings → About now has a **Join WhatsApp feedback
  group** button that opens the app's official feedback group in WhatsApp — the
  easiest way to report an issue or ask for a feature. A "What's New" tutorial
  for this release points to it.
- **Safer Drive sync across accounts.** The sync version is now remembered **per
  Google account** instead of globally. Signing into a different account no
  longer compares timestamps written by another account's backup:
  - the first sync after switching accounts **pushes the current app data** to
    the new account rather than overwriting it with the new account's own backup;
  - the previous account's Drive backup is left untouched, so nothing already
    synced is ever lost;
  - restoring a backup from the new account is still always possible through the
    explicit **Import from Drive** button.

**Minor fixes bundled into this release**

- **Reports TA summary corrected:** the TA count and its drill-down now include
  only days that actually qualify for TA — a movement to a station above 8 km,
  or to a Variable station where the log confirms the work was done at/after its
  KMs marker at a claimable TA percentage. Entries to below-8 km stations are no
  longer counted.
- **Deleted default tags / categories / equipment stay deleted.** Deleting one of
  the built-in defaults used to bring it back on the next app start or update.
  The app now remembers what you deleted and never re-adds it (a full **Reset all
  data** still restores the defaults).
- **Drive sign-in after logout fixed.** Picking the Google account again after
  signing out no longer fails with "Could not determine the signed-in Google
  account" — the full account is resolved silently before the token is fetched.

## 1.7.6.63 — 2026-08-19

**Minor: Variable KMs marker is now free text and editable on any station**

- The **KMs marker** of a Variable station is no longer restricted to numbers —
  it accepts text such as `8+` or `12/4`, so the marker can match the on-ground
  kilometre notation. The marker can be set both when adding a station and when
  editing an existing (older) station in Settings → Manage Stations → Edit.
- Existing stations that were created before the Variable feature can now be
  switched to **Variable** and given their KMs marker in the same edit dialog.

## 1.7.6.62 — 2026-08-19

**Feat: Variable TA for stations split across the 8 km boundary**

- Some stations sit right on the 8 km line: one side of the station is within
  8 km of headquarters and the other side is beyond it. A station can now be
  marked **Variable** in Settings → Manage Stations, with a **KMs marker** —
  the KMs at which the "greater than 8 km" side starts.
- When you log work at a variable station, the daily log asks **"Worked at
  [KMs] KMs?"**. Answer **Yes** to claim TA for that day (the work was done on
  the > 8 km side); **No** records the work as within 8 km, with no TA.
- Only **Yes** answers are written into the **TA Journal**. The work text of
  qualifying entries (TA Journal and Diary) carries **"at [KMs]"** at the end,
  e.g. *"Attended signal failure at 12 KMs"*.
- The TA Journal preview in the export dialog shows the same "at [KMs]" suffix
  and the same inclusion rule.

## 1.7.6.61 — 2026-08-19

**Minor: Drive backup and restore now show their progress as a percentage**

- Syncing to Drive (and importing from Drive) now displays a live progress bar
  with the **percentage done** and how many files are left, both in
  Settings → Backup & Drive and on the sync icon in the header.
- The percentage reflects the real upload/download of the per-day backup
  files, so large backups with many photos no longer look stuck while they run.

## 1.7.6.60 — 2026-08-18

**Feat: a new daily log starts on the calendar date you have selected** — `81510de`

- Selecting a date in the calendar and then tapping **+ → Add Daily Log** now
  opens the form pre-set to that selected date, instead of always defaulting to
  today. The date field stays editable, so you can still switch days.

## 1.7.6.59 — 2026-08-18

**Feat: a Dark theme, switchable from Settings → Appearance → Theme** — `7b5468f`

- A new **Theme** picker in Appearance offers **Light** (the default look) and
  **Dark**. Dark switches the whole app to dark surfaces with lighter text.
- The theme is remembered on the device and is saved with JSON backups, so a
  restore brings it back.

## 1.7.6.58 — 2026-08-18

**Feat: "What's New" tutorials now catch you up across every version you missed, not just the last one**

- Tutorials are defined **per major change** instead of once per app version. The
  current catalog covers the major feature releases: **1.7.6.38** (PCDO
  department-wise), **1.7.6.39** (search highlighting), **1.7.6.43** (search
  covers notes + backups include settings), **1.7.6.44** (counter resets),
  **1.7.6.54** (Materials tab) and **1.7.6.55** (equipment groups).
- If a user jumps several versions at once (for example from 1.7.6.37 straight
  to this build), every missed major-change tutorial is queued in order, oldest
  first, so nothing is skipped over — the progress bar at the top shows how many
  updates are left.
- Progress is remembered per version: finish one update's slides and the queue
  advances to the next; close the app mid-way and it resumes where you stopped.
- The **Skip tutorials** button still dismisses them permanently, and everything
  can be replayed any time from **Settings → About → Watch tutorials**.
- Brand-new installs skip the version queue entirely — the first-run onboarding
  tour covers the basics instead.

## 1.7.6.57 — 2026-08-18

**Feat: tutorials for the newly added Materials features, shown once per update with a "Skip tutorials" option**

- A **What's New** tutorial opens once after each update (and right after the
  first-run onboarding for new installs). It teaches the newly added features in
  six slides: the **Materials tab**, **Receive & Use**, **Add / + Req**,
  **equipment groups**, the **collapsible group dropdowns** and the
  **Station-wise Summary**.
- **Skip tutorials** dismisses it permanently for users who are not interested;
  pressing through to **Done** marks it shown for the current version so it will
  not re-open after the next app start.
- The same tutorials can be replayed any time from **Settings → About → Watch
  tutorials**.

## 1.7.6.56 — 2026-08-18

**Feat: Equipment groups and the station-wise summary are collapsible dropdowns**

- In the **Materials** tab every equipment group is now a dropdown: its
  materials are hidden by default and drop down when the group header is
  pressed (the header shows a ▾ / ▴ arrow and the material count).
- The **Station-wise Summary** below it works the same way — each station is a
  collapsible row that expands to show the materials received / used / in hand
  there and the station total.

## 1.7.6.55 — 2026-08-18

**Feat: Materials grouped by equipment + custom equipment; hamburger menu trimmed** — `1b28ca6`

- The **Materials** tab now groups the required list by **equipment**. Every
  material starts under **general**, and materials entered before this release
  (which had no equipment) are grouped under **general** too.
- Default equipment groups, in order: **general**, point, signal, block
  instrument, IPS, BPAC, MSDAC, TRACK CIRCUIT, PANEL, WIRE COILS, CABLE,
  BATTERY, GENERATOR, RELAYS, DATALOGGER, EI, records.
- **+ New Equipment** (Materials tab) or **Add new equipment…** in the Add /
  Edit Material form creates a custom equipment group, shown after the
  defaults. Custom equipment syncs to Drive and is included in JSON backups.
- The PDF export's summary is grouped by equipment in the same order, and each
  material's detail section shows which equipment it belongs to.
- The hamburger menu now shows only **Home, Important Notes, Attachments,
  Materials** and **Settings** — Reports, Task Manager and Search were removed
  from it (they remain available in the bottom navigation).

## 1.7.6.54 — 2026-08-17

**Feat: Materials tab in the hamburger menu — required list with receipts, usage and a station-wise summary** — `ccac1e7`

- New **Materials** tab (hamburger menu) keeps the materials required for
  maintenance work. Each material has a name, a required quantity and a unit
  (Nos / Kg / Sets / Units, or any custom unit typed via **Add new unit…**; a
  unit is optional).
- **Receive** records each delivery — quantity, date, station, room and a
  remark for exactly where it was placed. **Use** records quantity, date,
  station and purpose.
- **Required** shows the *outstanding* quantity (required − received), so it
  drops automatically as material is received.
- **+ Req** adds extra requirement on top of the current amount without
  opening the edit form.
- A **Station-wise Summary** table lists every station with the material
  received / used / in hand there and per-station totals — shown both in the
  Materials tab and in the PDF export.
- The PDF export covers the required list with received / used / in hand per
  material and the station-wise summary.
- Deleting a material also removes its receipts and usage records. All three
  tables sync to Drive and are included in JSON backups.

## 1.7.6.52 — 2026-08-17

**Fix: the CR entry now asks which rest day was worked, not when the CR is availed** — `348bfd3`

- CR (Compensatory Rest) is taken when the user works on a rest day. Selecting
  **CR** in the daily log used to show a "CR availed on" From/To date range,
  which asked for the dates the rest was taken.
- It now asks **"Worked on rest day"** — a single **Date** for the rest day the
  user actually worked on, which earned the compensatory rest.
- The movement text and stored date (`cr_from`) now carry that worked-on rest
  date, e.g. `CR (worked 12 Aug 2026)`.
- The Diary / Excel exports write **"AVAILED CR OF &lt;date&gt;"** (e.g.
  `AVAILED CR OF 12-08-2026`) instead of a bare "AVAILED CR".

## 1.7.6.51 — 2026-08-17

**Fix: Deficiencies Pending / Done and Planned Pending / Done always stay side by side in the Reports tab** — `63ac7ca`

- The *Deficiencies Pending* and *Deficiencies Done* tiles now sit next to each
  other, and the *Planned Pending* / *Planned Done* tiles do too.
- Each pair is rendered in its own two-column grid, so adding new stats to the
  Reports tab in the future can never push the pairs apart again.

## 1.7.6.50 — 2026-08-17

**Fix: converting a deficiency to planned work no longer counts it as completed** — `76d0d68`

- Converting a deficiency ("Convert to Plan") previously marked the deficiency
  **Completed** on the spot, so the *Deficiencies Done* count rose even though
  the work had only been planned, not executed.
- The conversion now sets the deficiency to a new **Planned** status: it leaves
  the pending deficiency list and moves to the planned works account, and it is
  counted as neither pending nor done.
- The planned work remembers which deficiency it came from. When that planned
  work is marked **Complete**, the linked deficiency becomes Completed and only
  then shows in *Deficiencies Done* and the Archive.
- Reopening a converted planned work (Mark Incomplete) returns the deficiency
  to Planned; deleting the planned work reverts the deficiency to Pending so
  the work is never silently lost.
- The conversion notice inside the form explains the new behaviour.

## 1.7.6.49 — 2026-08-17

**Feat: TA Journal and Diary PDF/Word exports now follow the official G.A.31 railway form** — `d67c711`

- **TA Journal header:** title is "SOUTH COAST RAILWAY. GUNTAKAL DIVISION" with
  a small "In lieu of G.A.31" note on its right, the centred
  "TRAVELLING ALLOWANCE JOURNAL" heading, and two fixed-column info rows
  (Name / Designation / P.F.NO / Pay Metric, then Headquarters / Month / B.U.No
  / Pay) matching the reference sheet.
- **Two-tier table header:** DATE · TRAIN · TIME (NO / TIME DEPT / TIME ARR) ·
  STATION (FROM / TO) · KMS · DAYS · AMOUNT · NATURE OF WORK, with the merged
  TIME / STATION spans centred across their columns.
- **Form-style numbers:** dates print as d-m-yyyy ("1-6-2026"), the DAYS column
  as "100.00%"/"70.00%", amounts as "₹ 1,000", and the vertical KMS note is kept
  ("ALL ARE ABOVE 8 KMS").
- **Summary in the form layout:** a "TOTAL NO. OF DAYS … ₹ …" row closes the
  main table, followed by the 100% X n / 70% X n / 30% X n calculation lines,
  underline and "TOTAL = n DAYS", exactly like the official form.
- **New profile fields:** Pay Metric (e.g. "L-VI") and Pay (e.g. "42,300/-")
  in Settings → Staff Details feed the TA Journal header.
- **Diary:** the title is now centred ("DIARY OF SRI … FOR THE MONTH OF
  JUNE-2026") and the old meta line was dropped; dates stay dd-mm-yyyy and the
  designation remains right-aligned at the foot.
- **Excel export untouched** — the TA/Diary .xlsx sheets keep exactly their
  previous layout; only the PDF and Word outputs were restyled.

## 1.7.6.48 — 2026-08-16

**Feat: Settings swipe polish — tab headings follow the swipe, content slides in smoothly, and swipes work over the blank areas too** — `5f970ae`

- **Smooth transition:** switching tabs (by swipe or by tapping a tab chip) now
  slides the incoming tab in from the direction the swipe came from, instead of
  swapping the content instantly.
- **Headings move:** the tab-chip row scrolls so the active chip is centred and
  visible whenever the tab changes.
- **Blank areas swipe:** the swipe gesture is now caught across the whole
  Settings screen (including the empty space below and around the sections),
  not just on the section cards. Vertical scrolling and horizontal scrolling of
  the chip row are unaffected, and swiping over an open dialog never changes
  the tab behind it.

## 1.7.6.47 — 2026-08-16

**Feat: Settings tabs can be switched with a horizontal swipe** — `aadb259`

- Swiping left or right over the Settings content moves between the tab groups
  (Account & Directory, Tags & Notifications, Backup & Drive, Appearance & Font
  Size, About). Vertical scrolling is unaffected — only clearly horizontal
  gestures change the tab.

## 1.7.6.46 — 2026-08-16

**Fix: the calendar's "Today" (and "Go to date") now also scroll the entry list back to that date** — `6891ced`

- After swiping the entry list away from a date, tapping *Today* in the calendar
  header only moved the calendar highlight — the lower list stayed where it was
  scrolled because the selected date hadn't actually changed.
- Tapping *Today* or *Go to date* now always re-scrolls the timeline so the
  chosen day sits directly under the calendar, even when it was already the
  selected date.

## 1.7.6.45 — 2026-08-16

**Fix: counter-reset sections print as "Station A - Station B", and special-movement days ask for both stations** — `f169030`

- The **PCDO export** Counter Resets table (and the Reports breakdown, timeline badge and
  log-detail card) now writes a UFSBI Block Instrument / BPAC section as *Station A -
  Station B* instead of *Station A → Station B*.
- On special-movement days (Rest / Leave / CR / NH / Footplate) the daily log now asks for
  **both** ends of the section for a UFSBI / BPAC counter reset — a *From station* and a
  *Next station* — instead of silently reusing the PCDO station. The two stations must
  differ, and the chosen From station is what the PCDO export and the station filter group
  by. On ordinary station days the near end still comes from the daily-log station.

## 1.7.6.44 — 2026-08-16

**Feat: Counter resets (UFSBI Block Instrument / MSDAC / BPAC) recorded in the daily log and summarised in the PCDO export** — `c2a7b23`

- **Daily log — Counter Resets section:** tick *Counter Resets* to record resets on the
  equipment that carry registers. Pick the equipment — **MSDAC**, **UFSBI Block
  Instrument** or **BPAC** — and enter the number of resets due to **Failures** and due to
  **Testing**. Several resets can be entered on the same day (one row per equipment /
  section), and the form shows the running total.
- **MSDAC counters belong to a station** — the same station as the daily entry, exactly like
  the disconnection counts; for Rest / Leave / CR / NH special movements you pick the station
  yourself.
- **UFSBI and BPAC counters belong to the section between two stations** — the daily-log
  station and a **next station** you select; the entry reads *Station A → Station B*.
- **PCDO export:** the report now prints a **Counter Resets** summary right after
  Disconnections, grouped station-wise with the Failures / Testing / Total per equipment and
  a grand total (both resets counted). The export dialog also shows the counter resets
  recorded in the selected period.
- **Reports tab:** a new **Counter Resets** count with a per-equipment breakdown, and the
  timeline / log detail now show each entry's resets.

## 1.7.6.43 — 2026-08-16

**Feat: Global Search now covers Important Notes** — `c9d244f`

- Notes appear in Global Search together with logs, deficiency tasks and
  planned works — search their title or body text from any tab, and a *Note*
  entry in the *All Types* filter narrows the results to notes.
- Tapping a note result opens the **Important Notes** tab with that note
  expanded to its full text, scrolled into view, and any active note
  category/search filter cleared so the note is always visible.

**Change: the backup now includes every app setting as well** — `c9d244f`

- The JSON backup already carried the logbook tables (logs, tasks, stations,
  staff, tags, notes, note categories); the manifest now also lists **Note
  Categories** and the exported **App settings**.
- Backing up now captures the device settings too: font size, entry-text size,
  reminder lead time, the TA auto-generation windows, the export format and
  each export's remembered PDF text size. Restoring a backup that contains
  settings reapplies them, and the app reloads once so they take effect.

## 1.7.6.42 — 2026-08-15

**Change: PCDO export now accepts a manually picked date range** — `2dc5fc3`

- The PCDO export used to be limited to the preset PCDO period (26th of the
  previous month to 25th of this month). You can now select any **From** and
  **To** dates directly in the export dialog.
- The default is still the current PCDO period, and a *Reset to current PCDO
  period* link restores those dates at any time.

**Fix: TA Auto-Generation timing windows no longer overflow in Settings** — `7a4f096`

- In Settings → TA Auto-Generation, the departure and return time fields now
  stack vertically on narrow screens instead of spilling over one another, and
  the inputs shrink to fit instead of overflowing their column.
- The *Tour duration condition* is shown as two separate rows (more than / less
  than) with flexible inputs so it never runs off the screen on small phones.

## 1.7.6.41 — 2026-08-15

**Change: TA is shown as a percentage, and the TA Journal AMOUNT column now uses a per-staff TA rate** — `3bc6a44`

- The TA claim is now indicated as a percentage (e.g. **70%**) instead of a
  fraction of a day (0.7) — in the daily-log form, the log detail, the reports
  and the exported TA Journal's *TA %* column.
- Staff details (Settings → Staff Directory) now include a **TA Rate (₹ per day)**.
  The TA Journal multiplies the days by this rate to fill the **AMOUNT** column.
- If the current user's TA rate is not set, the export shows a note in the
  AMOUNT column and a hint on the TA Journal screen pointing to Settings.

## 1.7.6.40 — 2026-08-15

**Change: notes show a preview and expand on tap instead of the full text** — `420c942`

- The Notes screen now shows each note's title, category/tags and only the first
  few lines of its body; the rest stays hidden.
- Tapping the body opens the note to its full content, with a *Show less* link
  to collapse it again.

## 1.7.6.39 — 2026-08-14

**Feat: search results now highlight the matched text** — `3f03710`

- **Global search:** the station/work title and the matching body text in every
  result (logs, deficiencies, planned works) are highlighted in amber where the
  search term appears.
- **Notes search:** the note title and body highlight the matching text as you
  type in the notes screen too.
- Highlighting is case-insensitive and mirrors each screen's existing search
  matching, so whatever currently returns a result now visibly marks the match.

## 1.7.6.38 — 2026-08-14

**Feat: PCDO special works are now recorded and exported department-wise** — `196bfda`

- **Daily log — department-wise PCDO:** when *PCDO — Special Work* is ticked on
  an entry you now pick one or more departments (Signalling / Engg / OHE /
  Telecom) and describe the special work done for **each** selected department
  in its own box. Entries saved before this release (single free-text special
  work) still open and export as before, grouped under *General*.
- **PCDO export:** the report is still grouped station-wise, but each station
  now has a **sub-section per department** with the date and special-work text
  of that department's entries. The selection preview in the export dialog
  shows each department's work with its colour-coded badge.

## 1.7.6.37 — 2026-08-14

**Change: TA Journal "ALL ARE ABOVE 8 KMS" note now runs vertically down the KMS column** — `e4a73dd`

- The note in the merged KMS column is now written one letter per line, reading
  top-to-bottom, with a blank line between each word (ALL / ARE / ABOVE / 8 / KMS).
- The KMS column is widened enough for its "KMS" header to stay on one line in
  every format; NATURE OF WORK keeps the remaining width and the whole table
  still fits inside the page / text area.

## 1.7.6.36 — 2026-08-14

**Fix: NATURE OF WORK column missing in the TA Journal PDF / Word exports (and too narrow in the Diary)** — `4809651`

- The TA Journal table's fixed column widths (556 pt) were wider than the page
  (515 pt), so the PDF renderer squeezed the last column — NATURE OF WORK — to
  ~10 pt (invisible) and the Word layout overflowed the text area, dropping it.
- Column widths are rebalanced in both tables so every column fits and the
  flexible NATURE OF WORK column keeps a healthy width: ~115 pt in the TA
  journal and ~165 pt in the Diary (both PDF and Word, Excel unchanged).

## 1.7.6.35 — 2026-08-13

**Fix: Word export's second row of each merged day is misaligned** — `02313ec`

- The Diary / TA Journal tables carry vertical merges (the date and nature-of-work
  cells span the two legs of a day). The Word writer was emitting merged
  continuation cells without an explicit column grid and without a paragraph
  inside the empty cells, so Word inferred the column positions from widths and
  shifted the second row's cells. Now every table declares a `<w:tblGrid>` with
  one column per cell, continuation cells keep their column's width, and each
  cell contains a real `<w:p>` — the rows line up under the correct headers.

## 1.7.6.34 — 2026-08-13

**Fix: Word (.docx) exports dropped the table, leaving only the heading** — `4cbe3cc`

- The Diary and TA Journal Word exports were producing an unreadable table
  (each cell was closed twice, breaking the document's XML) so Word discarded
  the whole table and showed only the heading. Fixed the cell writer so every
  `<w:tc>` is closed exactly once; the date / nature-of-work merges
  (`vMerge` / `gridSpan`) are unchanged and now render in Word.

## 1.7.6.33 — 2026-08-13

**Fix: PDF and Word exports merge the date and nature-of-work cells across a movement's legs** — `1608ee9`

- In the **Diary** export every away day prints two rows (outbound + return). The
  **DATE** and **NATURE OF WORK** cells now visually span both rows — and the
  whole journey's rows on a Footplate day — in the PDF and Word outputs, matching
  what the Excel export already did. Rest / NH / Leave / CR days merge their
  label across the movement columns too.
- In the **TA Journal** the **DATE / DAYS / AMOUNT / NATURE OF WORK** cells of a
  two-leg day merge across its rows, and the **KMS** note ("ALL ARE ABOVE 8 KMS")
  spans every TA day in the PDF and Word outputs (Excel already did both).
- Implemented by teaching the PDF renderer about `rowspan`/`colspan` cells and
  the Word renderer about `vMerge`/`gridSpan`, then rendering the Diary / TA
  tables from the same merge map the Excel sheet uses — so PDF, Word and Excel
  now all show the same merged layout.

## 1.7.6.32 — 2026-08-13

**Feat: Pre-filled default timings in manual mode** — `6bd5d34`

- When a new daily log opens in the manual (normal) build, the timing fields
  come pre-filled with sensible defaults: departure from HQ `08:00`, arrival at
  station `09:00`, departure from station `16:30`, arrival at HQ `17:30` (the
  outbound pair in the morning, the return pair in the afternoon).
- Editing an existing entry still shows its stored times; the exports keep
  printing 24-hour `HH:MM` as before, and the personal build is unaffected
  (fields stay hidden / generated).

## 1.7.6.31 — 2026-08-13

**Fix: Footplate single-movement return leg (Up / Down) shows the wrong "From" in the Diary and TA journal** — `8626f8f`

- On a one-way footplate (no return train) the third journey row is the road
  return to HQ **from the other-end station**, not from the boarding station.
- With a return train (Both) the ride ends back at the boarding station, so that
  row still goes boarding station → HQ.
- Fix applies to both the Diary and the TA journal exports (shared leg builder).

## 1.7.6.30 — 2026-08-13

**Feat: Footplate special movement in the daily log** — `f559e0f`

- A new **Footplate** option in the daily-log Movement selector. Instead of a
  Rest-style special day it behaves like a working tour: HQ → boarding station →
  ride the engine of a train Up / Down / Both to the other end, optional
  opposite-direction return train, then back to HQ. Work Done and TA stay
  available.
- The journey captures only the **boarding station** and the **other-end**
  station (intermediate stations are skipped), the direction (Up / Down /
  Both), the shift (Day / Night), and for each train leg its **train no. and
  engine no.** plus the boarding / alighting clock times. The movement row shows
  `Footplate: <Boarding> → <Other end> (<direction>)`.
- **Diary export** prints the day as 3 journey rows (HQ → boarding ROAD, the
  train leg, boarding → HQ ROAD) or 4 rows when riding back, each with its own
  time / from / to, and the date + work spanning the legs.
- **TA journal** treats a Footplate day as qualified (boarding station decides
  the distance rules) and prints the same 3–4 leg rows with the day count and
  amount spanning them; the TA rate stays the manual 100 / 70 / 30 pick.
- The personal (auto-timings) build generates the tour clock times
  deterministically, keeping them inside the configured TA window.

## 1.7.6.28 — 2026-08-12

**Feat: HQ-movement entries no longer need timings + configurable TA auto-generation windows** — `e7c2879`

- **HQ movements (normal build):** when the daily-log movement is the
  headquarters station, the four clock-time fields no longer appear and nothing
  is stored — the Diary already prints these days as `AT <HQ>` without times.
- **TA Auto-Generation (personal build):** a new Settings section (shown only
  in the auto-timings build) lets you pick, **per TA rate**, the departure
  window from HQ, the return-arrival window at HQ, and the tour-duration
  condition — e.g. for **1 TA**: depart 06:30–07:30, return 18:30–20:00, and
  the generated tour must last **more than 12 hrs and less than 14 hrs**. Each
  rate (1 / 0.7 / 0.3) has its own set; the station reach times still come from
  each station's travel-time range from HQ. A *Reset* button restores the
  defaults and *Save TA Settings* keeps the values on the device.
- The generator now draws the departure and return-arrival so the tour length
  always stays inside the configured condition (when the windows allow it), on
  the same deterministic 5-minute grid as before.

## 1.7.6.27 — 2026-08-11

**Chore: one codebase builds both the normal and the personal APK** — `ee127cc`

- The old `master` (manual timing entry) and `personal/owner` (auto-generated
  timings) branches are merged into **one** source tree. A build-time flag
  (`NEXT_PUBLIC_TIMINGS_MODE=manual|auto`) picks the behaviour for each APK, so
  there is no longer a second branch to keep in sync.
- `npm run apk:build` (or `scripts/build-variants.sh`) produces **both** APKs
  from the same tree: `SnTFieldlogbook-v1.7.6.27.apk` (manual timings, typed in
  the daily log) and `SnTFieldlogbook-v1.7.6.27p.apk` (auto-generated timings,
  the owner's personal build). Pass `normal` / `p` to build just one variant,
  e.g. `npm run apk:build normal` when only the manual-timing path changed.
- Everything else is identical to 1.7.6.26 / 1.7.6.26p (one-line Diary/TA
  columns, reference TA summary, explicit "missing" placeholders).
- Both variants share `versionCode 39`; the version shown in Settings gets the
  `p` suffix only in the personal build.

## 1.7.6.26 — 2026-08-11

**Feat: one-line Diary/TA columns, TA summary matching the reference workbook, and explicit "missing" placeholders** — `32b7cf2`
- The Diary and TA Journal tables are re-spaced so every column is wide enough
  for its content to sit on one line — matching the widths of the reference
  `JE_SIG_JMDG DIARY.xlsx` and `JE SIG JMDG TA.xlsx` workbooks — with only
  **NATURE OF WORK** wrapping.
- The **TA summary** is corrected to the reference layout: a `TOTAL NO. OF DAYS`
  row showing the weighted day total and the amount, then the three rate lines
  (`1.0 X n = x DAYS`, `0.7 X n`, `0.3 X n`), the underline, and the
  `TOTAL = x DAYS` line, followed by the certification and signature block.
  This also fixes the Excel sheet's summary merges, which were applied one row
  too high, so the underline / TOTAL / certification cells now land on the
  right rows.
- Missing information is now labelled where it is missing: a missing **B.U.No**
  or **P.F.NO** (and Name / Designation) shows `not updated in profile`, and a
  missing departure/arrival time shows `not entered in daily log` instead of a
  bare dash.

## 1.7.6.25 — 2026-08-10 (current)

**Feat: TA Journal refined — 8 km rule, South Coast Railway, centred & wrapped cells**
- The **TA Journal only includes movements to stations recorded as above 8 km**
  from the headquarters (`stations.distanceFromHq` = "above8"); below-8 km and
  unrecorded stations no longer generate TA rows. The preview count and the
  generated sheet stay in sync.
- The header now reads **SOUTH COAST RAILWAY. GUNTAKAL DIVISION** (was South
  Central Railway) and is **centred** in the PDF, Word and Excel exports, like
  the TRAVELLING ALLOWANCE JOURNAL line under it.
- In the TA sheet the **DATE, TIME DEP, TIME ARR, FROM, TO and KMS** columns are
  **centred both horizontally and vertically**, and **Nature of Work wraps**
  within its cell (also wrapped in the Diary Excel export).
- Each qualifying movement is still listed **vertically** as its own two-leg
  row pair.

## 1.7.6.24 — 2026-08-10

**Feat: a day with two movements exports as one — the TA movement wins, and the work merges with "and"** — `c391dca`
- When two daily log entries exist for the same date (two movements), the Diary
  and TA Journal exports now show them as **one movement** instead of two
  separate row pairs.
- The **TA movement** (the station trip that claims 100 / 70 / 30 % TA) drives
  the route and the timings in `FROM / TO`; the other movement's entry no
  longer prints its own rows.
- The **NATURE OF WORK** column merges both entries' work with **"and"** between
  them (e.g. *CARRIED OUT DAY FOOTPLATE INSPECTION. and CARRIED OUT YA-PRDT
  BLOCK AND BPAC MONTHLY INSPECTION.*); identical work is not repeated.
- The TA Journal counts such a day **once** towards the month's day total.

## 1.7.6.23 — 2026-08-10

**Feat: Diary and TA Journal exports in the reference workbook layout — with timings you enter yourself**
- The **Diary** export is rewritten to the reference format
  `DATE | TRAIN NO | TIME DEP | TIME ARR | FROM | TO | NATURE OF WORK`, two rows
  per away day (HQ → station and the return), `AT <HQ>` rows for days at
  headquarters, and single `AVAILED REST/NH/LEAVE/CR` rows for rest days.
- New **TA Journal** export: a SOUTH CENTRAL RAILWAY. GUNTAKAL DIVISION header
  with Name / Designation / P.F.NO and HQ / Month / B.U.No, the 10-column
  KMS / DAYS / AMOUNT table, a month summary by rate and the certification /
  signature block.
- Both exports print **station codes** (e.g. JMDG, GTL) instead of full names,
  and the export sheet gains an **Excel (.xlsx)** format alongside PDF and Word.
- **No timings are generated anymore.** When you add a daily log for a station
  movement, you now enter the four clock times yourself — departure from HQ,
  arrival at station, departure from station, arrival back at HQ. Those exact
  times appear in the Diary and TA Journal exports.
- Staff profiles gain optional **PF No** and **B.U. No** fields (shown in the TA
  Journal header).

## 1.7.6.22 — 2026-08-10

**Feat: station travel time is now a range (min–max) instead of a single value** — `3e80ce9`
- The travel time from the headquarters to a station is stored as a **range**,
  e.g. *40 to 55 min*, reflecting how long the trip typically takes.
- The Add Station form and the station Edit dialog take a **min** and a **max**
  travel time; the list shows the range (`40–55 min`) or a single value when
  both ends match.
- The **headquarters station** stays locked at *below 8 km* and *0–0 min* with
  its inputs disabled.

## 1.7.6.21 — 2026-08-10

**Feat: stations record their distance from the headquarters and travel time** — `fc412b5`
- Each station now stores whether it is **below 8 km** or **above 8 km** from
  the headquarters station, plus the **travel time (minutes)** from the
  headquarters to that station.
- The new fields are entered when adding a station and editable later via a new
  Edit button on each station row in Settings → Manage Stations; the distance /
  time also shows next to every station in the list.
- The **headquarters station** (the one selected as HQ in the current user's
  profile) is locked: its distance is fixed at *below 8 km* and its travel time
  at *0 min*, and those inputs are disabled in the editor.

## 1.7.6.20 — 2026-08-09

**Feat: easier date navigation and a reorganised Settings page**
- The calendar now shows a compact calendar-icon button (opens the native date
  picker) and a "Today" button that jumps straight back to the current day,
  both 25 px tall and side by side.
- Settings is collapsed into horizontally grouped sections — Account &
  Directory, Tags & Notifications, Backup & Drive, Appearance & Font Size, and
  About — so you reach what you need with one tap.

## 1.7.6.19 — 2026-08-09

**Feat: Google Drive backups are stored per day, so each sync uploads only what changed instead of the whole database** — `cd0b024`
- The single `snt-logbook-backup.json` is replaced by one small file per log
  date (photos included), one data file for the non-log tables, and a tiny
  index. A normal sync pushes only the touched day(s) plus the index — entering
  one daily log no longer re-uploads the entire backup, and the app-data
  storage quota is no longer wasted on redundant uploads.
- Restore pulls the index, the data file and every day file and imports them
  all at once, so nothing is missed on a new device.
- The first sync after the update migrates the existing single-file backup
  into the per-day layout automatically and then removes the old file — data
  is never lost in between.
- Every write (log, deficiency, planned work, station, staff, tag, note) marks
  exactly what changed, so unchanged days are never re-sent.
- The Drive Sync panel in Settings now remembers the outcome of the last sync —
  e.g. `Synced to Drive (1 day, 3.2 KB)` or `Already up to date (37 days backed
  up)` — so the per-day upload is visible even when an automatic sync performed
  it. — `9c45bca`

## 1.7.6.18 — 2026-08-09

**Feat: deficiency station defaults to the latest daily-log station; PCDO export keeps only the all-stations disconnection summary** — `989f438`
- Adding a deficiency now pre-fills the Affected Station with the station from
  the most recent daily log entry (the user can still change it).
- The PCDO export no longer prints the per-station, date-wise disconnection
  tables — the single station-wise summary table with the grand total is enough.

## 1.7.6.17 — 2026-08-08

**Fix: disconnection counts no longer show NaN in reports** — `f1e9c68`
- Logs saved before the Not Permitted purpose was added stored the disconnection
  fields as missing, so reports (PCDO export, monthly report, report summaries)
  summed `undefined` values into NaN. Reads are now sanitised so every
  disconnection count defaults to 0 for older entries.

## 1.7.6.16 — 2026-08-08

**Feat: Not Permitted disconnection purpose, 3-row global search filters, entry text size, grouped Drive/backup settings, per-version About** — `7948bd8`
- Disconnection counts gain a fourth "Not Permitted" purpose: the daily log
  form counts it, PCDO exports and reports include a "Not Permitted" column
  with totals, and the timeline / log detail / monthly report show it.
- The global search filters now sit in a fixed 3-column grid, so they take
  three rows even at the Large app font size instead of overflowing.
- An "Entry text size" option (100 / 125 / 150%) scales the written content on
  the Home and Tasks tabs independently of the app-wide font size.
- Deficiency / planned-work reminder days in Settings now apply via an explicit
  Edit + Save flow instead of an always-on input.
- Go-to-date now warns with the nearest valid boundary date, not the date you
  typed, when the pick is out of range.
- Settings groups manual Data Backup & Restore directly under Google Drive
  sync, and the About panel shows the exact app version.
- Tomorrow's Work export drops the priority badge and keeps the bullet dots.

## 1.7.6.15 — 2026-08-08

**Feat: attachments on deficiencies/planned works, Task Manager station+department filters, DOCX export** — `cff8ce1`
- Deficiency tasks and planned works now support attachments (photos/PDFs),
  added from their forms and shown as tappable thumbnails on the Task Manager
  rows, opening the same image/PDF preview with open-with and share actions.
- Planned works gain a Department field (defaults to Signalling), and both the
  Deficiencies and Planned tabs get Department + Station dropdown filters at
  the top, so the pending lists can be narrowed down in one tap.
- The monthly export's planned-work table now includes a Department column.
- Every export report (Tomorrow's Work, PCDO, Diary, Inspections, Monthly) can
  be produced as a PDF or as a Word (.docx) document via a toggle in the export
  sheet, remembering the last chosen format. The DOCX is generated fully
  offline by a built-in OOXML/ZIP writer — no new dependency.

## 1.7.6.14 — 2026-08-07

**Fix: persistent Drive sign-in, reliable auto-sync, smarter sync icon** — `998e3c8`
- Google sign-in now persists: the app remembers the account and silently
  refreshes the token, so it stays logged in until you sign out and no longer
  asks for a login on every sync.
- Signing out and signing in with another account no longer fails with "Could
  not determine the signed-in Google account" — the picked account is resolved
  from its ID token even when Google returns it without profile fields.
- New logs, deficiency/planned-work changes and notes now auto-sync to Drive
  (previously only new daily logs attempted it). Manual sync never pops the
  Google picker unless you are not signed in at all.
- Header sync button now performs a real Drive sync and shows its state:
  spinning while syncing, a static arrow when local changes are pending, and a
  green tick when everything is synced.

## 1.7.6.13 — 2026-08-07

**Fix: PDF heading/table spacing + configurable reminder window** — `ba27075`
- PDF exports: a station name heading now sits right above its table with only a
  small visible gap, and a clear 24pt gap follows the table before the next
  heading, so each station group reads as one block (applies to tables and
  bullet-list groups in all exports).
- Settings: new "Warn before (days)" under Notifications sets how many days
  before its due date a deficiency task or planned work starts warning.
  Default is 3 days; the value is remembered per device. Overdue items always
  warn.

## 1.7.6.12 — 2026-08-07

**Feat: station-filtered "Tomorrow's Work" selection + direct go-to-date + per-export font size** — `a7dab00`
- **Tomorrow's Work**: the export sheet gains a station multi-select filter, plus
  "Select all"/"Clear" buttons scoped to the filtered items, so picking one
  station's deficiencies and planned works is a single step.
- **Go to date**: the calendar now shows a visible bordered "Go to date" button
  that opens the native date picker directly (no extra sheet/step), and jumping
  outside the timeline range reports the exact chosen date
  ("No entry beyond 15 Aug 2026" / "No entry before …").
- **Export text size**: the fixed default in Settings is gone. Each export type
  (monthly, tomorrow's work, diary, PCDO, inspections) remembers the last text
  size chosen in its share/save sheet and reuses it next time; the size can
  still be changed on every export.

## 1.7.6.11 — 2026-08-06

**Feat: per-export text size + upgraded monthly report** — `cff4b17`
- **Export text size** — Settings gains a numeric text size (10–96) that scales
  only the written content in exported PDFs (the app UI is untouched). Every
  PDF export now asks for the text size at the top of the share/save sheet,
  pre-filled with the saved value; changing it there also updates the default.
- **Monthly export filters** — Station and Department are now multi-select
  (tick several, or none = all). The header lists every chosen station/dept.
- **Monthly report layout** — Deficiency Tasks and Planned Works are grouped
  station-wise (a heading per station with its own table, station column
  dropped since it's already the group header). Daily Logs are exported in
  ascending date order.

## 1.7.6.10 — 2026-08-06

**Feat: four new user-requested behaviours** — `f58f17d`
- **"No entry today" reminders** — when no daily log entry exists for today,
  four notifications (9:00 / 12:00 / 15:00 / 18:00) keep nagging until the
  entry is added; they are cancelled the moment the entry is recorded.
- **Automatic cloud sync** — new "Automatic cloud sync" toggle in the Google
  Drive Sync settings (on by default). Auto-sync runs when a new daily log
  entry is added and once on the first app open of the day. Silent and
  best-effort; the manual "Sync to Drive" button still reports errors.
- **New defaults** — app font size defaults to Large (was Medium) and a new
  daily log entry defaults to 70 % TA (was 100 %). Special cases are
  unchanged: Rest/Leave/CR/NH, headquarters visits and dates that already
  carry a TA claim force 0 %.
- **Calendar slide sensitivity & month jump** — swiping between months now
  needs a much shorter flick, and when a slide commits to another month the
  timeline jumps to the 1st of that month (dates outside the timeline range
  clamp silently to the nearest boundary).

## 1.7.6.9 — 2026-08-06

**Fix: notifications are station-based, side text only when explicitly chosen** — `40e3b92`
Deficiency notifications no longer say "towards … side" — they show just the
station. Planned-work notifications now name their station too. Inspection
reminders keep the "towards … side" phrasing only when the driving tag has
"asks for side" enabled in custom tag management; otherwise they show the
station only.

## 1.7.6.8 — 2026-08-06

**Feat: "Go to date" from the calendar header** — `b6596fa`
Tapping the month/year label in the upper calendar opens a date picker that
jumps the calendar and timeline straight to the chosen date. If the date falls
outside the timeline's range (no entries there), a message appears ("No entry
beyond the nearest date" / "No entry before the earliest date") and the app
lands on the nearest boundary date instead.

## 1.7.6.7 — 2026-08-06

**Fix: PDF export & backup save no longer fail with EACCES on Android 10+** — `9d2ff86`
Android scoped storage blocks direct writes to `/storage/emulated/0/Documents`,
which broke "Save file" for PDFs and the JSON backup ("open failed: EACCES").
Added a native `DocumentSave` plugin that saves via Android's Storage Access
Framework ("Save to…" picker), so the user chooses the location and no storage
permission is needed. "Share" now stages the PDF in the app cache (always
writable) before handing it to the share sheet, matching how attachments work.

## 1.7.6.6 — 2026-08-05

**Fix: never overwrite the Drive backup with an unknown local database**
`519a79e` — Sync used to push first and pull second, so on a fresh install the
good Drive backup was overwritten with the empty/default database and Sync then
reported "already up to date". Sync is now timestamp-aware (last-write-wins on
the backup's `exportedAt`): if the local version is unknown or older, the Drive
copy is restored first; the local copy is only uploaded when it is proven at
least as new, or when no backup exists yet. Also added HTTP status codes to
Drive API error messages.

## 1.7.6.5 — 2026-08-05

**Fix: app-data files now created with the appDataFolder parent**
`138d067` — The `drive.appdata` scope only allows files inside the app's
private Drive folder. The old `uploadType=media` create dropped the metadata and
tried to write to the user's root Drive, failing with `403`. New-file creation
now uses a multipart/related upload with `parents: ["appDataFolder"]`, so uploads
succeed and the backup lives in the hidden app-data folder.

## 1.7.6.4 — 2026-08-05

**Fix: fall back to the device Google account for the Drive token**
`1a89565` — When the sign-in result exposes no email/account, the plugin now
uses the single Google account registered on the device (AccountManager) and
reports `idTokenEmail` + `googleAccounts` counts for diagnosis.

## 1.7.6.3 — 2026-08-05

**Fix: sign out before sign-in to force a fresh account pick**
`b2cce56` — Diagnostics showed the restored sign-in had an ID token but no email
or account (a cached Google sign-in with missing profile data). Signing out first
makes the sign-in intent show the account picker again and return a complete
account.

## 1.7.6.2 — 2026-08-05

**Fix: extract the sign-in email from the ID token when the profile is empty**
`ec264aa` — Google cached sign-ins can return an account with empty email/account
fields. The plugin now decodes the ID token JWT (which carries the `email` claim)
in both the sign-in and scope-consent paths, and the failure message reports which
account fields were available.

## 1.7.6.1 — 2026-08-05

**Fix: remember the signed-in email across the Drive scope consent**
`bad5836` — After Google's scope-consent relaunch, `getLastSignedInAccount()` can
return an account with no email, breaking the token fetch. The email captured at
sign-in time is now reused in `fetchAccessToken`.

## 1.7.6 — 2026-08-05

**Fix: handle a null `Account` from `GoogleSignInAccount` during token fetch**
`7547894` — `GoogleAuthUtil.getToken()` throws "account cannot be null" when
`getAccount()` returns null. The plugin now builds the `android.accounts.Account`
from the sign-in email when that happens.

## 1.7.5 — 2026-08-05

**Fix: corrected Google web client ID (removed the `cli` prefix)**
`31381cf` — The embedded OAuth client ID had a spurious `cli` prefix, so the
ID-token exchange failed with `SIGN_IN_FAILED (10)` right after the consent
screen. Client IDs are `<project-number>-<suffix>.apps.googleusercontent.com`
with no prefix.

## 1.7.4 — 2026-08-05

**Fix: registered the GoogleDrive plugin before bridge creation**
`efff692` — `registerPlugin()` was called after `super.onCreate()`, by which
point the Capacitor bridge was already built without the plugin, so the JS
`isConfigured()` call threw and Settings reported "Not configured" even though a
real client ID was embedded.

## 1.7.3 — 2026-08-05

**Chore: embedded the real Google OAuth web client ID** — `ff12539`

## 1.7.2 — 2026-08-05

**Feat: Google Drive sync (first build)** — `de9456d`
Native Google Sign-In via a project-local Capacitor plugin
(`GoogleDrivePlugin`), push/pull of the whole database as one JSON backup in the
app's private Drive app-data folder, Settings UI section, and a `disabled`
state for the primary button. This build shipped with a placeholder client ID;
the real one arrived in 1.7.3.

## 1.7.1 — 2026-08-04

**Feat + bump** — `3c0d67b`, `ba123bf`
Rich notification details (due item names on the lock screen), calendar dot
spacing fix, and tappable search results. Corrected the APK spelling from
"Feild" to "Field".

## 1.7.0 — 2026-08-04

**Feat + bump** — `9f9b287`, `7415d1d`, `cfede91`
First-run onboarding (stations, profile, tutorials), attachments filter that
means "files only" and highlights when active. First version shipped under the
new `SnTFieldlogbook-v*.apk` naming (older archive kept as `SnTFeildlogbook-…`).

## 1.6.0 — 2026-08-04

**Feat: v1.6** — `cc5830a`
PDF viewing, smart reminders, attachments hub, and tag sides. Plus calendar swipe
to flip months (`b722902`) and smooth drag-follow sliding (`619e0b5`).

## 1.6.1 — 2026-08-03

Maintenance build (debug-signed), included in the archived APK list.

## 1.5 — 2026-08-02

Earlier feature build (archived APK only).

## 1.4 — 2026-08-02

Earlier feature build (archived APK only).

## Initial commit — 2026-07-31

Project bootstrap and the offline-first logbook web app. — `de81a61`

---

## How versions are shipped

1. Bump `versionCode` (always +1) and `versionName` in `android/app/build.gradle`.
2. Rebuild the web bundle (`npm run apk:sync`) and the APK (`./gradlew assembleDebug`).
3. Copy to `.apk-download/SnTFieldlogbook-v<version>.apk`.
4. Publish as a GitHub release (tag `v<version>`, "Latest") with the APK attached.

---
status: accepted
area: database
owner: shared
created: 2026-07-23
updated: 2026-07-23
---
# Database Views

This contract defines the canonical database view, filter, and property-visibility behavior shared
by the runtime, API, official client, and editor embeds.

## Canonical File Shape

The `.db.md` frontmatter owns schema and shared presentation configuration:

```yaml
type: database
properties:
  status:
    type: select
    options:
      - name: Todo
      - name: Doing
      - name: Done
  priority:
    type: number
  due:
    type: date
  notes:
    type: text
recordPage:
  hiddenProperties:
    - priority
views:
  - id: all
    name: All
    type: table
    columns:
      - status
      - priority
      - due
      - notes
  - id: active
    name: Active
    type: table
    columns:
      - status
      - priority
      - due
    filterMode: and
    filters:
      - property: status
        operator: not-equals
        value: Done
      - filterMode: or
        filters:
          - property: priority
            operator: greater-than
            value: 2
          - property: due
            operator: less-than
            value: 2026-08-01
```

Rules:

- View IDs are non-empty and unique inside one database. IDs are stable when a view is renamed.
- View names are non-empty and unique inside one database so tabs and menus remain unambiguous.
- Multiple views may have the same type.
- `columns` is an exact visible ordered list, not a hint. The record title remains the leading table
  column and is not repeated in `columns`.
- A missing `recordPage` or `hiddenProperties` means every supported schema property is visible on
  record pages.
- `recordPage.hiddenProperties` applies only to supported schema properties. Unknown frontmatter
  keys remain visible on the record page.
- Unknown future property definitions, view definitions, and unrelated top-level frontmatter are
  preserved across supported mutations.

## Filter Tree

A filter rule has `property`, `operator`, and an optional `value`. A filter group has `filterMode`
and `filters`, whose items may be rules or more groups. The view itself is the root group:

```text
view.filterMode + view.filters
  -> rule
  -> nested group
       -> rule
       -> nested group
```

`filterMode` defaults to `and`. Empty groups are omitted from canonical YAML. A nested group is
evaluated completely, then contributes one boolean result to its parent. The runtime, not the UI,
owns evaluation.

The title is available to filters as the reserved logical property `title`.

### Operators By Property Type

| Property type | Operators | Value control |
| --- | --- | --- |
| title, text | `contains`, `not-contains`, `equals`, `not-equals`, `is-empty`, `is-not-empty` | Text input |
| number | `equals`, `not-equals`, `greater-than`, `less-than`, `is-empty`, `is-not-empty` | Number input |
| date | `equals`, `not-equals`, `greater-than`, `less-than`, `is-empty`, `is-not-empty` | Date input |
| checkbox | `equals`, `not-equals` | Checked/unchecked choice |
| select | `contains`, `not-contains`, `equals`, `not-equals`, `is-empty`, `is-not-empty` | Searchable schema-option picker |
| multi-select | `contains`, `not-contains`, `equals`, `not-equals`, `is-empty`, `is-not-empty` | Searchable schema-option picker |

Value-free empty operators do not store `value`. Number comparison is numeric. Date comparison uses
valid ISO `YYYY-MM-DD` values. Text containment is case-insensitive. Select values must come from
the property's option catalog.

For multi-select, `contains` checks membership of one selected option; `not-contains` checks its
absence. `equals` and `not-equals` compare the complete unordered option set and therefore use a
multi-value option picker.

Changing a rule's property resets any operator or value that is invalid for the new property type.
Incomplete draft rules stay in the open filter UI but are not saved or sent to a query.

## Query Contract

`queryDatabase` accepts an optional `viewId`. When present, the runtime resolves and applies that
view's saved filters and sorts. Optional transient request filters, such as title search, are
combined with the saved root group using `and`. Explicit transient sorts override saved sorts for
that request only.

Querying without `viewId` remains an unfiltered database query for CLI, tests, and general clients.
An unknown explicit view ID is an error rather than silently returning the wrong configured view.

## Mutation Contract

Versioned runtime/API commands own:

```text
createDatabaseView
updateDatabaseView
deleteDatabaseView
setDatabaseRecordPagePropertyVisibility
createDatabaseProperty
```

`updateDatabaseView` may change its name, exact columns, filter tree, and sorts, but not its stable
ID. Creating a table view starts with all supported properties visible and no filters or sorts.
Duplicating a view copies its configuration under a new ID and collision-safe name. Reordering
views is deferred.

The last supported view cannot be deleted. All commands require the database schema base version
and return the new schema/version or a standard conflict result.

`createDatabaseProperty` receives an optional active view ID. A property created from a table header
is appended only to that active view. A property created from an individual record page is visible
on record pages by default and is appended to the first supported view, preserving the current
record-editor behavior without coupling record-page visibility to every table view.

## Shared UI Contract

The full database page and embedded database use one shared view/table component and the same
headless query/mutation behavior. The component's explicit surface variation adds the database
source control for an embed; it does not fork table, toolbar, selection, or view behavior.

### View Tabs

- Every supported view appears as a keyboard-accessible tab, regardless of whether another tab has
  the same type.
- View tabs share one row with the database source/search/filter/new controls. The surrounding
  toolbar and non-tab control area have no shared background fill. In embeds, the database source
  control sits between Filter and New. Every compact control is centered on the same Y-axis as the
  view pills inside the fixed-height toolbar.
- Views render as large independent pills. The active pill has a filled neutral background,
  stronger label color, and stronger weight. Inactive pills have a white background and neutral
  outline. Pills are 40 pixels high inside the shared toolbar band. They do not overlap, translate,
  or connect their borders to the table.
- The table heading has only continuous top and bottom borders. It has no enclosing side border,
  corner treatment, or viewport-pinned outline.
- Tab menus provide rename, duplicate, and delete. A nearby borderless add trigger creates another
  table view and gains a neutral fill only on hover.
- Selecting a full-page tab is client navigation state. Selecting an embedded tab updates that
  embed's `view` field to the stable view ID and participates in normal editor autosave.
- An embed without a `view` field follows the database's first supported view. There is no reserved
  view-ID sentinel: an explicit ID such as `table` remains explicit and roundtrips unchanged.

### Filter Menu

- A filter icon sits immediately before `New` on full database pages. In embeds, the source control
  occupies the intentional slot between Filter and New.
- Activating it opens an anchored context menu/popover. It does not replace the record-name search
  field.
- Each rule chooses property, type-valid condition, and condition value.
- Select and multi-select values use a searchable option list, never free text. Choices and selected
  values use the same colored pills as database cells, including each option's configured color.
- Users can add, remove, and nest groups and choose independent `and`/`or` logic at each group.
- Changes remain a local draft until the user selects `Apply`. Apply validates the complete tree,
  updates the active view through the versioned view command, and refreshes its query. Conflicts
  reload the latest configuration without adding a global notification.

### Property Visibility

- A visible table property's header menu contains `Hide in this view` alongside rename, change
  type, and delete.
- The table header context menu contains a `Show property` submenu for restoring hidden columns.
  This remains available from the name header even when every schema property is hidden. There is
  no separate property-visibility control in the database toolbar.
- Hiding or showing a table property changes only the active view's `columns`.
- A record-page property menu contains `Hide on record pages`. The record-page properties control
  lists hidden schema properties so they can be restored.
- Visibility changes never alter record frontmatter.

### Search And Bulk Selection

- The complete toolbar has a fixed 48-pixel height with 4 pixels of vertical padding. Its 40-pixel
  content band centers every tab and control on one Y-axis. An additional 6-pixel gap separates the
  toolbar from the table heading.
- Record search is a toolbar icon by default. Activating it immediately expands a 224-pixel search
  field to the left, above any tabs it overlaps. The expanded search surface and leading fade fill
  the complete 40-pixel content band, so the bottom rule exactly shares the view pills' bottom
  baseline. The search surface itself is solid white and its bottom rule uses the same border color as inactive
  pills. A separate preceding 44-pixel gradient contains no solid
  background and progresses from transparent white at zero opacity through 50% opacity at 30% of
  its width to fully opaque white, strengthening the blend over overlapping pills. The field has no
  enclosing border or expansion animation.
- When records are selected, the bulk-action surface uses the same 40-pixel white band and preceding
  44-pixel fade as search. Bulk controls retain their compact size while their labels share the exact
  vertical center and text line with the view-pill labels. The selection count becomes a blue-600
  underlined `Clear all` link on hover or keyboard focus and clears the selection when activated.
  In embeds, bulk mode omits the database source link/dropdown so only selection actions remain.
- Pressing Escape closes and clears search and clears the current bulk selection. If selection mode
  is temporarily hiding an open search state, the same Escape action cancels both.
- Table row and select-all checkboxes live in the left interaction gutter outside the primary
  table surface. Their compact controls have no surrounding border, shadow, or filled container.
  They are rendered in a measured sibling overlay outside a normal-width scroll frame; there are no
  checkbox cells or anchors in the table. Row measurements keep each control vertically aligned
  while the overlay keeps it on the exact X-axis of the editor block handle during horizontal
  scrolling. Each transparent gutter target spans the full measured height of its matching row or
  heading and reaches from the block-handle axis to the table edge, so moving within that Y band
  keeps the checkbox visible. The controls stay interactive in embeds rather than starting editor
  marquee selection. Like block handles, they appear on matching row/header or gutter hover and
  keyboard focus without an opacity animation, and remain visible while selected.

### Header Dividers

- Header cells have no persistent vertical divider.
- Hovering a header reveals its resize divider for the full header height; directly hovering or
  focusing the resize target uses the active resize color.

### Property Creation

One shared, parameterized property-create menu is used by table headers, database record pages, and
ordinary page properties.

- The menu opens beside its trigger.
- Its focused search field is both the property name and a type-ahead hint.
- Types appear in a compact icon grid with a small label below each icon.
- Text is the default focused type.
- Typing a type prefix such as `Dat` moves the active type to Date without replacing the entered
  property name.
- Arrow keys navigate the type grid while focus remains in the input.
- The first Enter confirms the active type. The second Enter creates the property with the exact
  search text as its name.
- Empty or duplicate names remain open with an inline validation message.
- The available type set is supplied by the caller, so ordinary pages may retain list/JSON while
  database schema properties expose select/multi-select.

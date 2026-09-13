# Comment Ownership

When `patch()` removes or reorders an entry, any comment that describes it travels along with it instead of being left behind and losing the context of what it's describing or talking about.


## The rules

Rules are evaluated in precedence order.

| | Rule |
|---|---|
| **R1** | **Trailing ownership.** A comment on the same line as the element that just ended is owned by that element. |
| **R2** | **Leading ownership.** A comment run whose last line is exactly one above the member below it is owned by that member. When the member is the last child of an implicit parent and its removal materialises the parent, the run transfers to the materialised parent header. |
| **R3** | **A blank line severs ownership.** A run separated from the member below it by one or more blank lines is independent (unowned), pinned to its position, never travels. |
| **R4** | **Independent otherwise.** A run with no member below it in the same container is pinned. |
| **R5** | **Cross-container ownership.** A trailing run inside a `[table]` / `[[array]]` that R2 assigns to the following document block is owned by that block. |
| **R6** | **A dead-entry run is independent.** A run in which every line is a commented-out entry is pinned, overriding R2. |

## R1 - **Trailing ownership.**

Trailing ownership covers four placements:

- A note after a key-value:

  ```toml
  x = 1 # note
  ```

- A note after a header (which belongs to the table rather than the first row below it):

  ```toml
  [a] # note
  b = 1
  ```

- A note after an entry inside an inline container (table or array):

  ```toml
  { 
    a = 1, # note
    b = 2
  }
  ```

- A note after the closing brace or bracket of a multi-line inline table or array:

  ```toml
  [hooks]
  session_start = [
    { hooks = [
      { command = "only" }] }, # group tail
  ]
  ```

`# group tail` trails the inner inline table `{ hooks = [...] }`, so it is owned by that table.

## Default behavior

A comment is owned by whatever it is attached to: a same-line trailing comment (R1), or an own-line
comment immediately above with no blank line in between (R2).

```toml
# Explains x
x = 1 # trailing note on x
y = 2
```

Removing `x` removes both of its comments along with it:

```toml
y = 2
```

The same applies to `[table]` / `[[array-of-tables]]` blocks, and to elements inside a multi-line
array or inline table, both a leading own-line comment and a trailing same-line one:

```toml
fruits = [
  "apple",
  # crisp and tart
  "banana", # slippery
  "cherry",
]
```

Removing `"banana"` removes both `# crisp and tart` and `# slippery` with it. `"apple"` and
`"cherry"` are untouched. Reordering array elements carries each moved element's own comment(s)
along too.

## A blank line opts out

A comment separated from the entry below it by a blank line is independent prose (R3). It stays in place
rather than traveling with anything:

```toml
# General notes about this file, not about y specifically

y = 2
```

Removing `y` here leaves the note behind.

## What counts as a blank line

A blank line means a line with no comment node on it, a gap in line numbers between two consecutive
comments. It is not a judgement about how the line looks. A `#` on its own is a perfectly good
comment, so it does not break a run:

```toml
# here is some information
#
# And some more notes
Key = "value2"
```

All three comments form one run, so the whole block, separator line included, is owned by `Key` and
travels with it.

Compare, with a genuinely empty line:

```toml
# here is some information

# And some more notes
Key = "value2"
```

Now there are two runs. `# here is some information` is pinned by R3, and only the second run
travels.

## Multi-line runs are all-or-nothing

A run is maximal over consecutive lines, so a blank line both severs ownership (R3) and splits one
visual comment block into two independent runs, which can get different verdicts:

```toml
# ==========================
# Server configuration
# ==========================

# Which interface to bind.
# Use 0.0.0.0 for all.
host = "127.0.0.1"

# Legacy, kept for reference:
# port = 8080
# port = 9090
port = 80

# retries = 3
# timeout = 30
enabled = true
```

| Group | Contents |
|---|---|
| pinned | the 3-line banner above `host` |
| `host` | the 2-line run above it, plus `host = "127.0.0.1"` |
| `port` | the 3-line run above it, plus `port = 80` |
| pinned | the 2-line `# retries` / `# timeout` run |
| `enabled` | `enabled = true` |

Three things this pins down:

- **Runs are all-or-nothing.** The run above `host` moves with `host` in full. There is no notion
  of "the last comment belongs to the key and the rest are a banner". A blank line is how an author
  expresses that split.
- **A mixed run is not R6.** The run above `port` holds two dead entries but one prose line, so the
  whole run stays owned by `port`. The uniformly dead `# retries` / `# timeout` run is pinned.
- **A banner survives a reorder.** The 3-line banner is pinned by R3, not by content, and stays in
  place.

## Commented-out entries

Position alone gets one case wrong. A commented-out entry sitting directly above a live one is not
documentation for it, and should not travel with it (R6):

```toml
# old_port = 80
port = 8080
```

Removing `port` leaves `# old_port = 80` behind.

Detection is a shape test on the comment body: does it look like a TOML entry? The key must be a
valid TOML key (bare, quoted, or dotted) immediately followed by `=`, or a `[table]` /
`[[array]]` header:

| Comment | Verdict |
|---|---|
| `# old_port = 80` | dead entry |
| `# a.b.c = 1` | dead entry |
| `# "my key" = 1` | dead entry |
| `# [server]` | dead entry |
| `# TODO: set x = 1` | prose, owned |
| `# use x = 1 for this` | prose, owned |
| `# see https://a.b?x=1` | prose, owned |

R6 requires every line in the run to be a dead entry. A mixed run stays owned:

```toml
# Port to bind to
# port = 8080
port = 80
```

All three lines travel together, because the prose line anchors the run to `port`.

One known limitation: prose of the exact shape `word = word` is treated as a dead entry and
pinned. For example:

```toml
# note = important
```

## Comments above the next section

A table consumes every token until the next header, so a comment that visually introduces the next
section is stored in the previous table. Ownership is still assigned correctly: a run adjacent to
the next block is owned by that block (R5), not by the table above it.

```toml
[a]
x = 1

# about b
[b]
y = 2
```

Here `# about b` belongs to `[b]`. Removing `[b]` takes the comment with it. A blank line before
`[b]` opts out as usual, and the comment then stays with `[a]`:

```toml
[a]
x = 1

# about b

[b]
y = 2
```

## Elements inside multi-line arrays and inline tables

Ownership also applies to individual elements inside a multi-line array or inline table. Removing
or reordering one element carries its own leading and trailing comments, leaving the neighbours
untouched:

```toml
xs = [
  1, # one
  2, # two
  3,
]
```

Removing the middle element removes `# two` with it:

```toml
xs = [
  1, # one
  3,
]
```

Commented-out-entry detection (R6) does not apply to bare array elements, which are values rather
than `key = value` entries.

## Scope

Comment ownership currently applies to:

- Removing a root key, a `[table]` / `[[array-of-tables]]` block, or a key-value row inside a table
  body.
- Removing or reordering an element inside a multi-line array or inline table.

It does not yet apply to:

- Reordering a `[table]` / `[[array-of-tables]]` block itself. This still uses a plain
  remove-then-insert and does not carry its comments along.
- An array nested inside a multiline inline table:

  ```toml
  t = { xs = [...] }
  ```

## Implementation

The model lives in `src/comment-ownership.ts`:

- `resolveGroups(container, isEligibleForLeading?)` partitions a container's `items` into ownership
  groups in document order. Pure, no mutation.
- `removeMember(root, parent, member)` removes a member along with every comment it owns. Called
  from the deletion sites in `patch.ts`.
- `resolveInlineElementGroups(container, hostItems)` extends the same scan to elements inside
  multi-line inline tables and arrays, correlating hoisted comments back by line range.
- `moveInlineElement(...)` relocates an inline element carrying its owned comments, used by
  `patch.ts` for moves inside inline arrays.
- `normalizeSectionComments(document)` is exported but unused. It is intended for a future reorder
  pass that consumes the tree without round-tripping through text first.

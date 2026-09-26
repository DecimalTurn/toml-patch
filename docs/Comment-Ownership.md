# Comment Ownership

When `patch()` removes or reorders an entry, any comment that describes it travels along with it instead of being left behind and losing the context of what it's describing or talking about.

## Terms

- A **line-comment** is a comment that occupies an entire line on its own. It only has whitespace before it on that line.
- A **trailing-comment** is a comment that appears at the end of a line, after some non-whitespace TOML element or syntax.
- A **comment-block** (aka. comment-run) is a sequence of uninterrupted line-comments. Note that a blank line ends a block even if it is followed by more line comments, a line containing only `#` is still a line-comment like any other and continues the block.

## The rules

Rules are evaluated in precedence order.

| | Rule |
|---|---|
| **R1** | [**Trailing ownership.**](#r1---trailing-ownership) A comment on the same line as the element that just ended is owned by that element. |
| **R2** | [**Leading ownership.**](#r2---leading-ownership) A comment block whose last line is exactly one above the member below it is owned by that member. When the member is the last child of an implicit parent and its removal materialises the parent, the block transfers to the materialised parent header. |
| **R3** | [**A blank line severs ownership.**](#r3---a-blank-line-severs-ownership) A block separated from the member below it by one or more blank lines is independent (unowned), pinned to its position, never travels. |
| **R4** | [**Independent otherwise.**](#r4---independent-otherwise) A block with no member below it in the same container is pinned. |
| **R5** | [**Cross-container ownership.**](#r5---cross-container-ownership) A trailing comment-block inside a `[table]` / `[[array]]` that R2 assigns to the following document-block is owned by that document-block. |
| **R6** | [**A dead-entry block is independent.**](#r6---a-dead-entry-block-is-independent) A commented-out entry whose key differs from the member below it is pinned and break the ownership link in the comment-block; a matching key stays with the member. |

## R1 - **Trailing ownership.**

A comment on the same line as the element that just ended is owned by that element. Trailing
ownership covers four placements:

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

## R2 - **Leading ownership.**

A comment block whose last line is exactly one line above a member is owned by that member:

```toml
# Explains x
x = 1
y = 2
```

Removing `x` removes its leading block along with it:

```toml
y = 2
```

A blank line between the block and the member severs the link (R3).

## R3 - **A blank line severs ownership.**

A block separated from the member below it by one or more blank lines is independent, pinned to its
position, never travels:

```toml
# General notes about this file, not about y specifically

y = 2
```

Removing `y` here leaves the note behind.

A blank line means a line with no comment node on it, a gap in line numbers between two consecutive
comments. It is not a judgement about how the line looks. A `#` on its own is a perfectly good
comment, so it does not break a block:

```toml
# here is some information
#
# And some more notes
Key = "value2"
```

All three comments form one block, so the whole block, separator line included, is owned by `Key` and
travels with it.

Compare, with a genuinely empty line:

```toml
# here is some information

# And some more notes
Key = "value2"
```

Now there are two blocks. `# here is some information` is pinned by R3, and only the second block
travels.

## R4 - **Independent otherwise.**

A block with no member below it in the same container is pinned:

```toml
a = 1
# tail note
```

Removing `a` leaves `# tail note` behind, because no member below it could own it.

## R5 - **Cross-container ownership.**

A table consumes every token until the next header, so a comment that visually introduces the next
section is stored in the previous table. Ownership is still assigned correctly: a trailing comment
block inside a `[table]` / `[[array-of-tables]]` that R2 assigns to the following block is owned by
that block, not by the table above it.

```toml
[a]
x = 1

# about b
[b]
y = 2
```

Here `# about b` belongs to `[b]`. Removing `[b]` takes the comment with it. 

A blank line before `[b]` means that `[b]` doesn't own the preceding comment and the comment then stays with `[a]`:

```toml
[a]
x = 1

# about a

[b]
y = 2
```
In the configuration above, the deleting of `[a]` deletes the comment `# about a` because the comment lives inside the `[a]` block.

## R6 - **A dead-entry block is independent.**

A commented-out entry is a line whose body is shaped like a TOML entry: a valid key (bare, quoted,
or dotted) immediately followed by `=`, or a `[table]` / `[[array]]` header:

| Comment | Verdict |
|---|---|
| `# old_port = 80` | dead entry |
| `# a.b.c = 1` | dead entry |
| `# "my key" = 1` | dead entry |
| `# [server]` | dead entry |
| `# TODO: set x = 1` | prose, owned |
| `# use x = 1 for this` | prose, owned |
| `# see https://a.b?x=1` | prose, owned |

A commented-out entry sitting directly above a live one is not documentation for it, and should not
travel with it:

```toml
# old_port = 80
port = 8080
```

Removing `port` leaves `# old_port = 80` behind.

This severs the block only when the keys differ. A dead `key = value` whose key matches the key of
the member below is related (a superseded value for that same key) and stays with it:

```toml
# Port to bind to
# port = 8080
port = 80
```

All three lines travel together: the prose line anchors the block, and `# port = 8080` has the same
key as `port`.

A differing key severs the block at that line: it and everything above it are pinned, and only the
lines below the last such barrier belong to the member:

```toml
# here is some information
#
# And some more, with a key example:
# key = "value1"
Key = "value2"
```

`# key = "value1"` has key `key`, which differs from `Key`, so it severs the block. Removing `Key`
leaves the whole block behind.

An all-dead block is therefore pinned when its keys differ from the member's key, but still owned
when every dead entry's key matches:

```toml
# port = 8080
port = 80
```

Removing `port` removes `# port = 8080` too.


## Multi-line blocks are all-or-nothing

A block is maximal over consecutive lines, so a blank line both severs ownership (R3) and splits it
into two independent blocks, which can get different verdicts:

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
| `host` | the 2-line block above it, plus `host = "127.0.0.1"` |
| `port` | the 3-line block above it, plus `port = 80` |
| pinned | the 2-line `# retries` / `# timeout` block |
| `enabled` | `enabled = true` |

Three things this pins down:

- **Blocks are all-or-nothing.** The block above `host` moves with `host` in full. There is no notion
  of "the last comment belongs to the key and the rest are a banner". A blank line is how an author
  expresses that split.
- **A mixed block is not R6.** The block above `port` holds two dead entries but one prose line, so the
  whole block stays owned by `port`. The uniformly dead `# retries` / `# timeout` block is pinned.
- **A banner survives a reorder.** The 3-line banner is pinned by R3, not by content, and stays in
  place.

## Elements inside multi-line arrays and inline tables

Ownership also applies to individual elements inside a multi-line array or inline table. Removing
or reordering one element carries its own leading and trailing comments, leaving the neighbours
untouched:

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

Comment ownership applies to:

- Removing a root key, a `[table]` / `[[array-of-tables]]` block, or a key-value row inside a table
  body.
- Removing or reordering an element inside a multi-line array or inline table.
- Reordering a `[table]` / `[[array-of-tables]]` block or a table-body row with the `updateOrder`
  option, which carries each entry's comments along.

It does not yet apply to:

- An array nested inside a multiline inline table:

  ```toml
  t = { xs = [...] }
  ```

## Disabling leading ownership (`commentOwnership: false`)

Ownership is on by default. Passing `commentOwnership: false` to `patch()` disables the *leading*
and *cross-container* ownership rules — a removed entry leaves its own-line leading comment block
behind instead of taking it along. Same-line trailing ownership (R1) always applies: it predates
the option, and the writer relies on it, so a comment such as `x = 1 # note` still travels with
`x` when `x` is removed.

The opt-out is bounded:

- Leading (R2) and cross-container (R5) comment blocks stop traveling: they are left in place.
- Same-line trailing (R1) comments are unchanged: they still travel with their entry.
- Moves are unaffected: a Move never deletes an element, so its comments always travel with it.

The option is not auto-detectable; `autoDetectFormatWithCst` always resolves it to `true`.

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

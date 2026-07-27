# Comment Ownership

When `patch()` removes or reorders an entry, any comment that describes it travels along with it,
instead of being left behind to describe whatever ends up in that spot.

## Default behavior

A comment is considered "owned" by whatever it's attached to — a same-line trailing comment, or an
own-line comment immediately above, with no blank line in between:

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
array or inline table:

```toml
fruits = [
  "apple",  # crisp
  "banana", # slippery
]
```

Removing `"banana"` removes `# slippery` with it — `"apple"` and its own comment are untouched.
Reordering array elements carries each moved element's own comment along too.

## A blank line opts out

A comment separated from the entry below it by a blank line is treated as unowned prose — it stays
in place rather than traveling with anything:

```toml
# General notes about this file, not about y specifically

y = 2
```

Removing `y` here leaves the note behind.

## Scope

Comment ownership currently applies to:

- Removing a root key, a `[table]`/`[[array-of-tables]]` block, or a key-value row inside a table body.
- Removing or reordering an element inside a multi-line array or inline table.

It does not yet apply to:

- Reordering a `[table]`/`[[array-of-tables]]` block itself — this still uses a plain remove-then-insert
  and does not carry its comments along.
- An array nested inside a multiline inline table (e.g. `t = { xs = [...] }`).

For the full rule set (including how a commented-out `# key = value` line is handled) and
implementation notes, see [docs/PLAN-Comment-Ownership.md](PLAN-Comment-Ownership.md).

# TOML 1.1.0 Release Notes

Released: December 24, 2025

## New Features

- Allow newlines and trailing commas in inline tables ([#904]).

  Previously an inline table had to be on a single line and couldn't end with a trailing comma. This is now relaxed so that the following is valid:

      tbl = {
          key      = "a string",
          moar-tbl =  {
              key = 1,
          },
      }

- Add `\xHH` notation to basic strings for codepoints <255 ([#796]):

      null = "null byte: \x00; letter a: \x61"

- Add `\e` escape for the escape character ([#790]):

      csi = "\e["

- Seconds in datetime and time values are now optional ([#894]). The following are now valid:

      dt = 2010-02-03 14:15
      t  = 14:15

## Clarifications

- Clarify that comments never affect the tables produced by parsers ([#950]).

- Clarify Unicode and UTF-8 references ([#929]).

- Clarify where and how dotted keys define tables ([#859]).

- Clarify newline normalization in multi-line literal strings ([#842]).

- Clarify sub-millisecond precision is allowed ([#805]).

- Clarify that parsers are free to support any int or float size ([#1058]).

## References

[#790]: https://github.com/toml-lang/toml/pull/790
[#796]: https://github.com/toml-lang/toml/pull/796
[#805]: https://github.com/toml-lang/toml/pull/805
[#842]: https://github.com/toml-lang/toml/pull/842
[#859]: https://github.com/toml-lang/toml/pull/859
[#894]: https://github.com/toml-lang/toml/pull/894
[#904]: https://github.com/toml-lang/toml/pull/904
[#929]: https://github.com/toml-lang/toml/pull/929
[#950]: https://github.com/toml-lang/toml/pull/950
[#1058]: https://github.com/toml-lang/toml/pull/1058

# Contributing to toml-patch

Thank you for your interest in contributing to toml-patch!

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/toml-patch.git`
3. Install dependencies: `pnpm install`
4. Update submodules: `git submodule update --init --remote`

## Development Workflow

### Updating Submodules

The project includes several submodules for testing and compliance:
- `submodules/spec-tests` - TOML specification test suite
- `submodules/toml-test` - Additional TOML test cases
- `submodules/iarna-toml` - Reference implementation for benchmarking

To update all submodules to their latest versions:

```bash
git submodule update --remote
```

This should be done periodically to ensure the project remains compatible with the latest TOML specifications and test cases.

### Type Checking

Before building or testing, ensure there are no type errors:

```bash
pnpm run typecheck
```

This runs TypeScript's type checker without emitting any files. Fix any type errors before proceeding with builds or pull requests.

### Building

To compile the TypeScript source code into distributable JavaScript:

```bash
pnpm run build
```

This command:
- Cleans the `dist/` directory
- Runs Rollup to bundle the code
- Generates ESM (ES modules) format output
- Creates TypeScript declaration files

The build outputs are:
- `dist/toml-patch.js` - ESM format (for Node.js and modern bundlers)
- `dist/toml-patch.d.ts` - TypeScript type declarations

### Testing

#### Running Tests

To run the main test suite:

```bash
pnpm test
```

This executes the TypeScript unit tests in the `src/__tests__/` directory using [Vitest](https://vitest.dev/).

To run the JavaScript integration tests, which verify the built output works for plain JS consumers:

```bash
pnpm run test:js
```

To capture the unit-test output in a temporary Markdown file at the repository root:

```bash
pnpm run test:output
```

Additional Vitest arguments can be forwarded, for example `pnpm run test:output -- --testNamePattern=16552`.
The captured output is written to `tmp-test-output.md`, which is ignored by Git.

#### Reproducing fuzz seeds

To check a single seed in the format-aware `fuzz3` harness, run:

```powershell
npx -y tsx scripts/fuzz-run3.ts --seed 2151 --to 2151 --mutations 3
```

To generate a distilled test for that `fuzz3` seed, use the variant 3 option:

```powershell
npx -y tsx scripts/distill-seed.ts --seed 2151 --variant 3 --out ./seed-2151.fuzz3.test.ts
```

To distill and append the test directly to `src/__tests__/patch.fuzz.test.ts`:

```powershell
npx -y tsx scripts/distill-and-append-seed.ts --seed 2151 --variant 3
```

The generic seed scaffold can also be previewed or appended to
`src/__tests__/patch.fuzz.test.ts`:

```powershell
npx -y tsx scripts/generate-seed-test.ts --seed 2151 --mutations 3 --dry-run
```

That scaffold replays the base `fuzzOne` harness. It does not include the randomized format options used by `fuzz3`, so use `distill-seed.ts --variant 3` when the format options are part of the reproduction.

#### Running All Tests Together

```bash
pnpm run test:all
```

This runs the Vitest test suite followed by Playwright browser tests.

#### TOML Specification Compliance

To verify compliance with the TOML specification:

```bash
pnpm run specs
```

This runs tests against the official TOML spec test cases from the submodules.

### Benchmarking

To measure performance:

```bash
pnpm run benchmark
```

This runs benchmarks for both parsing and stringifying operations. To see example outputs:

```bash
pnpm run benchmark:example
```

### Complete Development Cycle

For a full development cycle (typecheck, build, and test everything):

```bash
pnpm run dev
```

This command runs typechecking, builds the project, and then runs all tests and spec compliance checks in parallel.

## Making Changes

1. Create a new branch for your feature or fix: `git checkout -b my-feature-branch`
2. Make your changes
3. **Update the CHANGELOG.md** - Add an entry describing your changes under the `[Unreleased]` section
4. Run `pnpm run typecheck` to ensure no type errors
5. Run `pnpm run build` to compile your changes
6. Run `pnpm run test:all` to verify all tests pass
7. Run `pnpm run specs` to ensure TOML spec compliance
8. Commit your changes with a descriptive message
9. Push to your fork and submit a pull request

## Pull Request Requirements

For a pull request to be accepted, it must:

- **Include a CHANGELOG entry** - All PRs must update the CHANGELOG.md file with a description of the changes. Add your entry under the `[Unreleased]` section following the existing format.
- Pass all tests (`pnpm run test:all`)
- Pass TOML specification compliance checks (`pnpm run specs`)
- Pass type checking (`pnpm run typecheck`)
- Include tests for new features or bug fixes
- Follow the existing code style and conventions
- Update relevant documentation as needed

## Code Style

- Follow the existing code style and conventions
- Write tests for new features or bug fixes
- Update documentation as needed
- Ensure all tests pass before submitting a pull request 

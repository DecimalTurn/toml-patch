# Contributing to toml-patch

Thank you for your interest in contributing to toml-patch!

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/toml-patch.git`
3. Install dependencies: `npm install`
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
npm run typecheck
```

This runs TypeScript's type checker without emitting any files. Fix any type errors before proceeding with builds or pull requests.

### Building

To compile the TypeScript source code into distributable JavaScript:

```bash
npm run build
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

#### Running All Tests

To run the main test suite:

```bash
npm test
```

This executes all tests in the `src/__tests__/` directory using Jest.

#### Running JavaScript Tests

To test the built JavaScript output:

```bash
npm run test:js
```

This ensures the compiled JavaScript works correctly.

#### Running All Tests Together

```bash
npm run test:all
```

This runs both the TypeScript and JavaScript test suites.

#### TOML Specification Compliance

To verify compliance with the TOML specification:

```bash
npm run specs
```

This runs tests against the official TOML spec test cases from the submodules.

### Benchmarking

To measure performance:

```bash
npm run benchmark
```

This runs benchmarks for both parsing and stringifying operations. To see example outputs:

```bash
npm run benchmark:example
```

### Complete Development Cycle

For a full development cycle (typecheck, build, and test everything):

```bash
npm run dev
```

This command runs typechecking, builds the project, and then runs all tests and spec compliance checks in parallel.

## Making Changes

1. Create a new branch for your feature or fix: `git checkout -b my-feature-branch`
2. Make your changes
3. **Update the CHANGELOG.md** - Add an entry describing your changes under the `[Unreleased]` section
4. Run `npm run typecheck` to ensure no type errors
5. Run `npm run build` to compile your changes
6. Run `npm run test:all` to verify all tests pass
7. Run `npm run specs` to ensure TOML spec compliance
8. Commit your changes with a descriptive message
9. Push to your fork and submit a pull request

## Pull Request Requirements

For a pull request to be accepted, it must:

- **Include a CHANGELOG entry** - All PRs must update the CHANGELOG.md file with a description of the changes. Add your entry under the `[Unreleased]` section following the existing format.
- Pass all tests (`npm run test:all`)
- Pass TOML specification compliance checks (`npm run specs`)
- Pass type checking (`npm run typecheck`)
- Include tests for new features or bug fixes
- Follow the existing code style and conventions
- Update relevant documentation as needed

## Code Style

- Follow the existing code style and conventions
- Write tests for new features or bug fixes
- Update documentation as needed
- Ensure all tests pass before submitting a pull request 

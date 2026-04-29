
import patch from '../patch';
import { parse } from '../';
import dedent from 'dedent';

describe('inline comment alignment', () => {
  test('should shift an entire comment group right when one row grows past the original alignment column', () => {
    const existing = dedent`
      # Baseline aligned comment group
      short_label = "a"                # one
      medium      = "bb"               # two
      count       = 1                  # three
      ` + '\n';

    const value = parse(existing);

    // This row grows beyond the original comment column and previously caused
    // text/comment-column desync in normalizeInlineCommentAlignmentInString.
    value.medium = 'a much longer value than before';

    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      # Baseline aligned comment group
      short_label = "a"                                             # one
      medium      = "a much longer value than before"               # two
      count       = 1                                               # three
      ` + '\n');
  });

  test('should preserve aligned inline comments when patching single-line basic strings, arrays and numbers with same width', () => {
    const existing = dedent`
      # Demo fixture covering strings, arrays and number value kinds
      title         = "Release plan"                    # single-line basic string
      retry_count   = 3                                 # integer
      error_rate    = 0.125                             # float
      build_numbers = [1, 2, 3]                         # inline array

      [service]
      display_name  = "API"                             # string in table
      ports         = [8080, 8081]                      # array in table
      timeout_ms    = 1500                              # number in table
      ` + '\n';

    const value = parse(existing);

    value.title = 'Sprint notes';
    value.retry_count = 7;
    value.error_rate = 0.875;
    value.build_numbers = [2, 4, 6];
    value.service.display_name = 'CLI';
    value.service.ports = [9000, 9001];
    value.service.timeout_ms = 2500;

    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      # Demo fixture covering strings, arrays and number value kinds
      title         = "Sprint notes"                    # single-line basic string
      retry_count   = 7                                 # integer
      error_rate    = 0.875                             # float
      build_numbers = [2, 4, 6]                         # inline array

      [service]
      display_name  = "CLI"                             # string in table
      ports         = [9000, 9001]                      # array in table
      timeout_ms    = 2500                              # number in table
      ` + '\n');
  });

  test('should preserve aligned inline comments when patching single-line basic strings, arrays and numbers with different width', () => {
    const existing = dedent`
      # Demo fixture covering strings, arrays and number value kinds
      title         = "Release plan"                    # single-line basic string
      retry_count   = 3                                 # integer
      error_rate    = 0.125                             # float
      build_numbers = [1, 2, 3]                         # inline array

      [service]
      display_name  = "API"                             # string in table
      ports         = [8080, 8081]                      # array in table
      timeout_ms    = 1500                              # number in table
      ` + '\n';

    const value = parse(existing);

    value.title = 'Release plan v2';
    value.retry_count = 12;
    value.error_rate = 0.5;
    value.build_numbers = [1, 2, 3, 5, 8];
    value.service.display_name = 'API Gateway';
    value.service.ports = [8080, 8081, 8082];
    value.service.timeout_ms = 25000;

    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      # Demo fixture covering strings, arrays and number value kinds
      title         = "Release plan v2"                 # single-line basic string
      retry_count   = 12                                # integer
      error_rate    = 0.5                               # float
      build_numbers = [1, 2, 3, 5, 8]                   # inline array

      [service]
      display_name  = "API Gateway"                     # string in table
      ports         = [8080, 8081, 8082]                # array in table
      timeout_ms    = 25000                             # number in table
      ` + '\n');
  });

  test('should preserve aligned inline comments when patching single-line inline tables with different width', () => {
    const existing = dedent`
      # Demo fixture covering single-line inline tables
      release      = { name = "api", retries = 1 }                     # inline table at root
      deployment   = { region = "eu", timeout_ms = 1500 }              # another inline table at root

      [service]
      endpoints     = { primary = 8080, secondary = 8081 }             # inline table in table
      observability = { traces = false, metrics = true }               # another inline table in table
      ` + '\n';

    const value = parse(existing);

    value.release.name = 'api-gateway';
    value.release.retries = 12;
    value.deployment.region = 'europe-west-1';
    value.deployment.timeout_ms = 25000;
    value.service.endpoints.primary = 80;
    value.service.endpoints.secondary = 443;
    value.service.observability.traces = true;
    value.service.observability.metrics = false;

    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      # Demo fixture covering single-line inline tables
      release      = { name = "api-gateway", retries = 12 }            # inline table at root
      deployment   = { region = "europe-west-1", timeout_ms = 25000 }  # another inline table at root

      [service]
      endpoints     = { primary = 80, secondary = 443 }                # inline table in table
      observability = { traces = true, metrics = false }               # another inline table in table
      ` + '\n');
  });

  test('should preserve aligned inline comments when patching single-line inline tables with different width '
    + '+ need to increase whitespace across the full mixed-type group', () => {
    const existing = dedent`
      # Demo fixture covering single-line inline tables
      profile      = "dev"                                   # string before inline tables
      release      = { name = "api", retries = 1 }           # inline table at root
      deployment   = { region = "eu", timeout_ms = 1500 }    # another inline table at root
      retry_limit  = 3                                       # integer after inline tables
      backends     = ["api", "worker"]                       # array after inline tables

      ` + '\n';

    const value = parse(existing);

    value.profile = 'development';
    value.release.name = 'api-gateway';
    value.release.retries = 12;
    value.deployment.region = 'europe-west-1';
    value.deployment.timeout_ms = 25000;
    value.retry_limit = 12;
    value.backends = ['api', 'worker', 'scheduler'];

    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      # Demo fixture covering single-line inline tables
      profile      = "development"                                       # string before inline tables
      release      = { name = "api-gateway", retries = 12 }              # inline table at root
      deployment   = { region = "europe-west-1", timeout_ms = 25000 }    # another inline table at root
      retry_limit  = 12                                                  # integer after inline tables
      backends     = ["api", "worker", "scheduler"]                      # array after inline tables

      ` + '\n');
  });

  test('should preserve aligned inline comments when patching single-line inline tables with different width '
    + '+ need to increase whitespace across the full mixed-type group 2', () => {
    const existing = dedent`
      # Demo fixture covering single-line inline tables
      profile      = "dev"                                          # string before inline tables
      release      = { name = "api", retries = 1 }                  # inline table at root
      deployment   = { region = "eu", timeout_ms = 1500 }           # another inline table at root
      retry_limit  = 3                                              # integer after inline tables
      backends     = ["api", "worker", "cloud", "model", "engine"]  # array after inline tables

      ` + '\n';

    const value = parse(existing);

    value.profile = 'development';
    value.release.name = 'api-gateway';
    value.release.retries = 12;
    value.deployment.region = 'europe-west-1';
    value.deployment.timeout_ms = 25000;
    value.retry_limit = 12;
    // Backend unchanged, but still needs to be shifted to maintain alignment with the rest of the group

    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      # Demo fixture covering single-line inline tables
      profile      = "development"                                     # string before inline tables
      release      = { name = "api-gateway", retries = 12 }            # inline table at root
      deployment   = { region = "europe-west-1", timeout_ms = 25000 }  # another inline table at root
      retry_limit  = 12                                                # integer after inline tables
      backends     = ["api", "worker", "cloud", "model", "engine"]     # array after inline tables

      ` + '\n');
  });

  test('should preserve data when adjacent rows share identical trailing comment text', () => {
    const existing = dedent`
      short  = "a"                     # duplicate note
      medium = "bb"                    # duplicate note
      count  = 1                       # duplicate note
      ` + '\n';

    const value = parse(existing);
    value.medium = 'a much longer value than before';

    const patched = patch(existing, value);

    expect(parse(patched)).toEqual({
      short: 'a',
      medium: 'a much longer value than before',
      count: 1,
    });
    expect((patched.match(/# duplicate note/g) || []).length).toBe(3);
    expect(patched).toContain('short  = "a"');
    expect(patched).toContain('medium = "a much longer value than before"');
    expect(patched).toContain('count  = 1');
  });

  test('should keep # inside string values as data while preserving aligned trailing comments', () => {
    const existing = dedent`
      alpha = "id#A"                   # inline note
      beta  = "id#B"                   # inline note
      gamma = 1                        # inline note
      ` + '\n';

    const value = parse(existing);
    value.beta = 'payload#B#2026';
    value.gamma = 2;

    const patched = patch(existing, value);

    expect(parse(patched)).toEqual({
      alpha: 'id#A',
      beta: 'payload#B#2026',
      gamma: 2,
    });
    expect((patched.match(/# inline note/g) || []).length).toBe(3);
    expect(patched).toContain('alpha = "id#A"');
    expect(patched).toContain('beta  = "payload#B#2026"');
    expect(patched).toContain('gamma = 2');
  });

  test('should not confuse full comment text inside a string value with the actual trailing comment', () => {
    // The string value of alpha contains the FULL comment text "# inline note".
    // resolveCommentColumn uses lastIndexOf so it must find the rightmost occurrence
    // (the real trailing comment), not the one embedded in the quoted string.
    // A regression to indexOf would return the wrong column and corrupt alignment.
    const existing = dedent`
      alpha = "# inline note"   # inline note
      beta  = "B"               # inline note
      gamma = 1                 # inline note
      ` + '\n';

    const value = parse(existing);
    value.beta = 'much much longer value';
    value.gamma = 2;

    const patched = patch(existing, value);

    expect(parse(patched)).toEqual({
      alpha: '# inline note',
      beta: 'much much longer value',
      gamma: 2,
    });
    expect(patched).toEqual(dedent`
      alpha = "# inline note"            # inline note
      beta  = "much much longer value"   # inline note
      gamma = 2                          # inline note
      ` + '\n');
  });

  test('should not update trailing comments for inline tables', () => {

    const existing = dedent`
      alpha = "# inline note"   # inline note
      beta  = { key1 = "B",     # inline note
                key2 = "C" }    # inline note
      gamma = 1                 # inline note
      ` + '\n';

    const value = parse(existing);
    value.beta.key1 = 'much much longer value';
    value.gamma = 21;

    const patched = patch(existing, value);

    expect(parse(patched)).toEqual({
      alpha: '# inline note',
      beta: { key1: 'much much longer value', key2: 'C' },
      gamma: 21,
    });
    expect(patched).toEqual(dedent`
      alpha = "# inline note"                      # inline note
      beta  = { key1 = "much much longer value",   # inline note
                key2 = "C" }                       # inline note
      gamma = 21                                   # inline note
      ` + '\n');
  });


  test('should preserve aligned comments when a string becomes multiline', () => {
    const existing = dedent`
      title   = "A"                    # one
      details = """short"""            # two
      count   = 1                      # three
      feet    = 5                      # four
      ` + '\n';

    const value = parse(existing);
    value.details = 'first line\nsecond # still data\nthird line';
    value.count = 21;

    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
      title   = "A"                    # one
      details = """first line
      second # still data
      third line"""                    # two
      count   = 21                     # three
      feet    = 5                      # four
      ` + '\n');

    expect(parse(patched)).toEqual({
      title: 'A',
      details: 'first line\nsecond # still data\nthird line',
      count: 21,
      feet: 5
    });
  });

  test('should not preserve aligned comment if only a regular comment is present', () => {
    const existing = dedent`
                                        # Demo fixture covering single-line inline tables
      profile      = "dev"              # string before inline tables
      ` + '\n';

    const value = parse(existing);

    value.profile = 'development';

    const patched = patch(existing, value);

    expect(patched).toEqual(dedent`
                                        # Demo fixture covering single-line inline tables
      profile      = "development"              # string before inline tables
      ` + '\n');
  });
});

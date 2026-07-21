// Build script: runs both rollup configs sequentially with proper cleanup.
// Works around an intermittent event-loop hang in @rollup/plugin-typescript
// when targeting es2025 with TypeScript 6.x in multi-config rollup builds.
import { rollup } from 'rollup';

// Load the existing rollup config
const configs = (await import('../rollup.config.js')).default;
const configList = Array.isArray(configs) ? configs : [configs];

for (const config of configList) {
  const bundle = await rollup(config);
  const outputs = Array.isArray(config.output) ? config.output : [config.output];
  for (const out of outputs) {
    await bundle.write(out);
  }
  await bundle.close();
}

console.log('Build complete.');

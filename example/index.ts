import { registerRootComponent } from 'expo';
import { selectEntryMode } from './entry-mode';

// Direct property access lets Expo inline these optional build-time flags.
const mode = selectEntryMode({
  api: process.env.EXPO_PUBLIC_GLMAP_API_TESTS,
  lifecycle: process.env.EXPO_PUBLIC_GLMAP_LIFECYCLE,
  benchmark: process.env.EXPO_PUBLIC_GLMAP_BENCH,
});

// Do not evaluate benchmark/native test-view bindings during a normal demo launch.
const Root = mode === 'api' ? require('./DemoApiChecks').default
  : mode === 'lifecycle' ? require('./LifecycleApp').default
  : mode === 'benchmark' ? require('./BenchmarkApp').default
  : require('./App').default;

registerRootComponent(Root);

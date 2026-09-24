import { registerRootComponent } from 'expo';

import App from './App';
import BenchmarkApp from './BenchmarkApp';
import DemoApp from './DemoApp';
import DemoApiChecks from './DemoApiChecks';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(
  process.env.EXPO_PUBLIC_GLMAP_API_TESTS === '1'
    ? DemoApiChecks
    : process.env.EXPO_PUBLIC_GLMAP_DEMO === '1'
    ? DemoApp
    : process.env.EXPO_PUBLIC_GLMAP_BENCH === '1'
      ? BenchmarkApp
      : App,
);

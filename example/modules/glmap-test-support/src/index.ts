import { requireNativeModule } from 'expo-modules-core';

/** Example-only result persistence. No map or service implementation is exported. */
export const testSupport = requireNativeModule<{
  saveResults(json: string): Promise<string>;
  saveLifecycleResults(json: string): Promise<string>;
  saveBenchmarkResults(json: string): Promise<string>;
}>('GLMapTestSupport');

import type { Environment } from '../../config/env.js';
import { MockJobSource } from './mock/mock.adapter.js';
import { JobSourceRegistry } from './job-source.registry.js';
import { ArbeitnowJobSource } from './providers/arbeitnow/arbeitnow.adapter.js';
import { HimalayasJobSource } from './providers/himalayas/himalayas.adapter.js';
import { JobicyJobSource } from './providers/jobicy/jobicy.adapter.js';
import { RemotiveJobSource } from './providers/remotive/remotive.adapter.js';
import { RemoteOkJobSource } from './providers/remoteok/remoteok.adapter.js';
import { JobSourceHttpClient } from './shared/http-client.js';

export function createJobSourceRegistry(config: Environment): JobSourceRegistry {
  const http = new JobSourceHttpClient({
    timeoutMs: config.JOB_SOURCE_TIMEOUT_MS,
    maxRetries: config.JOB_SOURCE_MAX_RETRIES,
    userAgent: config.JOB_SOURCE_USER_AGENT,
  });
  const registry = new JobSourceRegistry().register(new MockJobSource());
  if (config.ENABLE_REAL_JOB_SOURCES) {
    if (config.REMOTIVE_ENABLED) {
      registry.register(new RemotiveJobSource(http, config.RAW_DATA_MAX_BYTES));
    }
    if (config.ARBEITNOW_ENABLED) {
      registry.register(new ArbeitnowJobSource(http, config.RAW_DATA_MAX_BYTES));
    }
    if (config.JOBICY_ENABLED) {
      registry.register(new JobicyJobSource(http, config.RAW_DATA_MAX_BYTES));
    }
    if (config.HIMALAYAS_ENABLED) {
      registry.register(new HimalayasJobSource(http, config.RAW_DATA_MAX_BYTES));
    }
    if (config.REMOTEOK_ENABLED) {
      registry.register(new RemoteOkJobSource(http, config.RAW_DATA_MAX_BYTES));
    }
  }
  return registry;
}

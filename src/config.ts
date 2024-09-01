import { poolLogger as logger } from './logger';
import * as fs from 'fs';

/**
 * Default config path of puppeteer
 *
 * Default is 'puppeteer-pool-config.json' from project root path
 */
const defaultConfigPath = process.cwd() + '/puppeteer-pool-config.json';

/**
 * Default Config
 *
 * This will be over written if user define own path
 */
const config = {
  browser_pool: {
    min: 2,
    max: 5,
    width: 1080,
    height: 1024,
  },
  session_pool: {
    min: 1,
    max: 5,
    width: 1080,
    height: 1024,
    ignoreResourceLoad: false,
    enablePageCache: false,
  },
  threshold: {
    activate: true,
    interval: 5,
    cpu: {
      break: 10,
      warn: 5,
    },
    memory: {
      break: 300,
      warn: 200,
    },
  },
};

export const load = (configPath: string = null) => {
  try {
    const loadedConfig = JSON.parse(
      fs.readFileSync(configPath ?? defaultConfigPath, 'utf-8'),
    );
    // Browser Pool Config
    if (loadedConfig?.browser_pool) {
      config.browser_pool.min =
        loadedConfig?.browser_pool?.min ?? config.browser_pool.min;
      config.browser_pool.max =
        loadedConfig?.browser_pool?.max ?? config.browser_pool.max;
    }
    // Session Pool Config
    if (loadedConfig?.session_pool) {
      config.session_pool.min =
        loadedConfig?.session_pool?.min ?? config.session_pool.min;
      config.session_pool.max =
        loadedConfig?.session_pool?.max ?? config.session_pool.max;
      config.session_pool.width =
        loadedConfig?.session_pool?.width ?? config.session_pool.width;
      config.session_pool.height =
        loadedConfig?.session_pool?.height ?? config.session_pool.height;
      config.session_pool.ignoreResourceLoad =
        loadedConfig?.session_pool?.ignoreResourceLoad ??
        config.session_pool.ignoreResourceLoad;
      config.session_pool.enablePageCache =
        loadedConfig?.session_pool?.enablePageCache ??
        config.session_pool.enablePageCache;
    }
    // Threshold Config
    if (loadedConfig?.threshold) {
      config.threshold.activate =
        loadedConfig.threshold?.activate ?? config.threshold.activate;
      // Threshold Interval
      config.threshold.interval =
        loadedConfig.threshold?.interval ?? config.threshold.interval;
      // Threshold CPU config
      if (loadedConfig.threshold?.cpu) {
        config.threshold.cpu.break =
          loadedConfig.threshold.cpu?.break ?? config.threshold.cpu.break;
        config.threshold.cpu.warn =
          loadedConfig.threshold.cpu?.warn ?? config.threshold.cpu.warn;
      }
      // Threshold Memory config
      if (loadedConfig.threshold?.memory) {
        config.threshold.memory.break =
          loadedConfig.threshold.memory?.break ?? config.threshold.memory.break;
        config.threshold.memory.warn =
          loadedConfig.threshold.memory?.warn ?? config.threshold.memory.warn;
      }
    }
    logger.info('Config loaded successfully');
  } catch (err) {
    // If error while loading config, use default config
    logger.warn('Fail to load config. Use default config');
  }

  return config;
};

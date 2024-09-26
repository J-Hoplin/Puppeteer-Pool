import { ManagerConfigValidationException } from './error';
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
  },
  session_pool: {
    min: 5,
    max: 10,
    width: 1080,
    height: 1024,
    ignoreResourceLoad: false,
    enablePageCache: false,
  },
  threshold: {
    activate: true,
    interval: 5,
    cpu: {
      break: 80,
      warn: 45,
    },
    memory: {
      break: 2048,
      warn: 800,
    },
  },
};

function ValidateInteager(
  value: number,
  least: number,
  section: string,
  valueName = 'Value',
): void {
  if (typeof value !== 'number') {
    throw new ManagerConfigValidationException(
      `[${section}] Value should be number - ${valueName}: ${value}`,
    );
  }
  if (value < 0) {
    throw new ManagerConfigValidationException(
      `[${section}] Negative number not allowed - ${valueName}: ${value}`,
    );
  }
  if (value < least) {
    throw new ManagerConfigValidationException(
      `[${section}] ${valueName} should be larger or equal than ${least} - ${valueName}: ${value}`,
    );
  }
}

function ValidateRange(
  minRange: number,
  maxRange: number,
  leastRange: number,
  section: string,
  minRangeName: string = 'Min',
  maxRangeName: string = 'Max',
): void {
  if (typeof minRange !== 'number' || typeof maxRange !== 'number') {
    throw new ManagerConfigValidationException(
      `[${section}] Value should be number - ${minRangeName}: ${minRange}, ${maxRangeName}: ${maxRange}`,
    );
  }
  if (minRange < 0 || maxRange < 0) {
    throw new ManagerConfigValidationException(
      `[${section}] Negative number not allowed - ${minRangeName}: ${minRange}, ${maxRangeName}: ${maxRange}`,
    );
  }
  if (minRange < leastRange) {
    throw new ManagerConfigValidationException(
      `[${section}] ${minRangeName} value should be larger or equal than ${leastRange} - ${minRangeName}: ${minRange}`,
    );
  }
  if (minRange > maxRange) {
    throw new ManagerConfigValidationException(
      `[${section}] ${minRangeName} should be less than ${maxRangeName} value - ${minRangeName}: ${minRange}, ${maxRangeName}: ${maxRange}`,
    );
  }
}

function ValidateBoolean(value: boolean, section: string): void {
  if (typeof value !== 'boolean') {
    throw new ManagerConfigValidationException(
      `[${section}] Value should be boolean`,
    );
  }
}

export const load = (configPath: string = null) => {
  let loadedConfig = null;
  try {
    loadedConfig = JSON.parse(
      fs.readFileSync(configPath ?? defaultConfigPath, 'utf-8'),
    );
    logger.info('Config loaded successfully');
  } catch (err) {
    // If error while loading config, use default config
    logger.warn('Fail to load config. Use default config');
  }
  // Browser Pool Config
  if (loadedConfig?.browser_pool) {
    config.browser_pool.min =
      loadedConfig?.browser_pool?.min ?? config.browser_pool.min;
    config.browser_pool.max =
      loadedConfig?.browser_pool?.max ?? config.browser_pool.max;
    ValidateRange(
      config.browser_pool.min,
      config.browser_pool.max,
      1,
      'Browser Pool Config',
    );
  }
  // Session Pool Config
  if (loadedConfig?.session_pool) {
    config.session_pool.min =
      loadedConfig?.session_pool?.min ?? config.session_pool.min;
    config.session_pool.max =
      loadedConfig?.session_pool?.max ?? config.session_pool.max;
    ValidateRange(
      config.session_pool.min,
      config.session_pool.max,
      1,
      'Session Pool Config',
    );
    config.session_pool.width =
      loadedConfig?.session_pool?.width ?? config.session_pool.width;
    ValidateInteager(config.session_pool.width, 50, 'Width Config', 'Width');
    config.session_pool.height =
      loadedConfig?.session_pool?.height ?? config.session_pool.height;
    ValidateInteager(config.session_pool.height, 50, 'Height Config', 'Height');
    config.session_pool.ignoreResourceLoad =
      loadedConfig?.session_pool?.ignoreResourceLoad ??
      config.session_pool.ignoreResourceLoad;
    ValidateBoolean(
      config.session_pool.ignoreResourceLoad,
      'Ignore Resource Config',
    );
    config.session_pool.enablePageCache =
      loadedConfig?.session_pool?.enablePageCache ??
      config.session_pool.enablePageCache;
    ValidateBoolean(config.session_pool.enablePageCache, 'Page Cache Config');
  }
  // Threshold Config
  if (loadedConfig?.threshold) {
    config.threshold.activate =
      loadedConfig.threshold?.activate ?? config.threshold.activate;
    ValidateBoolean(
      config.threshold.activate,
      'Threshold Watcher Active Config',
    );
    // Threshold Interval
    config.threshold.interval =
      loadedConfig.threshold?.interval ?? config.threshold.interval;
    ValidateInteager(
      config.threshold.interval,
      1,
      'Threshold Config',
      'Interval',
    );
    // Threshold CPU config
    if (loadedConfig.threshold?.cpu) {
      config.threshold.cpu.break =
        loadedConfig.threshold.cpu?.break ?? config.threshold.cpu.break;
      config.threshold.cpu.warn =
        loadedConfig.threshold.cpu?.warn ?? config.threshold.cpu.warn;
      ValidateRange(
        config.threshold.cpu.warn,
        config.threshold.cpu.break,
        1,
        'CPU Config',
        'Warn',
        'Break',
      );
    }
    // Threshold Memory config
    if (loadedConfig.threshold?.memory) {
      config.threshold.memory.break =
        loadedConfig.threshold.memory?.break ?? config.threshold.memory.break;
      config.threshold.memory.warn =
        loadedConfig.threshold.memory?.warn ?? config.threshold.memory.warn;
      ValidateRange(
        config.threshold.memory.warn,
        config.threshold.memory.break,
        100,
        'Memory Config',
        'Warn',
        'Break',
      );
    }
  }

  return config;
};

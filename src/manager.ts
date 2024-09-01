import {
  PoolManagerNotInitializedException,
  SessionCallbackException,
} from './error';
import puppeteer, { Browser, Page, PuppeteerLaunchOptions } from 'puppeteer';
import { enablePageCaching, ignoreResourceLoading } from './options';
import genericPool, { Pool } from 'generic-pool';
import { poolLogger as logger } from './logger';
import pidusage from 'pidusage';
import { load } from './config';
import dayjs from 'dayjs';

/**
 * Global Types
 */

// Type of pool metadata single entry's value
export type MetadataMap = {
  pid: number;
  sessionPoolCount: number;
  sessionPoolManager: SessionPoolManager;
};

// Type of session callback
export type sessionCallback = (page: Page) => Promise<any>;

// Type of session pool metrics
export type PoolMetricsType = {
  Id: number;
  CPU: number;
  Memory: number;
  SessionPoolCount: number;
};

/**
 * Global Instances
 */
let config = null;
let managerInstance: PuppeteerPoolManager = null;

/**
 * Create new puppeteer pool manager
 *
 * Invoke boot method
 */
export async function bootPoolManager(
  puppeteerOptions: PuppeteerLaunchOptions = {},
  poolConfigPath: string = null,
) {
  config = load(poolConfigPath);
  /**
   * Boot should be boot only once
   */
  if (managerInstance) {
    logger.warn('Pool manager already booted. Ignore invoke signal');
    return;
  }
  logger.info('Boot pool manager');
  managerInstance = new PuppeteerPoolManager();
  await managerInstance.boot(puppeteerOptions);
}

/**
 * Reboot pool manager
 *
 * Warning: Not recommended
 */
export async function rebootPoolManager() {
  logger.info('Reboot pool manager');
  if (managerInstance) {
    logger.info('Terminate current pool manager');
    await managerInstance.terminatePool();
    // Set instace to null
    managerInstance = null;
  }
  await bootPoolManager();
}

/**
 *
 * Issue session and run user's callback function
 *
 * throw exception if pool manager is not initialized
 */
export async function controlSession(cb: sessionCallback) {
  if (managerInstance === null) {
    throw new PoolManagerNotInitializedException();
  }
  return await managerInstance.issueSession(cb);
}

/**
 * Get entire metrics of pools which manager is managing
 *
 * throw exception if pool manager is not initialized
 */
export async function getPoolMetrics() {
  if (managerInstance === null) {
    throw new PoolManagerNotInitializedException();
  }
  return await managerInstance.getPoolMetrics();
}

class PuppeteerPoolManager {
  // Pool Instance
  private pools: Pool<any> = null;

  // Browser Pool ID - Increment
  private browserPoolId = 1;

  // Map: pid: browser process id
  private poolMetadata: Map<number, MetadataMap> = new Map();

  // Threshold Watcher ID
  private thresholdWatcher: NodeJS.Timeout = null;

  /**
   * Boot Manager - Browser Pool Factory
   *
   * Enroll signal handler for graceful shutdown
   */
  async boot(options: PuppeteerLaunchOptions) {
    this.pools = genericPool.createPool(
      {
        create: async () => {
          const id = this.browserPoolId++;
          logger.info(`Creating browser pool --- Pool ID: ${id}`);
          /**
           *
           * Create Session Pool Factory
           *
           * id: ID of Pool which manage Session Pool
           *
           */
          const pool = await this.sessionPoolFactory(
            id,
            options,
            config.session_pool.ignoreResourceLoad,
            config.session_pool.enablePageCache,
          );

          return { pool, id };
        },
        destroy: async ({ pool, id }) => {
          this.poolMetadata.delete(id);
          logger.info(`Destroying browser pool --- Pool ID: ${id}`);
          await pool.close();
        },
      },
      {
        max: config.browser_pool.max,
        min: config.browser_pool.min,
      },
    );
    /**
     * Signal Handler
     *
     * Common stderr signal handling for graceful shutdown
     */
    const targetSignals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    targetSignals.forEach((signal) => {
      process.on(signal, () => {
        const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
        logger.info(
          `${now} --- Signal received(${signal}) - Terminating puppeteer pool`,
        );
        // Terminate threshold watcher
        clearInterval(this.thresholdWatcher);
        logger.info('Threshold watcher successfully terminated');
        for (const [poolId, { pid }] of this.poolMetadata) {
          const poolAlias = `POOL_${poolId}(PID: ${pid})`;
          try {
            process.kill(pid, 'SIGTERM');
            logger.info(`${poolAlias} successfully terminated`);
          } catch (err) {
            logger.error(`${poolAlias} termination failed`);
          }
        }
        process.exit(1);
      });
    });

    if (config.threshold.activate) {
      this.startThresholdWatcher();
    }
  }

  /**
   * Start threshold watcher
   *
   * If threshold is over, log status and reboot puppeteer instance
   *
   * Reboot Session Pool Puppeteer
   */
  private startThresholdWatcher() {
    logger.info('Creating threshold watcher');
    this.thresholdWatcher = setInterval(async () => {
      const metrics = await this.getPoolMetrics();
      const getOverRate = (metric, threshold) =>
        parseFloat(((metric / threshold) * 100).toFixed(2));
      for (const metric of metrics) {
        const { Id, CPU, Memory } = metric;
        const metadata = this.poolMetadata.get(Id);
        // CPU Threshold
        if (CPU >= config.threshold.cpu.break) {
          logger.error(
            `CPU usage is over threshold. --- Pool ID: ${Id} --- CPU: ${CPU}% (${getOverRate(CPU, config.threshold.cpu.break)}%)`,
          );
          logger.error(`Reboot session pool puppeteer --- Pool ID: ${Id}`);
          // Reboot and get pid again
          const pid =
            await metadata.sessionPoolManager.rebootSessionPoolPuppeteer();
          this.poolMetadata.set(Id, {
            ...metadata,
            pid,
          });
          continue;
        } else if (CPU >= config.threshold.cpu.warn) {
          logger.warn(
            `[Warn] CPU usage is over threshold --- Pool ID: ${Id} --- CPU: ${CPU}% (${getOverRate(CPU, config.threshold.cpu.warn)}%)`,
          );
        }
        // Memory Threshold
        if (Memory >= config.threshold.memory.break) {
          logger.error(
            `Memory usage is over threshold. Reboot session pool puppeteer --- Pool ID: ${Id} --- Memory: ${Memory}MB (${getOverRate(Memory, config.threshold.memory.break)}%)`,
          );
          logger.error(`Reboot session pool puppeteer --- Pool ID: ${Id}`);
          // Reboot and get pid again
          const pid =
            await metadata.sessionPoolManager.rebootSessionPoolPuppeteer();
          this.poolMetadata.set(Id, {
            ...metadata,
            pid,
          });
          continue;
        } else if (Memory >= config.threshold.memory.warn) {
          logger.warn(
            `[Warn] Memory usage is over threshold --- Pool ID: ${Id} --- Memory: ${Memory}MB (${getOverRate(Memory, config.threshold.memory.warn)}%)`,
          );
        }
      }
    }, config.threshold.interval * 1000);
  }

  /**
   * Session Pool Facotory
   */
  async sessionPoolFactory(
    poolId: number,
    puppeteerConfig: PuppeteerLaunchOptions = {},
    ignoreResourceLoad = false,
    enablePageCache = false,
  ) {
    let sessionCounter = 1;
    /**
     *
     * Use puppeteer with capsulation
     *
     * Prevent unexpected behavior of raw puppeteer instance via capsulation
     */
    const capsule = new PuppeteerCapsule({
      ...puppeteerConfig,
      headless: true,
    });
    const browserProcessId = await capsule.startBrowser();
    const sessionPool = genericPool.createPool(
      {
        create: async () => {
          const page = await capsule.getPage();
          await page.setViewport({
            width: config.session_pool.width,
            height: config.session_pool.height,
          });

          // Speedy Text Scrape option
          if (ignoreResourceLoad) {
            await ignoreResourceLoading(page);
          }
          if (enablePageCache) {
            await enablePageCaching(page);
          }

          const sessionId = sessionCounter++;
          this.changeSessionPoolState(poolId, 'increase');
          logger.info(
            `Creating session pool --- Session ID: ${poolId}_${sessionId}`,
          );
          return { page, sessionId };
        },
        destroy: async ({ page, sessionId }) => {
          this.changeSessionPoolState(poolId, 'decrease');
          logger.info(
            `Destroying session pool --- Session ID: ${poolId}_${sessionId}`,
          );
          await page.close();
        },
      },
      {
        max: config.session_pool.max,
        min: config.session_pool.min,
      },
    );
    const sessionPoolManager = new SessionPoolManager(
      poolId,
      capsule,
      sessionPool,
    );
    // Enroll PID of puppeteer process when browser is created
    this.poolMetadata.set(poolId, {
      pid: browserProcessId,
      sessionPoolCount: 0,
      sessionPoolManager: sessionPoolManager,
    });
    return sessionPoolManager;
  }

  /**
   * State modifier of session pool count
   */
  private changeSessionPoolState(
    id: number,
    calculation: 'increase' | 'decrease',
  ) {
    const pool = this.poolMetadata.get(id);
    // If not found, ignore invoke
    if (!pool) {
      return;
    }
    if (calculation === 'increase') {
      pool.sessionPoolCount++;
    } else {
      pool.sessionPoolCount--;
    }
  }

  /**
   * Issue new session and run callback
   *
   * Acquire resource from browser pool
   */
  async issueSession(cb: sessionCallback) {
    /**
     * Resource type
     * {
     *  pool: SinglePool,
     *  id: number
     * }
     *
     */
    const resource = await this.pools.acquire();
    const singlePool = resource.pool;
    // Directly release Root Pool for handling next session pool
    this.pools.release(resource);
    let isSuccess = true;
    let exception = null;
    let callbackReturn = null;
    try {
      /**
       * sessionPoolResource type
       * {
       *   page: Page,
       *   sessionId: number
       * }
       *
       */
      const sessionPoolResource = await singlePool.acquireSession();
      callbackReturn = await cb(sessionPoolResource.page);
      await singlePool.releaseSession(sessionPoolResource);
    } catch (err) {
      isSuccess = false;
      exception = new SessionCallbackException(
        (err as Error)?.message ?? 'Unknown Exception',
      );
    }

    if (isSuccess) {
      return callbackReturn;
    } else {
      throw exception;
    }
  }

  /**
   * Get pool metrics
   *
   * If id is not provided, return all pool metrics
   */
  async getPoolMetrics(id?: number): Promise<PoolMetricsType[]> {
    /**
     * CPU Usage unit: %
     * Memory Usage unit: GB
     */
    const response: PoolMetricsType[] = [];

    const getStatCpuMemoryUsage = (stat) => {
      const CPUUsage = stat.cpu.toFixed(2);
      const MemoryUsage = (stat.memory / 1024 / 1024).toFixed(2);
      return {
        cpu: parseFloat(CPUUsage),
        memory: parseFloat(MemoryUsage),
      };
    };

    if (id) {
      const metadata = this.poolMetadata.get(id);
      if (!metadata) {
        return response;
      }
      const { pid, sessionPoolCount } = metadata;
      const stats = await pidusage(pid);
      const { cpu, memory } = getStatCpuMemoryUsage(stats);
      response.push({
        Id: id,
        CPU: cpu,
        Memory: memory,
        SessionPoolCount: sessionPoolCount,
      });
    } else {
      for (const [poolId, { pid, sessionPoolCount }] of this.poolMetadata) {
        const stats = await pidusage(pid);
        const { cpu, memory } = getStatCpuMemoryUsage(stats);
        response.push({
          Id: poolId,
          CPU: cpu,
          Memory: memory,
          SessionPoolCount: sessionPoolCount,
        });
      }
    }
    return response;
  }

  /**
   * Terminate entire pool
   */
  async terminatePool() {
    await this.pools.drain();
    await this.pools.clear();
    logger.info('Successfully terminated pool');
  }
}

/**
 *
 * Puppeteer Capsule
 *
 * Capsulation of puppeteer instance
 *
 * Why capsulate puppeteer? -> To trace and safe management of puppeteer instance
 *
 */

class PuppeteerCapsule {
  private browser: Browser;
  private pid: number;
  constructor(private option: PuppeteerLaunchOptions) {}

  // Return PID of browser process
  async startBrowser() {
    this.browser = await puppeteer.launch(this.option);
    this.pid = this.browser.process().pid;
    return this.pid;
  }

  async rebootBrowser() {
    if (this.browser) {
      await this.browser.close();
    }
    return await this.startBrowser();
  }

  async getPage() {
    if (!this.browser) {
      await this.startBrowser();
    }
    return await this.browser.newPage();
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

/**
 *
 * Session Pool Manager
 *
 * Cluster of Raw Session Pool
 *
 * Act as interface of Session Pool
 *
 */
class SessionPoolManager<T = any> {
  constructor(
    private poolId: number,
    private browser: PuppeteerCapsule,
    private pool: Pool<T>,
  ) {}

  public async acquireSession() {
    logger.info(`Acquire session from --- Pool ID: ${this.poolId}`);
    return await this.pool.acquire();
  }

  public async releaseSession(session: T) {
    logger.info(`Release session from --- Pool ID: ${this.poolId}`);
    return await this.pool.release(session);
  }

  async close() {
    await this.pool.drain();
    await this.pool.clear();
    await this.browser.closeBrowser();
  }

  async rebootSessionPoolPuppeteer() {
    // Wait until all session is released
    while (this.pool.borrowed >= 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return await this.browser.rebootBrowser();
  }
}

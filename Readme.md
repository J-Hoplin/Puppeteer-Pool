# Puppeteer Pool Manager

![NPM Version](https://img.shields.io/npm/v/%40hoplin%2Fpuppeteer-pool?style=for-the-badge)

<p align="center">
  <img src="./diagram/diagram.png" alt="Image description">
</p>

## Bootstrap issue handling in server runtime

Some servers may have trouble with puppeteer, Like session pool is not initializing or other similar cases. Follow these steps to resolve related issues.

1. Install system dependencies. Puppeteer requires several dependencies to execute.

```
sudo apt-get install -y libnss3 libatk1.0-0 libx11-xcb1 libxcomposite1 libasound2 libgtk-3-0
```

2. Install Chronium Browser

```
sudp apt-get install chromium-browser

which chronium-browser
```

3. Attach executable path

```typescript
  await bootPoolManager({
    args: [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-setuid-sandbox'
      ],
    executablePath: '(Result of 'which chronium-browser')',
  });
```


## Install packages

- `npm`

  ```
  npm i @hoplin/puppeteer-pool
  ```

- `yarn`

  ```
  yarn add @hoplin/puppeteer-pool
  ```

- `pnpm`
  ```
  pnpm install @hoplin/puppeteer-pool
  ```

## Go to

[1. 🔧Pool Manager Config Docuemnt](#puppeteer-pool-manager-config)

[2. 📖Pool Manager APIs Document](#puppeteer-pool-manager-apis)

[3. 😎Pool Manager Usage with Express.js Framework](#usage-example)

## Support

- Pool Managing
  - Puppeteer Level Pooling
  - Session Level Pooling
- Config
  - Support config customize
- Threshold Watcher
  - CPU
  - Memory
  - Support safe pool instance reset in runtime
- Metrics
  - Support Metric by pool
    - CPU usage of pool
    - Memory usage of pool
    - Managing session count in runtime
- Graceful Shutdown

## Puppeteer Pool Manager Config

Default config should be `puppeteer-pool-config.json` in root directory path.

### Default config setting

If config file are not given or invalid path, manager will use default defined configurations. Or if you want to pass config path, you can pass path to `bootPoolManager` function as parameter.

```typescript
{
  "browser_pool": {
    "min": 2,
    "max": 5
  },
  "session_pool": {
    "min": 5,
    "max": 10,
    "width": 1080,
    "height": 1024,
    "ignoreResourceLoad": false,
    "enablePageCache": false
  },
  "threshold": {
    "activate": true,
    "interval": 5,
    "cpu": {
      "break": 10,
      "warn": 5
    },
    "memory": {
      "break": 300,
      "warn": 200
    }
  }
}
```

### `browser_pool`

- `min`: Minimum pool instance
- `max`: Maximum pool instance
  - **Range Validation**
    - `max` should be larger or equal than `min`
    - `min` should be larger or equal than 1
    - Both `min` and `max` should be integer

### `session_pool`

- `min`: Minimum pool instance
- `max`: Maximum pool instance
  - **Range Validation**
    - `max` should be larger or equal than `min`
    - `min` should be larger or equal than 1
    - Both `min` and `max` should be integer
    - Both `min` and `max` does not allow negative number


- `width`: Browser width. Also set browser width and height if you need some acts like capturing screen or else.
  - **Inteager Validation**
    - `width` should be integer
    - `width` should be at least 50
    - `width` does not allow negative number
- `height`: Browser height. Also set browser width and height if you need some acts like capturing screen or else.
  - **Inteager Validation**
    - `height` should be integer
    - `height` should be at least 50
    - `height` does not allow negative number
- `ignoreResourceLoad`: Ignore resource load(This option makes ignore `image`, `stylesheet`, `font` assets request). If you set true, it will ignore resource load. This will increase performance but may occur some unintended behavior.
  - **Boolean Validation**
    - `ignoreResourceLoad` should be boolean
- `enablePageCache`: Enable page cache. If you set true, it will cache page. This will increase performance but may occur some unintended behavior.
  - **Boolean Validation**
    - `enablePageCache` should be boolean

### `threshold`

- `activate`: Activate threshold or not
  - **Boolean Validation**
    - `activate` should be boolean
- `interval`: Interval of checking threshold
- `cpu`
  - `break`: CPU Usage break point. If CPU Usage is over this value, it will log status and reboot session manager puppeteer.
  - `warn`: CPU Usage warning point. If CPU Usage is over this value, it will log status.
    - **Range Validation**
      - `break` should be larger or equal than `warn`
      - `warn` should be larger or equal than 1
      - Both `break` and `warn` should be integer
      - Both `break` and `warn` does not allow negative number
- `memory`
  - `break`: Memory Usage break point. If Memory Usage is over this value, it will log and reboot session manager puppeteer.
  - `warn`: Memory Usage warning point. If Memory Usage is over this value, it will log status.
    - **Range Validation**
      - `break` should be larger or equal than `warn`
      - `warn` should be larger or equal than 100
      - Both `break` and `warn` should be integer
      - Both `break` and `warn` does not allow negative number

## Puppeteer Pool Manager APIs

### `bootPoolManager(puppeteerOptions,poolConfigPath):Promise<void>`

Boot pool manager. **You need to invoke this function at least once to use another APIs**

#### Parameter

- `puppeteerOptions`
  - `PuppeteerLaunchOptions` from puppeteer([Ref](https://pptr.dev/api/puppeteer.puppeteerlaunchoptions))
- `poolConfigPath`
  - `string`
  - Custom Puppeteer Pool config path. Default is project root's `puppeteer-pool-config.json`

### `rebootPoolManager():Promise<void>`

Reboot pool manager. **This api is not recommended to use. Using this API in runtime may occur unintended session control context break**

### `controlSession(cb):Promise<any>`

Return single session from pool. You need to pass callback function as parameter to use in session.

#### About Callback Function

Manager will pass `session`, which is [`Page`](https://pptr.dev/api/puppeteer.page) type of puppeteer to callback function.
This API will return result of callback function.

#### Parameter

- `cb`

  - `sessionCallback`

    ```typescript
    // Session Callback type
    import { Page } from 'puppeteer';

    type sessionCallback<T> = (page: Page) => Promise<T>;
    ```

#### Return Value

- Return callback's return value

### `getPoolMetrics():Promise<Array<PoolMetrics>>`

Return pool metrics. This includes pool id, pool CPU Usage, Memory Usage

#### Return Value

```typescript
[
  {
    Id: "ID of pool"
    CPU: "Percentage of CPU that Pool is using (System)",
    Memory: "Memory Usage of Memory that Pool is using. Unit is MB (System)",
    SessionPoolCount: "Session count that Pool is managing"
  }
]

```

## Usage Example

Example of combining pool manager with Express Framework

```typescript
import {
  bootPoolManager,
  controlSession,
  getPoolMetrics,
} from '@hoplin/puppeteer-pool';
import express, { Application } from 'express';

async function bootstrap() {
  // Initialize pool
  await bootPoolManager({Puppeteer Launch Options},'Puppeteer Pool Config Path');

  const server: Application = express();

  // Control Session example
  server.post('/', async (req, res) => {
    const url = req.body.url;

    // Get single session from pool
    const controlResponse = await controlSession(async (session) => {
      /**
       * Control session here
       */
      return; //(Some values)
    });
    return res.status(200).json({ result: controlResponse });
  });

  server.get('/metrics',async(req,res,) => {
    let puppeteerPoolMetrics = await getPoolMetrics();
    puppeteerPoolMetrics = puppeteerPoolMetrics.map((metrics) => {
        const id = `POOL_${metrics.Id}`;
        const cpu = `${metrics.CPU}%`;
        const memory =
          metrics.Memory > 1024
            ? `${parseFloat((metrics.Memory / 1024).toFixed(2))}GB`
            : `${metrics.Memory}MB`;
        const sessionPoolCount = metrics.SessionPoolCount;
        return { id, cpu, memory, sessionPoolCount };
      })
    return res.status(200).json({ result: puppeteerPoolMetrics })
  })

  server.get('/', async (req, res) => {
    const puppeteerPoolMetrics = await getPoolMetrics();
    return res.status(200).json(puppeteerPoolMetrics);
  });

  server.listen(3000, () => {
    logger.info(`Server listening on port 3000`);
  });
}
```

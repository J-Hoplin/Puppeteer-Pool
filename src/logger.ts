import pino from 'pino';

// Logger Info
const transport = pino.transport({
  targets: [
    {
      level: 'trace',
      target: 'pino-pretty',
      options: { colorize: true },
    },
  ],
});

export const poolLogger = pino(transport);

import * as winston from 'winston';
import chalk from 'chalk';

const colorizer = winston.format.colorize();

const LEVEL_WIDTH = 7;

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'DD-MM-YYYY HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, context, trace }) => {
    const ts = timestamp as string;
    const msg = message as string;

    const ctx = (context as string) || 'Application';

    const trc = trace ? `\n${trace as string}` : '';

    const alignedLevel = level.toLocaleUpperCase().padStart(LEVEL_WIDTH);
    const base = `${ts} ${alignedLevel} ${chalk.yellow(`[${ctx}]`)} ${msg}${trc}`;

    return colorizer.colorize(level, base);
  }),
);

export const winstonConfig = {
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',

  transports: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ],
};

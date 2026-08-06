import winston from 'winston'

export const logger = winston.createLogger({
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(info => {
          const { timestamp, level, message, ...extra } = info

          return `${timestamp} [${level}]: ${message} ${
            Object.keys(extra).length !== 0 ? JSON.stringify(extra, null, 2) : ''
          }`
        })
      )
    })
  ],
  exitOnError: false
})

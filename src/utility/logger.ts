import winston from 'winston'
require('winston-mongodb')
const transports: any = winston.transports

export const logger = winston.createLogger({
  transports: [
    new transports.MongoDB({
      db: `mongodb://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?authSource=admin`,
      capped: true
    }),
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

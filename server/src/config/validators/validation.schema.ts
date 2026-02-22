import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // APP CONFIG
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  NAME: Joi.string().required(),
  HOST: Joi.string().default('http://localhost'),
  FRONTEND_HOST: Joi.string().required(),
  PORT: Joi.number().default(3000),
  TIMEOUT_MS: Joi.number().default(5000),
  THROTTLE_TTL_MS: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(10),
  CORS_ORIGIN: Joi.string().default('*'),
  EMAIL_VERIFICATION_EXPIRES_IN: Joi.number().default(15),
  RESET_PASSWORD_EXPIRES_IN: Joi.number().default(15),

  // DATABASE
  DATABASE_TYPE: Joi.string().required(),
  DATABASE_HOST: Joi.string().required(),
  DATABASE_PORT: Joi.number().default(3306),
  DATABASE_USER: Joi.string().required(),
  DATABASE_PASSWORD: Joi.string().required(),
  DATABASE_NAME: Joi.string().required(),

  // I18N
  I18N_FALLBACK_LANGUAGE: Joi.string().default('en'),

  // FILE
  AVATAR_MAX_SIZE_MB: Joi.number().default(5),

  // JWT
  JWT_EXPIRES_IN: Joi.string().default('1d'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  JWT_SECRET: Joi.string().required(),
  JWT_SALT_OR_ROUNDS: Joi.number().required(),

  // MAILER (SMTP)
  SMTP_HOST: Joi.string().default('localhost'),
  SMTP_PORT: Joi.number().default(587),
  SMTP_IGNORE_TLS: Joi.boolean().default(false),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().default(''),
  SMTP_PASSWORD: Joi.string().default(''),
  SMTP_FROM_NAME: Joi.string().default('No Reply'),
  SMTP_FROM_ADDRESS: Joi.string().email().default(''),

  // REDIS
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().default(''),
  REDIS_TTL: Joi.number().default(300),

  // STRIPE
  STRIPE_SECRET_KEY: Joi.string().required(),
  STRIPE_CURRENCY: Joi.string().default('usd'),
});

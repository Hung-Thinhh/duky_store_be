export const MAIL_QUEUE =
  process.env.NODE_ENV === 'production' ? 'mail' : 'mail_dev';

const silent = process.env.NODE_ENV === 'test' && !process.env.DEBUG_LOGS;
const ts = () => new Date().toISOString();

export const logger = {
  info: (...args) => !silent && console.log(ts(), '[info]', ...args),
  warn: (...args) => !silent && console.warn(ts(), '[warn]', ...args),
  error: (...args) => !silent && console.error(ts(), '[error]', ...args),
};

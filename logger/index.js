const fs = require('fs');
const path = require('path');
const os = require('os');

class Logger {
  constructor(options = {}) {
    this.name = options.name || 'app';
    this.level = options.level || 'info';
    
    const baseDir = this._expandPath(options.logDir || path.join(os.homedir(), 'logs', 'nodejs'));
    this.logDir = path.join(baseDir, this.name);
    
    this.levels = { debug: 0, info: 1, warn: 2, error: 3 };
    
    this._ensureLogDir();
  }
  
  _expandPath(p) {
    if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
    return p;
  }
  
  _ensureLogDir() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
        console.log(`[logger] 日志目录已创建: ${this.logDir}`);
      }
    } catch (err) {
      console.error(`[logger] 无法创建日志目录 ${this.logDir}: ${err.message}`);
      console.error(`[logger] 请检查父目录是否存在或是否有写入权限`);
      throw new Error(`无法创建日志目录: ${this.logDir}`);
    }
  }
  
  _getLogFileName() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}.log`;
  }
  
  _getLogFilePath() {
    return path.join(this.logDir, this._getLogFileName());
  }
  
  _shouldLog(level) {
    return this.levels[level] >= this.levels[this.level];
  }
  
  _formatConsole(level, message, data) {
    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(5);
    const prefix = `[${timestamp}] ${levelStr} [${this.name}]`;
    
    if (Object.keys(data).length === 0) {
      return prefix + ' ' + message;
    }
    
    const dataStr = Object.entries(data)
      .map(([k, v]) => `    ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join('\n');
    
    return prefix + ' ' + message + '\n' + dataStr;
  }
  
  _formatFile(level, message, data) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.name,
      message,
      ...data
    };
    
    if (data.error && data.stack) {
      logEntry.error = data.error;
      logEntry.stack = data.stack;
    }
    
    return JSON.stringify(logEntry) + '\n';
  }
  
  _writeLog(level, message, data = {}) {
    if (!this._shouldLog(level)) return;
    
    const consoleOutput = this._formatConsole(level, message, data);
    const fileOutput = this._formatFile(level, message, data);
    const logFilePath = this._getLogFilePath();
    
    try {
      fs.appendFileSync(logFilePath, fileOutput, 'utf8');
    } catch (err) {
      console.error(`[logger] 写入日志文件失败: ${err.message}`);
    }
    
    if (level === 'error') {
      console.error(consoleOutput);
    } else if (level === 'warn') {
      console.warn(consoleOutput);
    } else {
      console.log(consoleOutput);
    }
  }
  
  debug(message, data = {}) {
    this._writeLog('debug', message, data);
  }
  
  info(message, data = {}) {
    this._writeLog('info', message, data);
  }
  
  warn(message, data = {}) {
    this._writeLog('warn', message, data);
  }
  
  error(message, data = {}) {
    this._writeLog('error', message, data);
  }
}

module.exports = (options) => new Logger(options);
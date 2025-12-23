// Polyfill Web APIs for Node 18.x compatibility
global.File = class File {
  constructor(bits, name, options) {
    this.bits = bits;
    this.name = name;
    this.options = options;
  }
};

global.FormData = class FormData {
  constructor() {
    this.data = new Map();
  }
  append(key, value) {
    this.data.set(key, value);
  }
  get(key) {
    return this.data.get(key);
  }
};

global.Headers = class Headers {
  constructor(init) {
    this.headers = new Map();
    if (init) {
      Object.entries(init).forEach(([key, value]) => {
        this.headers.set(key.toLowerCase(), value);
      });
    }
  }
  get(name) {
    return this.headers.get(name.toLowerCase());
  }
  set(name, value) {
    this.headers.set(name.toLowerCase(), value);
  }
};

global.Request = class Request {
  constructor(url, options = {}) {
    this.url = url;
    this.method = options.method || 'GET';
    this.headers = new Headers(options.headers);
  }
};

global.Response = class Response {
  constructor(body, options = {}) {
    this.body = body;
    this.status = options.status || 200;
    this.headers = new Headers(options.headers);
  }
};

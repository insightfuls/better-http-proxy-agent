better-http-proxy-agent
=======================

An agent for HTTP through an HTTP(S) proxy server.

This is based on [http-proxy-agent](https://github.com/TooTallNate/node-http-proxy-agent)
but instead of building on a custom base class it extends the NodeJS
[http.Agent](https://nodejs.org/api/http.html#http_class_http_agent) or
[https.Agent](https://nodejs.org/api/https.html#https_class_https_agent) to leverage core
functionality such as connection pooling (all connections are to the proxy so there is
just one bucket in the pool) and TLS session resumption.

Basic usage
-----------

```
npm install better-http-proxy-agent
```

```javascript
const { createAgent } = require('better-http-proxy-agent');
const fs = require('fs');
const http = require('http');

/*
 * Options suitable for the base `http(s).Agent`.
 */
const agentOptions = {
    keepAlive: true,
    timeout: 55000, // for keepAlive
    maxSockets: 100,
    maxFreeSockets: 10,
    maxCachedSessions: 200
};

/*
 * Options suitable for `http(s).request`/`net.connect`/`tls.connect`. These
 * are used to connect to the proxy server.
 *
 * You should provide the `host` and `port` of the proxy here (unless you want
 * the default `localhost`).
 *
 * `protocol` will default to `http:`. If you need to connect to the proxy over
 * HTTPS, set `protocol` to `https:`. `http.Agent` or `https.Agent` will be
 * used accordingly.
 *
 * You can provide `auth` here, which will produce a `Proxy-Authorization`
 * header.
 */
const connectionOptions = {
    protocol: "https:",
    host: "proxy.example.com",
    port: 3128,
    timeout: 5000, // for in-flight requests
    cert: fs.readFileSync("proxy_auth_cert.pem"),
    key: fs.readFileSync("proxy_auth_key.pem"),
    passphrase: "secret"
};

const agent = createAgent(agentOptions, connectionOptions);

http.get("http://www.example.com/", {
    agent
});
```

Licence
-------

MIT.



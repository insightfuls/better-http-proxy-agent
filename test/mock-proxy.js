const http = require('http');
const https = require('https');
const tls = require('tls');
const { readFile } = require('./read-file');

const proxies = new Set();

/*
 * options.port: port to listen on (required)
 * options.hangRequest: milliseconds before responding with HTTP 200; true to hang forever
 * options.keepAlive: leave the socket open after responding with HTTP 200
 */
module.exports.startMockHttpProxy = async function(options) {
	options = Object.assign({}, options);
	return (new MockProxy(http.createServer(), options)).start();
};

/*
 * See createMockHttpProxy; also:
 * options.authenticate: require a client certificate
 * options.cn: expected client certificate CN (implies authenticate)
 */
module.exports.createMockHttpsProxy = async function(options) {
	options = Object.assign({ requestCert: _requestCert(options) }, options);
	return (new MockProxy(https.createServer(await localhostAuthentication()), options)).start();
};

module.exports.stopMockProxies = function() {
	return Promise.all(Array.from(proxies.values()).map((proxy) => proxy.stop()));
}

class MockProxy {

	constructor(server, options) {
		this.connections = 0;
		this.requests = [];
		this._sockets = new Set();
		this._server = server;
		this._options = options;

		this._server.on('request', (request, response) => {
			if (!this._sockets.has(request.socket)) this.connections++;
			this._sockets.add(request.socket);
			this.requests.push(request.url);

			if (!this._options.hangRequest) {
				this._respondToRequest(request, response);
				return;
			}

			if (this._options.hangRequest !== true) {
				setTimeout(this._respondToRequest.bind(this, request, response),
						this._options.hangRequest);
				return;
			}
		});

		/*
		 * The 500 is a workaround for NodeJS http(s).Server.close() not closing inactive
		 * sockets (but only preventing acceptance of new connections).
		 *
		 * The 1 is a workaround for NodeJS not having a way to disable HTTP keep-alive
		 * server-side (that I currently know of; using 0 disables the timeout, not the
		 * keep-alive functionality).
		 */
		this._server.keepAliveTimeout = this._options.keepAlive ? 500 : 1;
	}

	start() {
		return new Promise((resolve, reject) => {
			this._server.once('error', (err) => reject(err));
			this._server.listen(this._options.port, () => {
				proxies.add(this);
				resolve(this)
			});
		});
	}

	stop() {
		return new Promise((resolve, reject) => {
			this._server.close((err) => {
				if (err) reject(err);
				else {
					proxies.delete(this);
					resolve();
				}
			});
		});
	}

	_respondToRequest(request, response) {
		if (request.socket.encrypted && _requestCert(this._options)) {
			let verifyError = request.socket._handle.verifyError();

			if (!verifyError && this._options.cn) {
				const cert = request.socket.getPeerCertificate();
				if (cert.subject.CN !== this._options.cn) {
					verifyError = new Error("unauthorized client");
				}
			}

			if (verifyError) {
				/* Assume the stack only contains ASCII */
				const stack = verifyError.stack;
				response.statusCode = 403;
				response.write(stack);
				response.end();
				return;
			}
		}

		response.write('Success');
		response.end();
	}

}

function _requestCert(options) {
	return !!options.authenticate || options.cn;
}

async function localhostAuthentication() {
	const [ ca, cert, key ] = await Promise.all([
		readFile(__dirname + "/localhost.crt.pem"),
		readFile(__dirname + "/localhost.crt.pem"),
		readFile(__dirname + "/localhost.key.pem")
	]);
	return { ca, cert, key };
}

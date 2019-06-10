'use strict';

const url = require('url');
const { Agent: HttpAgent } = require('http');
const { Agent: HttpsAgent } = require('https');
const { inherits, debuglog } = require('util');
const debug = debuglog('betterHttpProxyAgent');

const OPTIONS = "_betterHttpProxyOptions";

function createAgent(agentOptions, connectionOptions) {
	return connectionOptions.protocol === 'https:'
	       ? new HttpsProxyAgent(agentOptions, connectionOptions)
	       : new HttpProxyAgent(agentOptions, connectionOptions);
}

function HttpProxyAgent(agentOptions, connectionOptions) {
	if (!(this instanceof HttpProxyAgent)) {
		return new HttpProxyAgent(agentOptions, connectionOptions);
	}

	HttpAgent.call(this, agentOptions);

	this.construct(connectionOptions);
}
inherits(HttpProxyAgent, HttpAgent);
HttpProxyAgent.prototype.construct = construct;
HttpProxyAgent.prototype.addRequest = addRequest;
HttpProxyAgent.prototype.getName = getName;

function HttpsProxyAgent(agentOptions, connectionOptions) {
	if (!(this instanceof HttpsProxyAgent)) {
		return new HttpsProxyAgent(agentOptions, connectionOptions);
	}

	HttpsAgent.call(this, agentOptions);

	this.construct(connectionOptions);
}
inherits(HttpsProxyAgent, HttpsAgent);
HttpsProxyAgent.prototype.construct = construct;
HttpsProxyAgent.prototype.addRequest = addRequest;
HttpsProxyAgent.prototype.getName = getName;

function construct(connectionOptions) {
	connectionOptions = Object.assign({}, connectionOptions);
	connectionOptions.agent = this;

	this[OPTIONS] = connectionOptions;
}

function addRequest(req, options) {
	debug('addRequest', options);

	// change the `http.ClientRequest` instance's "path" field
	// to the absolute path of the URL that will be requested
	var parsed = url.parse(req.path);
	if (parsed.protocol == null) parsed.protocol = 'http:';
	if (parsed.hostname == null) parsed.hostname = options.host || options.host;
	if (parsed.port == null) parsed.port = options.port;
	if (parsed.port == 80) {
		// if port is 80, then we can remove the port so that the
		// ":80" portion is not on the produced URL
		delete parsed.port;
	}
	var absolute = url.format(parsed);
	req.path = absolute;

	// inject the `Proxy-Authorization` header if necessary
	if (this[OPTIONS].auth) {
		req.setHeader(
			'Proxy-Authorization',
			'Basic ' + Buffer.from(this[OPTIONS].auth).toString('base64')
		);
	}

	// at this point, the http ClientRequest's internal `_header` field might have
	// already been set. If this is the case then we'll need to re-generate the
	// string since we just changed the `req.path`
	if (req._header) {
		debug('regenerating stored HTTP header string for request');
		req._header = null;
		req._implicitHeader();
		if (req.output && req.output.length > 0) {
			debug('patching connection write() output buffer with updated header');
			// the _header has already been queued to be written to the socket
			var first = req.output[0];
			var endOfHeaders = first.indexOf('\r\n\r\n') + 4;
			req.output[0] = req._header + first.substring(endOfHeaders);
			debug('output buffer: %o', req.output);
		}
	}

	this.constructor.super_.prototype.addRequest.call(this, req, this[OPTIONS]);
}

function getName(options) {
	return "proxy";
};

module.exports.createAgent = createAgent;
module.exports.HttpProxyAgent = HttpProxyAgent;
module.exports.HttpsProxyAgent = HttpsProxyAgent;

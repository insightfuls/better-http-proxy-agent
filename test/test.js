const { createAgent } = require('../index');
const { startMockHttpProxy, startMockHttpsProxy, stopMockProxies } = require('./mock-proxy');
const http = require('http');
const { expect } = require('chai');
const { readFile } = require('./read-file');

const port = 8999;

describe("better-http-proxy-agent", () => {

	afterEach(() => {
		return stopMockProxies();
	});

	it("works", async () => {
		await requestAndVerify({
			agent: agent({}),
			mock: await startMockHttpProxy({ port }),
			expectations: {
				responseData: "Success",
				mockConnections: 1,
				mockRequests: 1,
				mockURL: "http://www.example.com:1234/"
			}
		});
	});

	it("omits default port", async () => {
		await requestAndVerify({
			agent: agent({}),
			mock: await startMockHttpProxy({ port }),
			requestOptions: { port: 80 },
			expectations: {
				mockURL: "http://www.example.com/"
			}
		});
	});

	it("pools connections", async () => {
		const mock = await startMockHttpProxy({
			port,
			keepAlive: true
		});
		const options = {
			agent: agent({
				agentOptions: { maxSockets: 1 },
				connectionOptions: {},
			}),
			mock,
			expectations: {
				responseData: "Success",
				mockConnections: 1
			}
		};
		const results = [
			requestAndVerify(options),
			requestAndVerify(options),
			requestAndVerify(options)
		];
		await Promise.all(results).then(() => {
			verifyMockExpectations(mock, {
				mockRequests: 3
			});
		});
	});

});

function agent(options) {
	const agentOptions = Object.assign(
			defaultAgentOptions(), options.agentOptions || {});

	const connectionOptions = Object.assign(
			defaultConnectionOptions(), options.connectionOptions || {});

	return createAgent(agentOptions, connectionOptions);
}

function defaultAgentOptions() {
	return {
		keepAlive: true
	};
}

function defaultConnectionOptions() {
	return {
		protocol: "http:", 
		host: "localhost",
		port,
		timeout: 5000,
		maxSockets: 100
	};
}

async function requestAndVerify(options) {
	if (!options.agent) {
		throw new Error("agent not provided");
	}

	if (!options.mock) {
		throw new Error("mock not provided");
	}

	const requestOptions = Object.assign(
			await defaultRequestOptions(options.agent), options.requestOptions || {});

	const response = await performRequest(requestOptions);
	verifyResponseExpectations(response, options.expectations || {});
	verifyMockExpectations(options.mock, options.expectations || {});
}

async function defaultRequestOptions(agent) {
	return {
		protocol: "http:",
		host: "www.example.com",
		port: 1234,
		agent
	};
}

function performRequest(requestOptions) {
	const request = http.request(requestOptions);
	return new Promise((resolve, reject) => {
		request.on('error', (err) => {
			resolve({
				statusCode: null,
				data: null,
				error: err
			});
		});
		request.on('response', (response) => {
			response.data = "";
			response.on('data', (chunk) => {
				response.data += chunk.toString('utf8');
			});
			response.on('end', () => {
				response.error = null;
				resolve(response);
			});
			response.on('error', (err) => {
				response.error = err;
				resolve(response);
			});
		});
		request.end();
	});
}

function verifyResponseExpectations(response, expectations) {
	if (expectations.responseError) {
		expect(response.error.message).to.contain(expectations.responseError);
	}
	if (expectations.responseData) {
		expect(response.data).to.contain(expectations.responseData);
	}
}

function verifyMockExpectations(mock, expectations) {
	if (expectations.mockConnections) {
		expect(mock.connections).to.equal(expectations.mockConnections);
	}
	if (expectations.mockRequests) {
		expect(mock.requests.length).to.equal(expectations.mockRequests);
	}
	if (expectations.mockURL) {
		expect(mock.requests[mock.requests.length-1]).to.equal(expectations.mockURL);
	}
}

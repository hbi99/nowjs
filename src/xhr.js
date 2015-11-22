
var XMLHttpRequest = function() {
	'use strict';

	self = this;
};

XMLHttpRequest.prototype = {
	// Constants
	UNSENT           : 0,
	OPENED           : 1,
	HEADERS_RECEIVED : 2,
	LOADING          : 3,
	DONE             : 4,
	// current state
	readyState   : 0,
	// result & response
	responseText : '',
	responseType : '',
	responseURL  : '',
	responseXML  : null,
	status       : 0,
	statusText   : '',
	//timeout: 0,
	//onloadend: null,
	//ontimeout: null,
	withCredentials: false,
	// event handlers
	onreadystatechange: null,
	/**
	 * Adds an event listener. Preferred method of binding to events.
	 */
	addEventListener: function(event, callback) {
		if (!(event in listeners)) {
			listeners[event] = [];
		}
		listeners[event].push(callback);
	},
	/**
	 * Remove an event callback that has already been bound.
	 * Only works on the matching funciton, cannot be a copy.
	 */
	removeEventListener: function(event, callback) {
		if (event in listeners) {
			// Filter will return a new array with the callback removed
			listeners[event] = listeners[event].filter(function(ev) {
				return ev !== callback;
			});
		}
	},
	/**
	 * Dispatch any events, including both 'on' methods and
	 * events attached using addEventListener.
	 */
	dispatchEvent: function(event) {
		if (typeof self['on'+ event] === 'function') {
			self['on'+ event]();
		}
		if (event in listeners) {
			for (var i=0, len=listeners[event].length; i<len; i++) {
				listeners[event][i].call(self);
			}
		}
	},
	/**
	 * Called when an error is encountered to deal with it.
	 */
	handleError: function(error) {
		this.status = 0;
		this.statusText = error;
		this.responseText = error.stack;
		errorFlag = true;
		setState(this.DONE);
		this.dispatchEvent('error');
	},
	/**
	 * Gets a request header
	 *
	 * @param string name Name of header to get
	 * @return string Returns the request header or empty string if not set
	 */
	getRequestHeader: function(name) {
		if (typeof name === 'string' && headersCase[name.toLowerCase()]) {
			return headers[headersCase[name.toLowerCase()]];
		}
		return '';
	},
	/**
	 * Sets a header for the request or appends the value if one is already set.
	 *
	 * @param string header Header name
	 * @param string value Header value
	 */
	setRequestHeader: function(header, value) {
		if (this.readyState !== this.OPENED) {
			throw new Error('INVALID_STATE_ERR: setRequestHeader can only be called when state is OPEN');
		}
		if (!isAllowedHttpHeader(header)) {
			console.warn('Refused to set unsafe header "'+ header +'"');
			return;
		}
		if (sendFlag) {
			throw new Error('INVALID_STATE_ERR: send flag is true');
		}
		header = headersCase[header.toLowerCase()] || header;
		headersCase[header.toLowerCase()] = header;
		headers[header] = headers[header] ? headers[header] + ', ' + value : value;
	},
	/**
	 * Gets a header from the server response.
	 *
	 * @param string header Name of header to get.
	 * @return string Text of the header or null if it doesn't exist.
	 */
	getResponseHeader: function(header) {
		if (typeof header === 'string' &&
				this.readyState > this.OPENED &&
				response &&
				response.headers &&
				response.headers[header.toLowerCase()] &&
				!errorFlag) {
				return response.headers[header.toLowerCase()];
			}
		return null;
	},
	/**
	 * Gets all the response headers.
	 *
	 * @return string A string with all response headers separated by CR+LF
	 */
	getAllResponseHeaders: function() {
		if (this.readyState < this.HEADERS_RECEIVED || errorFlag) {
			return '';
		}
		var result = '';

		for (var i in response.headers) {
			// Cookie headers are excluded
			if (i !== 'set-cookie' && i !== 'set-cookie2') {
				result += i +': '+ response.headers[i] +'\r\n';
			}
		}
		return result.substr(0, result.length - 2);
	},
	open: function(method, url, async, user, password) {
		this.abort();
		errorFlag = false;

		// Check for valid request method
		if (!isAllowedHttpMethod(method)) {
			throw new Error('SecurityError: Request method not allowed');
		}

		settings = {
			'method'   : method,
			'url'      : url.toString(),
			'async'    : (typeof async !== 'boolean' ? true : async),
			'user'     : user || null,
			'password' : password || null
		};

		setState(this.OPENED);
	},
	abort: function() {
		if (request) {
			request.abort();
			request = null;
		}

		headers = defaultHeaders;
		this.status = 0;
		this.responseText = '';
		this.responseXML = '';

		errorFlag = true;

		if (this.readyState !== this.UNSENT &&
			(this.readyState !== this.OPENED || sendFlag) &&
			this.readyState !== this.DONE) {
				sendFlag = false;
				setState(this.DONE);
			}
		this.readyState = this.UNSENT;
		this.dispatchEvent('abort');
	},
	send: function() {
		if (this.readyState !== this.OPENED) {
			throw new Error('INVALID_STATE_ERR: connection must be opened before send() is called');
		}
		if (sendFlag) {
			throw new Error('INVALID_STATE_ERR: send has already been called');
		}

		var ssl   = false,
			local = false,
			url   = Url.parse(settings.url),
			host;
		// Determine the server
		switch (url.protocol) {
			case 'https:': ssl = true; // SSL & non-SSL both need host, no break here.
			/* falls through */
			case 'http:':  host = url.hostname; break;
			case 'file:':  local = true; break;
			case undefined:
			case null:
			case '': host = 'localhost'; break;
			default: throw new Error('Protocol not supported.');
		}
		// Load files off the local filesystem (file://)
		if (local) {
			if (settings.method !== 'GET') {
				throw new Error('XMLHttpRequest: Only GET method is supported');
			}
			if (settings.async) {
				fs.readFile(url.pathname, 'utf8', function(error, data) {
					if (error) {
						self.handleError(error);
					} else {
						self.status = 200;
						self.responseText = data;
						setState(self.DONE);
					}
				});
			} else {
				try {
					this.responseText = fs.readFileSync(url.pathname, 'utf8');
					this.status = 200;
					setState(self.DONE);
				} catch(e) {
					this.handleError(e);
				}
			}
			return;
		}
		// Default to port 80. If accessing localhost on another port be sure
		// to use http://localhost:port/path
		var port = url.port || (ssl ? 443 : 80);

		// Add query string if one is used
		var uri = url.pathname + (url.search ? url.search : '');

		// Set the defaults if they haven't been set
		for (var name in defaultHeaders) {
			if (!headersCase[name.toLowerCase()]) {
				headers[name] = defaultHeaders[name];
			}
		}

		// Set the Host header or the server may reject the request
		headers.Host = host;
		if (!((ssl && port === 443) || port === 80)) {
			headers.Host += ':'+ url.port;
		}

		// Set Basic Auth if necessary
		if (settings.user) {
			if (typeof settings.password === 'undefined') {
				settings.password = '';
			}
			var authBuf = new Buffer(settings.user +':'+ settings.password);
			headers.Authorization = 'Basic '+ authBuf.toString('base64');
		}

		// Set content length header
		if (settings.method === 'GET' || settings.method === 'HEAD') {
			data = null;
		} else if (data) {
			headers['Content-Length'] = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data);

			if (!headers['Content-Type']) {
				headers['Content-Type'] = 'text/plain;charset=UTF-8';
			}
		} else if (settings.method === 'POST') {
			// For a post with no data set Content-Length: 0.
			// This is required by buggy servers that don't meet the specs.
			headers['Content-Length'] = 0;
		}

		var options = {
			host: host,
			port: port,
			path: uri,
			method: settings.method,
			headers: headers,
			agent: false,
			withCredentials: self.withCredentials
		};

		// Reset error flag
		errorFlag = false;

		// Handle async requests
		if (settings.async) {
			// Use the proper protocol
			var doRequest = ssl ? https.request : http.request;

			// Request is being sent, set send flag
			sendFlag = true;

			// As per spec, this is called here for historical reasons.
			self.dispatchEvent('readystatechange');

			// Handler for the response
			var responseHandler = function responseHandler(resp) {
				// Set response var to the response we got back
				// This is so it remains accessable outside this scope
				response = resp;
				// Check for redirect
				// @TODO Prevent looped redirects
				if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 303 || response.statusCode === 307) {
					// Change URL to the redirect location
					settings.url = response.headers.location;
					var url = Url.parse(settings.url);
					// Set host var in case it's used later
					host = url.hostname;
					// Options for the new request
					var newOptions = {
						hostname: url.hostname,
						port: url.port,
						path: url.path,
						method: response.statusCode === 303 ? 'GET' : settings.method,
						headers: headers,
						withCredentials: self.withCredentials
					};

					// Issue the new request
					request = doRequest(newOptions, responseHandler).on('error', errorHandler);
					request.end();
					// @TODO Check if an XHR event needs to be fired here
					return;
				}

				response.setEncoding('utf8');

				setState(self.HEADERS_RECEIVED);
				self.status = response.statusCode;

				response.on('data', function(chunk) {
					// Make sure there's some data
					if (chunk) {
						self.responseText += chunk;
					}
					// Don't emit state changes if the connection has been aborted.
					if (sendFlag) {
						setState(self.LOADING);
					}
				});

				response.on('end', function() {
					if (sendFlag) {
						// Discard the end event if the connection has been aborted
						setState(self.DONE);
						sendFlag = false;
					}
				});

				response.on('error', function(error) {
					self.handleError(error);
				});
			};

			// Error handler for the request
			var errorHandler = function errorHandler(error) {
				self.handleError(error);
			};

			// Create the request
			request = doRequest(options, responseHandler).on('error', errorHandler);

			// Node 0.4 and later won't accept empty data. Make sure it's needed.
			if (data) {
				request.write(data);
			}

			request.end();

			self.dispatchEvent('loadstart');
		} else { // Synchronous
			// Create a temporary file for communication with the other Node process
			var contentFile = '.node-xmlhttprequest-content-'+ process.pid;
			var syncFile = '.node-xmlhttprequest-sync-'+ process.pid;
			fs.writeFileSync(syncFile, '', 'utf8');
			// The async request the other Node process executes
			var execString = 'var http = require("http"), https = require("https"), fs = require("fs");'+
							'var doRequest = http'+ (ssl ? 's' : '') +'.request;'+
							'var options = '+ JSON.stringify(options) +';'+
							'var responseText = "";'+
							'var req = doRequest(options, function(response) {'+
							'	response.setEncoding("utf8");'+
							'	response.on("data", function(chunk) {'+
							'		responseText += chunk;'+
							'	});'+
							'	response.on("end", function() {'+
							'		fs.writeFileSync("'+ contentFile +'", JSON.stringify({err: null, data: {statusCode: response.statusCode, headers: response.headers, text: responseText}}), "utf8");'+
							'		fs.unlinkSync("'+ syncFile +'");'+
							'	});'+
							'	response.on("error", function(error) {'+
							'		fs.writeFileSync("'+ contentFile +'", JSON.stringify({err: error}), "utf8");'+
							'		fs.unlinkSync("'+ syncFile +'");'+
							'	});'+
							'}).on("error", function(error) {'+
							'fs.writeFileSync("'+ contentFile +'", JSON.stringify({err: error}), "utf8");'+
							'fs.unlinkSync("'+ syncFile +'");'+
							'});'+
							(data ? 'req.write("'+ JSON.stringify(data).slice(1,-1).replace(/'/g, "\\'") +'");':'')+
							'req.end();';
			// Start the other Node Process, executing this string
			var syncProc = spawn(process.argv[0], ['-e', execString]);
			while(fs.existsSync(syncFile)) {
				// Wait while the sync file is empty
			}
			var resp = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
			// Kill the child process once the file has data
			syncProc.stdin.end();
			// Remove the temporary file
			fs.unlinkSync(contentFile);

			if (resp.err) {
				self.handleError(resp.err);
			} else {
				response = resp.data;
				self.status = resp.data.statusCode;
				self.responseText = resp.data.text;
				setState(self.DONE);
			}
		}
	}
};

// Private variables
var self,
	Url   = require('url'),
	http  = require('http'),
	https = require('https'),

	// Holds http.js objects
	request,
	response,

	// Send flag
	sendFlag = false,

	// Error flag, used when errors occur or abort is called
	errorFlag = false,

	// Request settings
	settings = {},

	// Event listeners
	listeners = {},

	// Set some default headers
	defaultHeaders = {
		'User-Agent': 'node-XMLHttpRequest',
		'Accept': '*/*'
	},

	headers = {},
	headersCase = {},

	// These headers are not user setable.
	// The following are allowed but banned in the spec:
	// * user-agent
	forbiddenRequestHeaders = [
		'accept-charset',
		'accept-encoding',
		'access-control-request-headers',
		'access-control-request-method',
		'connection',
		'content-length',
		'content-transfer-encoding',
		'cookie',
		'cookie2',
		'date',
		'expect',
		'host',
		'keep-alive',
		'origin',
		'referer',
		'te',
		'trailer',
		'transfer-encoding',
		'upgrade',
		'via'
	],

	// These request methods are not allowed
	forbiddenRequestMethods = [
		'TRACE',
		'TRACK',
		'CONNECT'
	];

/**
 * Private methods
 */


/**
 * Check if the specified header is allowed.
 *
 * @param string header Header to validate
 * @return boolean False if not allowed, otherwise true
 */
function isAllowedHttpHeader(header) {
	return (header && forbiddenRequestHeaders.indexOf(header.toLowerCase()) === -1);
}

/**
 * Check if the specified method is allowed.
 *
 * @param string method Request method to validate
 * @return boolean False if not allowed, otherwise true
 */
function isAllowedHttpMethod(method) {
	return (method && forbiddenRequestMethods.indexOf(method) === -1);
}

/**
 * Changes readyState and calls onreadystatechange.
 *
 * @param int state New state
 */
function setState(state) {
	if (state == self.LOADING || self.readyState !== state) {
		self.readyState = state;

		if (settings.async || self.readyState < self.OPENED || self.readyState === self.DONE) {
			self.dispatchEvent('readystatechange');
		}

		if (self.readyState === self.DONE && !errorFlag) {
			self.dispatchEvent('load');
			// @TODO figure out InspectorInstrumentation::didLoadXHR(cookie)
			self.dispatchEvent('loadend');
		}
	}
}

module.exports = XMLHttpRequest;

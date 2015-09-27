
if (typeof module === "undefined") {
	var module = { exports: undefined };
} else {
	// Node env adaptation goes here...
}

module.exports = Now = (function(window, document, undefined) {
	'use strict';

	// queuing mechanism
	function Queue(owner) {
		this._methods = [];
		this._owner = owner;
		this._paused = false;
	}
	Queue.prototype = {
		add: function(fn) {
			this._methods.push(fn);
			if (!this._paused) this.flush();
		},
		flush: function() {
			if (this._paused) return;
			while (this._methods[0]) {
				var fn = this._methods.shift();
				fn.apply(this._owner, arguments);
				if (fn._paused) {
					this._paused = true;
					break;
				}
			}
		}
	};

	// CORS Request
	function CORSreq(parent, targetUrl) {
		var method = 'GET',
			xhr = new XMLHttpRequest();
		if ('withCredentials' in xhr) {
			xhr.open(method, targetUrl, true);
		} else if (typeof XDomainRequest != 'undefined') {
			xhr = new XDomainRequest();
			xhr.open(method, targetUrl);
		} else {
			// no-support -> fallback: JSReq ?
			throw 'XHR not supported';
		}
		xhr.parent = parent;
		xhr.onload = this.doload;
		return xhr;
	}
	CORSreq.prototype = {
		doload: function(event) {
			var resp = JSON.parse(event.target.responseText);
			this.parent.queue._paused = false;
			this.parent.queue.flush(resp);
		}
	};


	// nowjs class
	function Now() {
		var that = {};
		Now.extendClass(that);
		that.queue = new Queue(that);
		return that;
	}
	Now.extendClass = function(that) {
		for (var method in Now.prototype) {
			if (Now.prototype.hasOwnProperty(method)) {
				that[method] = Now.prototype[method];
			}
		}
		return that;
	};
	Now.prototype = {
		fork: function() {
			return new Now();
		},
		wait: function(duration) {
			var self = this,
				fn = function() {
					setTimeout(function() {
						self.queue._paused = false;
						self.queue.flush();
					}, duration);
				};
			fn._paused = true;
			this.queue.add(fn);
			return this;
		},
		then: function(fn) {
			if (fn) this.queue.add(fn);
			return this;
		},
		ajax: function(url) {
			var self = this,
				fn = function() {
					var cors = new CORSreq(self, url);
					cors.send( );
				};
			fn._paused = true;
			this.queue.add(fn);
			return this;
		},
		recursive: function(fn) {
			if (fn) this.queue.add(fn);
			return this;
		}
	};

	return new Now();

})(window, document);

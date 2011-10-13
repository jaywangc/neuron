/*!
 * module  ajax
 * author  Kael Zhang
 */

KM.define(['util/json'], function(K, require){

/**
 * entrance of ajax method
 */	
function ajax(data, callback, options){
	var self = this, len = arguments.length;
	
	// KM.ajax('/hander/?a=avatar&email=i@kael.me', function(rt){...});
	if(self === WIN && callback && len > 1){
		options = options || {};
		// options.method = 'GET';
		// options.url = data;
		options.onSuccess = callback;
		
		return new _Ajax(options).send(data);
	
	// var ajax = new KM.ajax(options);
	// ajax.send({a:1});
	// ajax.send({a:2});
	}else{
		return new _Ajax(data);
	}
	
};

function standardXMLHttpRequest(){
	return new XMLHttpRequest();
};

function isXHRSuccess(xhr){
	var pass = false, s;

	try{
		s = xhr.status;
		
		// IE sometimes incorrectly returns 1223 which should be 204
		// ref:
		// http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html
		pass = s >= 200 || s < 300 || s === 1223;
		
	}catch(e){}
	
	return pass;
};


function LAMBDA(data){
	return data;
};

function returnTrue(){
	return true;
};

function extendQueryString(query, extra){
	return query + (query.indexOf('?') > -1 ? '&' : '?' ) + extra;
};

/**
 ref: http://www.w3.org/TR/XMLHttpRequest2/#the-xmlhttprequest-interface
	const unsigned short UNSENT = 0;
	const unsigned short OPENED = 1;
	const unsigned short HEADERS_RECEIVED = 2;
	const unsigned short LOADING = 3;
	const unsigned short DONE = 4;
	readonly attribute unsigned short readyState;
 */

var JSON = require('util/json'),

DONE = 4,

WIN = K.__HOST,

EMPTY = '', POST = 'POST', GET = 'GET', STR_JSON = 'json',
WITH_CREDENTIALS = 'withCredentials',

NOOP = function(){},
REGEX_TRIM_EMPERSAND = /^&+|&+$/,
REGEX_TRIM_HASH = /#.*/,

Xhr = WIN.ActiveXObject ?

	// fallback
    function() {
        if (WIN.XMLHttpRequest) {
            try {
                return standardXMLHttpRequest();
            } catch(e) {}
        }

        try {
            return new WIN.ActiveXObject('Microsoft.XMLHTTP');
        } catch(e) {
        }
    }
:
    standardXMLHttpRequest
,
 
header_presets = {
	Accept: {
	    xml		: 'aplication/xml, text/xml',
	    html	: 'text/html',
	    script	: 'text/javascript, application/javascript',
	    json	: 'application/json, text/javascript',
	    text	: 'text/plain',
	    '*'		: '*/*'
	},
	
	'X-Request': {
		json	: 'JSON'
	}
},

response_filter = {
	xml	: 'responseXML',
	text: 'responseText'
},

default_options = {
	url				: EMPTY,
	method			: GET, // GET is recommended
	
	/**
	 @type {string}
	 if dataType is 'json', an empty responseText will be treated as an Error by default;
	 you can config santitizer option to avoid this:
	 {
	 	santitizer: function(rt){ return rt || {}; }
	 }
	 */
	dataType		: STR_JSON,
	
	async			: true,
	timeout			: 0,
	cache			: true,
	
	onSuccess		: NOOP,
	onError			: NOOP,
	onRequest		: NOOP,
	
	user			: EMPTY,
	password		: EMPTY,
	
	headers			: {
		'X-Requested-With': 'XMLHttpRequest'
	},
	
	// isXHRSuccess	: isXHRSuccess
	// isSuccess	: returnTrue
	
	/**
	 * parse the final data
	 */
	parser			: LAMBDA,
	
	/** 
	 * sanitize the data from the responseText before everything takes its part
	 * it will be useful if the server response data of no standards
	 */
	santitizer		: LAMBDA
},

// XMLHttpRequest2
xhr_tester = Xhr(),

// progress support
is_progress_supported = 'onprogress' in xhr_tester,

// credentials support, for cross domain ajax request
is_credentials_supported = WITH_CREDENTIALS in xhr_tester,


// @private
_Ajax = K.Class({
	Implements: ['attrs', 'events'],
	
	options: default_options,
	
	initialize: function(options){
	
		var self = this, 
			o = self.setAttrs(options),
			bind = K.bind;
		
		self.xhr = Xhr();
		self.headers = self._makeHeaders();
		
		self.timer = K.delay(function(){ self.cancel(); }, o.timeout);
		
		bind('_stateChange', self);
		
		if(is_progress_supported){
			bind('_loadstart', self);
			bind('_progress', self);
		}
	},
	
	_makeHeaders: function(){
		var self = this,
			o = self.options,
			data_type = o.dataType || '*',
			headers = o.headers,
			presets = header_presets;
			
		K.each(presets, function(preset, key){
			var header = preset[data_type]; 
		
			if(value){
				headers[key] = value;
			}
		});
			
		return headers;
	},
	
	_stateChange: function(){
		var self = this,
			o = self.options,
			xhr = self.xhr,
			response,
			isResponseSuccess = o.isSuccess || returnTrue;
			isXHRSuccess = o.isXHRSuccess || isXHRSuccess;

		if (xhr.readyState === DONE && self.running){
			self.running = false;
			
			xhr.onreadystatechange = NOOP;

			self.timer.cancel();
			
			response = self._parseResponse(xhr);
			callback_args = [ response, xhr ];
			
			self.fire( !self.parseError && isXHRSuccess(xhr) && isResponseSuccess(response) ?
				'success' : 'error', callback_args);
		}
	},
	
	_parseResponse: function(xhr){
		var self = this,
			o = self.options,
			
			// to prevent santitizer method changing the Ajax options,
			// assign o.santitizer to santitizer
			santitizer = o.santitizer,
			parser = o.parser,
			rt,
			type = o.dataType,
			data_filter = response_filter;
			
		rt = santitizer(xhr[data_filter[type] || data_filter.text] || xhr[data_filter.text]);
		
		if(type.indexOf(STR_JSON) > -1){
			try{
				rt = JSON.parse(rt);
				self.parseError = false;
			}catch(e){
				rt = {};
				self.parseError = true;
			}
		}
		
		return parser(rt);
	},
	
	send: function(data){
		var self = this,
			o = self.options,
			
			method = (o.method || GET).toUpperCase(),
			url = String(o.url).replace(REGEX_TRIM_HASH, EMPTY) || K.getLocation().pathname,
			headers = self.headers,
			
			xhr = self.xhr;
		
		self.running = true;
		
		data = self._tidyRequest(data);
		
		/**
		 * if options.cache is true, 
		 */
		if (o.cache){
			url = extendQueryString(url, K.guid());
		}

		if (data && method === GET){
			url = extendQueryString(url, data);
			data = undefined;
		}
		
		if (is_progress_supported){
			xhr.onloadstart = self._loadstart;
			xhr.onprogress = self._progress;
		}
		
		// socket
		if(o.user){
			xhr.open(method, url, o.async, o.user, o.password);
			
		// passing null username, generates a login popup on Opera
		}else{
			xhr.open(method, url, o.async);
		}
		
		/**
		 * for firefox 3.5 + and other xmlhttprequest2 supported browsers
		 * ref:
		 * https://developer.mozilla.org/en/HTTP_access_control#Requests_with_credentials
		 * http://www.w3.org/TR/XMLHttpRequest2/#dom-xmlhttprequest-withcredentials
		 */
		if (o.user && WITH_CREDENTIALS in xhr) xhr[WITH_CREDENTIALS] = true;
		
		xhr.onreadystatechange = self._stateChange;
		
		K.each(headers, function(header, key){
		
			// for cross domain requests, try/catch is needed
			try {
				xhr.setRequestHeader(key, header);
			} catch (e){}
		});

		self.fire('request');
		
		xhr.send(data);
		
		!o.async && self._stateChange();
		o.timeout && self.timer.start();
		
		return self;
	},
	
	_tidyRequest: function(data){
		data = (data === undefined ? this.options.data : data) || EMPTY;
		
		if (K.isObject(data)){
			data = K.toQueryString(data);
		}else if(K.isString(data)){
			data = data.replace(REGEX_TRIM_EMPERSAND, EMPTY);
		}
		
		return data;
	},
	
	_loadstart: function(event){
		this.fire('loadstart', [event, this.xhr]);
	},
	
	_progress: function(event){
		this.fire('progress', [event, this.xhr]);
	},

	cancel: function(){
		var self = this;
	
		if (self.running){
			self.running = false;
			
			var xhr = this.xhr;
			xhr.abort();
			self.timer.cancel();
			xhr.onreadystatechange = NOOP;
			
			if (is_progress_supported){
				xhr.onprogress = xhr.onloadstart = NOOP;
			}
			
			self.xhr = Xhr();
			this.fire('cancel');
		}
		
		return self;
	}

});

xhr_tester = null;

return ajax;

});

/**

 2011-08-27  Kael:
 - complete main functionalities
 - minimize the dependency on mootools
 - remove non-standard ecma5 methods
 - dealing with Header:Accepts according to expected data type
 - add some support to XMLHttpRequest2, such as progress, credentials(user, password)
 - add santitizer and parser configurations
 
 TODO:
 A. add support to xmlParser
 B. add queue supported
 C. add complete cross domain support
 D. check compatibility with XMLHttpRequest2
 E. test Content-type and Accepts
 
 
 */
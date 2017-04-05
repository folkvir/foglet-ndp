/*
MIT License

Copyright (c) 2017 Grall Arnaud

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
'use strict';

const Q = require('q');
const _ = require('lodash');
const debug = require('debug');
const EventEmitter = require('events');

/**
 * Abstract delegation protocol used by Foglet-NDP to distribute queries between peers
 * @abstract
 * @author Arnaud Grall (Folkvir), Thomas Minier
 */
class DelegationProtocol extends EventEmitter {
	/**
	 * Constructor
	 * @param {object} options - The protocol's options object where all options are defined
	 * @param {string} options.name Name of the protocol
	 * @param {string} options.verbose If true, logs are printed through debug package
	 */
	constructor (options) {
		super();
		this.options = _.merge({
			name: 'ndp',
			verbose: true
		}, options);
		this.name = 'foglet-'+this.options.name;
		this.logger = debug(this.name);
		this.foglet = null;
	}

	/**
	 * Set the Foglet used by the delegation protocol
	 * @param {NDP} foglet - The foglet used by the delegation protocol
	 * @return {void}
	 * @example
	 * const protocol = // construct a new protocol
	 * const ndp = new NDP(config);
	 * protocol.use(ndp);
	 */
	use (foglet) {
		this.foglet = foglet;
	}


	/**
	 * Send queries to neighbours and emit results on ndp-answer
	 * @param {array} data array of element to send (query)
	 * @param {string} endpoint - Endpoint to send queries
	 * @return {promise} A Q promise
	 */
	send (data, endpoint) {
		return Q(endpoint);
	}

	/**
	 * Execute queries in {data} via ldf-client to the {endpoint}
	 * @param {array} data - Queries to execute
	 * @param {string} endpoint - Endpoint to process queries
	 * @return {promise} Return a promise with results as reponse
	 */
	execute (data, endpoint) {
		return Q(endpoint);
	}

	_log (...args) {
		if(this.options.verbose) {
			this.logger('%O', ...args);
			this.emit('logs', ...args);
		}
	}
}

module.exports = DelegationProtocol;

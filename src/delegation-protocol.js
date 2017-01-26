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

/**
 * Abstract delegation protocol used by Foglet-NDP to distribute queries between peers
 * @abstract
 * @author Arnaud Grall (Folkvir), Thomas Minier
 */
class DelegationProtocol {
	/**
	 * Constructor
	 * @param {string} name - The protocol's name
	 */
	constructor (name) {
		this.name = name;
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
	 * Forward en event to Foglet
	 * @param {string} key - The event's key
	 * @param {*} value - The event value
	 * @return {void}
	 */
	emit (key, value) {
		if(this.foglet !== null) this.foglet.events.emit(key, value);
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
}

module.exports = DelegationProtocol;

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

const EventEmitter = require('events');
const Foglet = require('foglet-core');
const LaddaProtocol = require('./ladda-protocol.js');

/**
 * A Foglet using Neighbours Delegation Protocol to delegate SPARQL query to its neighbours
 * @extends Foglet
 * @author Grall Arnaud (Folkvir), Thomas Minier
 */
class NDP extends Foglet {
	/**
	 * This is the constructor of the NDP class, need options as parameter
	 * @constructor
	 * @param {object} options Options used to build the Foglet-ndp
	 * @param {Spray} options.spray - The Spray network used by the foglet
	 * @param {DelegationProtocol|undefined} options.delegationProtocol - (optional) The delegation protocol used by the Foglet. Default to {@link LaddaProtocol}
	 * @param {int|undefined} options.maxPeers - (optional) The maximum number of peer to delegated queries (default to Number.MAX_VALUE)
	 */
	constructor (options) {
		if (options === undefined || options.spray === undefined || options.spray.protocol === undefined ) {
			throw new Error('Missing options, Spray must be defined in options', 'ndp.js');
		}
		super(options);
		this.events = new EventEmitter();
		this.delegationProtocol = options.delegationProtocol || new LaddaProtocol();
		this.maxPeers = options.maxPeers || Number.MAX_VALUE;
	}

	/**
	 * Initialize the foglet, and connect it to the delegation protocol
	 * @return {void}
	 * @override
	 */
	init () {
		super.init();
		this.delegationProtocol.use(this);
	}

	/**
	 * Send queries to neighbours and emit results on ndp-answer
	 * @param {array} data array of element to send (query)
	 * @param {string} endpoint - Endpoint to send queries
	 * @return {promise} Return a Q promise
	 */
	send (data, endpoint) {
		return this.delegationProtocol.send(data, endpoint);
	}
}

module.exports = NDP;

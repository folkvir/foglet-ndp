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
const Immutable = require('immutable');
const ldf = require('ldf-client');
const DelegationProtocol = require('./delegation-protocol.js');
const NDPMessage = require('./ndp-message.js');

/**
 * Ladda delegation protocol
 * @extends DelegationProtocol
 * @author Arnaud Grall (Folkvir), Thomas Minier
 */
class LaddaProtocol extends DelegationProtocol {
	/**
	 * Constructor
	 * @param {int|undefined} nbDestinations - (optional) The number of destinations for delegation (default to 2)
	 */
	constructor (nbDestinations) {
		super('ladda');
		this.queryQueue = Immutable.List();
		this.busyPeers = Immutable.Set();
		this.isFree = true;
		this.nbDestinations = nbDestinations || 2;
	}

	/**
	 * Set the foglet used by the protocol and configure how to handle incoming messages
	 * @param {NDP} foglet - The foglet used by the delegation protocol
	 * @return {void}
	 * @override
	 */
	use (foglet) {
		super.use(foglet);
		const self = this;
		this.foglet.unicast.on('receive', (id, message) => {
			if (message.type === 'request') {
				self.foglet._flog(' You received queries to execute from : @' + id);
				if (!this.isFree) {
					const msg = new NDPMessage({
						type: 'failed',
						id,
						payload: message.payload,
						endpoint: message.endpoint
					});
					self.foglet._flog(msg);
					self.foglet.unicast.send(msg, id);
				} else {
					self.isFree = false;
					self.execute([ message.payload ], message.endpoint).then(result => {
						self.isFree = true;
						const msg = new NDPMessage({
							type: 'answer',
							id,
							payload: result,
							endpoint: message.endpoint
						});
						self.foglet._flog(msg);
						self.foglet.unicast.send(msg, id);
					}).catch(error => {
						self.isFree = true;
						self.foglet._flog('Error : ' + error);
					});
				}
			} else if (message.type === 'answer') {
				try {
					self.foglet._flog('@NDP : A result received from ' + message.id);
					this.busyPeers = this.busyPeers.delete(id);
					self.foglet.events.emit('ndp-answer', message);
					if(this.queryQueue.count() > 0) this.delegateQueries(message.endpoint);
				} catch (e) {
					self.foglet._flog('@NDP : error ' + e);
				}
			} else if (message.type === 'failed') {
				self.foglet._flog('@NDP : failed query from ' + message.id);
				this.queryQueue = this.queryQueue.push(message.payload);
				this.busyPeers = this.busyPeers.delete(id);
				if(this.isFree) this.delegateQueries(message.endpoint);
			}
		});
	}

	/**
	 * Send queries to neighbours and emit results on ndp-answer
	 * @param {array} data array of element to send (query)
	 * @param {string} endpoint - Endpoint to send queries
	 * @return {promise} A Q promise
	 */
	send (data, endpoint) {
		data.forEach(query => this.queryQueue = this.queryQueue.push(query));
		return this.delegateQueries(endpoint);
	}

	/**
	 * Perform delegation using Ladda algorithm
	 * @param {string} endpoint - The LDF-server on which queries will be evaluated
	 * @return {Q.Promise} A Q Promise fullfilled when delegation is complete
	 */
	delegateQueries (endpoint) {
		this.foglet._flog('LADDA - beginning delegation');
		return Q.Promise((resolve, reject) => {
			try {
				if (this.queryQueue.count() > 0) {
					this.foglet._flog('LADDA - queue not empty, try to delegate to me first');
					if (this.isFree) {
						this.isFree = false;
						this.foglet._flog('LADDA - ' + this.foglet.spray.toString() + ' will execute one query');
						const query = this.queryQueue.first();
						this.foglet._flog('LADDA - selected query:' + query);
						this.queryQueue = this.queryQueue.shift(0);
						this.foglet._flog('LADDA - shifting queue');
						this.execute([ query ], endpoint).then(result => {
							this.isFree = true;
							const msg = new NDPMessage({
								type: 'answer',
								id: 'me',
								payload: result,
								query
							});
							this.foglet._flog('LADDA - client finished query');
							this.emit('ndp-answer', msg);
						});
					}
					this.foglet._flog('LADDA - trying to delegate to peers');
					if (this.queryQueue.count() > 0) {
						// delegate queries to peers
						const peers = this._choosePeers();
						this.foglet._flog('LADDA - choosen peers: ' + peers);
						peers.forEach(peer => {
							if (this.queryQueue.count() > 0) {
								this.foglet._flog('LADDA - send to peer ' + peer);
								const query = this.queryQueue.first();
								this.queryQueue = this.queryQueue.shift(0);
								// mark the peer as 'busy'
								this.busyPeers = this.busyPeers.add(peer);
								this.foglet.unicast.send(new NDPMessage({
									type: 'request',
									id: peer,
									payload: query,
									endpoint
								}), peer);
							}
						});
					}
				}
				resolve('delegation done');
			} catch (e) {
				reject(e);
			}
		});
	}

	/**
	 * Execute one query on an endpoint using ldf-client
	 * @param {array} data - Query to execute
	 * @param {string} endpoint - Endpoint to process queries
	 * @return {Promise} A Promise with results as reponse
	 */
	execute (data, endpoint) {
		this.foglet._flog(' Execution of : '+ data + ' on ' + endpoint);
		let delegationResults = Immutable.List();
		let completedQueries = 0;
		const self = this;

		return Q.Promise( (resolve, reject) => {
			// Convert array to Immutable.List
			try {
				data = Immutable.fromJS(data);
				let fragmentsClient = new ldf.FragmentsClient(endpoint);
				for (let i = 0; i < data.size; i++) {
					delegationResults = delegationResults.insert(i, Immutable.List());
					let queryResults = new ldf.SparqlIterator( data.get(i), {fragmentsClient});
					queryResults.on('data', ldfResult => {
						delegationResults = delegationResults.set(i, delegationResults.get(i).push(ldfResult));
					});
					queryResults.on('end', () => {
						++completedQueries;
						// resolve when all results are arrived
						if (completedQueries >= data.count()) {
							self.isFree = true;
							resolve(delegationResults.toJS());
						}
					});/* SEE WITH LDF-CLIENT BECAUSE THIS IS A BUG ! .catch((error) => reject(error) */
				}
			} catch (error) {
				reject(error);
			}
		});
	}

	/**
	 * Choose to which peers send the request
	 * @return {Immutable.Set} A set of peers selected for delegation
	 */
	_choosePeers () {
		let choosedPeers = Immutable.Set();
		choosedPeers = choosedPeers.union(this.foglet.spray.getPeers(this.foglet.maxPeers).i);
		return choosedPeers.subtract(this.busyPeers);
	}
}

module.exports = LaddaProtocol;

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

// LDF LOG Disabling
ldf.Logger.setLevel('EMERGENCY');
//ldf.Logger.setLevel('DEBUG');
// status
const STATUS_WAITING = 'status_waiting';
const STATUS_DELEGATED = 'status_delegated';
const STATUS_DONE = 'status_done';

// utility to format dates in hh:mm:ss:ms
const formatTime = time => `${time.getHours()}:${time.getMinutes()}:${time.getSeconds()}:${time.getMilliseconds()}`;

/**
 * Ladda delegation protocol
 * @extends DelegationProtocol
 * @author Arnaud Grall (Folkvir), Thomas Minier
 */
class LaddaProtocol extends DelegationProtocol {
	/**
	 * Constructor
	 * @param {int|undefined} nbDestinations - (optional) The number of destinations for delegation (default to 2, as in Ladda paper)
	 * @param {int|undefined} timeout - (optional) The timeout used by the protocol. Disable by default unless it is set.
	 */
	constructor (nbDestinations, timeout) {
		super('ladda');
		this.queryQueue = Immutable.Map();
		this.busyPeers = Immutable.Set();
		this.isFree = true;
		this.nbDestinations = nbDestinations || 2;
		this.timeout = timeout || -1; // disable dy default
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
		this.foglet.onUnicast((id, message) => {
			const receiveMessageTime = formatTime(new Date());
			switch (message.type) {
			case 'request': {
				self.foglet._flog('@LADDA - Peer @' + self.foglet.id + ' received a query to execute from : @' + id);
				if (!self.isFree) {
					self.foglet._flog('@LADDA - Peer @' + self.foglet.id + ' is busy, cannot execute query ' + message.payload + ' from ' + id);
					const msg = new NDPMessage({
						type: 'failed',
						id,
						payload: message.payload,
						endpoint: message.endpoint,
						receiveQueryTime: receiveMessageTime
					});
					self.foglet._flog(msg);
					self.foglet.sendUnicast(msg, id);
				} else {
					self.isFree = false;
					const query = message.payload;
					const startExecutionTime = formatTime(new Date());
					self.execute(query, message.endpoint).then(result => {
						const endExecutionTime = formatTime(new Date());
						self.isFree = true;
						const msg = new NDPMessage({
							type: 'answer',
							id: this.foglet.id,
							schedulerId: message.id,
							payload: result,
							query: query,
							endpoint: message.endpoint,
							startTime: message.startTime,
							sendQueryTime: message.sendQueryTime,
							receiveQueryTime: receiveMessageTime,
							startExecutionTime,
							endExecutionTime
						});
						self.foglet._flog(msg);
						msg.sendResultsTime = formatTime(new Date());
						self.foglet.sendUnicast(msg, id);
					}).catch(error => {
						self.foglet._flog('**********************ERROR****************************');
						self.isFree = true;
						self.foglet._flog('@LADDA - Error : ' + error);
						self.foglet._flog('*******************************************************');
					});
				}
				break;
			}
			case 'answer': {
				try {
					self.foglet._flog('@LADDA : Received an answer from @' + message.id);
					this.queryQueue = this.queryQueue.update(message.query, () => STATUS_DONE);
					this.busyPeers = this.busyPeers.delete(id);
					message.receiveResultsTime = receiveMessageTime;
					self.foglet.events.emit('ndp-answer', message);
					// retry delegation if there's queries in the queue
					if(self.queueIsNotEmpty()) self.delegateQueries(message.endpoint);
				} catch (e) {
					self.foglet._flog('**********************ERROR****************************');
					self.foglet._flog('@NDP : error ' + e);
					self.foglet._flog('*******************************************************');
				}
				break;
			}
			case 'failed': {
				self.foglet._flog('@LADDA : failed query from @' + message.id);
				self.queryQueue = self.queryQueue.update(message.query, () => STATUS_WAITING);
				self.busyPeers = self.busyPeers.delete(id);
				if(self.isFree) self.delegateQueries(message.endpoint);
				break;
			}
			default:
				break;
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
		// clear queue before anything
		this.queryQueue = this.queryQueue.clear();
		data.forEach(query => this.queryQueue = this.queryQueue.set(query, STATUS_WAITING));
		this.foglet._flog('**********************QUEUE****************************');
		console.log(this.queryQueue.toJS());
		this.foglet._flog('*******************************************************');
		return this.delegateQueries(endpoint);
	}

	/**
	 * Return true if the queue has queries to delegate
	 * @return {boolean} True or false
	 */
	queueIsNotEmpty () {
		return this.queryQueue.filter(x => x === STATUS_WAITING).count() > 0;
	}

	/**
	 * Perform delegation using Ladda algorithm
	 * @param {string} endpoint - The LDF-server on which queries will be evaluated
	 * @return {Q.Promise} A Q Promise fullfilled when delegation is complete
	 */
	delegateQueries (endpoint) {
		this.foglet._flog('@LADDA - beginning delegation');

		return Q.Promise((resolve, reject) => {
			try {
				if (this.queueIsNotEmpty()) {
					this.foglet._flog('@LADDA - queue not empty, try to delegate to me first');
					if (this.isFree) {
						this.isFree = false;
						this.foglet._flog('@LADDA - Peer @' + this.foglet.id + ' (client) will execute one query');
						const query = this.queryQueue.findKey(status => status === STATUS_WAITING);
						this.foglet._flog('@LADDA - selected query:' + query);
						this.queryQueue = this.queryQueue.update(query, () => STATUS_DELEGATED);
						const startExecutionTime = formatTime(new Date());
						this.execute(query, endpoint).then(result => {
							this.queryQueue = this.queryQueue.update(query, () => STATUS_DONE);
							const endExecutionTime = formatTime(new Date());
							this.isFree = true;
							const msg = new NDPMessage({
								type: 'answer',
								id: 'me',
								schedulerId: 'me',
								payload: result,
								query,
								endpoint,
								sendQueryTime: startExecutionTime,
								receiveQueryTime: startExecutionTime,
								startExecutionTime,
								endExecutionTime,
								sendResultsTime: endExecutionTime,
								receiveResultsTime: endExecutionTime
							});
							this.foglet._flog('@LADDA - client finished query');
							this.emit('ndp-answer', msg);
							// retry delegation if there's queries in the queue
							if(this.queueIsNotEmpty()) this.delegateQueries(endpoint);
						}).catch(error => {
							self.foglet._flog('**********************ERROR****************************');
							self.isFree = true;
							self.foglet._flog('@LADDA - Error : ' + error);
							self.foglet._flog('*******************************************************');
						});;
					}
					this.foglet._flog('@LADDA - trying to delegate to peers');
					if (this.queueIsNotEmpty()) {
						// delegate queries to peers
						const peers = this._choosePeers();
						this.foglet._flog('@LADDA - chosen peers: ' + peers);
						peers.forEach(peer => {
							if (this.queueIsNotEmpty()) {
								const query = this.queryQueue.findKey(status => status === STATUS_WAITING);
								this.foglet._flog('@LADDA - delegate ' + query + ' to peer @' + peer);
								this.queryQueue = this.queryQueue.update(query, () => STATUS_DELEGATED);
								// mark the peer as 'busy'
								this.busyPeers = this.busyPeers.add(peer);
								const sendQueryTime = formatTime(new Date());
								this.foglet.sendUnicast(new NDPMessage({
									type: 'request',
									id: this.foglet.id,
									payload: query,
									endpoint,
									sendQueryTime
								}), peer);
								// set timeout if necessary
								if (this.timeout > 0) {
									setTimeout(() => {
										if(this.queryQueue.get(query) === STATUS_DELEGATED) {
											this.queryQueue = this.queryQueue.update(query, () => STATUS_WAITING);
											self.busyPeers = self.busyPeers.delete(peer);
										}
									}, this.timeout);
								}
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
	 * @param {string} query - The query to execute
	 * @param {string} endpoint - Endpoint to process queries
	 * @return {Promise} A Promise with results as reponse
	 */
	execute (query, endpoint) {
		this.foglet._flog(' Execution of : ' + query + ' on ' + endpoint);
		let delegationResults = Immutable.List();
		const self = this;
		return Q.Promise( (resolve, reject) => {
			try {
				let fragmentsClient = new ldf.FragmentsClient(endpoint);
				let queryResults = new ldf.SparqlIterator(query, {fragmentsClient});
				queryResults.on('data', ldfResult => {
					delegationResults = delegationResults.push(ldfResult);
				});
				// resolve when all results are arrived
				queryResults.on('end', () => {
					self.isFree = true;
					resolve(delegationResults.toJS());
				});/* SEE WITH LDF-CLIENT BECAUSE THIS IS A BUG ! .catch((error) => reject(error) */
			} catch (error) {
				self.foglet._flog('**********************ERROR****************************');
				console.log(error);
				self.foglet._flog('*******************************************************');
				reject(error);
			}
		});
	}

	/**
	 * Choose non-busy peers fro query delegation
	 * @return {Immutable.Set} A set of peers selected for delegation
	 */
	_choosePeers () {
		let chosenPeers = Immutable.Set();
		let _peers = Immutable.Set();
		// gather non-busy peers
		_peers = _peers.union(this.foglet.getNeighbours());
		_peers = _peers.subtract(this.busyPeers).toList();
		let index = 0;
		// random selection beytween non-busy peers (as in LADDA algorithm)
		while( (chosenPeers.count() < this.nbDestinations) && (_peers.count() > 0)) {
			index = this._randomInt(0, _peers.count());
			chosenPeers = chosenPeers.add(_peers.get(index));
			_peers = _peers.remove(index);
		}
		return chosenPeers;
	}

	/**
	 * Pick a random int between two values
	 * @param {int} min - The lower bound
	 * @param {int} max - The upper bound (excluded)
	 * @return {int} A random int between min and max (excluded)
	 */
	_randomInt (min, max) {
		min = Math.ceil(min);
		max = Math.floor(max);
		return Math.floor(Math.random() * (max - min)) + min;
	}
}

module.exports = LaddaProtocol;

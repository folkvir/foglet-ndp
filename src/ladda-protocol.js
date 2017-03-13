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
const StatusQueue = require('./status-queue.js');
const DelegationProtocol = require('./delegation-protocol.js');
const NDPMessage = require('./ndp-message.js');
const uuidV4 = require('uuid/v4');

// LDF LOG Disabling
ldf.Logger.setLevel('EMERGENCY');
// ldf.Logger.setLevel('DEBUG');
// status
const STATUS_DELEGATED = 'status_delegated';

// utility to format dates in hh:mm:ss:ms
const formatTime = time => {
	const hours = time.getHours().toString(),
		min = time.getMinutes().toString(),
		sec = time.getSeconds().toString();
	let mil = time.getMilliseconds().toString();
	if(mil.length === 1) {
		mil = `00${mil}`;
	}else if (mil.length === 2) {
		mil = `0${mil}`;
	}
	return `${hours}:${min}:${sec}:${mil}`;
};

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
		// this.queryQueue = Immutable.Map();
		this.queryQueue = new StatusQueue();
		this.busyPeers = Immutable.Set();
		this.isFree = true;
		this.nbDestinations = nbDestinations || 2;
		this.timeout = timeout || 300 * 1000; // 300 secondes by default = 5 minutes

		this.garbageTimeout = {};

		this.signalAnswer = 'ndp-answer'; // When an answer is received from our workload
		this.signalError = 'ndp-error'; // An error occurred
		this.signalFailed = 'ndp-failed'; // a query has failed to be delegated
		self.signalTimeout = 'ndp-timeout'; // Signal for timed out queries
		this.signalDelegateQuery = 'ndp-delegated'; // We are delegating a query
		this.signalDelegatedQueryExecuted = 'ndp-delegated-query-executed'; // We executed a delegated query
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
				if(self.isFree && !self.queryQueue.hasWaitingQueries()) {
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
							qId: message.qId,
							endpoint: message.endpoint,
							startTime: message.startTime,
							sendQueryTime: message.sendQueryTime,
							receiveQueryTime: receiveMessageTime,
							startExecutionTime,
							endExecutionTime
						});
						self.foglet._flog(msg);
						msg.sendResultsTime = formatTime(new Date());
						self.emit(this.signalDelegatedQueryExecuted, msg);
						self.foglet.sendUnicast(msg, id);
					}).catch(error => {
						self.foglet._flog('**********************ERROR****************************');
						self.isFree = true;
						self.emit(self.signalError, new Error(error));
						console.log(error);
						self.foglet._flog('*******************************************************');
					});
				} else {
					self.foglet._flog('@LADDA - Peer @' + self.foglet.id + ' is busy, cannot execute query ' + message.payload + ' from ' + id);
					const msg = new NDPMessage({
						type: 'failed',
						id,
						payload: message.payload,
						endpoint: message.endpoint,
						qId: message.qId,
						receiveQueryTime: receiveMessageTime
					});
					self.foglet._flog(msg);
					self.emit(this.signalFailed, msg);
					self.foglet.sendUnicast(msg, id);
				}
				break;
			}
			case 'answer': {
				try {
					self.foglet._flog('@LADDA : Received an answer from @' + message.id);
					self.queryQueue.setDone(message.qId);
					self.busyPeers = this.busyPeers.delete(id);
					message.receiveResultsTime = receiveMessageTime;
					self.emit(this.signalAnswer, message);
					// clear the timeout
					clearTimeout(this.garbageTimeout[message.qId]);
					// retry delegation if there's queries in the queue
					if(self.queryQueue.hasWaitingQueries()) self.delegateQueries(message.endpoint);
				} catch (error) {
					self.foglet._flog('**********************ERROR****************************');
					self.emit(self.signalError, new Error(error));
					self.foglet._flog('*******************************************************');
				}
				break;
			}
			case 'failed': {
				self.foglet._flog('@LADDA : failed query from @' + message.id);
				self.emit(this.signalFailed, message);
				self.queryQueue.setWaiting(message.qId);
				clearTimeout(this.garbageTimeout[message.qId]);
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
		this.queryQueue.clear();
		data.forEach(query => this.queryQueue.push(this._getNewUid(), query));
		console.log('===> Queue:');
		console.log(this.queryQueue.queries.toJS());
		return this.delegateQueries(endpoint);
	}

	/**
	 * Generate and return  a v4 UUID (random) based on uuid npm package
	 * @return {string} uuidv4
	 */
	_getNewUid () {
		return uuidV4();
	}

	// /**
	//  * Return true if the queue has queries to delegate
	//  * @return {boolean} True or false
	//  */
	// queueIsNotEmpty () {
	// 	return this.queryQueue.filter(x => x === STATUS_WAITING).count() > 0;
	// }

	/**
	 * Perform delegation using Ladda algorithm
	 * @param {string} endpoint - The LDF-server on which queries will be evaluated
	 * @return {Q.Promise} A Q Promise fullfilled when delegation is complete
	 */
	delegateQueries (endpoint) {
		this.foglet._flog('@LADDA - beginning delegation');
		const self = this;
		return Q.Promise((resolve, reject) => {
			try {
				if (self.queryQueue.hasWaitingQueries()) {
					self.foglet._flog('@LADDA - queue not empty, try to delegate to me first');
					if (self.isFree) {
						console.log(self.queryQueue.queries.toJS());
						self.foglet._flog('@LADDA - Peer @' + self.foglet.id + ' (client) will execute one query');
						const query = self.queryQueue.first();
						self.isFree = false;
						self.foglet._flog('@LADDA - Selected query:' + query.query);
						self.queryQueue.setDelegated(query.id);
						const startExecutionTime = formatTime(new Date());
						self.execute(query.query, endpoint).then(result => {
							self.queryQueue.setDone(query.id);
							const endExecutionTime = formatTime(new Date());
							self.isFree = true;
							const msg = new NDPMessage({
								type: 'answer',
								id: 'me',
								schedulerId: 'me',
								payload: result,
								query: query.query,
								qId: query.id,
								endpoint,
								sendQueryTime: startExecutionTime,
								receiveQueryTime: startExecutionTime,
								startExecutionTime,
								endExecutionTime,
								sendResultsTime: endExecutionTime,
								receiveResultsTime: endExecutionTime
							});
							self.foglet._flog('@LADDA - client finished query');
							self.emit(this.signalAnswer, msg);
							// retry delegation if there's queries in the queue
							if(self.queryQueue.hasWaitingQueries()) self.delegateQueries(endpoint);
						}).catch(error => {
							self.foglet._flog('**********************ERROR****************************');
							self.isFree = true;
							self.foglet._flog('@LADDA - Error : ' + error);
							self.emit(self.signalError, new Error(error));
							self.foglet._flog('*******************************************************');
						});
					}
					self.foglet._flog('@LADDA - trying to delegate to peers');
					if (self.queryQueue.hasWaitingQueries()) {
						// delegate queries to peers
						const peers = self._choosePeers();
						self.foglet._flog('@LADDA - chosen peers: ' + peers);
						peers.forEach(peer => {
							if (self.queryQueue.hasWaitingQueries()) {
								const query = self.queryQueue.first();
								console.log(query);
								self.foglet._flog('@LADDA - delegate ' + query.query + ' to peer @' + peer);
								self.queryQueue.setDelegated(query.id);
								// mark the peer as 'busy'
								self.busyPeers = self.busyPeers.add(peer);
								const sendQueryTime = formatTime(new Date());
								const m = new NDPMessage({
									type: 'request',
									id: self.foglet.id,
									payload: query.query,
									qId: query.id,
									endpoint,
									sendQueryTime
								});
								self.emit(this.signalDelegateQuery, m);
								self.foglet.sendUnicast(m, peer);
								// set timeout if necessary
								if (self.timeout > 0) {
									this.garbageTimeout[query.id] = setTimeout(() => {
										if(self.queryQueue.getStatus(query.id) === STATUS_DELEGATED) {
											self.emit(self.signalTimeout, query);
											self.queryQueue.setWaiting(query.id);
											self.busyPeers = self.busyPeers.delete(peer);
										}
									}, self.timeout);
								}
							}
						});
					}
				}
				resolve('delegation done');
			} catch (error) {
				self.foglet._flog('**********************ERROR****************************');
				self.isFree = true;
				self.foglet._flog('@LADDA - Error : ' + error);
				self.emit(self.signalError, new Error(error));
				self.foglet._flog('*******************************************************');
				reject(error);
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
		console.log(query);
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
				self.emit(self.signalError, new Error(error));
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
		_peers = _peers.union(this.foglet.getAllNeighbours());
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

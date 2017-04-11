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
const moment = require('moment');
const _ = require('lodash');

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

function clone (obj) {
	return _.merge({}, obj);
}

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
	constructor (nbDestinations, timeout, verbose) {
		super({
			name: 'ladda',
			verbose
		});
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
		this.signalTimeout = 'ndp-timeout'; // Signal for timed out queries
		this.signalDelegateQuery = 'ndp-delegated'; // We are delegating a query
		this.signalDelegatedQueryExecuted = 'ndp-delegated-query-executed'; // We executed a delegated query


		// fragmentsClient
		this.endpoints = {};
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

			const receiveMessageTimeDate = new Date();
			const receiveMessageTime = formatTime(receiveMessageTimeDate);
			switch (message.type) {
			case 'request': {
				self._log(' message: ', message);
				self._log('@LADDA - Peer @' + self.foglet.id + ' received a query to execute from : @' + id);
				if(self.isFree && !self.queryQueue.hasWaitingQueries()) {
					self.isFree = false;
					const query = message.payload;
					const startExecutionTimeDate = new Date();
					const startExecutionTime = formatTime(startExecutionTimeDate);
					self._setFragmentsClient(message.endpoint);
					self.execute(query, message.endpoint).then(result => {
						const endExecutionTimeDate = new Date();
						const endExecutionTime = formatTime(endExecutionTimeDate);
						const executionTime = self._computeExecutionTime(startExecutionTimeDate, endExecutionTimeDate);
						self.isFree = true;
						const msg = new NDPMessage({
							type: 'answer',
							id: self.foglet.id,
							schedulerId: message.id,
							payload: result,
							query: query,
							qId: message.qId,
							endpoint: message.endpoint,
							startTime: message.startTime,
							sendQueryTime: message.sendQueryTime,
							receiveQueryTime: receiveMessageTime,
							startExecutionTime,
							endExecutionTime,
							executionTime
						});
						self._log(clone(msg));
						msg.sendResultsTime = formatTime(new Date());
						self.emit(this.signalDelegatedQueryExecuted, clone(msg));
						self.foglet.sendUnicast(msg, id);
					}).catch(error => {
						self._log('**********************ERROR REQUEST EXECUTE DELEGATED QUERY ****************************');
						self.isFree = true;
						self.emit(self.signalError, error.toString() + '\n' + error.stack);
						self._log(error.toString() + '\n' + error.stack);
						self._log('****************************************************************************************');
						const msg = new NDPMessage({
							type: 'failed',
							id: self.foglet.id,
							payload: message.payload,
							endpoint: message.endpoint,
							qId: message.qId,
							receiveQueryTime: receiveMessageTime
						});
						self._log(clone(msg));
						self.emit(this.signalFailed, clone(msg));
						self.foglet.sendUnicast(msg, id);
					});
				} else {
					self._log('@LADDA - Peer @' + self.foglet.id + ' is busy, cannot execute query ' + message.payload + ' from ' + id);
					const msg = new NDPMessage({
						type: 'failed',
						id: self.foglet.id,
						payload: message.payload,
						endpoint: message.endpoint,
						qId: message.qId,
						receiveQueryTime: receiveMessageTime
					});
					self._log(clone(msg));
					self.emit(this.signalFailed, clone(msg));
					self.foglet.sendUnicast(msg, id);
				}
				break;
			}
			case 'answer': {
				try {
					self._log('@LADDA : Received an answer from @' + message.id);
					self.queryQueue.setDone(message.qId);
					self.busyPeers = this.busyPeers.delete(id);
					message.receiveResultsTime = receiveMessageTime;
					message.globalExecutionTime = self._computeGlobalExecutionTime(message.sendQueryTime, receiveMessageTimeDate);
					self.emit(this.signalAnswer, clone(message));
					// clear the timeout
					clearTimeout(this.garbageTimeout[message.qId]);
					// retry delegation if there's queries in the queue
					if(self.queryQueue.hasWaitingQueries()) self.delegateQueries(message.endpoint);
				} catch (error) {
					self._log('**********************ERROR ANSWER****************************');
					self._log(error.toString() + '\n' + error.stack);
					self.emit(self.signalError, error.toString() + '\n' + error.stack);
					self._log('**************************************************************');
				}
				break;
			}
			case 'failed': {
				self._log('@LADDA : failed query from @' + message.id);
				self.emit(this.signalFailed, clone(message));
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

	_setFragmentsClient (endpoint) {
		let fragmentsClient = this.endpoints.has(endpoint);
		if(!fragmentsClient) {
			this.endpoints.set(endpoint, new ldf.FragmentsClient(endpoint));
		}
	}

	/**
	 * Send queries to neighbours and emit results on ndp-answer
	 * @param {array} data array of element to send (query)
	 * @param {string} endpoint - Endpoint to send queries
	 * @return {promise} A Q promise
	 */
	send (data, endpoint) {
		this._setFragmentsClient (endpoint);
		// clear queue before anything
		this.queryQueue.clear();
		data.forEach(query => this.queryQueue.push(this._getNewUid(), query));
		return this.delegateQueries(endpoint);
	}

	/**
	 * Send queries to neighbours and emit results on ndp-answer
	 * @param {array} data array of element to send (query)
	 * @param {string} endpoint - Endpoint to send queries
	 * @param {boolean} withResults - True if you want response with query results or false, just metadata
	 * @return {promise} A Q promise
	 */
	sendPromise (data, endpoint, withResults = true) {
		return Q.Promise( (resolve) => {
			this._setFragmentsClient (endpoint);
			// clear queue before anything
			this.queryQueue.clear();
			data.forEach(query => this.queryQueue.push(this._getNewUid(), query));
			this.delegateQueries(endpoint);
			let result = 0;
			let results = [];
			this.on(this.signalAnswer, (response) => {
				result++;
				if(!withResults) {
					response.payload = withResults;
				}
				results.push(response);
				if(result === data.length) {
					this._log(results);
					resolve(results);
				}
			});
		});
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
		this._log('@LADDA - beginning delegation');
		const self = this;
		return Q.Promise((resolve, reject) => {
			try {
				if (self.queryQueue.hasWaitingQueries()) {
					self._log('@LADDA - queue not empty, try to delegate to me first');
					if (self.isFree) {
						self._log('@LADDA - Peer @' + self.foglet.id + ' (client) will execute one query');
						const query = self.queryQueue.first();
						self.isFree = false;
						self._log('@LADDA - Selected query:' + query.query);
						self.queryQueue.setDelegated(query.id);
						const startExecutionTimeDate = new Date();
						const startExecutionTime = formatTime(startExecutionTimeDate);
						self.execute(query.query, endpoint).then(result => {
							self.queryQueue.setDone(query.id);
							const endExecutionTimeDate = new Date();
							const endExecutionTime = formatTime(endExecutionTimeDate);
							const executionTime = self._computeExecutionTime(startExecutionTimeDate, endExecutionTimeDate);
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
								receiveResultsTime: endExecutionTime,
								executionTime,
								globalExecutionTime: executionTime
							});
							self._log('@LADDA - client finished query');
							self.emit(this.signalAnswer, clone(msg));
							// retry delegation if there's queries in the queue
							if(self.queryQueue.hasWaitingQueries()) self.delegateQueries(endpoint);
						}).catch(error => {
							self._log('**********************ERROR EXECUTE AT ME****************************');
							self.isFree = true;
							self.queryQueue.setWaiting(query.id);
							self._log(error.toString() + '\n' + error.stack);
							self._log('@LADDA - Error : ' + error.toString() + '\n' + error.stack);
							self.emit(self.signalError, error.toString() + '\n' + error.stack);
							self._log('*********************************************************************');
						});
					}
					self._log('@LADDA - trying to delegate to peers');
					if (self.queryQueue.hasWaitingQueries()) {
						// delegate queries to peers
						const peers = self._choosePeers();
						self._log('@LADDA - chosen peers: ' + peers);
						peers.forEach(peer => {
							if (self.queryQueue.hasWaitingQueries()) {
								const query = self.queryQueue.first();
								self._log('@LADDA - delegate ' + query.query + ' to peer @' + peer);
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
								self.emit(this.signalDelegateQuery, clone(m));
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
				self._log('**********************ERROR****************************');
				self.isFree = true;
				self._log(error.toString() + '\n' + error.stack);
				self._log('@LADDA - Error : ' + error.toString() + '\n' + error.stack);
				self.emit(self.signalError, error.toString() + '\n' + error.stack);
				self._log('*******************************************************');
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
		this._log(' Execution of : ' + query + ' on ' + endpoint);
		let delegationResults = Immutable.List();
		const self = this;
		return Q.Promise( (resolve, reject) => {
			try {
				// let fragmentsClient = new ldf.FragmentsClient(endpoint);
				const fragmentsClient = self.endpoints.get(endpoint);
				console.log('********************************** => FRAGMENTSCLIENT: ', fragmentsClient);
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
				self._log('**********************ERROR****************************');
				self._log(error.toString() + '\n' + error.stack);
				self.emit(self.signalError, error.toString() + '\n' + error.stack);
				self._log('*******************************************************');
				reject(error);
			}
		});
	}

	_computeExecutionTime (start, end) {
		const s = moment.duration(start.getTime());
		const e = moment.duration(end.getTime());
		return e.subtract(s).asMilliseconds();
	}

	_computeGlobalExecutionTime (start, end) {
		// start is a formated date, end is a Date
		return this._computeExecutionTime(this._toDate(start), end);
	}

	_toDate (date) {
		let d = new Date();
		const split = date.split(':');
		d.setHours(split[0]);
		d.setMinutes(split[1]);
		d.setSeconds(split[2]);
		d.setMilliseconds(split[3]);
		return d;
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

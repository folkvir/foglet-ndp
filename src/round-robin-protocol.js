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
 * Simple delegation protocol using a Round Robin approach to distribute queries between peers
 * @extends DelegationProtocol
 * @author Arnaud Grall (Folkvir), Thomas Minier
 */
class RoundRobinProtocol extends DelegationProtocol {
	/**
	 * Constructor
	 */
	constructor () {
		super('round-robin');
	}

	/**
	 * Send queries to neighbours and emit results on ndp-answer
	 * @param {array} data array of element to send (query)
	 * @param {string} endpoint - Endpoint to send queries
	 * @return {promise} A Q promise
	 */
	send (data, endpoint) {
		const self = this;
		return Q.Promise(function (resolve, reject) {
			let queries;
			if (!data || !(queries = Immutable.fromJS(data)) ) {
				if(!queries.isList()) {
					reject(new Error('Data are not typed as Array', 'ndp.js'));
				}
			}
			self.foglet._flog(queries);
			try {
				const peers = self.foglet.spray.getPeers(self.foglet.maxPeers);
				// calcul des requètes à envoyer
				const users = peers.i.length /* + peers.o.length */ + 1;
				self.foglet._flog('Number of neightbours : ' + users);
				// Répartition...
				let cpt = 0;
				const dividedData = self.divideData(queries, users);
				self.foglet._flog(dividedData.toJS());
				if ( users !== 1 ) {
					for (let k = 0; k < users - 1; ++k) {
						const msg = new NDPMessage({
							type: 'request',
							id: peers.i[k],
							payload: dividedData.get(cpt).toJS(),
							endpoint
						});
						self.foglet.unicast.send(msg, peers.i[k]);
						++cpt;
					}

					const query = dividedData.get(cpt).toJS();
					self.execute(query, endpoint).then(result => {
						const msg = new NDPMessage({
							type: 'answer',
							id: 'me',
							payload: result,
							endpoint
						});
						self.emit('ndp-receive', msg);
					});
				} else {
					const query = dividedData.get(cpt).toJS();
					self.execute(query, endpoint).then(result => {
						const msg = new NDPMessage({
							type: 'answer',
							id: 'me',
							payload: result,
							endpoint
						});
						self.emit('ndp-receive', msg);
					});
				}
				resolve();
			} catch (error) {
				reject(new Error(error));
			}
		});
	}

	/**
	 * Execute queries in {data} via ldf-client to the {endpoint}
	 * @param {array} data - Queries to execute
	 * @param {string} endpoint - Endpoint to process queries
	 * @return {Promise} A Promise with results as reponse
	 */
	execute (data, endpoint) {
		this.foglet._flog(' Execution of : '+ data + ' on ' + endpoint);
		let delegationResults = Immutable.List();
		let completedQueries = 0;

		return Q.Promise( (resolve, reject) => {
			// Convert array to Immutable.List
			try {
				data = Immutable.fromJS(data);
				console.log(data);
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
	 * Divides queries between a number of clients using a Round Robin approach
	 * @param {Immutable.List} queries - List of queries to divide bewteen clients
	 * @param {int} nbClients - The number of clients
	 * @return {Immutable.List<Immutable.list>} The queries divided between a number of clients
	 */
	divideData (queries, nbClients) {
		let dividedData = Immutable.List([]);
		for (let i = 0; i < nbClients; ++i) {
			dividedData = dividedData.insert(i, Immutable.List([]));
		}
		for (let i = 0; i < queries.size; ++i) {
			const tmp = dividedData.get(i % nbClients).insert(i % nbClients, queries.get(i));
			dividedData = dividedData.set(i % nbClients, tmp);
		}
		return dividedData;
	}
}

module.exports = RoundRobinProtocol;

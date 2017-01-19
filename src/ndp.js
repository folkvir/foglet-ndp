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
const Immutable = require('immutable');
const VVwE = require('version-vector-with-exceptions');
const Unicast = require('unicast-definition');
const ldf = require('ldf-client');
const Foglet = require('foglet-core');
const Q = require('q');
const NDPMessage = require('./ndp-message.js');

function divideData (data, n) {
	let dividedData = Immutable.List([]);
	for (let i = 0; i < n; ++i) {
		dividedData = dividedData.insert(i, Immutable.List([]));
	}
	for (let i = 0; i < data.size; ++i) {
		console.log(data.get(i));
		const tmp = dividedData.get(i % n).insert(i % n, data.get(i));
		dividedData = dividedData.set(i % n, tmp);
	}
	return dividedData;
}

class NDP extends Foglet {
	constructor (options) {
		if (options === undefined || options.spray === undefined || options.protocol === undefined ) {
			throw new Error('Missing options', 'ndp.js');
		}
		super(options);
		this.options = options;
		this.vector = new VVwE(Number.MAX_VALUE);
		this.unicast = new Unicast(this.spray, this.protocol + '-unicast');
		this.events = new EventEmitter();
		const self = this;
		this.unicast.on('receive', (id, message) => {
			if (message.type === 'request') {
				self.execute(message.payload, message.endpoint).then(result => {
					const msg = new NDPMessage({
						type: 'answer',
						id,
						payload: result
					});
					console.log(msg);
					self.unicast.send(msg, id);
				}).catch(error => {
					console.log('Error : ' + error);
				});
			} else if (message.type === 'answer') {
				console.log('@NDP : A result received from ' + message.id);
				self.events.emit('ndp-answer', message);
			}
		});

		this.maxPeers = options.maxPeers || Number.MAX_VALUE;
	}

	/**
	 * Send queries to neighbours and emit results on ndp-answer
	 * @function
	 * @param {array} data array of element to send (query)
	 * @param {string} endpoint - Endpoint to send queries
	 * @return {promise} Return a Q promise
	 **/
	send (data, endpoint) {
		console.log(data);
		console.log(typeof data);
		const self = this;
		return Q.Promise(function (resolve, reject) {
			let queries;
			if (!data || !(queries = Immutable.fromJS(data)) ) {
				if(!queries.isList()){
						reject(new Error('Data are not typed as Array', 'ndp.js'));
				}
			}
			console.log(queries);
			try {
				const peers = self.spray.getPeers(self.maxPeers);
				// calcul des requètes à envoyer
				const users = peers.i.length /* + peers.o.length */ + 1;
				console.log('Number of neightbours : ');
				console.log(peers);
				// Répartition...
				let cpt = 0;
				const dividedData = divideData(queries, users);
				self.events.emit('ndp-receive', "hello");
				console.log("dividedData: "+ dividedData);
				if ( users !== 1 ) {
					console.log('Number of peers !== 1 : '+ users);
					for (let k = 0; k < users - 1; ++k) {
						const msg = new NDPMessage({
							type: 'request',
							id: peers.i[k],
							payload: dividedData.get(k).toJS(),
							endpoint
						});
						console.log('Send message :' + msg);
						self.unicast.send(msg, peers.i[k]);
						++cpt;
					}
					console.log(cpt);
					self.execute(dividedData.get(cpt).toJS(), endpoint).then(result => {
						const msg = new NDPMessage({
							type: 'answer',
							id: 'me',
							payload: result,
							endpoint
						});
						console.log('Execute queries : ' + msg);
						self.events.emit('ndp-receive', msg);
					}).catch(error => reject(error));
				} else {
					console.log('Number of peers === 1');
					self.execute(dividedData.get(cpt).toJS(), endpoint).then(result => {
						const msg = new NDPMessage({
							type: 'answer',
							id: 'me',
							payload: result,
							endpoint
						});
						console.log('Execute queries : ' + msg);
						self.events.emit('ndp-receive', msg);
					}).catch(error => reject(error));
				}
				resolve();
			} catch (e) {
				reject(e);
			}
		});
	}

	/**
	 * Execute queries in {data} via ldf-client to the {endpoint}
	 * @param {array} data - Queries to execute
	 * @param {string} endpoint - Endpoint to process queries
	 * @return {promise} Return a promise with results as reponse
	 */
	execute (data, endpoint) {
		this._flog(' Execution of : '+ data + ' on ' + endpoint);
		let resultat = Immutable.List();
		let finishedQuery = 0;

		return new Promise( (resolve, reject) => {
			// Convert array to Immutable.List
			try {
				data = Immutable.fromJS(data);
				console.log(data);
				const fragmentsClient = new ldf.FragmentsClient(endpoint);
				for (let i = 0; i < data.size; ++i) {
					resultat = resultat.insert(i, Immutable.List());

					let results = new ldf.SparqlIterator( 0, {fragmentsClient});
					results.on('data', ldfResult => {
						console.log(ldfResult);
						resultat[i].push(JSON.stringify(ldfResult + '\n'));
					}).on('end', () => {
						++finishedQuery;
						console.log(finishedQuery);
						if (finishedQuery >= data.size) {
							resolve(resultat.toJS());
						}
					}).catch((error) => reject(error));
				}
			} catch (error) {
				reject(error);
			}
		});
	}
}

module.exports = NDP;

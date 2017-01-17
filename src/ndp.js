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

const Immutable = require('immutable');
const VVwE = require('version-vector-with-exceptions');
const Unicast = require('unicast-definition');
const ldf = require('ldf-client');
const Foglet = require('foglet-core');

const NDPMessage = require('./ndp-message.js');

function divideData (data, n) {
	const dividedData = new Array(n);
	for (let i = 0; i < n; ++i) {
		dividedData[i] = new Array();
	}
	for (let i = 0; i < data.length; ++i) {
		dividedData[i % n][dividedData[i % n].length] = data[i];
	}
	return dividedData;
}

class NDP extends Foglet {
	constructor (options) {
		if (options === undefined || options.spray === undefined || options.protocol === undefined ) {
			throw new Error('Missing options', 'ndp.js');
		}
		super(options.spray, options.protocol, options.room);
		this.options = options;
		this.vector = new VVwE(Number.MAX_VALUE);
		this.unicast = new Unicast(this.spray, this.protocol + '-unicast');

		const self = this;
		this.unicast.on('ndp-receive', (id, message) => {
			if (message.type === 'request') {
				self.execute(message.payload).then(result => {
					const msg = new NDPMessage({
						type: 'answer',
						id,
						payload: result
					});
					console.log(msg);
					self.unicast.send(msg, id);
				}).catch(() => {
					console.log('promesse rompue');
				});
			} else if (message.type === 'answer') {
				console.log('@NDP : A result received from ' + message.id);
				self.emit('ndp-answer', message);
			}
		});

		this.maxPeers = options.maxPeers || Number.MAX_VALUE;
	}

	/**
	 * Send queries to neighbours and emit on ndp-answer results
	 * @function
	 * @param {array} data array of element to send (query)
	 * @param {string} endpoint - Endpoint to send queries
	 * @return {void}
	 **/
	send (data, endpoint) {
		if (data && Array.isArray(data)) {
			throw new Error('Data are not typed as Array', 'ndp.js');
		}

		const peers = this.spray.getPeers(this.maxPeers);

		// calcul des requètes à envoyer
		const users = peers.i.length /* + peers.o.length */ + 1;
		console.log('Number of neightbours : ');
		console.log(peers);
		// Répartition...
		const dividedData = divideData(data, users);
		const self = this;
		if ( users !== 1 ) {
			let cpt = 0;
			for (let k = 0; k < peers.i.length; ++k) {
				const msg = new NDPMessage({
					type: 'request',
					id: peers.i[k],
					payload: dividedData[cpt],
					endpoint
				});
				this.unicast.send(msg, peers.i[k]);
				cpt++;
			}
			this.execute(dividedData[cpt], endpoint).then(result => {
				const msg = new NDPMessage({
					type: 'answer',
					id: 'me',
					payload: result,
					endpoint
				});
				console.log(msg);
				self.emit('ndp-answer', msg);
			}).catch(error => self.emit('ndp-answer', error));
		} else {
			this.execute(data, endpoint).then(result => {
				const msg = new NDPMessage({
					type: 'answer',
					id: 'me',
					payload: result,
					endpoint
				});
				console.log(msg);
				self.emit('ndp-answer', msg);
			}).catch();
		}
	}

	execute (data, endpoint) {
		const resultat = Immutable.List();
		let finishedQuery = 0;

		return new Promise( (resolve, reject) => {
			// Convert array to Immutable.List
			data = Immutable.fromJs(data);
			const fragmentsClient = ldf.fragmentsClient(endpoint);
			for (let i = 0; i < data.length; ++i) {
				resultat[i] = Immutable.List();

				const results = new ldf.SparqlIterator(data[i].toJS(), {fragmentsClient});
				results.on('data', ldfResult => {
					resultat[i].push(JSON.stringify(ldfResult + '\n'));
				}).on('end', () => {
					++finishedQuery;
					console.log(finishedQuery);
					if (finishedQuery >= data.length) {
						resolve(resultat);
					}
				}).catch((error) => reject(error));
			}
		});
	}
}

module.exports = NDP;

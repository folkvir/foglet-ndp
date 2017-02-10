'use strict';
require('chai').should();
const Spray = require('spray-wrtc');
const NDP = require('../foglet-ndp.js').NDP;
const $ = require('jquery');
const endpoint = 'https://query.wikidata.org/bigdata/ldf';
const requests = [
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o } LIMIT 1',
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o } LIMIT 2',
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o } LIMIT 3',
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o } LIMIT 4',
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o } LIMIT 5',
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o } LIMIT 6',
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o } LIMIT 7',
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o } LIMIT 8',
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o } LIMIT 9',
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o } LIMIT 10'
];

describe('[LADDA]', function () {
	this.timeout(15000);
	it('Initialization', function (done) {
		$.ajax({
			url : "https://service.xirsys.com/ice",
			data : {
				ident: "folkvir",
				secret: "a0fe3e18-c9da-11e6-8f98-9ac41bd47f24",
				domain: "foglet-examples.herokuapp.com",
				application: "foglet-examples",
				room: "test",
				secure: 1
		}}).then(function(response, status){
			console.log(status);
			console.log(response);
			/**
			 * Create the foglet protocol.
			 * @param {[type]} {protocol:"chat"} [description]
			 */
			var iceServers = [];
			if(response.d.iceServers){
				iceServers = response.d.iceServers;
			}

			const f1 = new NDP({
				spray: new Spray({
					protocol: 'testNdp',
					webrtc:	{
						trickle: true,
						iceServers
					}
				}),
				room: 'test'
			});
			const f2 = new NDP({
				spray: new Spray({
					protocol: 'testNdp',
					webrtc:	{
						trickle: true,
						iceServers
					}
				}),
				room: 'test'
			});

			const f3 = new NDP({
				spray: new Spray({
					protocol: 'testNdp',
					webrtc:	{
						trickle: true,
						iceServers
					}
				}),
				room: 'test'
			});

			f1.init();
			f2.init();
			let cpt = 0;
			f1.events.on('ndp-answer', (response) => {
				console.log(response)
				cpt++;
				console.log('Number of answer : ' + cpt);
				// assert response fields
				//response.should.include.keys('type', 'id', 'schedulerId', 'payload', 'endpoint', 'query',
					//'sendQueryTime', 'receiveQueryTime', 'startExecutionTime', 'endExecutionTime', 'sendResultsTime', 'receiveResultsTime');
				// assert number of answers
				if(cpt >= 10) {
					done();
				}
			});

			f1.connection().then(() =>  {
				f3.init();
				return f2.connection();
			}).then( () => {

				return f3.connection();
			}).then( () => {
				f1.send(requests, endpoint);
			}).catch(error => {
				console.log(error)
				done(error);
			});
		});
	});
});

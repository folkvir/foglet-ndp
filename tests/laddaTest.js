'use strict';
require('chai').should();
const NDP = require('../foglet-ndp.js').NDP;
// const $ = require('jquery');
const endpoint = 'https://query.wikidata.org/bigdata/ldf';
const requests = [
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o } LIMIT 1',
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
		const f1 = new NDP({
			protocol: 'testNdp',
			webrtc:	{
				trickle: false,
				iceServers: []
			},
			room: 'test',
			verbose:true
		});
		const f2 = new NDP({
			protocol: 'testNdp',
			webrtc:	{
				trickle: false,
				iceServers: []
			},
			room: 'test',
			verbose:true
		});

		const f3 = new NDP({
			protocol: 'testNdp',
			webrtc:	{
				trickle: false,
				iceServers: []
			},
			room: 'test',
			verbose:true
		});


		let cpt = 0;
		const nbResultWantetd = 11;
		f1.events.on('ndp-answer', (response) => {
			console.log(response);
			cpt++;
			console.log('Number of answer : ' + cpt);

			if(cpt >= nbResultWantetd) {
				done();
			}
		});

		f1.init();
		f2.init();
		f3.init();

		f1.connection().then(() =>  {
			f2.connection().then( () => {
				f3.connection().then( () => {
					f1.send(requests, endpoint);
				}).catch(error => {
					done(error);
				});
			});
		});
	});
});

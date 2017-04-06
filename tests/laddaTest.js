'use strict';
require('chai').should();

localStorage.debug = 'foglet-*';

const NDP = require('../foglet-ndp.js').NDP;
// const $ = require('jquery');
let endpoint = 'https://query.wikidata.org/bigdata/ldf';
let requests = [
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
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o } LIMIT 10',
	"PREFIX foaf: <http://xmlns.com/foaf/0.1/> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> SELECT * WHERE {  ?airport a <http://dbpedia.org/ontology/Airport>; rdfs:label ?name. { ?airport <http://dbpedia.org/property/iata> 'EZE'@en. } UNION { ?airport <http://dbpedia.org/ontology/iataLocationIdentifier> 'EZE'@en. } }"
];

describe('[LADDA]', function () {
	this.timeout(30000);
	it('Workload without promise', function (done) {
		let f1 = new NDP({
			protocol: 'testNdp',
			webrtc:	{
				trickle: true,
				iceServers: []
			},
			rpsType: 'spray-wrtc',
			room: 'test',
			verbose:true
		});
		let f2 = new NDP({
			protocol: 'testNdp',
			webrtc:	{
				trickle: true,
				iceServers: []
			},
			rpsType: 'spray-wrtc',
			room: 'test',
			verbose:true
		});

		let f3 = new NDP({
			protocol: 'testNdp',
			webrtc:	{
				trickle: true,
				iceServers: []
			},
			rpsType: 'spray-wrtc',
			room: 'test',
			verbose:true
		});


		let cpt = 0;
		const nbResultWantetd = 11;
		f1.delegationProtocol.on('ndp-answer', (response) => {
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
			console.log('F1 connected');
			f2.connection().then( () => {
				console.log('F2 connected');
				f3.connection().then( () => {
					console.log('F3 connected');
					f1.send(requests, endpoint);
				}).catch(error => {
					done(error);
				});
			}).catch(error => {
				done(error);
			});
		}).catch(error => {
			done(error);
		});
	});

	it('Workload with promise', function (done) {
		let f1 = new NDP({
			protocol: 'testNdp2',
			webrtc:	{
				trickle: true,
				iceServers: []
			},
			rpsType: 'spray-wrtc',
			room: 'test2',
			verbose:true
		});
		let f2 = new NDP({
			protocol: 'testNdp2',
			webrtc:	{
				trickle: true,
				iceServers: []
			},
			rpsType: 'spray-wrtc',
			room: 'test2',
			verbose:true
		});

		let f3 = new NDP({
			protocol: 'testNdp2',
			webrtc:	{
				trickle: true,
				iceServers: []
			},
			rpsType: 'spray-wrtc',
			room: 'test2',
			verbose:true
		});


		f1.init();
		f2.init();
		f3.init();

		f1.connection().then(() =>  {
			console.log('F1 connected');
			f2.connection().then( () => {
				console.log('F2 connected');
				f3.connection().then( () => {
					console.log('F3 connected');
					f1.delegationProtocol.sendPromise(requests, endpoint, false).then( (results) => {
						assert(results.length, requests.length);
						done();
					});
				}).catch(error => {
					done(error);
				});
			}).catch(error => {
				done(error);
			});
		}).catch(error => {
			done(error);
		});
	});
});

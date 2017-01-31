'use strict';
const Spray = require('spray-wrtc');
const NDP = require('../foglet-ndp.js').NDP;
const $ = require('jquery');
const endpoint = 'https://query.wikidata.org/bigdata/ldf';
const request = [
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o . } LIMIT 10',
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o . } OFFSET 10 LIMIT 10',
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o . } OFFSET 20 LIMIT 10'
];

describe('[NDP]', function () {
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
					protocol: 'ndp',
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
					protocol: 'ndp',
					room: 'test'
				});
				f1.init();
				f2.init();
				let cpt = 0;
				f1.events.on('ndp-answer', (response) => {
					console.log(response)
					cpt++;
					if(cpt >= 2) {
						done();
					}
				});
				return f1.connection().then(status =>  {
					return f1.send(request, endpoint);
				})
		}, err => console.log(err));

	});
});

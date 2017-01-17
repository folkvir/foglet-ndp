const Spray = require('spray-wrtc');

const NDP = require('../src/ndp.js');
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
						protocol: 'test',
						webrtc:	{
							trickle: true,
							iceServers
						}
					}),
					protocol: 'test',
					room: 'test'
				});
				const f2 = new NDP({
					spray: new Spray({
						protocol: 'test',
						webrtc:	{
							trickle: true,
							iceServers
						}
					}),
					protocol: 'test',
					room: 'test'
				});
				f1.init();
				f2.init();
				f1.on('ndp-answer', (response) => {
					console.log(response)
				});
				f1.connection().then(status =>  {
					//assert(status, 'connected');
					f1.send(request, endpoint).then(() => {
						done()
					}).catch(error => done(error));
				}).catch(error => {
					console.err(error);
					done(error);
				});
		});

	});
});

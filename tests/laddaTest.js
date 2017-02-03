'use strict';
require('chai').should();
const Spray = require('spray-wrtc');
const NDP = require('../foglet-ndp.js').NDP;
const LaddaProtocol = require('../src/ladda-protocol.js');
const $ = require('jquery');
const endpoint = 'https://query.wikidata.org/bigdata/ldf';
const requests = [
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o . } LIMIT 10',
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o . } OFFSET 10 LIMIT 10',
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o . } OFFSET 20 LIMIT 10',
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o . } OFFSET 30 LIMIT 10',
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o . } OFFSET 40 LIMIT 10',
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o . } OFFSET 50 LIMIT 10',
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o . } OFFSET 60 LIMIT 10',
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o . } OFFSET 70 LIMIT 10',
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o . } OFFSET 80 LIMIT 10',
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o . } OFFSET 90 LIMIT 10'
];

describe('[LADDA]', function () {
	this.timeout(15000);
	it('Initialization', function (done) {
		$.ajax({
			url : 'https://service.xirsys.com/ice',
			data : {
				ident: 'folkvir',
				secret: 'a0fe3e18-c9da-11e6-8f98-9ac41bd47f24',
				domain: 'foglet-examples.herokuapp.com',
				application: 'foglet-examples',
				room: 'test',
				secure: 1
			}}).then(function (response, status) {
				console.log(status);
				console.log(response);
				/**
				 * Create the foglet protocol.
				 * @param {[type]} {protocol:'chat'} [description]
				 */
				let iceServers = [];
				if (response.d.iceServers) {
					iceServers = response.d.iceServers;
				}

				const f1 = new NDP({
					spray: new Spray({
						protocol: 'testLadda',
						webrtc:	{
							trickle: true,
							iceServers
						}
					}),
					room: 'testLadda',
					delegationProtocol: new LaddaProtocol()
				});
				const f2 = new NDP({
					spray: new Spray({
						protocol: 'testLadda',
						webrtc:	{
							trickle: true,
							iceServers
						}
					}),
					room: 'laddaTest',
					delegationProtocol: new LaddaProtocol()
				});
				const f3 = new NDP({
					spray: new Spray({
						protocol: 'testLadda',
						webrtc:	{
							trickle: true,
							iceServers
						}
					}),
					room: 'testLadda',
					delegationProtocol: new LaddaProtocol()
				});

				f1.init();
				f2.init();
				f3.init();

				let cpt = 0;
				f1.events.on('ndp-answer', response => {
					cpt++;
					console.log(response);
					// assert response fields
					response.should.include.keys('type', 'id', 'schedulerId', 'payload', 'endpoint', 'query',
						'sendQueryTime', 'receiveQueryTime', 'startExecutionTime', 'endExecutionTime', 'sendResultsTime', 'receiveResultsTime');
					if (response.id === 'me') {
						// for queries executed by me, (sendQueryTime = receiveQueryTime = startExecutionTime) < (endExecutionTime = sendResultsTime = receiveResultsTime)
						response.sendQueryTime.should.equal(response.receiveQueryTime);
						response.receiveQueryTime.should.equal(response.startExecutionTime);
						(response.startExecutionTime <= response.endExecutionTime).should.be.true;
						response.endExecutionTime.should.equal(response.sendResultsTime);
						response.sendResultsTime.should.equal(response.receiveResultsTime);
					} else {
						// for delegated queries , sendQueryTime < receiveQueryTime < startExecutionTime < endExecutionTime < sendResultsTime < receiveResultsTime
						(response.sendQueryTime <= response.receiveQueryTime).should.be.true;
						(response.receiveQueryTime <= response.startExecutionTime).should.be.true;
						(response.startExecutionTime <= response.endExecutionTime).should.be.true;
						(response.endExecutionTime <= response.sendResultsTime).should.be.true;
						(response.sendResultsTime <= response.receiveResultsTime).should.be.true;
					}
					if(cpt >= 10) {
						done();
					}
				});

				return f1.connection().then(() =>  {
					f1.send(requests, endpoint);
				});
			}).catch(err => console.log(err));

	});
});

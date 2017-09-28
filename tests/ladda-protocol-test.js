'use strict';
require('chai').should();

localStorage.debug = '';



const NDP = require('../foglet-ndp.js').NDP;
// const $ = require('jquery');
let endpoint = 'http://fragments.dbpedia.org/';
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
  'PREFIX foaf: <http://xmlns.com/foaf/0.1/> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> SELECT * WHERE { ?airport a <http://dbpedia.org/ontology/Airport>; rdfs:label ?name. { ?airport <http://dbpedia.org/property/iata> "EZE"@en. } UNION { ?airport <http://dbpedia.org/ontology/iataLocationIdentifier> "EZE"@en. }}'
];

describe('[LADDA]', function () {
  this.timeout(30000);
  it('Workload without promise', function (done) {

    let options = {
      verbose: true, // want some logs ? switch to false otherwise
      rps: {
        type: 'ladda-protocol-test-without-promise',
        options: {
          protocol: 'ladda-estimator-test', // foglet running on the protocol foglet-example, defined for spray-wrtc
          webrtc:	{ // add WebRTC options
            trickle: true, // enable trickle (divide offers in multiple small offers sent by pieces)
            iceServers : [] // define iceServers in non local instance
          },
          timeout: 2 * 60 * 1000, // spray-wrtc timeout before definitively close a WebRTC connection.
          delta: 2* 60 * 1000, // spray-wrtc shuffle interval
          signaling: {
            address: 'https://signaling.herokuapp.com/',
            // signalingAdress: 'https://signaling.herokuapp.com/', // address of the signaling server
            room: 'ladda-protocol-test-without-promise' // room to join
          }
        }
      }
    };

    let f1 = new NDP(options);
    let f2 = new NDP(options);
    let f3 = new NDP(options);

    let cpt = 0;
    const nbResultWantetd = requests.length;
    f3.delegationProtocol.on('ndp-answer', () => {
      cpt++;
      console.log('Number of answer : ' + cpt);

      if(cpt >= nbResultWantetd) {
        done();
      }
    });

    f1.init();
    f2.init();
    f3.init();

    f1.connection(f2).then(() =>  {
      console.log('F1 connected');
      f2.connection(f3).then( () => {
        console.log('F2 connected');
        f3.connection(f1).then( () => {
          f3.send(requests, endpoint);
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
    let options = {
      verbose: true, // want some logs ? switch to false otherwise
      rps: {
        type: 'ladda-protocol-test-with-promise',
        options: {
          protocol: 'ladda-estimator-test', // foglet running on the protocol foglet-example, defined for spray-wrtc
          webrtc:	{ // add WebRTC options
            trickle: true, // enable trickle (divide offers in multiple small offers sent by pieces)
            iceServers : [] // define iceServers in non local instance
          },
          timeout: 2 * 60 * 1000, // spray-wrtc timeout before definitively close a WebRTC connection.
          delta: 2* 60 * 1000, // spray-wrtc shuffle interval
          signaling: {
            address: 'https://signaling.herokuapp.com/',
            // signalingAdress: 'https://signaling.herokuapp.com/', // address of the signaling server
            room: 'ladda-protocol-test-with-promise' // room to join
          }
        }
      }
    };

    let f1 = new NDP(options);
    let f2 = new NDP(options);
    let f3 = new NDP(options);

    f1.init();
    f2.init();
    f3.init();

    f1.connection(f2).then(() =>  {
      console.log('F1 connected');
      f2.connection(f3).then( () => {
        console.log('F2 connected');
        f3.connection(f1).then( () => {
          console.log('F3 connected');
          f3.delegationProtocol.sendPromise(requests, endpoint, false).then( (results) => {
            results.length.should.equal(requests.length);
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

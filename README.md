# Foglet - Neighbours Delegated Protocol (NDP) [![Build Status](https://travis-ci.org/folkvir/foglet-ndp.svg?branch=master)](https://travis-ci.org/folkvir/foglet-core) [![Coverage Status](https://coveralls.io/repos/github/folkvir/foglet-ndp/badge.svg?branch=master)](https://coveralls.io/github/folkvir/foglet-ndp?branch=master) [![XirSys WebRTC Cloud Support](https://img.shields.io/badge/XirSys%20Cloud-used-blue.svg)](http://xirsys.com/)

Keywords: Simple Neighbours delegated protocol, Random peer sampling, adaptive, browser-to-browser communication, WebRTC

This project aims to provide a simple neighbours delegated protocol in order to reduce query execution time. It works with a random peer sampling protocol [1] and foglet-core [2].
It uses Linked Data Fragments [ldf](http://linkeddatafragments.org/) to query endpoints.  


## Install

```bash
npm install spray-wrtc foglet-ndp
```

## Usage

We provide a bundle for you, just add foglet-ndp.bundle.js to your html page.
The following example works like a charm and is avalaible in the folder **example/** !

!!! You need a signaling server in order to run the example, foglet-core has one, just run this : ```bash cd node_modules/foglet-core && npm run server```

```javascript
const Spray = require('spray-wrtc');
const NDP = require('foglet-ndp').NDP;

const endpoint = 'https://query.wikidata.org/bigdata/ldf';
const request = [
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o . } LIMIT 10',
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o . } OFFSET 10 LIMIT 10',
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o . } OFFSET 20 LIMIT 10'
];

const f1 = new NDP({
  spray: new Spray({
    protocol: 'test',
    webrtc:	{
      trickle: true,
      iceServers: [] //iceServers you have to provide
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
      iceServers: [] //iceServers you have to provide
    }
  }),
  protocol: 'test',
  room: 'test'
});

f1.init();
f2.init();

f1.events.on('ndp-answer', (response) => {
  console.log(response)
  done();
});

f1.connection().then(status =>  {
  return f1.send(request, endpoint).then(() => {});
});

```

## Implementing your own delegation protocol

You can create you own custom delegation protocol by extending `DelegationProtocol` and provides an instance of it when creating a new Foglet-NDP.
```javascript
const Q = require('q'); // use q promises for a better workflow
const Spray = require('spray-wrtc');
const DelegationProtocol = require('foglet-ndp').DelegationProtocol;
const NDP = require('foglet-ndp').NDP;

class DummyProtocol extends DelegationProtocol {
	send (data, endpoint) {
		return Q.Promise((resolve, reject) => {
			try {
				const peers = self.foglet.spray.getPeers(self.foglet.maxPeers);
				self.foglet.unicast.send({
					type: 'request',
					id: peers.i[0],
					payload: data,
					endpoint
				}, peers.i[0]); // send everything to the first peer
			} catch (e) {
				reject(e);
			}
		});
	}

	execute (data, endpoint) {
		console.log('Hey! I need to execute this:' + data + ' @' + endpoint);
		return Q(data);
	}
}

const f = new NDP({
  spray: new Spray({
    protocol: 'test',
    webrtc:	{
      trickle: true,
      iceServers: [] //iceServers you have to provide
    }
  }),
  protocol: 'test',
  room: 'test',
	delegationProtocol: new DummyProtocol()
});

// now use the foglet!
```

## Build the bundle

```bash
npm run build:ndp
```

## Test the library

```bash
npm test
```

## Doc

```bash
npm run doc
```

## Author

**Grall Arnaud (Folkvir)** Master student at University of Nantes

## References

[1] [Spray-wrtc](https://github.com/Chat-Wane/spray-wrtc) Chat-Wane, Spray is a random peer sampling protocol [1] inspired by both Cyclon [2] and Scamp [3]. It adapts the partial view of each member to the network size using local knowledge only. Therefore, without any configurations, each peer automatically adjust itself to the need of the network.

[2] [foglet-core](https://github.com/folkvir/foglet-core.git) Folkvir, Foglet-core is a core library in order to provide a solid infrastructure working with spray-wrtc.

[3] [ldf](http://linkeddatafragments.org/) LDF : Linked Data Fragments is a conceptual framework that provides a uniform view on all possible interfaces to RDF, by observing that each interface partitions a dataset into its own specific kind of fragments.
A Linked Data Fragment (LDF) is characterized by a specific selector (subject URI, SPARQL query, …), metadata (variable names, counts, …), and controls (links or URIs to other fragments).

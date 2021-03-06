# Foglet - Neighbours Delegated Protocol (NDP)
[![Build Status](https://travis-ci.org/RAN3D/foglet-ndp.svg?branch=master)](https://travis-ci.org/RAN3D/foglet-ndp)

Keywords: Simple Neighbours delegated protocol, Random peer sampling, adaptive, browser-to-browser communication, WebRTC

This project aims to provide a simple neighbours delegated protocol in order to reduce query execution time. It works with a random peer sampling protocol [1] and foglet-core [2].
It uses Linked Data Fragments [ldf](http://linkeddatafragments.org/) to query endpoints.  

By default it uses the Ladda Query Delegation Protocol.

## Install

```bash
npm install foglet-ndp
```

## Usage

We provide a bundle for you, just add foglet-ndp.bundle.js to your html page.
The following example works like a charm and is avalaible in the folder **example/** !

!!! You need a signaling server in order to run the example, foglet-core has one embedded, just run: ```cd node_modules/foglet-core && npm run server```

```javascript
const NDP = require('foglet-ndp').NDP;

const endpoint = 'https://query.wikidata.org/bigdata/ldf';
const request = [
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o . } LIMIT 10',
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o . } OFFSET 10 LIMIT 10',
	'PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o . } OFFSET 20 LIMIT 10'
];

const f1 = new NDP({
	protocol: 'test-protocol',
	webrtc:	{
		trickle: false,
		iceServers: [] //iceServers you have to provide
	},
  room: 'test'
});

const f2 = new NDP({
	protocol: 'test-protocol',
	webrtc:	{
		trickle: false,
		iceServers: [] //iceServers you have to provide
	},
  room: 'test'
});

f1.init();
f2.init();

f1.delegationProtocol.on('ndp-answer', (response) => {
  console.log(response)
});

f1.connection().then(status =>  {
  return f1.send(request, endpoint);
});

```

## Implementing your own delegation protocol

You can create you own custom delegation protocol by extending `DelegationProtocol` and provides an instance of it when creating a new Foglet-NDP.
```javascript
const Q = require('q'); // use q promises for a better workflow
const DelegationProtocol = require('foglet-ndp').DelegationProtocol;
const NDP = require('foglet-ndp').NDP;

class DummyProtocol extends DelegationProtocol {

	use (foglet) {
		super.use(foglet);
		// listen for incoming delegated request
		this.foglet.onUnicast((id, message) => {
			if (message.type === 'request') {
				this.execute(message.payload)
					.then(results => this.emit('ndp-answer', results))
					.catch(error => this.emit('ndp-error', error));
			}
		});
	}

	send (data, endpoint) {
		return Q.Promise((resolve, reject) => {
			try {
				const peers = self.foglet.getNeighbours();
				self.foglet.sendUnicast({
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
	protocol: 'test-protocol',
	webrtc:	{
		trickle: false,
		iceServers: [] //iceServers you have to provide
	},
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

[1] [Spray-wrtc](https://github.com/Chat-Wane/spray-wrtc) Chat-Wane, Spray is a random peer sampling protocol inspired by both Cyclon and Scamp. It adapts the partial view of each member to the network size using local knowledge only. Therefore, without any configurations, each peer automatically adjust itself to the need of the network.

[2] [foglet-core](https://github.com/folkvir/foglet-core.git) Folkvir, Foglet-core is a core library in order to provide a solid infrastructure working with spray-wrtc.

[3] [ldf](http://linkeddatafragments.org/) LDF : Linked Data Fragments is a conceptual framework that provides a uniform view on all possible interfaces to RDF, by observing that each interface partitions a dataset into its own specific kind of fragments.
A Linked Data Fragment (LDF) is characterized by a specific selector (subject URI, SPARQL query, …), metadata (variable names, counts, …), and controls (links or URIs to other fragments).

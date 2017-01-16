# Foglet - Neighbours Delegated Protocol (NDP)

Keywords: Simple Neighbours delegated protocol, Random peer sampling, adaptive, browser-to-browser communication, WebRTC

This project aims to provide a simple neighbours delegated protocol in order to reduce query execution time. It works with a random peer sampling protocol [1] and foglet-core [2].
It uses Linked Data Fragments [ldf](http://linkeddatafragments.org/) to query endpoints.  


## Install

```bash
npm install spray-wrtc foglet-ndp
```

## Build

```bash
npm run build:ndp
```

## Tests

```bash
npm run test
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

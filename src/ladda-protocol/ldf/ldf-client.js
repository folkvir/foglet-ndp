'use strict';

const Immutable = require('immutable');
const LdfClient = require('ldf-client');
const Request = require('./ldf-client-request.js')
const StatusQueue = require('../structures/status-queue.js');
const Estimator = require('../structures/estimator.js');
const debug = require('debug')('foglet-ndp:client');
const EventEmitter = require('events');

LdfClient.Logger.setLevel('warning');


class Client extends EventEmitter{
  constructor (parent = undefined, options) {
    super();
    if(!parent) throw new Error('Client need a parent to be constructed.');
    this.options = options || { verbose: false };
    this.parent = parent || undefined;
    // fragmentsClient
    this.endpoints = new Map();
    this.estimator = new Estimator({ verbose: this.options.verbose });
  }

  /**
  * Execute one query on an endpoint using ldf-client
  * @param {string} query - The query to execute
  * @param {string} endpoint - Endpoint to process queries
  * @param {LaddaProtocol} ladda ladda reference to use other function if needed;
  * @return {Promise} A Promise with results as reponse
  */
  execute (query, endpoint) {
    this.parent._log('@LADDA : Execution of : ' + query + ' on ' + endpoint);
    return new Promise((resolve, reject) => {
      this._execute(query, endpoint).then((results) => {
        resolve(results);
      }).catch(e => {
        this.endpoints.delete(endpoint); // force the client to be re-set to a new fragmentsClients because an error occured
        this._setFragmentsClient(endpoint, true);
        debug(e);
        reject(e);
      });
    });
  }

  _execute (query, endpoint) {
    let delegationResults = Immutable.List();
    return new Promise( (resolve, reject) => {
      try {
        // let fragmentsClient = new ldf.FragmentsClient(endpoint);
        const fragmentsClient = this.endpoints.get(endpoint);

        // dont forget to remove listener other than on('data')
        fragmentsClient._httpClient._statistics.events.removeAllListeners('httpResponse');
        fragmentsClient.events.removeAllListeners('error');

        let queryResults = new LdfClient.SparqlIterator(query, {fragmentsClient});

        fragmentsClient._httpClient._statistics.events.on('httpResponse', (response) => {
          // console.log('HttpResponse elapsedTime: ', response.timings.response);
          // console.log('HttpResponse timings: ', response.timings);
          this._checkFanout(response.timings.response);
        });

        fragmentsClient.events.once('error', (error, stack) => {
          debug(error, stack);
          reject({
            error,
            stack
          });
        });

        queryResults.on('data', ldfResult => {
          // this._checkFanout(fragmentsClient._httpClient._statistics.responseTime.latest);
          delegationResults = delegationResults.push(ldfResult);
        });

        queryResults.on('end', () => {
          // this._checkFanout(fragmentsClient._httpClient._statistics.responseTime.latest);
          resolve(delegationResults.toJS());
        });

        queryResults.on('error', (error, stack) => {
          debug(error, stack);
          reject({
            error,
            stack
          });
        });
      } catch (error) {
        debug(error);
        reject({error});
      }
    });
  }

  /**
  * Set the fragmentsClient for a specific endpoint if it was not initialized or force the initialization if force is set to true
  * @param {string} endpoint endpoint of the fragmentsClient
  * @param {boolean} force Force to set the endpoint
  * @return {void}
  */
  _setFragmentsClient (endpoint, force = false) {
    try {
      let fragmentsClient = this.endpoints.has(endpoint);
      if(!fragmentsClient || force) {
        this.endpoints.set(endpoint, new LdfClient.FragmentsClient(endpoint, {request: Request}));
      }
    } catch (e) {
      debug('BIG ERROR: ', e);
    }
  }

  /**
  * Check if we have the right to increase or decrease the fanout by passing a value representing a time response of a Triple pattern query.
  * @param {number} value Response time of TPQ
  * @return {void}
  */
  _checkFanout (value) {
    switch(this.estimator.estimate(value)) {
    case 1: {
      // we can increase the fanout
      this._increaseFanout();
      break;
    }
    case -1: {
      // we have to decrease, consider it as an error
      this.parent._processErrors({error: 'decrease the fanout'});
      break;
    }
    case 0: {
      // noop
      break;
    }
    default: {
      throw new Error('Estimate function return an unknown value.');
    }
    }
    this.emit('statistics', this.estimator.items);
    this.parent.emit(this.parent.signalFanoutChanged, value, this.parent.nbDestinations.value, this.parent.foglet.getNeighbours().length, this.parent.queryQueue.getQueriesByStatus(StatusQueue.STATUS_DELEGATED).count());
  }

  /**
  * increase the fanout, it take care to not be greater than the number of neighbours
  * @return {void}
  */
  _increaseFanout () {
    let oldFanout = this.parent.nbDestinations.value;
    let neighbours = this.parent.foglet.getNeighbours().length;
    let newFanout = oldFanout + 1;
    if(newFanout >= neighbours) {
      newFanout = neighbours;
    }
    this.parent.nbDestinations = newFanout;
  }
}

module.exports = Client;

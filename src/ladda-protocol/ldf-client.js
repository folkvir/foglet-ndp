'use strict';

const Immutable = require('immutable');
const ldf = require('ldf-client');
const StatusQueue = require('./structures/status-queue.js');
const Fanout = require('./estimator/fanout.js');

ldf.Logger.setLevel('WARNING');

class Client {
  constructor (parent = undefined, options) {
    if(!parent) throw new Error('Client need a parent to be constructed.');
    this.options = options || { verbose: false };
    this.parent = parent || undefined;
    // fragmentsClient
    this.endpoints = new Map();
    this.fanout = new Fanout({ verbose: this.options.verbose });
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
        fragmentsClient.events.removeAllListeners('error');
        // console.log('********************************** => FRAGMENTSCLIENT: ', fragmentsClient);
        let queryResults = new ldf.SparqlIterator(query, {fragmentsClient});

        fragmentsClient.events.once('error', (error, stack) => {
          reject({
            error,
            stack
          });
        });
        // console.log(queryResults);
        queryResults.on('data', ldfResult => {
          // this._log('@LADDA :** ON DATA EXECUTE **');
          this._checkFanout(fragmentsClient._httpClient._statistics.responseTime.latest);
          delegationResults = delegationResults.push(ldfResult);
        });
        // resolve when all results are arrived
        queryResults.on('end', () => {
          // this._log('@LADDA :** ON END EXECUTE **');
          this._checkFanout(fragmentsClient._httpClient._statistics.responseTime.latest);
          resolve(delegationResults.toJS());
        });

        queryResults.once('error', (error, stack) => {
          reject({
            error,
            stack
          });
        });
      } catch (error) {
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
    let fragmentsClient = this.endpoints.has(endpoint);
    if(!fragmentsClient || force) {
      this.endpoints.set(endpoint, new ldf.FragmentsClient(endpoint));
    }
  }

  /**
  * Check if we have the right to increase or decrease the fanout by passing a value representing a time response of a Triple pattern query.
  * @param {number} value Response time of TPQ
  * @return {void}
  */
  _checkFanout (value) {
    let estimation = this.fanout.estimate(value);

    switch(estimation.flag) {
    case 1: {
      // if(estimation.value) {
      //   this.setNbDestination(estimation.value);
      // } else {
      this._increaseFanout();
      // }
      break;
    }
    case -1: {
      // if(estimation.value) {
      //   this.setNbDestination(estimation.value);
      // } else {
      // decrease the fanout, same behavior than _processErrors
      this._processErrors({error: 'decrease the fanout'});
      // }
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
    this.parent.nbDestinations.setValue(newFanout, this.parent.enableFanoutBroadcast);
  }
}

module.exports = Client;

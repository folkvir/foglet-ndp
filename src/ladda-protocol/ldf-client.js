'use strict';

const Immutable = require('immutable');
const ldf = require('ldf-client');

ldf.Logger.setLevel('WARNING');

class Client {
  constructor (options) {
    this.options = options || {};
    // fragmentsClient
    this.endpoints = new Map();
  }

  /**
  * Execute one query on an endpoint using ldf-client
  * @param {string} query - The query to execute
  * @param {string} endpoint - Endpoint to process queries
  * @param {LaddaProtocol} ladda ladda reference to use other function if needed;
  * @return {Promise} A Promise with results as reponse
  */
  execute (query, endpoint, ladda) {
    ladda._log('@LADDA : Execution of : ' + query + ' on ' + endpoint);
    let delegationResults = Immutable.List();
    return new Promise( (resolve, reject) => {
      try {
        // let fragmentsClient = new ldf.FragmentsClient(endpoint);
        const fragmentsClient = this.endpoints.get(endpoint);
        fragmentsClient.events.removeAllListeners('error');
        // console.log('********************************** => FRAGMENTSCLIENT: ', fragmentsClient);
        let queryResults = new ldf.SparqlIterator(query, {fragmentsClient});

        fragmentsClient.events.once('error', (error, stack) => {
          this.endpoints.delete(endpoint); // force the client to be re-set to a new fragmentsClients because an error occured
          this._setFragmentsClient(endpoint, true);
          reject({
            error,
            stack
          });
        });
        // console.log(queryResults);
        queryResults.on('data', ldfResult => {
          // this._log('@LADDA :** ON DATA EXECUTE **');
          ladda.checkFanout(fragmentsClient._httpClient._statistics.responseTime.latest);
          delegationResults = delegationResults.push(ldfResult);
        });
        // resolve when all results are arrived
        queryResults.on('end', () => {
          // this._log('@LADDA :** ON END EXECUTE **');
          ladda.checkFanout(fragmentsClient._httpClient._statistics.responseTime.latest);
          resolve(delegationResults.toJS());
        });

        queryResults.once('error', (error, stack) => {
          this.endpoints.delete(endpoint); // force the client to be re-set to a new fragmentsClients because an error occured
          this._setFragmentsClient(endpoint, true);
          reject({
            error,
            stack
          });
        });
      } catch (error) {
        this.endpoints.delete(endpoint); // force the client to be re-set to a new fragmentsClients because an error occured
        this._setFragmentsClient(endpoint, true);
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
}

module.exports = Client;

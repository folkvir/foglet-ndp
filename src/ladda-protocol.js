/*
MIT License

Copyright (c) 2017 Grall Arnaud

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
'use strict';

const Q = require('q');
const Immutable = require('immutable');
const ldf = require('ldf-client');
const StatusQueue = require('./status-queue.js');
const DelegationProtocol = require('./delegation-protocol.js');
const NDPMessage = require('./ndp-message.js');
const uuidV4 = require('uuid/v4');
const moment = require('moment');
const _ = require('lodash');

// LDF LOG Disabling
// ldf.Logger.setLevel('INFO');
ldf.Logger.setLevel('WARNING');
// ldf.Logger.setLevel('DEBUG');

// status
const STATUS_WAITING = 'status_waiting';
const STATUS_DELEGATED = 'status_delegated';
const STATUS_DONE = 'status_done';
const STATUS_ERRORED = 'status_errored';

// utility to format dates in hh:mm:ss:ms
const formatTime = time => {
  const hours = time.getHours().toString(),
    min = time.getMinutes().toString(),
    sec = time.getSeconds().toString();
  let mil = time.getMilliseconds().toString();
  if(mil.length === 1) {
    mil = `00${mil}`;
  }else if (mil.length === 2) {
    mil = `0${mil}`;
  }
  return `${hours}:${min}:${sec}:${mil}`;
};

/**
 * Clone an object
 * @param  {object} obj Object to clone
 * @return {object} Object cloned
 */
function clone (obj) {
  return _.merge({}, obj);
}

/**
* Ladda delegation protocol
* @extends DelegationProtocol
* @author Arnaud Grall (Folkvir), Thomas Minier
*/
class LaddaProtocol extends DelegationProtocol {
  /**
  * Constructor
  * @param {int|undefined} nbDestinations - (optional) The number of destinations for delegation (default to 2, as in Ladda paper)
  * @param {int|undefined} timeout - (optional) The timeout used by the protocol. Disable by default unless it is set.
  */
  constructor (nbDestinations, timeout, verbose) {
    super({
      name: 'ladda',
      verbose
    });
    // this.queryQueue = Immutable.Map();
    this.queryQueue = new StatusQueue();
    this.busyPeers = Immutable.Set();
    this.isFree = true;
    this.nbDestinations = nbDestinations || 2;
    this.nbDestinationsLoop = null;
    this.timeout = timeout || 300 * 1000; // 300 secondes by default = 5 minutes
    this.maxError = 5;
    this.fanoutSet = false;

    this.workloadFinished = 'ndp-workload-finished'; // for internal use
    this.signalAnswerNdp = 'ndp-answer-internal'; // When an answer is received from our workload, for internal use

    this.signalAnswer = 'ndp-answer'; // When an answer is received from our workload for the public
    this.signalError = 'ndp-error'; // An error occurred
    this.signalFailed = 'ndp-failed'; // a query has failed to be delegated
    this.signalTimeout = 'ndp-timeout'; // Signal for timed out queries
    this.signalDelegateQuery = 'ndp-delegated'; // We are delegating a query
    this.signalDelegatedQueryExecuted = 'ndp-delegated-query-executed'; // We executed a delegated query
    this.signalFanoutSet = 'ndp-fanout-set';
    // garbageTimeout
    this.garbageTimeout = new Map();
    // fragmentsClient
    this.endpoints = new Map();

    // checking loop
    this.garbageQueries = undefined;

    this.erroredQueries = new Map();
  }

  /**
  * Send queries to neighbours and emit results on ndp-answer
  * @param {array} data array of element to send (query)
  * @param {string} endpoint - Endpoint to send queries
  * @return {promise} A Q promise
  */
  send (data, endpoint) {
    this._setFragmentsClient (endpoint, false);
    // clear queue before anything
    this.queryQueue.clear();
    this.busyPeers.clear();
    data.forEach(query => this.queryQueue.push(this._getNewUid(), query));
    return this.delegateQueries(endpoint);
  }

  /**
  * Send queries to neighbours and emit results on ndp-answer
  * @param {array} data array of element to send (query)
  * @param {string} endpoint - Endpoint to send queries
  * @param {boolean} withResults - True if you want response with query results or false, just metadata
  * @param {number} interval - Interval to check before executing waiting queries if we are free
  * @return {promise} A Q promise
  */
  sendPromise (data, endpoint, withResults = true, interval = 500, maxErrors = 5, fanoutValidity = 10000) {
    // need to get the fanout before process queries if we have neighbours();
    if(!this.fanoutSet) {
      this.on(this.signalFanoutSet, () => {
        return this._sendPromise(data, endpoint, withResults, interval, maxErrors, fanoutValidity);
      });
    } else {
      return this._sendPromise(data, endpoint, withResults, interval, maxErrors, fanoutValidity);
    }
  }

  /**
  * Bis, Send queries to neighbours and emit results on ndp-answer
  * @param {array} data array of element to send (query)
  * @param {string} endpoint - Endpoint to send queries
  * @param {boolean} withResults - True if you want response with query results or false, just metadata
  * @param {number} interval - Interval to check before executing waiting queries if we are free
  * @return {promise} A Q promise
  */
  _sendPromise (data, endpoint, withResults = true, interval = 500, maxErrors = 5, fanoutValidity = 10000) {
    return Q.Promise( (resolve) => {
      this.maxErrors = maxErrors;
      this.fanoutValidity = 10000;
      this._setFragmentsClient (endpoint, false);
      // clear queue before anything
      this.queryQueue.clear();
      this.busyPeers.clear();
      this.garbageQueries = this.initGarbageQueries(interval, endpoint);
      data.forEach(query => this.queryQueue.push(this._getNewUid(), query));
      this.delegateQueries(endpoint);
      let results = [];
      this.on(this.workloadFinished, () => {
        // Clear the Interval
        clearInterval(this.garbageQueries);
        this._log('Workload finished.');
        this._log('#Queries Done: ', this.queryQueue.done);
        this._log('#Queries Errored: ', this.queryQueue.errored);
        this._log(results);
        // clear the listener
        this.removeAllListeners(this.signalAnswerNdp);
        this.removeAllListeners(this.workloadFinished);
        resolve(results);
      });

      this.on(this.signalAnswerNdp, (response) => {

        this.systemState ('@LADDA: Answer received ! #CurrentlyDone: '+ results.length);
        if(!withResults) {
          response.payload = withResults;
        }
        results.push(response);
        // if we have no errors
        console.log('State: ', this.queryQueue.done, this.queryQueue.errored);
        if((this.queryQueue.done+this.queryQueue.errored) === data.length) {
          this.emit(this.workloadFinished, true);
        }
      });
    });
  }

  /**
  * Set the foglet used by the protocol and configure how to handle incoming messages
  * @param {NDP} foglet - The foglet used by the delegation protocol
  * @return {void}
  * @override
  */
  use (foglet) {
    super.use(foglet);
    this.foglet.options.rps.on('connected', () => {
      // ask a neighbours  its fanout
      const neigh = this.foglet.getNeighbours();
      console.log(neigh);
      if(neigh.length > 0) {
        // need to ask my neighbourhood for the fanout value
        neigh.forEach(n => {
          console.log(n);
          this.foglet.sendUnicast({ type: 'ask-fanout' }, n);
        });


      } else {
        // no neighbours we are alone, set to true
        this.fanoutSet = true;
        this.emit(this.signalFanoutSet, this.fanoutSet);
      }
    });

    const self = this;
    this.foglet.onBroadcast((message) => {
      console.log('Broadcast: ', message);
    });

    this.foglet.onUnicast((id, message) => {
      self.systemState(`@LADDA : Receive Message from ${id}`, message);
      const receiveMessageTimeDate = new Date();
      const receiveMessageTime = formatTime(receiveMessageTimeDate);
      switch (message.type) {
      case 'ask-fanout' : {
        self.systemState(`@LADDA : Someone ask for a fanout value ${id}`);
        this.foglet.sendUnicast({ type: 'answer-fanout', value: this.nbDestinations}, id);
        break;
      }
      case 'answer-fanout' : {
        self.systemState(`@LADDA : Receive fanout value: ${message.value} from ${id}`);
        this.nbDestinations = message.value;
        this.fanoutSet = true;
        this.emit(this.signalFanoutSet, this.fanoutSet);
        break;
      }
      case 'request': {
        self.systemState('@LADDA : Message: ', message);
        self.systemState('@LADDA - Peer @' + self.foglet.id + ' received a query to execute from : @' + id);
        if(self.isFree && !self.queryQueue.hasWaitingQueries()) {
          self.isFree = false;
          const query = message.payload;
          // Set if not set the fragmentsClient before to timestamp anything
          self._setFragmentsClient(message.endpoint, false);
          const startExecutionTimeDate = new Date();
          const startExecutionTime = formatTime(startExecutionTimeDate);
          // Execution of a remote query
          self.execute(query, message.endpoint).then(result => {
            self.isFree = true;
            const endExecutionTimeDate = new Date();
            const endExecutionTime = formatTime(endExecutionTimeDate);
            const executionTime = self._computeExecutionTime(startExecutionTimeDate, endExecutionTimeDate);
            const msg = new NDPMessage({
              type: 'answer',
              id: self.foglet.id,
              schedulerId: message.id,
              payload: result,
              query: query,
              qId: message.qId,
              endpoint: message.endpoint,
              startTime: message.startTime,
              sendQueryTime: message.sendQueryTime,
              receiveQueryTime: receiveMessageTime,
              startExecutionTime,
              endExecutionTime,
              executionTime,
              peerId: message.peerId
            });
            self._log(clone(msg));
            msg.sendResultsTime = formatTime(new Date());
            self.emit(this.signalDelegatedQueryExecuted, clone(msg));
            // never mind that there is a bug to send the response
            self.foglet.sendUnicast(msg, id);
            self.systemState('@LADDA : Message sent after its execution.');
          }).catch(error => {
            self.isFree = true;
            // If execution failed
            self._processErrors(error);

            try {
              self._log('@LADDA :**********************ERROR REQUEST EXECUTE DELEGATED QUERY ****************************');
              self.emit(self.signalError, '[ERROR-REQUEST-EXECUTE-DELEGATED-QUERY]' + error.toString() + '\n' + error.stack);
              self.systemState(error.toString() + '\n' + error.stack);
              self._log('@LADDA :****************************************************************************************');
              const msg = new NDPMessage({
                type: 'failed',
                id: self.foglet.id,
                payload: message.payload,
                endpoint: message.endpoint,
                qId: message.qId,
                receiveQueryTime: receiveMessageTime,
                peerId: message.peerId
              });
              self.systemState(clone(msg));
              self.emit(this.signalFailed, clone(msg));
              self.foglet.sendUnicast(msg, id);
              self._log('@LADDA : Message sent after it\'s failed. ');

            } catch (e) {
              self.emit(self.signalError, '[ERROR-REQUEST-EXECUTE-DELEGATED-QUERY]' + e.toString() + '\n' + e.stack);
              this.systemState(`[ERROR-REQUEST-EXECUTE-DELEGATED-QUERY] ${e.toString()} \n  ${e.stack}`);
            }
          });
        } else {
          self._log('@LADDA - Peer @' + self.foglet.id + ' is busy, cannot execute query ' + message.payload + ' from ' + id);
          const msg = new NDPMessage({
            type: 'failed',
            id: self.foglet.id,
            payload: message.payload,
            endpoint: message.endpoint,
            qId: message.qId,
            receiveQueryTime: receiveMessageTime,
            peerId: message.peerId
          });
          self.systemState(clone(msg));
          self.emit(this.signalFailed, clone(msg));
          try {
            self.foglet.sendUnicast(msg, id);
          } catch (e) {
            self.emit(self.signalError, '[ERROR-REQUEST-BUSY-PEER]' + e.toString() + '\n' + e.stack);
            this.systemState(`[ERROR-REQUEST-BUSY-PEER] ${e.toString()} \n  ${e.stack}`);
          }
        }
        break;
      }
      case 'answer': {
        self.systemState('@LADDA : Received an answer from @' + message.id);
        if(self.queryQueue.getStatus(message.qId) === STATUS_DELEGATED || self.queryQueue.getStatus(message.qId) === STATUS_WAITING) {
          self.queryQueue.setDone(message.qId);
          message.receiveResultsTime = receiveMessageTime;
          message.globalExecutionTime = self._computeGlobalExecutionTime(message.sendQueryTime, receiveMessageTimeDate);
          self.emit(self.signalAnswerNdp, clone(message));
          self.emit(self.signalAnswer, clone(message));
        }
        // clear the timeout
        self._clearTimeout(message.qId);
        self.busyPeers = this.busyPeers.delete(message.peerId);
        // retry at any case
        self.systemState('Retry delegateQueries');
        self.delegateQueries(message.endpoint);
        break;
      }
      case 'failed': {
        if(self.queryQueue.getStatus(message.qId) === STATUS_DELEGATED || self.queryQueue.getStatus(message.qId) === STATUS_WAITING) {
          self.queryQueue.setWaiting(message.qId);
          self.systemState('@LADDA : failed query from @' + message.id);
          self.emit(this.signalFailed, clone(message));
        }
        self._clearTimeout(message.qId);
        self.busyPeers = self.busyPeers.delete(message.peerId);

        // retry only if we are free
        if(self.isFree) {
          self.systemState('Retry delegateQueries');
          self.delegateQueries(message.endpoint);
        }
        break;
      }
      default:
        break;
      }

    });
  }

  /**
  * Perform delegation using Ladda algorithm
  * @param {string} endpoint - The LDF-server on which queries will be evaluated
  * @return {Q.Promise} A Q Promise fullfilled when delegation is complete
  */
  delegateQueries (endpoint) {
    this.systemState('@LADDA - beginning delegation');
    const self = this;
    return Q.Promise((resolve, reject) => {
      try {
        if (self.queryQueue.hasWaitingQueries()) {
          this.systemState('@LADDA - queue not empty, try to delegate to me first');
          if (self.isFree) {
            this.systemState('@LADDA - Peer @' + self.foglet.id + ' (client) will execute one query');
            const query = self.queryQueue.first();
            self.isFree = false;
            this.systemState('@LADDA - Selected query:' + query.query);
            self.queryQueue.setDelegated(query.id);
            const startExecutionTimeDate = new Date();
            const startExecutionTime = formatTime(startExecutionTimeDate);
            self.execute(query.query, endpoint).then(result => {
              if(self.queryQueue.getStatus(query.id) !== STATUS_DONE ) {
                self.queryQueue.setDone(query.id);
                const endExecutionTimeDate = new Date();
                const endExecutionTime = formatTime(endExecutionTimeDate);
                const executionTime = self._computeExecutionTime(startExecutionTimeDate, endExecutionTimeDate);
                const msg = new NDPMessage({
                  type: 'answer',
                  id: 'me',
                  schedulerId: 'me',
                  payload: result,
                  query: query.query,
                  qId: query.id,
                  endpoint,
                  sendQueryTime: startExecutionTime,
                  receiveQueryTime: startExecutionTime,
                  startExecutionTime,
                  endExecutionTime,
                  sendResultsTime: endExecutionTime,
                  receiveResultsTime: endExecutionTime,
                  executionTime,
                  globalExecutionTime: executionTime
                });
                self.systemState('@LADDA - client finished query');
                self.emit(self.signalAnswerNdp, clone(msg));
                self.emit(this.signalAnswer, clone(msg));
              }
              self.isFree = true;
              // // retry delegation if there's queries in the queue
              if(self.isFree && self.queryQueue.hasWaitingQueries()) self.delegateQueries(endpoint);
            }).catch(error => {
              // anyway process error
              self._processErrors(error);

              if(self.queryQueue.getStatus(query.id) !== STATUS_DONE) {
                self.queryQueue.setWaiting(query.id);
                self._log('@LADDA :**********************ERROR:EXECUTE-AT-ME****************************');
                self.systemState(error.toString() + '\n' + error.stack);
                self.systemState('@LADDA - [ERROR:EXECUTE-AT-ME] : ' + error.toString() + '\n' + error.stack);
                self.emit(self.signalError, '[ERROR:EXECUTE-AT-ME] ' + error.toString() + '\n' + error.stack);
                self._log('@LADDA :*********************************************************************');
                // finally check if the query is errored;
                self._checkErroredQueries(query.id, true);
              }
              self.isFree = true;
              // // retry delegation if there's queries in the queue
              if(self.isFree && self.queryQueue.hasWaitingQueries()) self.delegateQueries(endpoint);
            });
          }
          self._log('@LADDA - trying to delegate to peers');
          if (self.queryQueue.hasWaitingQueries()) {
            // delegate queries to peers
            const peers = self._choosePeers();
            this.systemState('@LADDA - chosen peers: ' + peers);
            peers.forEach(peer => {
              if (self.queryQueue.hasWaitingQueries()) {
                const query = self.queryQueue.first();
                self.systemState('@LADDA - delegate ' + query.query + ' to peer @' + peer);
                self.queryQueue.setDelegated(query.id);
                // mark the peer as 'busy'
                self.busyPeers = self.busyPeers.add(peer);
                const sendQueryTime = formatTime(new Date());
                const m = new NDPMessage({
                  type: 'request',
                  id: self.foglet.id,
                  payload: query.query,
                  qId: query.id,
                  endpoint,
                  sendQueryTime,
                  peerId: peer
                });
                self.emit(this.signalDelegateQuery, clone(m));
                try {
                  self.foglet.sendUnicast(m, peer);
                } catch (e) {
                  this.systemState(`@LADDA : **** MESSAGE CANNOT BE SENT TO ${peer} **** \n ${e.stack} \n ${e.toString()} `);
                  self.busyPeers = self.busyPeers.delete(peer);
                  self._clearTimeout(query.id);
                }
                // set timeout if necessary
                if (self.timeout > 0) {
                  this.garbageTimeout.set(query.id,  setTimeout(() => {
                    this.systemState('@LADDA :********************** TIMEOUT TRIGGERED ****************************');
                    if(self.queryQueue.getStatus(query.id) === STATUS_DELEGATED) {
                      this.systemState('@LADDA :********************** TIMEOUT TRIGGERED: query is delegated ****************************');
                      self.emit(self.signalTimeout, query);
                      self.queryQueue.setWaiting(query.id);
                    } else {
                      this.systemState('@LADDA :********************** TIMEOUT TRIGGERED: query is already done ****************************');
                    }
                    self.busyPeers = self.busyPeers.delete(peer);
                    self.delegateQueries(endpoint);
                  }, self.timeout));
                }
              }
            });
          }
        }
        this.systemState('@LADDA - SYSTEM STATE AT DELEGATION DONE');
        resolve('delegation done');
      } catch (error) {
        this._log('@LADDA :**********************ERROR-DELEGATE-FUNCTION****************************');
        self.isFree = true;
        this.systemState(error.toString() + '\n' + error.stack);
        this.systemState('@LADDA [ERROR-DELEGATE-FUNCTION] : ' + error.toString() + '\n' + error.stack);
        self.emit(self.signalError, '[ERROR-DELEGATE-FUNCTION] ' + error.toString() + '\n' + error.stack);
        self._log('@LADDA :*******************************************************');
        reject(error);
      }
    });
  }

  /**
  * Execute one query on an endpoint using ldf-client
  * @param {string} query - The query to execute
  * @param {string} endpoint - Endpoint to process queries
  * @return {Promise} A Promise with results as reponse
  */
  execute (query, endpoint) {
    this._log('@LADDA : Execution of : ' + query + ' on ' + endpoint);
    let delegationResults = Immutable.List();
    const self = this;
    return Q.Promise( (resolve, reject) => {
      try {
        // let fragmentsClient = new ldf.FragmentsClient(endpoint);
        const fragmentsClient = self.endpoints.get(endpoint);
        fragmentsClient.events.removeAllListeners('error');
        // console.log('********************************** => FRAGMENTSCLIENT: ', fragmentsClient);
        let queryResults = new ldf.SparqlIterator(query, {fragmentsClient});

        // fragmentsClient._httpClient.on('error', function (error) {
        //   self._log('@LADDA :**********************ERROR-FRAGMENTSCLIENT****************************');
        //   this.systemState('@LADDA :[ERROR-FRAGMENTSCLIENT] ' + error.toString() + '\n' + error.stack);
        //   self.emit(self.signalError, '[ERROR-FRAGMENTSCLIENT] ' + error.toString() + '\n' + error.stack);
        //   self._log('@LADDA :*******************************************************');
        //   self.endpoints.delete(endpoint); // force the client to be re-set to a new fragmentsClients because an error occured
        //   self._setFragmentsClient(endpoint, true);
        //   reject(error);
        // })
        // fragmentsClient.logger.event.once('error', function (error) {
        //   self._log('@LADDA :**********************ERROR-FRAGMENTSCLIENT****************************');
        //   this.systemState('@LADDA :[ERROR-FRAGMENTSCLIENT] ' + error.toString() + '\n' + error.stack);
        //   self.emit(self.signalError, '[ERROR-FRAGMENTSCLIENT] ' + error.toString() + '\n' + error.stack);
        //   self._log('@LADDA :*******************************************************');
        //   self.endpoints.delete(endpoint); // force the client to be re-set to a new fragmentsClients because an error occured
        //   self._setFragmentsClient(endpoint, true);
        //   reject(error);
        // });
        //
        fragmentsClient.events.once('error', (error, stack) => {
          console.log('FragmentsClientLADDA: ', error, stack);
          self._log('@LADDA :**********************ERROR-SPARQLITERATOR****************************');
          console.log('QueryResultsError: ', error, stack);
          this.systemState('@LADDA :[ERROR-SPARQLITERATOR] ' + error.toString() + '\n' + error.stack);
          self.emit(self.signalError, '[ERROR-SPARQLITERATOR] ' + error.toString() + '\n' + error.stack);
          self._log('@LADDA :*******************************************************');
          self.endpoints.delete(endpoint); // force the client to be re-set to a new fragmentsClients because an error occured
          self._setFragmentsClient(endpoint, true);
          reject({
            error,
            stack
          });
        });
        // console.log(queryResults);
        queryResults.on('data', ldfResult => {
          // self._log('@LADDA :** ON DATA EXECUTE **');
          delegationResults = delegationResults.push(ldfResult);
        });
        // resolve when all results are arrived
        queryResults.on('end', () => {
          // self._log('@LADDA :** ON END EXECUTE **');
          resolve(delegationResults.toJS());
        });

        queryResults.once('error', (error, stack) => {
          self._log('@LADDA :**********************ERROR-SPARQLITERATOR****************************');
          console.log('QueryResultsError: ', error, stack);
          self.systemState('@LADDA :[ERROR-SPARQLITERATOR] ' + error.toString() + '\n' + error.stack);
          self.emit(self.signalError, '[ERROR-SPARQLITERATOR] ' + error.toString() + '\n' + error.stack);
          self._log('@LADDA :*******************************************************');
          self.endpoints.delete(endpoint); // force the client to be re-set to a new fragmentsClients because an error occured
          self._setFragmentsClient(endpoint, true);
          reject({
            error,
            stack
          });
        });
      } catch (error) {
        self._log('@LADDA :**********************ERROR-EXECUTE****************************');
        self.systemState('@LADDA :[ERROR-EXECUTE] ' + error.toString() + '\n' + error.stack);
        self.emit(self.signalError, '[ERROR-EXECUTE] ' + error.toString() + '\n' + error.stack);
        self._log('@LADDA :*******************************************************');
        self.endpoints.delete(endpoint); // force the client to be re-set to a new fragmentsClients because an error occured
        self._setFragmentsClient(endpoint, true);
        reject({error});
      }
    });
  }

  /** ***********************
   * *** UTILITY FUNTIONS ***
   * ************************
   */

/**
 * Process errors to adjust the fanout or just do some work on errors
 * @param {object} error Error formated as { error:object, stack:object}
 * @return {void}
 */
  _processErrors (error) {
    console.log(error);
    if(error && error.error) {
      console.log(error.error, error.stack);
      // reduce the fanout in any case
      if(this.nbDestinations > 0) {
        this.nbDestinations--;
        // now broadcast the new fanout to the whole network
        this.foglet.sendBroadcast({
          type: 'ndp-new-fanout',
          value: this.nbDestinations
        });
        console.log('New fanout: ', this.nbDestinations);
      }
    }
  }
   /**
    * Check if a queries is errored or not and if maxErrors is exceeded set to errored
    * @param {string} id Id of the query
    * @param {boolean} errored If true increase the number of errors for the query
    * @return {void}
    */
  _checkErroredQueries (id, errored = false) {
    const find = this.erroredQueries.has(id);
    if(!find) {
      this.erroredQueries.set(id, 0);
    }
    // if we want to set the query to errored, error + 1
    // console.log('QueryBefore: ', id, this.erroredQueries.get(id));
    if (errored) {
      this.erroredQueries.set(id, this.erroredQueries.get(id) + 1);
    }
    // if maxErrors exceeded set to errors
    if(this.erroredQueries.get(id) >= this.maxErrors) this.queryQueue.setErrored(id);
    // console.log('QueryAfter: ', id, this.erroredQueries.get(id));
  }


  /**
   * Clear a timeout specified by its id if it exists in garbageTimeout Map.
   * @param {number} timeoutId Id of the timeout
   * @return {void}
   */
  _clearTimeout (timeoutId) {
    let time = this.garbageTimeout.has(timeoutId);
    if(time) {
      this.systemState ('@LADDA: Timeout cleared for: '+ timeoutId);
      clearTimeout(this.garbageTimeout.get(timeoutId));
    }
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
      this.systemState ('@LADDA: Fragments Client reset for: '+ endpoint);
      this.endpoints.set(endpoint, new ldf.FragmentsClient(endpoint));
    }
  }

  /**
  * Generate and return  a v4 UUID (random) based on uuid npm package
  * @return {string} uuidv4
  */
  _getNewUid () {
    return uuidV4();
  }

  /**
   * Log a message with specific informations of the system state
   * @param {string} message String Message to log
   * @return {void}
   */
  systemState (message) {
    this._log(`@LADDA - SYSTEM STATE:
      Message: ${message}

      #Free: ${this.isFree} \n
      #BusyPeers:${this.busyPeers.count()}, \n
      #WaitingQueries:${this.queryQueue.getQueriesByStatus(STATUS_WAITING).count()}, \n
      #DoneQueries: ${this.queryQueue.getQueriesByStatus(STATUS_DONE).count()}, \n
      #DelegatedQueries: ${this.queryQueue.getQueriesByStatus(STATUS_DELEGATED).count()} \n
      #ErroredQueries: ${this.queryQueue.getQueriesByStatus(STATUS_ERRORED).count()} \n`
    );
  }

  /**
   * Init the Interval which will check if there is no waiting queries. Removed when we have fully fullfilled the send promise
   * @param {time} time time in milliseconds of the loop
   * @param {string} endpoint Endpoint needed for the delegateQueries function
   * @return {number} ID of the Interval
   */
  initGarbageQueries (time, endpoint) {
    return setInterval(() => {
      // Check we have no waiting queries and if we are free and we have waiting queries, process them
      if(this.queryQueue.hasWaitingQueries() && this.isFree) {
        this.systemState('[CHECKING-LOOP] We have waiting queries and we are free ! Need to do something...');
        this.delegateQueries(endpoint);
      } else {
        if(this.queryQueue.done + this.queryQueue.errored === this.queryQueue.count()) {
          this.emit(this.workloadFinished, true);
        } else {
          this.systemState('[CHECKING-LOOP] No queries to process or we are busy');
        }
      }
    }, time);
  }

  /**
   * Compute the execuion time between start and end.
   * @param {time} start getTime() of a (new Date) representing the beginning of the execution
   * @param {time} end getTime() of a (new Date) representing the end of the executio
   * @return {time} Time in milliseconds of the execution
   */
  _computeExecutionTime (start, end) {
    const s = moment.duration(start.getTime());
    const e = moment.duration(end.getTime());
    return e.subtract(s).asMilliseconds();
  }

  /**
   * Compute the global execuion time between start and end.
   * @param {time} start getTime() of a (new Date) representing the beginning of the global execution
   * @param {time} end getTime() of a (new Date) representing the end of the global execution
   * @return {time} Time in milliseconds of the execution
   */
  _computeGlobalExecutionTime (start, end) {
    // start is a formated date, end is a Date
    return this._computeExecutionTime(this._toDate(start), end);
  }

  /**
   * Return a date from a string representation
   * @param {string} date String date representation
   * @return {date} Return the custom date specified by its string representation
   */
  _toDate (date) {
    let d = new Date();
    const split = date.split(':');
    d.setHours(split[0]);
    d.setMinutes(split[1]);
    d.setSeconds(split[2]);
    d.setMilliseconds(split[3]);
    return d;
  }

  /**
  * Choose non-busy peers fro query delegation
  * @return {Immutable.Set} A set of peers selected for delegation
  */
  _choosePeers () {
    let chosenPeers = Immutable.Set();
    let _peers = Immutable.Set();
    // gather non-busy peers
    _peers = _peers.union(this.foglet.getNeighbours());
    _peers = _peers.subtract(this.busyPeers).toList();
    let index = 0;
    // random selection beytween non-busy peers (as in LADDA algorithm)
    // MAXIMUM nbDestinations parallel query
    if(this.busyPeers.count() < this.nbDestinations) {
      while( (chosenPeers.count() < (this.nbDestinations - this.busyPeers.count())) && (_peers.count() > 0)) {
        index = this._randomInt(0, _peers.count());
        chosenPeers = chosenPeers.add(_peers.get(index));
        _peers = _peers.remove(index);
      }
    }
    return chosenPeers;
  }

  /**
  * Pick a random int between two values
  * @param {int} min - The lower bound
  * @param {int} max - The upper bound (excluded)
  * @return {int} A random int between min and max (excluded)
  */
  _randomInt (min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min;
  }
}

module.exports = LaddaProtocol;

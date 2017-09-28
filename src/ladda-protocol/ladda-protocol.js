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
// Packages
const Immutable = require('immutable');
const lmerge = require('lodash.merge');
// Files
const DelegationProtocol = require('./../delegation-protocol.js');
const StatusQueue = require('./structures/status-queue.js');
const NDPMessage = require('./structures/ndp-message.js');
const TRSFanout = require('./structures/trs-fanout.js');
const LDFClient = require('./ldf-client.js');
const Utils = require('./utils.js');


/**
* Ladda delegation protocol
* @extends DelegationProtocol
* @author Arnaud Grall (Folkvir), Thomas Minier
*/
class LaddaProtocol extends DelegationProtocol {
  constructor (options) {
    let opts = lmerge({
      name: 'ladda',
      verbose: true,
      nbDestinations: 0,
      timeout: 10000
    }, options);
    super(opts);
    this.opts = opts;

    this.isFree = true;
    this.timeout = this.opts.timeout || 300 * 1000; // 300 secondes by default = 5 minutes
    this.maxError = this.opts.maxErrors || 5;
    // define a total replicated structure (or not if not specified in the setter)
    this.enableFanoutBroadcast = this.opts.enableFanoutBroadcast || false;

    /**
     * Internbal use
     */
    this.workloadFinished = 'ndp-workload-finished'; // for internal use
    this.signalAnswerNdp = 'ndp-answer-internal'; // When an answer is received from our workload, for internal use

    /**
     * External signal
     */
    this.signalAnswer = 'ndp-answer'; // When an answer is received from our workload for the public
    this.signalError = 'ndp-error'; // An error occurred
    this.signalFailed = 'ndp-failed'; // a query has failed to be delegated
    this.signalTimeout = 'ndp-timeout'; // Signal for timed out queries
    this.signalDelegateQuery = 'ndp-delegated'; // We are delegating a query
    this.signalDelegatedQueryExecuted = 'ndp-delegated-query-executed'; // We executed a delegated query
    this.signalFanoutChanged = 'ndp-fanout-changed';

  }

  /**
  * Send queries to neighbours and emit results on ndp-answer
  * @param {array} data array of element to send (query)
  * @param {string} endpoint - Endpoint to send queries
  * @param {number} interval Time between each checking step of non processed queries, usefull when your program has completely crashed and you want to continue to processed queries
  * @param {number} maxErrors The number of acceptable errored queries
  * @return {promise} A promise
  */
  send (data, endpoint, interval = 500, maxErrors = 5) {
    this.maxErrors = maxErrors;
    this.client._setFragmentsClient (endpoint, false);
    // clear queue before anything
    this.queryQueue.clear();
    this.busyPeers.clear();
    this.garbageQueries = this.initGarbageQueries(interval, endpoint);
    data.forEach(query => this.queryQueue.push(Utils.getNewUid(), query));
    return this.delegateQueries(endpoint);
  }

  /**
  * Send queries to neighbours and emit results on ndp-answer
  * @param {array} data array of element to send (query)
  * @param {string} endpoint - Endpoint to send queries
  * @param {boolean} withResults - True if you want response with query results or false, just metadata
  * @param {number} interval Time between each checking step of non processed queries, usefull when your program has completely crashed and you want to continue to processed queries
  * @param {number} maxErrors The number of acceptable errored queries
  * @return {promise} A promise
  */
  sendPromise (data, endpoint, withResults = true, interval = 500, maxErrors = 5) {
    return new Promise( (resolve) => {
      this.maxErrors = maxErrors;
      this.client._setFragmentsClient (endpoint, false);
      // clear queue before anything
      this.queryQueue.clear();
      this.busyPeers.clear();
      this.garbageQueries = this.initGarbageQueries(interval, endpoint);
      data.forEach(query => this.queryQueue.push(Utils.getNewUid(), query));
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

    this.nbDestinations = new TRSFanout(this.foglet, 'trs-fanout-nbdestinations', this.opts.nbDestinations);
    // this.queryQueue = Immutable.Map();
    this.queryQueue = new StatusQueue();
    this.busyPeers = Immutable.Set();
    // garbageTimeout
    this.garbageTimeout = new Map();
    // checking loop
    this.garbageQueries = undefined;
    this.erroredQueries = new Map();
    // LDF client, here TPF
    this.client = new LDFClient(this, this.opts);

    this.foglet.onUnicast((id, message) => {
      this.systemState(`@LADDA : Receive Message from ${id}`, message);
      const receiveMessageTimeDate = new Date();
      const receiveMessageTime = Utils.formatTime(receiveMessageTimeDate);
      switch (message.type) {
      case 'request': {
        this.systemState('@LADDA : Message: ', message);
        this.systemState('@LADDA - Peer @' + this.foglet._id + ' received a query to execute from : @' + id);
        if(this.isFree && !this.queryQueue.hasWaitingQueries()) {
          this.isFree = false;
          const query = message.payload;
          // Set if not set the fragmentsClient before to timestamp anything
          this.client._setFragmentsClient(message.endpoint, false);
          const startExecutionTimeDate = new Date();
          const startExecutionTime = Utils.formatTime(startExecutionTimeDate);
          // Execution of a remote query
          this.client.execute(query, message.endpoint).then(result => {
            this.isFree = true;
            const endExecutionTimeDate = new Date();
            const endExecutionTime = Utils.formatTime(endExecutionTimeDate);
            const executionTime = Utils.computeExecutionTime(startExecutionTimeDate, endExecutionTimeDate);
            const msg = new NDPMessage({
              type: 'answer',
              id: this.foglet._id,
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
            this._log(Utils.clone(msg));
            msg.sendResultsTime = Utils.formatTime(new Date());
            this.emit(this.signalDelegatedQueryExecuted, Utils.clone(msg));
            // never mind that there is a bug to send the response
            this.foglet.sendUnicast(id, msg);
            this.systemState('@LADDA : Message sent after its execution.');
          }).catch(error => {
            this.isFree = true;
            // If execution failed
            this._processErrors(error);

            try {
              this.systemState(error.toString() + '\n' + error.stack);
              const msg = new NDPMessage({
                type: 'failed',
                id: this.foglet._id,
                payload: message.payload,
                endpoint: message.endpoint,
                qId: message.qId,
                receiveQueryTime: receiveMessageTime,
                peerId: message.peerId
              });
              this.systemState(Utils.clone(msg));
              this.emit(this.signalFailed, Utils.clone(msg));
              this.foglet.sendUnicast(id, msg);
              this._log('@LADDA : Message FAILED sent after it\'s failed. ');

            } catch (e) {
              this.systemState(`[ERROR-REQUEST-EXECUTE-DELEGATED-QUERY] ${e.toString()} \n  ${e.stack}`);
            }
          });
        } else {
          this._log('@LADDA - Peer @' + this.foglet._id + ' is busy, cannot execute query ' + message.payload + ' from ' + id);
          const msg = new NDPMessage({
            type: 'failed',
            id: this.foglet._id,
            payload: message.payload,
            endpoint: message.endpoint,
            qId: message.qId,
            receiveQueryTime: receiveMessageTime,
            peerId: message.peerId
          });
          this.systemState(Utils.clone(msg));
          this.emit(this.signalFailed, Utils.clone(msg));
          try {
            this.foglet.sendUnicast(id, msg);
          } catch (e) {
            this.emit(this.signalError, '[ERROR-REQUEST-BUSY-PEER]' + e.toString() + '\n' + e.stack);
            this.systemState(`[ERROR-REQUEST-BUSY-PEER] ${e.toString()} \n  ${e.stack}`);
          }
        }
        break;
      }
      case 'answer': {
        this.systemState('@LADDA : Received an answer from @' + message.id);
        if(this.queryQueue.getStatus(message.qId) === StatusQueue.STATUS_ERRORED || this.queryQueue.getStatus(message.qId) === StatusQueue.STATUS_DELEGATED || this.queryQueue.getStatus(message.qId) === StatusQueue.STATUS_WAITING) {
          // in case we received an answer for a query that is errored for us
          this.queryQueue.setDone(message.qId);
          message.receiveResultsTime = receiveMessageTime;
          message.globalExecutionTime = Utils.computeGlobalExecutionTime(message.sendQueryTime, receiveMessageTimeDate);
          this.emit(this.signalAnswerNdp, Utils.clone(message));
          this.emit(this.signalAnswer, Utils.clone(message));
        }
        // clear the timeout
        this._clearTimeout(message.qId);
        this.busyPeers = this.busyPeers.delete(message.peerId);
        // retry at any case
        this.systemState('Retry delegateQueries');
        this.delegateQueries(message.endpoint);
        break;
      }
      case 'failed': {
        if(this.queryQueue.getStatus(message.qId) === StatusQueue.STATUS_DELEGATED || this.queryQueue.getStatus(message.qId) === StatusQueue.STATUS_WAITING) {
          this.queryQueue.setWaiting(message.qId);
          this.systemState('@LADDA : failed query from @' + message.id);
          this.emit(this.signalFailed, Utils.clone(message));
        }
        this._clearTimeout(message.qId);
        this.busyPeers = this.busyPeers.delete(message.peerId);

        // retry only if we are free
        if(this.isFree) {
          this.systemState('Retry delegateQueries');
          this.delegateQueries(message.endpoint);
        }
        break;
      }
      default: {
        break;
      }
      } // end switch
    });
  }

  /**
  * Perform delegation using Ladda algorithm
  * @param {string} endpoint - The LDF-server on which queries will be evaluated
  * @return {Q.Promise} A Q Promise fullfilled when delegation is complete
  */
  delegateQueries (endpoint) {
    this.systemState('@LADDA - beginning delegation');
    return new Promise((resolve, reject) => {
      try {
        if (this.queryQueue.hasWaitingQueries()) {
          this.systemState('@LADDA - queue not empty, try to delegate to me first');
          if (this.isFree) {
            this.systemState('@LADDA - Peer @' + this.foglet._id + ' (client) will execute one query');
            const query = this.queryQueue.first();
            this.isFree = false;
            this.systemState('@LADDA - Selected query:' + query.query);
            this.queryQueue.setDelegated(query.id);
            const startExecutionTimeDate = new Date();
            const startExecutionTime = Utils.formatTime(startExecutionTimeDate);
            this.client.execute(query.query, endpoint).then(result => {
              if(this.queryQueue.getStatus(query.id) !== StatusQueue.STATUS_DONE ) {
                this.queryQueue.setDone(query.id);
                const endExecutionTimeDate = new Date();
                const endExecutionTime = Utils.formatTime(endExecutionTimeDate);
                const executionTime = Utils.computeExecutionTime(startExecutionTimeDate, endExecutionTimeDate);
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
                this.systemState('@LADDA - client finished query');
                this.emit(this.signalAnswerNdp, Utils.clone(msg));
                this.emit(this.signalAnswer, Utils.clone(msg));
              }
              this.isFree = true;
              // // retry delegation if there's queries in the queue
              if(this.isFree && this.queryQueue.hasWaitingQueries()) this.delegateQueries(endpoint);
            }).catch(error => {
              // anyway process error
              if(this.queryQueue.getStatus(query.id) !== StatusQueue.STATUS_DONE) {
                this.queryQueue.setWaiting(query.id);
                this._log('@LADDA :**********************ERROR:EXECUTE-AT-ME****************************');
                this.systemState(error.toString() + '\n' + error.stack);
                this.systemState('@LADDA - [ERROR:EXECUTE-AT-ME] : ' + error.toString() + '\n' + error.stack);
                this.emit(this.signalError, '[ERROR:EXECUTE-AT-ME] ' + error.toString() + '\n' + error.stack);
                this._log('@LADDA :*********************************************************************');
                // finally check if the query is errored;
                this._checkErroredQueries(query.id, true);
                // adjust the fanout cause we have an error (in a catch)
                this._processErrors(error);
              }
              this.isFree = true;
              // retry delegation if there's queries in the queue
              if(this.isFree && this.queryQueue.hasWaitingQueries()) this.delegateQueries(endpoint);
            });
          }
          this._log('@LADDA - trying to delegate to peers');
          if (this.queryQueue.hasWaitingQueries()) {
            // delegate queries to peers
            const peers = this._choosePeers();
            this.systemState('@LADDA - chosen peers: ' + peers);
            peers.forEach(peer => {
              if (this.queryQueue.hasWaitingQueries()) {
                const query = this.queryQueue.first();
                this.systemState('@LADDA - delegate ' + query.query + ' to peer @' + peer);
                this.queryQueue.setDelegated(query.id);
                // mark the peer as 'busy'
                this.busyPeers = this.busyPeers.add(peer);
                const sendQueryTime = Utils.formatTime(new Date());
                const m = new NDPMessage({
                  type: 'request',
                  id: this.foglet._id,
                  payload: query.query,
                  qId: query.id,
                  endpoint,
                  sendQueryTime,
                  peerId: peer
                });
                this.emit(this.signalDelegateQuery, Utils.clone(m));
                try {
                  this.foglet.sendUnicast(peer, m);
                } catch (e) {
                  this.systemState(`@LADDA : **** MESSAGE CANNOT BE SENT TO ${peer} **** \n ${e.stack} \n ${e.toString()} `);
                  this.busyPeers = this.busyPeers.delete(peer);
                  this._clearTimeout(query.id);
                }
                // set timeout if necessary
                if (this.timeout > 0) {
                  this.garbageTimeout.set(query.id,  setTimeout(() => {
                    this.systemState('@LADDA :********************** TIMEOUT TRIGGERED ****************************');
                    if(this.queryQueue.getStatus(query.id) === StatusQueue.STATUS_DELEGATED) {
                      this.systemState('@LADDA :********************** TIMEOUT TRIGGERED: query is delegated ****************************');
                      this.emit(this.signalTimeout, query);
                      this.queryQueue.setWaiting(query.id);
                    } else {
                      this.systemState('@LADDA :********************** TIMEOUT TRIGGERED: query is already done ****************************');
                    }
                    this.busyPeers = this.busyPeers.delete(peer);
                    this.delegateQueries(endpoint);
                  }, this.timeout));
                }
              }
            });
          }
        }
        this.systemState('@LADDA - SYSTEM STATE AT DELEGATION DONE');
        resolve('delegation done');
      } catch (error) {
        this._log('@LADDA :**********************ERROR-DELEGATE-FUNCTION****************************');
        this.isFree = true;
        this.systemState(error.toString() + '\n' + error.stack);
        this.systemState('@LADDA [ERROR-DELEGATE-FUNCTION] : ' + error.toString() + '\n' + error.stack);
        this.emit(this.signalError, '[ERROR-DELEGATE-FUNCTION] ' + error.toString() + '\n' + error.stack);
        this._log('@LADDA :*******************************************************');
        reject(error);
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
    if(error && error.error) {
      // reduce the fanout in any case
      if(this.nbDestinations.value > 0) {
        // we set and broadcast
        this.nbDestinations.setValue(this.nbDestinations.value - 1, this.enableFanoutBroadcast);
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
  * Log a message with specific informations of the system state
  * @param {string} message String Message to log
  * @return {void}
  */
  systemState (message) {
    this._log(`@LADDA - SYSTEM STATE:
      Message: ${message}
      #Free: ${this.isFree} \n
      #BusyPeers:${this.busyPeers.count()}, \n
      #WaitingQueries:${this.queryQueue.getQueriesByStatus(StatusQueue.STATUS_WAITING).count()}, \n
      #DoneQueries: ${this.queryQueue.getQueriesByStatus(StatusQueue.STATUS_DONE).count()}, \n
      #DelegatedQueries: ${this.queryQueue.getQueriesByStatus(StatusQueue.STATUS_DELEGATED).count()} \n
      #ErroredQueries: ${this.queryQueue.getQueriesByStatus(StatusQueue.STATUS_ERRORED).count()} \n`
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
        // this.systemState('[CHECKING-LOOP] We have waiting queries and we are free ! Need to do something...');
        this.delegateQueries(endpoint);
      } else {
        if(this.queryQueue.done + this.queryQueue.errored === this.queryQueue.count()) {
          this.emit(this.workloadFinished, true);
        } else {
          // this.systemState('[CHECKING-LOOP] No queries to process or we are busy');
        }
      }
    }, time);
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
    if(this.busyPeers.count() < this.nbDestinations.value) {
      while( (chosenPeers.count() < (this.nbDestinations.value - this.busyPeers.count())) && (_peers.count() > 0)) {
        index = Utils.randomInt(0, _peers.count());
        chosenPeers = chosenPeers.add(_peers.get(index));
        _peers = _peers.remove(index);
      }
    }
    return chosenPeers;
  }

}

module.exports = LaddaProtocol;

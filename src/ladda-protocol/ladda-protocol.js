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

const Immutable = require('immutable');

const StatusQueue = require('./status-queue.js');
const DelegationProtocol = require('./../delegation-protocol.js');
const NDPMessage = require('./ndp-message.js');
const uuidV4 = require('uuid/v4');
const moment = require('moment');
const _ = require('lodash');
const Fanout = require('./fanout.js');
const LDFClient = require('./ldf-client.js');

// LDF LOG Disabling
// ldf.Logger.setLevel('INFO');

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
  constructor (options) {
    let opts = _.merge({
      name: 'ladda',
      verbose: true,
      nbDestinations: 2,
      timeout: 10000
    }, options);
    super(opts);
    this.opts = opts;
    // this.queryQueue = Immutable.Map();
    this.queryQueue = new StatusQueue();
    this.busyPeers = Immutable.Set();
    this.isFree = true;
    this.nbDestinations = this.opts.nbDestinations || 0;
    this.timeout = this.opts.timeout || 300 * 1000; // 300 secondes by default = 5 minutes
    this.maxError = this.opts.maxErrors || 5;

    this.workloadFinished = 'ndp-workload-finished'; // for internal use
    this.signalAnswerNdp = 'ndp-answer-internal'; // When an answer is received from our workload, for internal use

    this.signalAnswer = 'ndp-answer'; // When an answer is received from our workload for the public
    this.signalError = 'ndp-error'; // An error occurred
    this.signalFailed = 'ndp-failed'; // a query has failed to be delegated
    this.signalTimeout = 'ndp-timeout'; // Signal for timed out queries
    this.signalDelegateQuery = 'ndp-delegated'; // We are delegating a query
    this.signalDelegatedQueryExecuted = 'ndp-delegated-query-executed'; // We executed a delegated query
    this.signalFanoutChanged = 'ndp-fanout-changed';

    this.enableFanoutBroadcast = this.opts.enableFanoutBroadcast || false;

    // garbageTimeout
    this.garbageTimeout = new Map();
    // checking loop
    this.garbageQueries = undefined;
    this.erroredQueries = new Map();
    this.fanout = new Fanout({ verbose: this.opts.verbose });
    // LDF client, here TPF
    this.client = new LDFClient({});
  }

  /**
  * Send queries to neighbours and emit results on ndp-answer
  * @param {array} data array of element to send (query)
  * @param {string} endpoint - Endpoint to send queries
  * @return {promise} A promise
  */
  send (data, endpoint, interval = 500, maxErrors = 5) {
    this.maxErrors = maxErrors;
    this._setFragmentsClient (endpoint, false);
    // clear queue before anything
    this.queryQueue.clear();
    this.busyPeers.clear();
    this.garbageQueries = this.initGarbageQueries(interval, endpoint);
    data.forEach(query => this.queryQueue.push(this._getNewUid(), query));
    return this.delegateQueries(endpoint);
  }

  /**
  * Send queries to neighbours and emit results on ndp-answer
  * @param {array} data array of element to send (query)
  * @param {string} endpoint - Endpoint to send queries
  * @param {boolean} withResults - True if you want response with query results or false, just metadata
  * @param {number} interval - Interval to check before executing waiting queries if we are free
  * @param {number} maxErrors - Number of retry for a query
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

    this.olderFanoutIntervalRequest = setInterval(() => {
      const neigh = this.foglet.getNeighbours();
      if(neigh.length > 0) {
        const id = this.foglet.getRandomNeighbourId();
        if(id) this.foglet.sendUnicast(id, { type: 'ask-fanout' });
      }
    }, 2000);

    this.foglet.onBroadcast((id, message) => {
      if(message.type && message.type === 'ndp-new-fanout' && message.value) {
        this.systemState('Fanout is going to change to :' + message.value);
        this.nbDestinations = message.value;
      }
    });

    this.foglet.onUnicast((id, message) => {
      this.systemState(`@LADDA : Receive Message from ${id}`, message);
      const receiveMessageTimeDate = new Date();
      const receiveMessageTime = formatTime(receiveMessageTimeDate);
      switch (message.type) {
      case 'ask-fanout' : {
        this.systemState(`@LADDA : Someone ask for a fanout value ${id}`);
        this.foglet.sendUnicast(id, { type: 'answer-fanout', value: this.nbDestinations});
        break;
      }
      case 'answer-fanout' : {
        this.systemState(`@LADDA : Receive fanout value: ${message.value} from ${id}`);
        this.nbDestinations = message.value;
        // need to clear the interval asking, because we have the fanout of the network.
        if(this.olderFanoutIntervalRequest) clearInterval(this.olderFanoutIntervalRequest);
        break;
      }
      case 'request': {
        this.systemState('@LADDA : Message: ', message);
        this.systemState('@LADDA - Peer @' + this.foglet._id + ' received a query to execute from : @' + id);
        if(this.isFree && !this.queryQueue.hasWaitingQueries()) {
          this.isFree = false;
          const query = message.payload;
          // Set if not set the fragmentsClient before to timestamp anything
          this.client._setFragmentsClient(message.endpoint, false);
          const startExecutionTimeDate = new Date();
          const startExecutionTime = formatTime(startExecutionTimeDate);
          // Execution of a remote query
          this.client.execute(query, message.endpoint, this).then(result => {
            this.isFree = true;
            const endExecutionTimeDate = new Date();
            const endExecutionTime = formatTime(endExecutionTimeDate);
            const executionTime = this._computeExecutionTime(startExecutionTimeDate, endExecutionTimeDate);
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
            this._log(clone(msg));
            msg.sendResultsTime = formatTime(new Date());
            this.emit(this.signalDelegatedQueryExecuted, clone(msg));
            // never mind that there is a bug to send the response
            this.foglet.sendUnicast(id, msg);
            this.systemState('@LADDA : Message sent after its execution.');
          }).catch(error => {
            this.isFree = true;
            // If execution failed
            this._processErrors(error);

            try {
              this._log('@LADDA :**********************ERROR REQUEST EXECUTE DELEGATED QUERY ****************************');
              this.emit(this.signalError, '[ERROR-REQUEST-EXECUTE-DELEGATED-QUERY]' + error.toString() + '\n' + error.stack);
              this.systemState(error.toString() + '\n' + error.stack);
              this._log('@LADDA :****************************************************************************************');
              const msg = new NDPMessage({
                type: 'failed',
                id: this.foglet._id,
                payload: message.payload,
                endpoint: message.endpoint,
                qId: message.qId,
                receiveQueryTime: receiveMessageTime,
                peerId: message.peerId
              });
              this.systemState(clone(msg));
              this.emit(this.signalFailed, clone(msg));
              this.foglet.sendUnicast(id, msg);
              this._log('@LADDA : Message sent after it\'s failed. ');

            } catch (e) {
              this.emit(this.signalError, '[ERROR-REQUEST-EXECUTE-DELEGATED-QUERY]' + e.toString() + '\n' + e.stack);
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
          this.systemState(clone(msg));
          this.emit(this.signalFailed, clone(msg));
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
        if(this.queryQueue.getStatus(message.qId) === STATUS_ERRORED || this.queryQueue.getStatus(message.qId) === STATUS_DELEGATED || this.queryQueue.getStatus(message.qId) === STATUS_WAITING) {
          // in case we received an answer for a query that is errored for us
          this.queryQueue.setDone(message.qId);
          message.receiveResultsTime = receiveMessageTime;
          message.globalExecutionTime = this._computeGlobalExecutionTime(message.sendQueryTime, receiveMessageTimeDate);
          this.emit(this.signalAnswerNdp, clone(message));
          this.emit(this.signalAnswer, clone(message));
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
        if(this.queryQueue.getStatus(message.qId) === STATUS_DELEGATED || this.queryQueue.getStatus(message.qId) === STATUS_WAITING) {
          this.queryQueue.setWaiting(message.qId);
          this.systemState('@LADDA : failed query from @' + message.id);
          this.emit(this.signalFailed, clone(message));
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
    console.log(this.foglet);
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
            const startExecutionTime = formatTime(startExecutionTimeDate);
            this.client.execute(query.query, endpoint, this).then(result => {
              if(this.queryQueue.getStatus(query.id) !== STATUS_DONE ) {
                this.queryQueue.setDone(query.id);
                const endExecutionTimeDate = new Date();
                const endExecutionTime = formatTime(endExecutionTimeDate);
                const executionTime = this._computeExecutionTime(startExecutionTimeDate, endExecutionTimeDate);
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
                this.emit(this.signalAnswerNdp, clone(msg));
                this.emit(this.signalAnswer, clone(msg));
              }
              this.isFree = true;
              // // retry delegation if there's queries in the queue
              if(this.isFree && this.queryQueue.hasWaitingQueries()) this.delegateQueries(endpoint);
            }).catch(error => {
              // anyway process error
              if(this.queryQueue.getStatus(query.id) !== STATUS_DONE) {
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
                const sendQueryTime = formatTime(new Date());
                const m = new NDPMessage({
                  type: 'request',
                  id: this.foglet._id,
                  payload: query.query,
                  qId: query.id,
                  endpoint,
                  sendQueryTime,
                  peerId: peer
                });
                this.emit(this.signalDelegateQuery, clone(m));
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
                    if(this.queryQueue.getStatus(query.id) === STATUS_DELEGATED) {
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
  * Check if we have the right to increase or decrease the fanout by passing a value representing a time response of a Triple pattern query.
  * @param {number} value Response time of TPQ
  * @return {void}
  */
  checkFanout (value) {
    let estimation = this.fanout.estimate(value);

    switch(estimation.flag) {
    case 1: {
      // if(estimation.value) {
      //   this.setNbDestination(estimation.value);
      // } else {
      this.increaseFanout();
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

    this.emit(this.signalFanoutChanged, value, this.nbDestinations, this.foglet.getNeighbours().length, this.queryQueue.getQueriesByStatus(STATUS_DELEGATED).count());
  }

  /**
  * increase the fanout, it take care to not be greater than the number of neighbours
  * @return {void}
  */
  increaseFanout () {
    let oldFanout = this.nbDestinations;
    let neighbours = this.foglet.getNeighbours().length;
    let newFanout = oldFanout + 1;
    if(newFanout >= neighbours) {
      newFanout = neighbours;
    }
    this.setNbDestination(newFanout);
  }

  /**
  * Set the new fanout
  * @param {number} newValue the new fanout
  * @return {void}
  */
  setNbDestination (newValue) {
    this.nbDestinations = newValue;
    this.broadcastFanout();
  }
  /**
  * Process errors to adjust the fanout or just do some work on errors
  * @param {object} error Error formated as { error:object, stack:object}
  * @return {void}
  */
  _processErrors (error) {
    if(error && error.error) {
      // reduce the fanout in any case
      if(this.nbDestinations > 0) {
        this.setNbDestination(this.nbDestinations - 1);
      }
    }
  }
  /**
  * Broadcast the fanout to all neighbours in the network
  * @return {void}
  */
  broadcastFanout () {
    if(this.enableFanoutBroadcast) {
      // now broadcast the new fanout to the whole network
      this.foglet.sendBroadcast({
        type: 'ndp-new-fanout',
        value: this.nbDestinations
      });
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

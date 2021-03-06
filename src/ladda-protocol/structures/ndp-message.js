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

/**
* Delegation message in the Foglet-NDP protocol
* @author Grall Arnaud(Folkvir), Thomas Minier
*/
class NDPMessage {
  /**
  * Constructor
  * @param {object} options The content of the delegation message
  * @param {string} options.type - The type of the message ('answer', 'request' or 'failed')
  * @param {string} options.id - The id of the peer who sent this message
  * @param {*} options.payload - The response to the delegated query or a delegated query to execute
  * @param {string} options.endpoint - The endpoint used to execute the query
  * @param {string} options.query - The delegated SPARQL query
  * @param {string} options.peerId - The peer id who will receive this message
  * @param {string|undefined} options.schedulerId - (optional) The id of the peer who delegated the query
  * @param {string|undefined} options.sendQueryTime - (optional) The time (hh:mm:ss:ms) on which the query was delegated
  * @param {string|undefined} options.receiveQueryTime - (optional) The time (hh:mm:ss:ms) on which a delegated query was received
  * @param {string|undefined} options.startExecutionTime - (optional) The time (hh:mm:ss:ms) on which query execution started
  * @param {string|undefined} options.endExecutionTime - (optional) The time (hh:mm:ss:ms) on which query execution ended
  * @param {string|undefined} options.sendResultsTime - (optional) The time (hh:mm:ss:ms) on which query results was sent
  * @param {string|undefined} options.receiveResultsTime - (optional) The time (hh:mm:ss:ms) on which query results was received
  */
  constructor (options) {
    if (options.type === undefined) throw new TypeError('Error: a delegation message must have a type');
    if (options.payload === undefined) throw new TypeError('Error: a delegation message must have data to transmit in the "payload" field');
    // Is 'answer', 'request' or 'failed'
    this.type = options.type;
    // Owner id
    this.id = options.id;
    // Id of the peer who delegated the request to the peer
    this.schedulerId = options.schedulerId || 'unknown';
    // peer id who will receive this message
    this.peerId = options.peerId;
    // Message to sent
    this.payload = options.payload;
    // Endpoint representing the source of the payload
    this.endpoint = options.endpoint;
    // query
    this.query = options.query;
    // query id
    this.qId = options.qId;
    // timestamps
    this.sendQueryTime = options.sendQueryTime || 'unknown';
    this.receiveQueryTime = options.receiveQueryTime || 'unknown';
    this.startExecutionTime = options.startExecutionTime || 'unknown';
    this.endExecutionTime = options.endExecutionTime || 'unknown';
    this.sendResultsTime = options.sendResultsTime || 'unknown';
    this.receiveResultsTime = options.receiveResultsTime || 'unknown';
    this.executionTime = options.executionTime || 'unknown'; // in milliseconds
    this.globalExecutionTime = options.executionTime || 'unknown'; // in milliseconds
  }
}

module.exports = NDPMessage;

/*
MIT License

Copyright (c) 2017 Grall Arnaud, Minier Thomas

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

const LaddaProtocol = require('.../ladda-protocol.js');

/**
 * LaddaQuartzProtocol extends {@link LaddaProtocol} to used a Quartz client instead of a classic TPF client
 * @extends LaddaProtocol
 * @author Thomas Minier
 */
class LaddaQuartzProtocol extends LaddaProtocol {
  /**
  * Constructor
  * @param {QuartzClient}  client - The Quartz client used to execute queries
  * @param {int|undefined} nbDestinations - (optional) The number of destinations for delegation (default to 2, as in Ladda paper)
  * @param {int|undefined} timeout - (optional) The timeout used by the protocol. Disable by default unless it is set.
  * @param {boolean}       verbose - (optional) Whether to use verbose mode or not
  */
  constructor (client, nbDestinations, timeout, verbose) {
    super(nbDestinations, timeout, verbose);
    this._client = client;
  }

  /**
  * Execute a query plan using the quartz client
  * @param {string} queryPlan - The query plan to execute
  * @return {Promise} A Promise with results as reponse
  */
  execute (queryPlan) {
    // executePlan execute a query plan and true means that we want a promise back
    return this._client.executePlan(queryPlan, true);
  }
}

module.exports = LaddaQuartzProtocol;

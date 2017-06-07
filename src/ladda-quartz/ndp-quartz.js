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

const QuartzClient = require('quartz-tpf');
const LaddaQuartzProtocol = require('./ladda-quartz-protocol.js');
const NDP = require('../ndp.js');

/**
 * QuartzNDP extends {@link NDP} to execute a query suing Quartz parallel queyr processing techniques
 * @extends NDP
 * @author Thomas Minier
 */
class QuartzNDP extends NDP {
  /**
   * Constructor
   * @param {object} options Options used to build the Foglet-ndp
   * @param {Spray} options.spray - The Spray network used by the foglet
   * @param {DelegationProtocol|undefined} options.delegationProtocol - (optional) The delegation protocol used by the Foglet. Default to {@link LaddaQuartzProtocol}
   * @param {int|undefined} options.maxPeers - (optional) The maximum number of peer to delegated queries (default to Number.MAX_VALUE)
   */
  constructor (options) {
    super(options);
    this._client = new QuartzClient();
    this.delegationProtocol = new LaddaQuartzProtocol(this._client, this.maxPeers, this.timeout, this.options.verbose);
  }

  /**
   * Send queries to neighbours and emit results on ndp-answer
   * @param {array} query - The query to be executed by the fog
   * @param {string} endpoints - TPF servers used to answer the query
   * @return {promise} Return a Q promise fullfilled when the delegation is done (but not when the execution is completed !!)
   */
  send (query, endpoints) {
    /* TODO
      1 - build quartz execution plan
      2 - convert each branch of the top level union as a query
      3 - send all queries as a workload
      4 - (question) recompose results here or let the user do it ???
    */
    const plan = this._client.buildPlan(query, endpoints);
    const queries = plan.where[0].patterns.map(pattern => {
      return {
        queryType: 'select',
        variables: [ '*' ],
        prefixes: plan.prefixes,
        where: [ pattern ]
      };
    });
    return this.delegationProtocol.send(queries, endpoints[0]);
  }

}

module.exports = QuartzNDP;

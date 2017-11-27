'use strict';

const lmerge = require('lodash.merge');
const FixedArray = require('fixed-array');
const DEFAULT_OPTIONS = { verbose: false, maxStoredItems: 1000 };

class Estimator {
  constructor (options) {
    this.options = lmerge(DEFAULT_OPTIONS, options);

    this.items = new FixedArray(this.options.maxStoredItems);
  }

  /**
   * Estimate from an HTTP response time if we increase(1)/decrease(-1)/noop(0) the fanout
   * @return {Number} equal to 1;-1 or 0
   */
  estimate (httpResponseTime) {
    this.items.push(httpResponseTime);
    console.log('New estition of the value: ', httpResponseTime);
    return 1;
  }

  _log (message) {
    if(this.options.verbose) debug(message);
  }
}

module.exports = Estimator;

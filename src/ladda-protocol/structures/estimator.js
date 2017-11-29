'use strict';

const lmerge = require('lodash.merge');
const FixedArray = require('fixed-array');
const regression = require('regression');

const DEFAULT_OPTIONS = { verbose: false, maxStoredItems: 50, enable: true };

class Estimator {
  constructor (options) {
    this.options = lmerge(DEFAULT_OPTIONS, options);

    this.items = new FixedArray(this.options.maxStoredItems);
    this.meanItems = new FixedArray(this.options.maxStoredItems);
    this.ecarTypeItems = new FixedArray(this.options.maxStoredItems);
  }

  /**
   * Estimate from an HTTP response time if we increase(1)/decrease(-1)/noop(0) the fanout
   * @return {Number} equal to 1;-1 or 0
   */
  estimate (httpResponseTime, thresholdMax = 0.6, thresholdMin = 0.4) {
    this.items.push(httpResponseTime);
    this.meanItems.push(this.items.mean());
    this.ecarTypeItems.push(Math.sqrt(this.items.variance()));
    // if the estimation is not enabled, do nothing
    if(!this.options.enable) return 0;

    const standardDeviation = Math.abs(this.standardDeviation - httpResponseTime);
    let res = 0;
    if(standardDeviation >= thresholdMax * this.standardDeviation) {
      res = -1; // decrease
    } else if(standardDeviation <= thresholdMin * this.standardDeviation) {
      res = 1; // increase
    }
    console.log('New estition of the value: ', httpResponseTime, 'Decision: (1=increase, -1=decrease, 0=noop)', res);
    return res;
  }

  get max () { return this.items.max; }
  get min () { return this.items.min; }
  get mean () { return this.items.mean; }
  get standardDeviation () { return Math.sqrt(this.items.variance()); }

  /**
   * Return the coefficient of the linear regression of the mean of the values stored;
   * @return {Object}
   */
  getMeanLinearRegression() {
    const y = this.meanItems.values();
    const data = Array.from(new Array(y.length), (x,i) => [i, y[i]])
    console.log(data);
    return regression.linear(data);
  }
  /**
   * Return the coefficient of the linear regression of the ecart type of the values stored;
   * @return {Object}
   */
  getEcartTypeLinearRegression() {
    const y = this.ecarTypeItems.values();
    const data = Array.from(new Array(y.length), (x,i) => [i, y[i]])
    console.log(data);
    return regression.linear(data);
  }



  _log (message) {
    if(this.options.verbose) debug(message);
  }
}

module.exports = Estimator;

'use strict';

const debug = require('debug')('ladda:fanout');
const _ = require('lodash');
const EventEmitter = require('events');
const Estimator = require('./estimator/estimator.js');
const FixedArray = require('fixed-array');

class Fanout extends EventEmitter {
  constructor (options = {}) {
    super();
    this.options = _.merge({
      verbose: true,
      threshold: 0.30,
      maxValue: 100,
      maxParallelConnections: 10,
      networkSize: function (sizeView, a, b) {
        return Math.exp((sizeView - b)/a);
      }
    }, options);

    this.stack = FixedArray(this.options.maxValue);

    this.estimator = new Estimator();
    this.estimator.loadReference();
    console.log(this.estimator);
  }

  /**
   * Add a value to our estimator, and return 1 is we have to increase the fanout or -1 if we have to decrease the fanout
   * @param {number} y
   * @return {number} 1 (increase the fanout) || -1 (decrease the fanout)
   */
  addValue (y = undefined) {
    this.estimator.addPointY(y);
    return this.estimate(y);
  }

  /**
   * Estimate if we have to increase/decrease the fanout or do nothing
   * Assume that max is upper than min
   * @param {number} y
   * @param {number} threshold Value between 0 and 1
   * @return {number} 1 (increase the fanout) || -1 (decrease the fanout)
   */
  estimate (y, threshold = this.options.threshold) {
    let min = this.estimator.data.min,
      max = this.estimator.data.max,
      average = (max + min) /2;
    const finish = (message = 'noop', flag = 0, value = undefined) => {
      this._log('Increase/Decrease/Noop: ' + flag + ', Message: '+ message + ', New Value: ' + value);
      return {flag, value};
    };
    // if y is upper than max, decrease
    if(y >= max) return finish('upper than max', -1);
    // if y is lower than min, increase
    if(y <= min) return finish('lower than min', 1);

    // if we are between max and min, need to know if we are in the threshold interval
    if(y > min && y < max) {
      let thresholdDistance = (max - average) * threshold;
      if( y >= (average + thresholdDistance)) return finish('upper than the threshold upper bound', -1);
      if( y <= (average - thresholdDistance)) return finish('lower than the threshold lower bound', 1);
    }

    return finish('noop', 0);
  }

  estimateByThreshold (y) {
    this.stack.push(y);
    const average = this.stack.mean();

    let max = this.estimator.f(
        Math.abs(
          (- this.estimator.regression.equation[1])
          /
          (this.estimator.f(1) - this.estimator.regression.equation[0])
        )
    );

    const finish = (message = 'noop', flag = 0, value = undefined, ...args) => {
      return {flag, value, args};
    };
    if( average > max) return finish('value upper than max, decrease', -1);
    if( average < max) return finish('value lower than max, increase', +1);
    return finish('noop', 0);
    // let thresholdFanout = Math.floor( y / this.estimator.f(1) );
    // if( thresholdFanout > fanout) return finish('threshold upper than fanout, increase', 1, fanout+1, thresholdFanout);
    // if( thresholdFanout < fanout) return finish('threshold lower than fanout, decrease', -1, thresholdFanout, thresholdFanout);
    // return finish('noop', 0, fanout, thresholdFanout);
  }

  _log (message) {
    if(this.options.verbose) debug(message);
  }
}

module.exports = Fanout;

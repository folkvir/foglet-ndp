'use strict';

const debug = require('debug')('ladda:estimator');
const _ = require('lodash');
const lmerge = require('lodash.merge');
const lmax = require('lodash.max');
const lmaxby = require('lodash.maxby');
const lminby = require('lodash.minby');

const EventEmitter = require('events');
/**
 * TYPE OF REGRESSION
 */
const regression = require('regression');
const Reference = require('./reference.json');


class Estimator extends EventEmitter {
  constructor (options = {}) {
    super();
    this.options = lmerge({
      verbose: true,
    }, options);

    this.data = {
      x: [],
      y: [],
      max: undefined,
      min: undefined
    };
    this.regression = undefined;
    /**
     * Return the value corresponding to x
     * @param  {number} x The number of queries
     * @return {number}   The response time associated for the number of queries associated
     */
    this.f = (x) => {
      return x;
    };
    /**
     * Return the y value, eg: a query response time. We can extrapolate the number of parallel queries on the server.
     * @param  {number} y Response Time
     * @return {number}   The number of parallel queries on the server
     */
    this.y = (y) => {
      return y;
    };
    this._log('[*] Estimator created.');
  }

  /**
  * Add a point to the data to process
  * @param {object} point Point to add to data
  * @return {void}
  */
  addPoint (point = {x: undefined, y: undefined}) {
    if((point.x || point.x === 0) && (point.y || point.y === 0)) {
      this.data.x.push(point.x);
      this.data.y.push(point.y);
    } else {
      throw new Error('Need a well-formed point: {x: ..., y: ... }');
    }
  }

  /**
  * Add a point by providing this y value, y = f(x).
  * We found x with the function providing by the regression.
  * And we compute again the regression to adjust f and y functions
  * @param {number} y Point to add to data
  * @return {void}
  */
  addPointY (y = 0) {
    this.addPoint({
      x: this.y(y),
      y: y
    });
    if(!this.data.max) {
      this.data.max = y;
    } else {
      this.data.max = lmax([ y, this.data.max ]);
    }
    if(!this.data.min) {
      this.data.min = y;
    } else {
      this.data.min = lmax([ y, this.data.min ]);
    }
    this.run();
  }

  /**
  * Add a point by providing this y value, y = f(x).
  * We found x with the function providing by the regression.
  * And we compute again the regression to adjust f and y functions
  * @param {number} x Point to add to data
  * @return {void}
  */
  addPointX (x = 0) {
    this.addPoint({
      x: x,
      y: this.f(x)
    });
    this.run();
  }

  /**
  * Add an array of point [{x:, y:},...] to data, If one point is not well-formed, this point is not added
  * @param {array} array Array of point to add
  * @return {void}
  */
  addArray (array = []) {
    if(array.length > 0) {
      array.forEach(elem => {
        if(elem.x && elem.y) this.addPoint(elem);
      });
    }
  }

  get _data () {
    let result = [];
    for(let i = 0; i<this.data.x.length; ++i ) {
      result.push([ this.data.x[i], this.data.y[i] ]);
    }
    return result;
  }


  run () {
    this.regression = this._computeRegression();
    this._log('Estimator found an approximate function: ', this.regression.string);
    this.f = (x) => {
      // // polynomial
      // let equation = this.regression.equation;
      // let a = equation[2], b= equation[1], c = equation[0];
      // return a * x * x + b * x + c;

      // linear
      let equation = this.regression.equation;
      return equation[0]*x + (equation[1]);
      // console.log('Coefficients: ', this.regression.calculateCoefficients());
      // console.log('Hypothesize: ', this.regression.hypothesize({x:[ x ]}));
      // return this.regression.hypothesize({x:[ x ]})[0];
    };
    this.y = (y) => {
      // polynomial
      // let equation = this.regression.equation;
      // let a = equation[2], b = equation[1], c = equation[0];
      // // quadratic formula for the second order polynome, assuming that the curve is only positive
      // return (-b + Math.sqrt((b*b - 4 * a * (c - y))))/(2 * a);

      // linear
      let equation = this.regression.equation;
      return (y - equation[1] )/equation[0];
      // return y / this.regression.calculateCoefficients()[0];
    };
  }

  _computeRegression () {
    // let model = Loess.loess_pairs(this._data, 0.5);
    // this.regression = new smr.Regression({ numX: 1, numY: 1 });
    // for(let i = 0; i<this.data.x.length; ++i) this.regression.push({x: [ this.data.x[i] ], y: [ this.data.y[i] ] });
    // return this.regression;
    // return regression('linearThroughOrigin', this._data);
    return regression.linear(this._data);
  }

  loadReference () {
    let data = Reference;
    this.addPoint({
      x: 0,
      y: data[0].average
    });
    this.data.max = lmaxby(data, 'max').max;
    this.data.min = lminby(data, 'min').min;
    this.data.limit = lmaxby(data, 'clients').clients;
    data.forEach(d => {
      this.addPoint({
        x: d.clients,
        y: d.average
      });
    });
    this.run();
  }

  _log (message) {
    if(this.options.verbose) debug(message);
  }
}

module.exports = Estimator;

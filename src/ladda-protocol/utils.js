'use strict';

const uuidV4 = require('uuid/v4');
const moment = require('moment');
const lmerge = require('lodash.merge');

class Utils {
  constructor () {

  }

  /**
  * Compute the execuion time between start and end.
  * @param {time} start getTime() of a (new Date) representing the beginning of the execution
  * @param {time} end getTime() of a (new Date) representing the end of the executio
  * @return {time} Time in milliseconds of the execution
  */
  static computeExecutionTime (start, end) {
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
  static computeGlobalExecutionTime (start, end) {
    // start is a formated date, end is a Date
    return this.computeExecutionTime(this.toDate(start), end);
  }

  /**
  * Return a date from a string representation
  * @param {string} date String date representation
  * @return {date} Return the custom date specified by its string representation
  */
  static toDate (date) {
    let d = new Date();
    const split = date.split(':');
    d.setHours(split[0]);
    d.setMinutes(split[1]);
    d.setSeconds(split[2]);
    d.setMilliseconds(split[3]);
    return d;
  }
  /**
  * Pick a random int between two values
  * @param {int} min - The lower bound
  * @param {int} max - The upper bound (excluded)
  * @return {int} A random int between min and max (excluded)
  */
  static randomInt (min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min;
  }

  /**
  * Generate and return  a v4 UUID (random) based on uuid npm package
  * @return {string} uuidv4
  */
  static getNewUid () {
    return uuidV4();
  }

  /**
   * Format a time in hour:min:sec:mil
   * @param  {[type]} time [description]
   * @return {[type]}      [description]
   */
  static formatTime (time) {
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
  }

  /**
  * Clone an object
  * @param  {object} obj Object to clone
  * @return {object} Object cloned
  */
  static clone (obj) {
    return lmerge({}, obj);
  }
}

module.exports = Utils;

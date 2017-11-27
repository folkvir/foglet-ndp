'use strict';

const EventEmitter = require('events');

module.exports = class Fanout extends EventEmitter {
  constructor (foglet, protocol, defaultValue) {
    super();
    if(!foglet || !protocol) throw new Error('Need a foglet and a protocol');
    this._value = defaultValue;
    this._foglet = foglet;
    this._protocol = protocol;
  }

  get value () {
    return this._value;
  }

  set value (val) {
    this._value = val;
    this.emit('updated');
  }
};

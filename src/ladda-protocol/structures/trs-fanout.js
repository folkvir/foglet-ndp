'use strict';

const EventEmitter = require('events');

module.exports = class TRSFanout extends EventEmitter {
  constructor (foglet, protocol, defaultValue) {
    super();
    if(!foglet || !protocol) throw new Error('Need a foglet and a protocol');
    this._value = defaultValue;
    this._foglet = foglet;
    this._protocol = protocol;

    this.olderValues = setInterval(() => {
      const neigh = this._foglet.getNeighbours();
      if(neigh.length > 0) {
        const id = this._foglet.getRandomNeighbourId();
        if(id) this._foglet.sendUnicast(id, { type: 'ask-older' });
      }
    }, 2000);

    this._foglet.onUnicast((id, message) => {
      switch(message.type) {
      case 'ask-older' : {
        this._foglet.sendUnicast(id, { type: 'answer-older', value: this._value});
        break;
      }
      case 'answer-older' : {
        this.setValue(message.value, false);
        // need to clear the interval asking, because we have the older value
        if(this.olderValues) clearInterval(this.olderValues);
        break;
      }
      }
    });

    this._foglet.onBroadcast((id, message) => {
      if(message.type && message.protocol && message.type === 'fanout-update' && message.protocol === this._protocol) {
        this.setValue(message._value, false);
      }
    });
  }

  get value () {
    return this._value;
  }

  set value (val) {
    this._value = val;
  }

  setValue (val, broadcast = false) {
    this._value = val;
    this.emit('updated');
    if(broadcast) this._foglet.sendBroadcast({ type: 'fanout-update', protocol: this._protocol, value: this._value });
  }
};

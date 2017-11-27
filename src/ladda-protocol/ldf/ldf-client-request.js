const EventEmitter = require('events');
const request = require('request');
const { SingletonIterator } = require('asynciterator');

module.exports = function (options) {
  const requestProxy = new EventEmitter();
  const requestOptions = {
    url: options.url,
    method: options.method || 'GET',
    headers: options.headers,
    timeout: options.timeout || 10000,
    encoding: 'utf8',
    time: true,
    gzip:true
  };
  request(requestOptions, (error, response, body) => {
    if (!error && response.statusCode === 200) {
      try {
        const source = new SingletonIterator(body)
        source['content-type'] = response.headers['content-type'];
        source.statusCode = response.statusCode;
        source.headers = response.headers;
        source.httpResponse = response;
        console.log(`Fetching <${options.url}>...`);
        requestProxy.emit('response', source);
      } catch (e) {
        console.error('An error occured during decoding the response.', e);
      }

    } else {
      requestProxy.emit('error', error);
    }
  });
  return requestProxy;
};

const path = require('path')
module.exports = {
  browsers: [ 'Firefox' ],
  timeout: 20000,
  lint: false,
  build: require('./foglet-webpack-config.js')
}

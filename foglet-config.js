'use strict';
const path = require('path');
module.exports = {
  browsers: [ 'Firefox' ],
  timeout: 20000,
  lint: false,
  build: {
    entry: './foglet-ndp.js',
    output: {
      'path': path.resolve(process.cwd(), 'dist'),
      'filename': 'foglet-ndp.bundle.js',
      'library': 'foglet',
      'libraryTarget': 'umd',
      'umdNamedDefine': true
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: () => {
            return true;
          },
          use: {
            loader: 'babel-loader',
            options: {
              presets: [ 'env' ]
            }
          }
        },
        { test: /\.json$/, loader: 'json-loader' }
      ]
    },
    devtool: 'source-map',
    target: 'web',
    node: {
      console: true,
      fs: 'empty',
      net: 'empty',
      tls: 'empty',
      __dirname: true,
      __filename: true,
    }
  }
};

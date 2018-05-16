const UglifyJSPlugin = require('uglifyjs-webpack-plugin')
module.exports = {
  mode: 'development',
  entry: './foglet-ndp.js',
  output: {
    'path': require('path').resolve(process.cwd(), 'dist'),
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
          return true
        },
        use: {
          loader: 'babel-loader',
          options: {
            presets: [ 'env' ]
          }
        }
      }
    ]
  },
  // plugins: [new UglifyJSPlugin({
  //   sourceMap: true
  // })],
  devtool: 'source-map',
  node: {
    console: true,
    fs: 'empty',
    net: 'empty',
    tls: 'empty',
    __dirname: true,
    __filename: true,
  }
}

// {
//   entry: './foglet-ndp.js',
//   output: {
//     'path': path.resolve(process.cwd(), 'dist'),
//     'filename': 'foglet-ndp.bundle.js',
//     'library': 'foglet',
//     'libraryTarget': 'umd',
//     'umdNamedDefine': true
//   },
//   module: {
//     rules: [
//       {
//         test: /\.js$/,
//         exclude: () => {
//           return true;
//         },
//         use: {
//           loader: 'babel-loader',
//           options: {
//             presets: [ 'env' ]
//           }
//         }
//       },
//       { test: /\.json$/, loader: 'json-loader' }
//     ]
//   },
//   devtool: 'source-map',
//   target: 'web',
//
// }

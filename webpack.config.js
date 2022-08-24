const nodeExternals = require('webpack-node-externals')
const path = require('path')

module.exports = {
  mode: 'development',
  entry: './src/core/start.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [{
          loader: 'ts-loader',
          options: {
            transpileOnly: true
          }
        }],
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    modules: ['node_modules', path.join(__dirname, './src')]
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist')
  },
  target: 'node',
  stats: {
    warnings: false
  },
  externals: [nodeExternals()]
}

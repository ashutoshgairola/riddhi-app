// react-native-svg-transformer turns .svg into a React component at runtime.
// Under jest we stub it with a host <svg> that forwards its props, so
// components that render brand SVGs can be smoke-tested.
const React = require('react');
module.exports = {
  __esModule: true,
  default: (props) => React.createElement('svg', props),
};

import '@testing-library/jest-dom';

// jsdom doesn't implement scrollIntoView; components that scroll on mount
// (e.g. StudentAIChat's message list) crash without this shim.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoViewShim() {};
}

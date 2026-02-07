// server/webpack.config.js
module.exports = function (options) {
  return {
    ...options,
    watchOptions: {
      poll: 1000, // Sprawdzaj zmiany co 1 sekundę
      aggregateTimeout: 300, // Czekaj chwilę po zmianie, zanim przebudujesz
    },
  };
};

const { app, initDb } = require("../server.cjs");

initDb().catch(() => {});

module.exports = app;

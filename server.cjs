require("dotenv").config();

const { app, initDb } = require("./api/server.cjs");

if (process.env.VERCEL !== '1') {
  const PORT = Number(process.env.PORT || 3000);
  const HOST = process.env.HOST || "0.0.0.0";

  function getLocalIP() {
    const os = require("os");
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name]) {
        if (iface.family === "IPv4" && !iface.internal) return iface.address;
      }
    }
    return "localhost";
  }

  initDb()
    .then(() => {
      const srv = app.listen(PORT, HOST, () => {
        const ip = getLocalIP();
        console.log(`Closet Elander backend listo`);
        console.log(`  Local:   http://localhost:${PORT}`);
        console.log(`  Red:     http://${ip}:${PORT}`);
      });
      srv.on("error", err => {
        console.error("Error al iniciar servidor:", err.message);
        process.exit(1);
      });
    })
    .catch(error => {
      console.error("Error al iniciar:", error.message);
      process.exit(1);
    });
}

module.exports = { app, initDb };

require("dotenv").config();

const app = require("./src/app");

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`[Server] Running at http://localhost:${PORT}`);
  console.log(`[Server] Health → http://localhost:${PORT}/health`);
});

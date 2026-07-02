import 'dotenv/config';
import { createServer } from '../src/api/server.js';

const PORT = process.env.PORT ?? 3000;
const app = createServer();
app.listen(PORT, () => {
  console.log(`MapApp running → http://localhost:${PORT}`);
});

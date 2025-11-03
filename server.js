const dotenv = require('dotenv');

dotenv.config({ path: './Config.env' });

const app = require('./app');

const port = process.env.PORT;

const server = app.listen(port, () => console.log(`Server running on the port: ${port}`));


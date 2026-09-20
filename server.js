const express = require('express');
const cors    = require('cors');
require('dotenv').config();

const routes = require('./routes');
require('./cron/aisSimulator'); // démarre le simulateur AIS + Observer automatiquement

const app = express();

app.use(cors());
app.use(express.json());
app.use('/', routes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SmartPort Attribution Service démarré sur le port ${PORT}`);
  console.log('Simulateur AIS actif — vérification toutes les 5 secondes');
});
// Configuration PM2 de Smart RH. Les deux configurations fonctionnent de la même façon (comptes, mots de passe, HTTPS possible) ;
// seule la base change.
//   Démonstration (base fictive, préparée par npm run demo:preparer) : pm2 start ecosystem.config.js
//   Production (base de l'entreprise)                                 : pm2 start ecosystem.config.js --env production
const path = require('node:path');

module.exports = {
  apps: [{
    name: 'smart-rh',
    script: 'server.js',
    cwd: __dirname,
    node_args: '--no-warnings',
    max_memory_restart: '300M',
    // valeurs par défaut : base de démonstration, sur ce poste uniquement
    env: {
      PORT: 4322,
      HOST: '127.0.0.1',
      SMART_RH_DB: path.join(__dirname, 'demo', 'smart-rh-demo.db'),
      SMART_RH_SAUVEGARDES: path.join(__dirname, 'demo', 'sauvegardes'),
    },
    // production : base de l'entreprise, accessible depuis le réseau local en HTTPS (certificat : npm run certificat)
    // (PM2 complète ces valeurs avec celles de « env » : la base et les sauvegardes sont donc toujours redonnées ici)
    env_production: {
      PORT: 4322,
      HOST: '0.0.0.0',
      SMART_RH_DB: path.join(__dirname, 'smart-rh.db'), // ou par exemple 'D:/SmartRH/donnees/smart-rh.db'
      SMART_RH_SAUVEGARDES: path.join(__dirname, 'sauvegardes'),
      SMART_RH_HTTPS: '1',
      SMART_RH_INACTIVITE_MINUTES: 30,
      SMART_RH_CONSERVATION: 14,
    },
  }],
};

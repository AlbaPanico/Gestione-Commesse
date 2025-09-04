module.exports = {
  apps: [
    {
      name: "server",
      script: "server.js",
      cwd: ".", // Cartella principale
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "client",
      // Esegui il comando "npm run dev" tramite cmd.exe
      script: "cmd",
      args: "/c npm run dev",
      cwd: "client",  // Cartella del client
      shell: true,    // Assicura l'esecuzione tramite la shell
      watch: false,
      env: {
        NODE_ENV: "development"
      }
    }
  ]
};

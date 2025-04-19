module.exports = {
  apps: [
    {
      name: 'server',
      script: 'server.js',
      watch: false,
      env: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    }
  ]
}; 
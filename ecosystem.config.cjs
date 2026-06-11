module.exports = {
  apps: [
    {
      name: "teamclips",
      script: "server.js",
      cwd: "C:\\sites\\teamclips",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "5300",
        DATA_DIR: "C:\\sites\\teamclips\\data",
        STORAGE_DIR: "C:\\sites\\teamclips\\storage",
        MAX_UPLOAD_MB: "800"
      }
    }
  ]
};

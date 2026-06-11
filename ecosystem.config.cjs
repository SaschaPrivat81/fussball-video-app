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
        MAX_UPLOAD_MB: "800",
        MEDIA_ACCEL_ENABLED: "true",
        MEDIA_ACCEL_VIDEO_PREFIX: "/_protected_media/videos",
        MEDIA_ACCEL_THUMBNAIL_PREFIX: "/_protected_media/thumbnails",
        VIDEO_CACHE_SECONDS: "3600",
        THUMBNAIL_CACHE_SECONDS: "86400"
      }
    }
  ]
};

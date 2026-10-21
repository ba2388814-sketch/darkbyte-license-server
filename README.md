# DARK BYTE License Server

Run: ADMIN_PASSWORD=yourpass node server.js   (Node 18+, no npm install needed)

Env vars: ADMIN_PASSWORD (required), ADMIN_USER (default admin), PORT, DATA_DIR (persistent folder), SESSION_SECRET (optional)

Extension API:
  POST /api/verify   body {"key":"DB-XXXX-XXXX-XXXX","deviceId":"<any stable id>"}
  -> {"valid":true|false,"message":"...","expiresAt":<ms|null>,"name":"..."}
Admin panel: open the server URL in a browser.

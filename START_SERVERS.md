# How to start Nudge servers

Open two terminal windows in `C:\Users\inyan\nudge` and run one command in each:

**Terminal 1 — Next.js (website + webhook):**
```
npm run dev
```

**Terminal 2 — Worker (reminders):**
```
npm run worker
```

Both must be running for Nudge to work.

---

**Check if already running:** visit http://localhost:3000 in a browser. If it loads, the server is up.

**BlueBubbles webhook URL:**
```
http://192.168.1.24:3000/api/webhook/bluebubbles?secret=VUJZPpbnDS9fsdR2tl56q4QBm1jgC3GY
```

> Note: if your Mac's IP changes (after a WiFi outage), update `BLUEBUBBLES_URL` in `.env` with the new IP and restart the servers.

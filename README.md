<p align="center">
  <img src="banner.png" width="120" alt="nudge" />
</p>

# nudge

[nudgebuddy.net](https://nudgebuddy.net) · live · 35 users

an ai assistant that lives in imessage. text it an assignment, it schedules the reminder and follows up until you've done it. i built it for people with adhd, and then for gsu and georgia tech students trying to get into full classes.



https://github.com/user-attachments/assets/f8b12138-933a-4edb-86f5-fa8d8e679267



> the code is in a private repo. nudge is a live product with real users, so i don't publish the source, but if you're looking at my work i'll add you to the repo the same day. zacharyinyan [at] gmail [dot] com. the hard parts are written up on [zachinyang.com/work](https://zachinyang.com/work).

## what it does

you text it the way you'd text a friend.

```
You:   i have a bio exam friday at 8am
Nudge: bio exam friday 8am — want me to really nag you on this one?
You:   yes lol
Nudge: locked in. blowing your phone up thursday. you asked for this
```

when the time comes it texts you. if you don't answer it sends up to 4 more, 30 seconds apart, each one less polite than the last (or gentler, if pressure makes you freeze up), and stops the moment you reply.

it also does the smaller things. "remind me to take my meds in 20 minutes" works, and so does "shower every 3 days but not on tuesdays". text it a photo of your syllabus and it pulls out every due date. "nag me when i get home to take out the trash" works through an ios shortcut and a geofence. there's a web dashboard where you can see your assignments, mark things done and pick a persona (coach, snarky or anxious). you sign in with a code nudge texts you, so there are no passwords.

## seatsnipe

during add/drop at gsu, classes fill up and seats open for minutes at a time. seatsnipe watches a section for you and texts you the second a seat opens. 152 students used it in fall 2026, 100 of them in the first 24 hours. as of november 2026 it works at georgia tech too, my friend at tech built the gt side.

```
You:   watch CSC 1301
Nudge: Found 3 sections for CSC 1301 — reply with a number:
       1. CRN 12343, Sec 002 MW 11–12:15, Saghaeiannejad (40 seats open)
       2. CRN 12344, Sec 005 TR 2–3:15, Williams (FULL)
       3. CRN 12345, Sec 008 Online Async, Johnson (FULL)
You:   3
Nudge: Watching CSC 1301 Sec 008 (CRN 12345). I'll text you the second a seat opens.

[3 hours later]
Nudge: 🚨 Seat opened in CSC 1301 (Sec 008, Online Async, Johnson), 1 seat available! Register at gosolar.gsu.edu before it fills up.
```

it polls banner about every 90 seconds during the day (a bit faster when registration is busy) and every 15 minutes overnight. georgia tech's banner rate-limits harder, so gt sections get checked about every 3 minutes. an alert only fires when a section goes from zero seats to some, so a seat flapping open and closed doesn't text you five times, and seats held for a waitlist count as zero. each watch gets 3 alerts, then retires and tells you how to re-arm it. you can hold 5 watches at once, and they all expire on their own when add/drop closes.

the hard part was banner itself. gsu's registration api has no public docs and answers 200 with empty results if you call it out of order. i captured the real request chain from browser dev tools and rebuilt the 3-step session-cookie handshake in code, with a mutex and a 500ms rate limiter so concurrent polls don't thrash the session, and a circuit breaker that pauses for 10 minutes after 5 errors. georgia tech's banner was its own problem. it pushes back if you hit it too often, so every process shares one redis lease and one session and takes turns, and its public seat panel leaves out the shared seats on cross-listed sections, so those get checked against course search instead. the whole story is in [the seatsnipe write-up](https://zachinyang.com/work/seatsnipe-add-drop).

## how it's built

```
iMessage → BlueBubbles → webhook → next.js api (vercel)
                                         ↓
                                   claude agent loop
                                         ↓
                              bullmq (upstash redis)
                                         ↓
                              worker (pm2, always on)
                             /                       \
                    reminder jobs              seatsnipe watcher loop
                                                      ↓
                                             banner api polling
                                                      ↓
                                              alert → iMessage
```

typescript, next.js 15, postgres on neon with prisma, bullmq on upstash redis, bluebubbles for imessage, the anthropic api, docker.

serverless functions die after each request, so a delayed reminder can't just sleep. a next.js route handles the webhook and a separate always-on worker consumes the queue and fires reminders on time, with recovery on boot so nothing is lost if the worker restarts.

a text going out twice is the bug i spent the most time on. duplicates can come from three places at once (serverless retries, bullmq retries, two watcher ticks overlapping), so each send has to win an atomic database claim that rolls back if the send fails, pass a redis set nx check keyed on the message guid, and carry a deterministic bullmq job id. the claude agent runs a tool-use loop across 15 tools, keeps a 20-message rolling history, and pushes any assignment reminder that would land overnight to 9am in your own timezone.

---

copyright © 2026 zach inyang. all rights reserved.

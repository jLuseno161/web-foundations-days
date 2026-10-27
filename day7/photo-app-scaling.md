# SnapShare Scaling Plan

## 1. Assumptions
- 10,000,000 registered users; 10% are active daily, so DAU = **1,000,000**.
- Each active user uploads 1 photo and views 50 feed pages per day (one request per page).
- A photo is 2 MB and its thumbnail is 50 KB (1 MB = 1,000,000 bytes).
- 86,400 seconds per day; peak traffic = 5× the average. Metadata and backups are ignored.

## 2. Estimates

| Measure | Calculation | Result |
|---|---|---|
| Uploads per second | 1,000,000 ÷ 86,400 | ≈ 12 average, ≈ 58 peak |
| Feed views per second | 50,000,000 ÷ 86,400 | ≈ 579 average, ≈ 2,900 peak |
| Photo storage per year | (1M × 2 MB + 1M × 50 KB) × 365 | ≈ 748 TB (730 TB originals + 18.25 TB thumbnails) |

## 3. Read-heavy or write-heavy?
The system is **read-heavy**: about 579 feed views per second against 12 uploads per second, roughly 50 reads for every write. So we optimise reads first (CDN, cache, read replica) and push slow write work, such as thumbnails, into background jobs.

## 4. Where photos are stored
Photos stay out of the database: 2 MB files would bloat it, slow backups and replication, and cost far more than file storage. They go in **object storage**, and the database keeps only metadata and the file's storage key.

## 5. Architecture diagram

```
Users
  |
  v
[CDN] --------------------------> [Object storage]
  |                                    ^       ^
  v                                    |       |
[Load balancer]                        |       |
  |                                    |       |
  v                                    |       |
[App servers 1..N] -------------------+       |
  |      |      |                              |
  |      |      |                              |
  |      |      +--> [Queue] --> [Thumbnail worker]
  |      |
  |      +--> [Primary database] --> [Read replica]
  |
  +--> [Cache (Redis)]
```

Originals are saved by the app servers, and thumbnails by the worker. Feed reads go to the cache first, then the read replica; writes go to the primary database.

## 6. What each component does
- **CDN:** Serves photos and thumbnails from servers near users, so images load fast and most image traffic never reaches our servers.
- **Load balancer:** Spreads requests across the app servers and avoids any that fail.
- **App servers:** Run the application logic (login, upload, feed) and, being stateless, can be added as traffic grows.
- **Cache (Redis):** Keeps ready-made feeds in memory so repeated reads skip the database.
- **Primary database:** Stores users, follows and photo metadata, and handles all writes.
- **Read replica:** Holds a copy of the primary and answers read queries, protecting the primary from heavy read traffic.
- **Object storage:** Stores the photo files cheaply and durably, keeping them out of the database.
- **Queue:** Holds "create thumbnail" jobs so uploads finish fast and no job is lost in busy periods.
- **Thumbnail worker:** Takes jobs from the queue, creates the 50 KB thumbnail and saves it, so slow image processing never delays an upload.

## 7. Upload flow
1. The app sends the upload (with the login token) through the CDN and load balancer to an app server.
2. The app server checks the login, file type and size.
3. It saves the original in object storage and gets its storage key.
4. It writes a metadata row to the primary database (thumbnail status "pending").
5. It puts a "create thumbnail" job (photo id and storage key) on the queue.
6. It replies "upload successful" straight away, without waiting for the thumbnail.
7. A worker takes the job, reads the original, creates the 50 KB thumbnail and saves it to object storage.
8. The worker marks the row "ready" (failed jobs are retried), followers' cached feeds are expired so the photo appears, and the CDN caches the thumbnail on first view.

## 8. Trade-offs
- **Thumbnails by queue (speed vs. complexity):** Uploads stay fast, but a photo may have no thumbnail for a few seconds (show a placeholder), and we must run, monitor and retry a queue and workers.
- **Read replica (capacity vs. eventual consistency):** Replicas handle many more reads, but they lag slightly behind the primary, so a user may briefly not see their own new photo. Reads right after a write can go to the primary.
- **Cache and CDN (speed vs. freshness):** They make the feed fast and cheap, but cached data can be stale, and deleted photos may linger until the cache expires.
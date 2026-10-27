# SnapShare Scaling Plan

SnapShare is a photo-sharing app where users upload photos and scroll a feed of photos from people they follow.

## 1. Assumptions

- There are 10,000,000 registered users.
- 10% of them are active each day, so daily active users (DAU) = 10,000,000 × 0.10 = **1,000,000**.
- Each active user uploads 1 photo per day, so there are 1,000,000 uploads per day.
- Each active user views 50 feed pages per day, so there are 50,000,000 feed views per day. Each feed page is one request.
- An average photo is 2 MB, and each photo also gets a 50 KB thumbnail.
- There are 86,400 seconds in a day, and traffic is averaged over the whole day.
- Peak traffic is 5× the average.
- Units are decimal: 1 MB = 1,000,000 bytes and 1 TB = 1,000,000 MB.
- Storage counts only the photo files. Metadata (users, captions, follows) is small by comparison and ignored, and copies made for backups are not counted.

## 2. Estimates

| Measure | Calculation | Result |
|---|---|---|
| Uploads per second (average) | 1,000,000 ÷ 86,400 | ≈ 12 per second |
| Uploads per second (peak) | 12 × 5 | ≈ 58 per second |
| Feed views per second (average) | 50,000,000 ÷ 86,400 | ≈ 579 per second |
| Feed views per second (peak) | 579 × 5 | ≈ 2,900 per second |
| Original photos per day | 1,000,000 × 2 MB | 2 TB per day |
| Thumbnails per day | 1,000,000 × 50 KB | 50 GB per day |
| Photo storage per year | (2 TB + 0.05 TB) × 365 | ≈ 748 TB per year (730 TB originals + 18.25 TB thumbnails) |

Upload bandwidth follows from these numbers: about 12 × 2 MB = 24 MB/s on average and about 116 MB/s at peak.

## 3. Read-heavy or write-heavy?

SnapShare is **read-heavy**. There are about 579 feed views per second against only about 12 uploads per second, a ratio of roughly 50 reads to 1 write.

What this means for the design:

- Optimise the read path first: serve photos from a CDN, keep popular data in a cache, and send read queries to a read replica so the primary database is free for writes.
- Writes can be slower and more careful, so heavy work such as creating thumbnails is moved out of the upload request into a background job.
- Reads are cheap to scale by adding more copies (cache, replicas, CDN), whereas the single primary database is harder to scale, so we protect it.

## 4. Where photos are stored

Photos should **not** be stored inside the database. At 2 MB each, large files would make the database huge, slow down queries, backups and replication, and cost much more than plain file storage. A database is also not built to deliver files to millions of users, and a CDN cannot serve files straight from it.

Instead, photo files go in **object storage** (such as Amazon S3), which is cheap, very durable and scales to hundreds of terabytes. The database stores only the metadata, including the photo's owner, caption, time and the object storage key (the file's address).

## 5. Architecture diagram

```
                   Users (mobile app / web browser)
                                   |
                                   v
                     +---------------------------+
                     |            CDN            |
                     +---------------------------+
                                   | API calls and cache misses
                                   v
                     +---------------------------+
                     |       Load balancer       |
                     +---------------------------+
                                   |
                                   v
                     +---------------------------+
                     |   App servers (1 to N)    |
                     +-------------+-------------+
                                   |
         +----------------+--------+---------+----------------+
         v                v                  v                v
   +-----------+   +-------------+  +----------------+  +-----------+
   |   Cache   |   |  Database   |  | Object storage |  |   Queue   |
   |  (Redis)  |   |  (primary)  |  | (photo files)  |  |   (jobs)  |
   +-----------+   +------+------+  +--------^-------+  +-----+-----+
                          |                  |                |
                          v                  |                v
                  +-----------------+        |        +-----------------+
                  | Read replica    |        |        |    Thumbnail    |
                  +-----------------+        |        |      worker     |
                                             |        +--------+--------+
                                             |                 |
                                             +-----------------+
                                       reads the original, writes the thumbnail
```

(Feed reads go through the cache first, then the read replica. Writes always go to the primary database, which copies changes to the replica.)

## 6. What each component does

- **CDN:** Stores copies of photos and thumbnails at servers close to users, so images load fast and most image traffic never reaches our servers.
- **Load balancer:** Spreads incoming requests across many app servers so no single server is overloaded, and keeps traffic away from servers that fail.
- **App servers:** Run the application logic (login, uploads, building the feed), and because they keep no data of their own, we can add more of them as traffic grows.
- **Cache:** Keeps frequently requested data such as ready-made feeds in memory, so repeated reads are fast and the database is not hit every time.
- **Database (primary):** Stores the important structured data (users, follows, photo metadata) and handles all writes.
- **Read replica:** Holds a live copy of the primary database and answers read queries, so the heavy read traffic does not slow down writes.
- **Object storage:** Stores the photo files cheaply and durably, solving the problem of keeping hundreds of terabytes out of the database.
- **Queue:** Holds background jobs such as "create a thumbnail", so the upload request can finish quickly and jobs are not lost during busy periods.
- **Thumbnail worker:** Takes jobs from the queue, creates the 50 KB thumbnail from the original, and saves it, so the slow image processing happens outside the user's upload request.

## 7. Upload flow

1. The user picks a photo in the app, and the app sends an upload request (with the user's login token) through the CDN and load balancer to an app server.
2. The app server checks that the user is logged in and that the file is a valid image within the size limit.
3. The app server saves the original photo (about 2 MB) in object storage and receives its storage key.
4. The app server writes a metadata row to the primary database (photo id, user id, storage key, time, thumbnail status "pending").
5. The app server puts a "create thumbnail" job (photo id and storage key) on the queue.
6. The app server replies "upload successful" to the user straight away, without waiting for the thumbnail.
7. A thumbnail worker takes the job from the queue, reads the original from object storage, creates a 50 KB thumbnail and saves it back to object storage.
8. The worker updates the database row to mark the thumbnail as "ready". If the job fails, it is retried from the queue.
9. The cached feeds of the user's followers are refreshed or expired, so the new photo appears in their feeds. The CDN fetches the thumbnail on the first request and then serves it from its edge servers.

## 8. Trade-offs

- **Thumbnails by queue (speed vs. complexity).** Creating thumbnails in the background keeps uploads fast and smooths out busy periods, but a photo may have no thumbnail for a few seconds (the app must show a placeholder), and we now have to run, monitor and retry a queue and workers.
- **Caching and CDN (speed vs. freshness).** They make the read-heavy feed fast and cheap, but cached data can be out of date for a short time, deleted photos may linger until the cache expires, and clearing caches correctly is hard.
- **Read replica (read capacity vs. consistency).** Replicas let us handle many more reads, but they copy data with a small delay (replication lag). A user might upload a photo and briefly not see it in their own feed, so reads right after a write may need to go to the primary database.
- **Storing every photo forever (cost vs. completeness).** Keeping originals and thumbnails adds about 748 TB each year, which is costly. Moving old, rarely viewed photos to cheaper storage tiers saves money but makes them slower to open.
# TicketHub Design
 
## 1. Requirements
 
**Functional:** register and log in; browse and search events; view a seat map with live availability; hold seats for 5 minutes; pay and receive tickets; view my tickets.
 
**Non-functional:**
- **Speed:** pages under 1 s and the seat map under 500 ms, even in a big sale.
- **Correctness:** a seat is never sold twice, nobody is charged without a ticket, and payments are safe to retry.
- **Fairness:** first come, first served; bots and bulk buying are limited; "sold out" is answered quickly and honestly.
- **Availability and security:** the site stays up during a sale, and card data is handled only by the payment provider.
## 2. Estimates
 
Assumptions: 86,400 s per day; normal peak = 5x average; in the sale each buyer makes about 10 requests and 3 hold attempts.
 
| Measure | Normal day | Big sale (600 s) |
|---|---|---|
| Requests per second | 50,000 x 10 / 86,400 = 6 (peak 30) | 200,000 x 10 / 600 = 3,300 |
| Purchases per second | 5,000 / 86,400 = 0.06 | 20,000 / 600 = 33 |
| Hold attempts per second | about 0 | 200,000 x 3 / 600 = 1,000 |
 
**Comparison:** the sale is about 570x busier than a normal day, it hits one event, and 90% of buyers get no seat. Storage is small (about 2 GB of orders a year), so the problem is concurrency, not data size.
 
## 3. API
 
| Method | Path | Purpose | Success |
|---|---|---|---|
| GET | /events | Browse and search events | 200 |
| GET | /events/{id}/seats | Seat map with availability | 200 |
| POST | /events/{id}/holds | Hold seats for 5 min, body `{"seatIds":[101,102]}` | 201 |
| DELETE | /holds/{id} | Release a hold | 204 |
| POST | /orders | Pay for a hold (Idempotency-Key header) | 201 |
| GET | /me/tickets | View my tickets | 200 |
 
Errors: 400 invalid input, 401 not logged in, 402 payment failed, 404 unknown event, 409 seat already taken, 429 too many requests.
 
## 4. Data model
 
- **users** (user_id PK, name, email UNIQUE, password_hash)
- **events** (event_id PK, name, venue, starts_at)
- **seats** (seat_id PK, event_id FK, section, row_label, seat_number, price, status, held_by FK, hold_expires_at); UNIQUE (event_id, section, row_label, seat_number)
- **orders** (order_id PK, user_id FK, event_id FK, total_amount, status, payment_ref UNIQUE)
- **tickets** (ticket_id PK, order_id FK, seat_id FK UNIQUE)
Relationships: one user has many orders; one event has many seats and orders; one order has many tickets; each seat has at most one ticket.
 
## 5. Preventing double-booking
 
1. Seat status lives only in the primary database; the cache never decides who gets a seat.
2. A hold is one atomic conditional update, not "check, then update":
```sql
UPDATE seats SET status = 'held', held_by = :user, hold_expires_at = :now_plus_5min
WHERE seat_id = :seat
  AND (status = 'available' OR (status = 'held' AND hold_expires_at < :now));
```
 
The database locks the row, so concurrent requests run one at a time. The loser updates 0 rows and gets a 409. Expired holds count as available, so correctness does not depend on a cleanup job.
3. Holding and paying each run in one transaction; if any seat fails, everything rolls back.
4. `tickets.seat_id` is UNIQUE, so even if a bug let two buyers reach the end, the second INSERT fails and rolls back.
5. `payment_ref` is UNIQUE and orders use an idempotency key, so retries cannot create two orders or charges.
 
## 6. Architecture
 
```
Users
  |
  v
[CDN]  static files, event pages
  |
  v
[Waiting room]  admits buyers at a safe rate
  |
  v
[Load balancer]
  |
  v
[App servers 1..N]  (scaled up for a sale)
  |        |         |            |
  |        |         |            +--> [Payment provider] (external)
  |        |         +--> [Queue] --> [Workers]
  |        +--> [Primary DB] --> [Read replica]
  +--> [Cache (Redis)]
```
 
- **CDN:** serves images and public event pages near users, so most traffic never reaches our servers.
- **Waiting room:** admits buyers at a rate the system can handle, keeping the sale fair and stable.
- **Load balancer:** spreads requests over the app servers and skips failed ones.
- **App servers:** run the API and business rules; stateless, so more can be added for a sale.
- **Cache (Redis):** holds the seat map for 1 to 2 s and counts requests per user, so thousands of reads become one database read.
- **Primary DB:** stores seats and orders and enforces the locks and constraints that stop double-booking.
- **Read replica:** answers browsing queries so they never compete with seat updates.
- **Queue and workers:** create tickets, send emails and free expired holds outside the buyer's request.
- **Payment provider:** an external service that takes the payment, so we never store card data.
**Surviving the sale:** the CDN and cache absorb most of the 3,300 requests per second; the waiting room limits how many buyers reach the write path; the 1,000 hold attempts per second are small single-row updates the primary can handle; "sold out" answers come from the cache; slow work runs in the background; each buyer is limited to 4 seats, with rate limits against bots.
 
## 7. Trade-offs
 
- **Waiting room (fairness vs. experience):** it protects the system and gives everyone a fair turn, but buyers must wait and it is one more component to run.
- **5-minute holds (fairness vs. seat usage):** buyers have time to pay, but abandoned holds keep seats locked, so an event can look sold out when it is not.
- **Database decides, cache only displays (correctness vs. speed):** the seat map may be 1 to 2 s old, so a buyer can click a seat that was just taken and get a 409, which the app explains clearly.
- **Single primary database (simplicity vs. headroom):** it keeps transactions simple, but all seat writes go to one place; that is enough for one sale, and data can be split by event later.
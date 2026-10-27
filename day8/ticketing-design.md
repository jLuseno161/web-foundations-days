# TicketHub Design

TicketHub is a website that sells tickets for concerts and events.

## 1. Requirements

### Functional
- Users can register, log in and browse or search events.
- Users can view an event's seat map with live availability.
- Users can hold seats for a short time (5 minutes) while they pay.
- Users can pay and receive tickets, and view their tickets later.
- Users can release a hold, and expired holds free their seats automatically.

### Non-functional
- **Speed:** event pages load in under 1 second and the seat map in under 500 ms, even during a big sale.
- **Correctness:** a seat is never sold twice, and a user is never charged without getting a ticket. Payments must be safe to retry.
- **Fairness:** first come, first served. Bots and one person grabbing hundreds of seats are limited, and everyone gets a quick, honest answer when seats run out.
- **Availability:** the site stays up during a big sale.
- **Security:** card details are handled only by the payment provider.

## 2. Estimates

**Facts:** 2,000,000 registered users; 50,000 visitors a day, each viewing 10 pages; 5,000 tickets sold a day. A big sale has 200,000 buyers for 20,000 seats in the first 10 minutes (600 seconds).

**Assumptions:** 86,400 seconds in a day; normal peak = 5× the average; in the sale each buyer makes about 10 requests (event page, seat map refreshes, holds, payment) and about 3 hold attempts, because seats get taken while they choose.

| Measure | Normal day | Big sale (10 minutes) |
|---|---|---|
| Page views / requests per second | 500,000 ÷ 86,400 ≈ **6/s** average, ≈ 30/s peak | 200,000 × 10 ÷ 600 ≈ **3,300/s** |
| Purchases per second | 5,000 ÷ 86,400 ≈ **0.06/s** (one every 17 s) | 20,000 ÷ 600 ≈ **33/s** |
| Seat-hold attempts per second | negligible | 200,000 × 3 ÷ 600 ≈ **1,000/s** |
| Storage per year | 5,000 × 365 ≈ 1.8 million orders ≈ 2 GB | negligible |

**Comparison:** the big sale is about **570 times** busier than a normal day (3,300 vs 6 requests per second), and it is a sudden spike on one event, not a gradual rise. Also, only 10% of the 200,000 buyers can get a seat, so the system must answer "sold out" quickly and cheaply for the other 180,000. The size of the data is small, so the challenge is **concurrency**, not storage.

## 3. API

Base path `/v1`. All endpoints except login need a token, and `POST /orders` needs an `Idempotency-Key` header.

| Method | Path | Description | Success |
|---|---|---|---|
| `POST` | `/auth/login` | Log in and get a token | `200` |
| `GET` | `/events?q=&page=` | Browse or search events | `200` |
| `GET` | `/events/{id}` | Event details | `200` |
| `GET` | `/events/{id}/seats` | Seat map with availability | `200` |
| `POST` | `/events/{id}/holds` | Hold seats for 5 minutes | `201` |
| `DELETE` | `/holds/{id}` | Release a hold | `204` |
| `POST` | `/orders` | Pay for a hold and get tickets | `201` |
| `GET` | `/me/tickets` | View my tickets | `200` |

**Hold request** `POST /events/7/holds`: `{ "seatIds": [101, 102] }`. **Response `201`:** `{ "holdId": 55, "expiresAt": "2026-11-01T18:05:00Z" }`.

**Errors:** `400` invalid input (such as more than 4 seats), `401` not logged in, `404` unknown event, `409` **seat already taken** (`{ "error": "SEAT_UNAVAILABLE", "seatIds": [102] }`), `429` too many requests, `402` payment failed.

## 4. Data model

- **users:** `user_id` (PK), `name`, `email` (UNIQUE), `password_hash`, `created_at`
- **events:** `event_id` (PK), `name`, `venue`, `starts_at`, `on_sale_at`
- **seats:** `seat_id` (PK), `event_id` (FK to events), `section`, `row_label`, `seat_number`, `price`, `status` (`available`, `held` or `sold`), `held_by` (FK to users, can be empty), `hold_expires_at`. `UNIQUE (event_id, section, row_label, seat_number)`.
- **orders:** `order_id` (PK), `user_id` (FK to users), `event_id` (FK to events), `total_amount`, `status`, `payment_ref` (UNIQUE), `created_at`
- **tickets:** `ticket_id` (PK), `order_id` (FK to orders), `seat_id` (FK to seats, **UNIQUE**)

**Relationships:** one user has many orders; one event has many seats and many orders; one order has many tickets (one per seat); each seat has at most one ticket. Users and events are linked many-to-many through orders.

## 5. How double-booking is prevented

Two people clicking the same seat at the same moment is the main correctness risk. Several layers stop it:

1. **One source of truth.** The seat's status lives in the primary database. The cache is never used to decide who gets a seat.
2. **Atomic conditional update.** A hold is one statement, not a "check, then update" in the app, which would let two requests both see "available":

```sql
UPDATE seats
SET status = 'held', held_by = :user_id, hold_expires_at = :now_plus_5_min
WHERE seat_id = :seat_id
  AND (status = 'available' OR (status = 'held' AND hold_expires_at < :now));
```

   The database locks the row while updating, so concurrent requests run one after the other. The second request finds the seat already held, updates **0 rows**, and the app returns `409`.
3. **Transaction.** Holding several seats, and later paying, each run in one transaction (`BEGIN ... COMMIT`). If any seat fails, everything rolls back, so a user never gets half of their seats.
4. **Constraint as a safety net.** `tickets.seat_id` is **UNIQUE**. Even if an application bug let two buyers reach the final step, the second `INSERT` fails and its transaction is rolled back. The database refuses to create two tickets for one seat.
5. **Checks at payment.** Before creating the order, the transaction confirms the hold belongs to this user and has not expired, then marks the seats `sold` and inserts the tickets. A background worker also frees expired holds, but correctness does not depend on it because step 2 treats an expired hold as available.
6. **Safe retries.** `payment_ref` is UNIQUE and `POST /orders` uses an idempotency key, so a double-click or network retry cannot create two orders or charge twice.

## 6. Architecture

```
Users
  |
  v
[CDN]  static files and event pages
  |
  v
[Waiting room]  admits buyers at a controlled rate
  |
  v
[Load balancer]
  |
  v
[App servers 1..N]  (extra servers added for a sale)
  |        |         |            |
  |        |         |            +--> [Payment provider]  (external)
  |        |         +--> [Queue] --> [Workers]  (tickets, emails, free expired holds)
  |        +--> [Primary database]  (seats, orders) --> [Read replica]  (browsing)
  +--> [Cache (Redis)]  (event pages, seat map snapshot, rate limits)
```

- **CDN:** Serves images, scripts and public event pages from servers near users, so most traffic never reaches our servers.
- **Waiting room:** Lets buyers into the sale at a rate the system can handle, which keeps the sale fair and prevents a crash.
- **Load balancer:** Spreads requests across the app servers and avoids any that fail.
- **App servers:** Run the API and business rules, and being stateless, more can be added quickly for a sale.
- **Cache (Redis):** Holds the seat map for 1 to 2 seconds and counts requests per user, so thousands of identical reads become one database read.
- **Primary database:** Holds the seats and orders and applies the locks and constraints that stop double-booking.
- **Read replica:** Answers browsing queries so they do not compete with the seat updates.
- **Queue and workers:** Do the slow jobs (create tickets and QR codes, send emails, free expired holds) outside the buyer's request.
- **Payment provider:** An outside service that takes the card payment, so we never store card details.

**How it survives the big sale:**
- The CDN and cache absorb most of the 3,300 requests per second, and only holds and payments reach the primary database.
- The waiting room caps how many buyers reach the write path at once.
- Hold attempts (about 1,000 a second) are small updates to single rows, which a primary database can handle. Row-level locking means different seats do not block each other.
- "Sold out" answers come from the cache, so the 180,000 unlucky buyers cost almost nothing.
- Slow work and email run in the background, so a slow payment or email never holds a seat lock.
- Each buyer is limited to 4 seats, and rate limits and CAPTCHA reduce bots.

## 7. Trade-offs

- **Fairness vs. user experience (waiting room).** It protects the system and gives everyone a fair turn, but buyers must wait, which can be frustrating, and it adds a component to build and run.
- **Hold time (fairness vs. seat usage).** A 5-minute hold gives people time to pay without losing their seat, but it keeps seats locked from others, and abandoned holds make a sale look sold out when it is not. A shorter hold frees seats faster but rushes buyers.
- **Strong consistency vs. speed (database vs. cache).** Deciding seats only in the primary database guarantees correctness, but it is slower than using the cache. The cached seat map may be 1 to 2 seconds old, so a buyer can click a seat that was just taken and get a `409`. The app handles this with a clear message.
- **One primary database vs. scale (simplicity vs. headroom).** A single primary keeps transactions simple and consistent, but all seat writes go to one place. For one event that is enough. If TicketHub grows to many simultaneous sales, we can split the data by event.
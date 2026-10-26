# Library API Design

A REST API for a library's `books` resource. All requests and responses use JSON.

## Endpoints

### 1. List all books
- **Method and path:** `GET /books`
- **Description:** Returns every book in the library.
- **Request body:** none
- **Success status:** `200 OK`

### 2. Get one book
- **Method and path:** `GET /books/{id}`
- **Description:** Returns the book with the given id.
- **Request body:** none
- **Success status:** `200 OK`

### 3. Create a book
- **Method and path:** `POST /books`
- **Description:** Adds a new book to the library.
- **Example request body:**

```json
{
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "isbn": "9780385474542",
  "publishedYear": 1958
}
```

- **Success status:** `201 Created`

### 4. Update a book
- **Method and path:** `PUT /books/{id}`
- **Description:** Replaces the details of an existing book.
- **Example request body:**

```json
{
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "isbn": "9780385474542",
  "publishedYear": 1959
}
```

- **Success status:** `200 OK`

### 5. Delete a book
- **Method and path:** `DELETE /books/{id}`
- **Description:** Removes the book with the given id.
- **Request body:** none
- **Success status:** `204 No Content`

### 6. List books by an author
- **Method and path:** `GET /books?author={name}`
- **Example:** `GET /books?author=Chinua%20Achebe`
- **Description:** Returns only the books written by the given author, using a query parameter.
- **Request body:** none
- **Success status:** `200 OK` (an empty list `[]` if the author has no books)

## Error codes

### 400 Bad Request
- The request is invalid or incomplete, so the server cannot process it.
- **Example:** `POST /books` is sent without a `title`, or with `publishedYear` set to `"abc"` instead of a number.

### 404 Not Found
- The requested book does not exist.
- **Example:** `GET /books/9999` when there is no book with id `9999`. The same applies to `PUT` and `DELETE` on an id that does not exist.
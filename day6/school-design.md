# School Database Design

## Tables

- **students** stores one row per student: a unique `student_id` (primary key), their `name`, and their `email`, which must be unique so no two students share an address.
- **courses** stores one row per course: a unique `course_id` (primary key), a unique course `code` (such as WEB101) and the course `title`.
- **enrolments** records the fact that a student is taking a course. Each row has its own `enrolment_id`, a `student_id` and `course_id` (both foreign keys), and the `grade`, which stays empty until the student is marked. A `UNIQUE (student_id, course_id)` rule stops the same student enrolling on the same course twice.

## Relationships

- **students to enrolments is one-to-many.** One student can have many enrolments, but each enrolment belongs to exactly one student.
- **courses to enrolments is one-to-many.** One course can have many enrolments, but each enrolment belongs to exactly one course.
- **students to courses is many-to-many.** A student can take many courses, and a course has many students.

A join table (`enrolments`) is needed because a relational column holds a single value. We cannot store a list of course ids in a student row, or a list of student ids in a course row, without breaking the rules of the model and making queries and updates messy. The join table turns one many-to-many relationship into two one-to-many relationships. It also gives a natural home for data that belongs to the pair, such as the grade, which is neither the student's nor the course's alone.

## Index

I would add an index on the course in the enrolments table:

`CREATE INDEX idx_enrolments_course_id ON enrolments (course_id);`

The `UNIQUE (student_id, course_id)` rule already creates an index that speeds up looking up a student's enrolments, but it does not help when searching by course first. Queries such as "all students on a course" and "number of students per course" filter and group by `course_id`, so this index lets the database find those rows directly instead of scanning the whole enrolments table as it grows.

## SQL or NoSQL?

I would choose SQL for this system. The data is highly structured and relational: students, courses and enrolments always have the same fields and are connected by clear relationships. A SQL database enforces that structure with primary keys, foreign keys, `NOT NULL`, `UNIQUE` and `CHECK` rules, so bad data such as a duplicate enrolment or an enrolment for a student who does not exist is rejected automatically. Joins and aggregates like `COUNT` and `GROUP BY` also make the questions a school asks, such as who is on a course or who has no enrolments, simple to write. NoSQL would be a better fit if the data had no fixed shape or needed to scale across huge numbers of servers, but neither is the case for a school records system.
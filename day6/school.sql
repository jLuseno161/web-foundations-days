-- School database for SQLite
PRAGMA foreign_keys = ON;

-- Drop in reverse order so the script can be re-run safely
DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

-- ---------- 1. Tables ----------
CREATE TABLE students (
  student_id INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
  course_id INTEGER PRIMARY KEY,
  code      TEXT NOT NULL UNIQUE,
  title     TEXT NOT NULL
);

CREATE TABLE enrolments (
  enrolment_id INTEGER PRIMARY KEY,
  student_id   INTEGER NOT NULL,
  course_id    INTEGER NOT NULL,
  grade        INTEGER CHECK (grade BETWEEN 0 AND 100),  -- NULL until graded
  FOREIGN KEY (student_id) REFERENCES students (student_id),
  FOREIGN KEY (course_id)  REFERENCES courses (course_id),
  UNIQUE (student_id, course_id)  -- a student cannot enrol on the same course twice
);

-- ---------- 2. Sample data ----------
INSERT INTO students (student_id, name, email) VALUES
  (1, 'Amina Wanjiru', 'amina@school.test'),
  (2, 'Brian Otieno',  'brian@school.test'),
  (3, 'Grace Mutua',   'grace@school.test'),
  (4, 'David Kamau',   'david@school.test');

INSERT INTO courses (course_id, code, title) VALUES
  (1, 'WEB101', 'HTML & CSS'),
  (2, 'WEB102', 'JavaScript'),
  (3, 'DB101',  'Databases'),
  (4, 'PY101',  'Python');

INSERT INTO enrolments (student_id, course_id, grade) VALUES
  (1, 1, 85),
  (1, 2, 90),
  (1, 3, 95),
  (2, 1, 72),
  (2, 3, NULL),
  (3, 2, 78),
  (3, 3, 88);

-- ---------- 3. Queries ----------

-- Query 1: all courses for one student (by name)
SELECT students.name, courses.title, enrolments.grade
FROM students
JOIN enrolments ON enrolments.student_id = students.student_id
JOIN courses    ON courses.course_id = enrolments.course_id
WHERE students.name = 'Amina Wanjiru';
-- Expected: HTML & CSS (85), JavaScript (90), Databases (95)

-- Query 2: all students on one course
SELECT courses.title, students.name, enrolments.grade
FROM courses
JOIN enrolments ON enrolments.course_id = courses.course_id
JOIN students   ON students.student_id = enrolments.student_id
WHERE courses.title = 'Databases'
ORDER BY students.name;
-- Expected: Amina Wanjiru (95), Brian Otieno (NULL), Grace Mutua (88)

-- Query 3: number of students per course (LEFT JOIN keeps courses with 0 students)
SELECT courses.title, COUNT(enrolments.enrolment_id) AS student_count
FROM courses
LEFT JOIN enrolments ON enrolments.course_id = courses.course_id
GROUP BY courses.course_id, courses.title
ORDER BY student_count DESC, courses.title;
-- Expected: Databases 3, HTML & CSS 2, JavaScript 2, Python 0

-- Query 4: students who have no enrolments
SELECT students.name, students.email
FROM students
LEFT JOIN enrolments ON enrolments.student_id = students.student_id
WHERE enrolments.enrolment_id IS NULL;
-- Expected: David Kamau

-- Query 5: update one enrolment's grade (Brian's grade for Databases)
UPDATE enrolments
SET grade = 80
WHERE student_id = (SELECT student_id FROM students WHERE name = 'Brian Otieno')
  AND course_id  = (SELECT course_id FROM courses WHERE title = 'Databases');

-- Check the update worked
SELECT students.name, courses.title, enrolments.grade
FROM enrolments
JOIN students ON students.student_id = enrolments.student_id
JOIN courses  ON courses.course_id = enrolments.course_id
WHERE students.name = 'Brian Otieno' AND courses.title = 'Databases';
-- Expected: Brian Otieno, Databases, 80
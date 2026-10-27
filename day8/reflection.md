# Reflection

**Most difficult concept.** The hardest concepts for me were many-to-many join tables and
preventing double-booking.

With many-to-many relationships, I could not see why I needed a third table. It clicked when I
realised that a column can only hold one value, so a student cannot store a list of courses in
one cell. A join table solves this by holding one row for each pair, with a foreign key to each
side. I overcame it by running the Day 6 school database in an SQLite playground and tracing
what each JOIN returned.

Double-booking was harder because the problem only appears when two people act at the same
moment. Checking that a seat is free and then updating it in two separate steps is not safe,
because both buyers can see it as available. The fix is to check and update in one atomic
statement inside a transaction, with a UNIQUE constraint on the seat as a safety net. I worked
through it by following what two buyers would do, step by step, until I could explain each
layer.

**What I would improve in my capstone.** The feedback showed that my Project 2 link could not
be found and that my Day 7 file was cut off before the end. Next time I will check that the
repository is public and fully pushed, and read the end of each file on GitHub before
submitting.

**What I will learn next.** Next I want to learn Docker and CI/CD, because they are how
projects like these get tested and deployed reliably. I plan to start by putting one of my
projects in a container.
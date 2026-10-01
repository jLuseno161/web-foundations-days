let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

const VALID_CATEGORIES = ["personal", "work", "study"];

// Helper: trims, collapses repeated spaces and lowercases
function normalise(text) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

// 1. Returns notes whose text contains the word (case-insensitive)
function searchNotes(word) {
  const search = word.toLowerCase();
  return notes.filter((note) => note.text.toLowerCase().includes(search));
}

// 2. Returns the note with the most characters, or null if there are none
function longestNote() {
  if (notes.length === 0) {
    return null;
  }
  let longest = notes[0];
  for (const note of notes) {
    if (note.text.length > longest.text.length) {
      longest = note;
    }
  }
  return longest;
}

// 3. Returns an object counting notes per category
function countByCategory() {
  const counts = {};
  for (const note of notes) {
    counts[note.category] = (counts[note.category] || 0) + 1;
  }
  return counts;
}

// 4. Returns a sentence such as "5 notes: 2 personal, 1 work, 2 study."
function getSummary() {
  const counts = countByCategory();
  const total = notes.length;
  const noun = total === 1 ? "note" : "notes";

  if (total === 0) {
    return `0 ${noun}.`;
  }

  const parts = [];
  for (const category of VALID_CATEGORIES) {
    if (counts[category]) {
      parts.push(`${counts[category]} ${category}`);
    }
  }
  return `${total} ${noun}: ${parts.join(", ")}.`;
}

// 5. True if a note with the same text exists (ignoring case and extra spaces)
function isDuplicate(text) {
  const target = normalise(text);
  return notes.some((note) => normalise(note.text) === target);
}

// 6. Adds a note if valid. Returns true when added, false otherwise
function addNote(text, category) {
  if (typeof text !== "string" || text.trim().length === 0) {
    console.log("Not added: the note text is empty.");
    return false;
  }
  if (text.trim().length > 200) {
    console.log("Not added: the note text is longer than 200 characters.");
    return false;
  }
  if (isDuplicate(text)) {
    console.log("Not added: this note already exists.");
    return false;
  }
  if (!VALID_CATEGORIES.includes(category)) {
    console.log("Not added: category must be personal, work or study.");
    return false;
  }

  const nextId = notes.length > 0 ? Math.max(...notes.map((n) => n.id)) + 1 : 1;
  notes.push({ id: nextId, text: text.trim(), category: category });
  return true;
}

// ---------- TESTS ----------

// searchNotes
console.log(searchNotes("JAVASCRIPT"));
// [ { id: 4, text: "Revise JavaScript arrays", category: "study" } ]
console.log(searchNotes("zebra"));
// [] (edge case: no results)
console.log(searchNotes("the"));
// 2 notes: id 2 ("Finish the Day 3 assignment") and id 3 ("Email the project report to Grace")

// longestNote
console.log(longestNote());
// { id: 3, text: "Email the project report to Grace", category: "work" }
const savedNotes = notes;
notes = [];
console.log(longestNote());
// null (edge case: empty array)
notes = savedNotes;

// countByCategory
console.log(countByCategory());
// { personal: 2, study: 2, work: 1 }
notes = [];
console.log(countByCategory());
// {} (edge case: empty array)
notes = savedNotes;

// getSummary
console.log(getSummary());
// "5 notes: 2 personal, 1 work, 2 study."
notes = [{ id: 1, text: "Only note", category: "work" }];
console.log(getSummary());
// "1 note: 1 work." (edge case: singular)
notes = [];
console.log(getSummary());
// "0 notes." (edge case: empty array)
notes = savedNotes;

// isDuplicate
console.log(isDuplicate("  buy MILK   and bread "));
// true (ignores case and extra spaces)
console.log(isDuplicate("Buy eggs"));
// false

// addNote
console.log(addNote("Buy eggs", "personal"));
// true
console.log(addNote("buy   EGGS", "personal"));
// "Not added: this note already exists." then false
console.log(addNote("   ", "work"));
// "Not added: the note text is empty." then false
console.log(addNote("a".repeat(201), "work"));
// "Not added: the note text is longer than 200 characters." then false
console.log(addNote("Plan the holiday", "fun"));
// "Not added: category must be personal, work or study." then false
console.log(addNote("a".repeat(200), "study"));
// true (edge case: exactly 200 characters is allowed)

console.log(getSummary());
// "7 notes: 3 personal, 1 work, 3 study."
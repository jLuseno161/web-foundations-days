const textarea = document.getElementById("note-text");
const charCount = document.getElementById("char-count");
const wordCount = document.getElementById("word-count");
const clearBtn = document.getElementById("clear-btn");
const themeToggle = document.getElementById("theme-toggle");

const MAX_CHARS = 200;
const WARNING_AT = 180;

function updateCounts() {
  const text = textarea.value;
  const chars = text.length;
  const trimmed = text.trim();
  const words = trimmed === "" ? 0 : trimmed.split(/\s+/).length;

  charCount.textContent = `${chars} / ${MAX_CHARS} characters`;
  wordCount.textContent = `${words} words`;

  charCount.classList.toggle("warning", chars > WARNING_AT);
  charCount.classList.toggle("over", chars > MAX_CHARS);
}

function clearAll() {
  textarea.value = "";
  localStorage.removeItem("draft");
  updateCounts();
}

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.body.classList.toggle("dark", isDark);
  themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
}

// Typing: update counters and save the draft
textarea.addEventListener("input", function () {
  updateCounts();
  localStorage.setItem("draft", textarea.value);
});

// Escape inside the textarea clears everything
textarea.addEventListener("keydown", function (event) {
  if (event.key === "Escape") {
    clearAll();
  }
});

// Clear button
clearBtn.addEventListener("click", clearAll);

// Theme button
themeToggle.addEventListener("click", function () {
  const nextTheme = document.body.classList.contains("dark") ? "light" : "dark";
  applyTheme(nextTheme);
  localStorage.setItem("theme", nextTheme);
});

// On page load: restore draft and theme
const savedDraft = localStorage.getItem("draft");
if (savedDraft !== null) {
  textarea.value = savedDraft;
}
applyTheme(localStorage.getItem("theme"));
updateCounts();
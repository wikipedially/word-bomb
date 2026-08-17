let dictionaryData = {};

// fetch dict.json when page is loaded
async function loadDictionary() {
  try {
    const response = await fetch('dict.json');
    dictionaryData = await response.json();
    console.log(
      `Loaded ${Object.keys(dictionaryData).length} words into memory.`
    );
  } catch (error) {
    console.error('Failed to load dictionary:', error);
    document.getElementById(
      'results-container'
    ).innerHTML = `<p class="placeholder-text" style="color: #ff6b6b;">Error loading dict.json. Check console.</p>`;
  }
}

loadDictionary();

const searchInput = document.getElementById('search-input');
const resultsContainer = document.getElementById('results-container');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modal-body');
const closeModalBtn = document.getElementById('close-modal');

// user input text box
searchInput.addEventListener('input', (e) => {
  const query = e.target.value.trim();

  if (query === '') {
    resultsContainer.innerHTML = `<p class="placeholder-text">Enter a search query for results.</p>`;
    return;
  }

  searchWords(query);
});

// search filter logic
function searchWords(query) {
  const words = Object.keys(dictionaryData);
  let matchedWords = [];

  try {
    const regex = new RegExp(query, 'i');
    matchedWords = words.filter((word) => regex.test(word));
  } catch (err) {
    matchedWords = words.filter((word) =>
      word.toLowerCase().includes(query.toLowerCase())
    );
  }

  matchedWords.sort((a, b) => a.localeCompare(b));

  renderResults(matchedWords);
}

// display filtered words
function renderResults(words) {
  if (words.length === 0) {
    resultsContainer.innerHTML = `<p class="placeholder-text">No matching words found.</p>`;
    return;
  }

  const displayWords = words.slice(0, 100); // limit word display to 100

  let html = `<p style="font-size: 0.85rem; color: #888; margin-bottom: 0.5rem;">Found ${words.length} matches:</p>`;
  html += `<div class="word-grid">`;

  displayWords.forEach((word) => {
    html += `<button class="word-pill" data-word="${word}">${word}</button>`;
  });

  if (words.length > 100) {
    html += `<p style="color: #888; font-style: italic; margin-top: 0.5rem;">Showing first 100 results...</p>`;
  }

  html += `</div>`;
  resultsContainer.innerHTML = html;

  // click listeners for word-pills
  document.querySelectorAll('.word-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      const word = btn.getAttribute('data-word');
      openModal(word);
    });
  });
}

// modal body
function openModal(word) {
  const entries = dictionaryData[word];
  let content = `<h2>${word}</h2>`;

  entries.forEach((entry, index) => {
    content += `<div class="definition-entry">`;
    content += `<span class="pos-tag">${entry.pos}</span>`;

    if (entry.pron) {
      content += `<span class="ipa-tag">${entry.pron}</span>`;
    }

    if (Array.isArray(entry.def)) {
      content += `<ul class="def-list">`;
      entry.def.forEach((d) => {
        content += `<li>${d}</li>`;
      });
      content += `</ul>`;
    } else {
      content += `<p>${entry.def}</p>`;
    }

    content += `</div>`;

    if (index < entries.length - 1) {
      content += `<hr style="border-color: #333; margin: 1rem 0;">`;
    }
  });

  modalBody.innerHTML = content;
  modal.classList.remove('hidden');
}

// close modal if X is clicked
closeModalBtn.addEventListener('click', () => {
  modal.classList.add('hidden');
});

// close modal if clicking outside
modal.addEventListener('click', (e) => {
  if (e.target === modal) {
    modal.classList.add('hidden');
  }
});

// close modal when ESC is pressed
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
    modal.classList.add('hidden');
  }
});

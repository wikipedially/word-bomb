let dictionaryData = {};
let currentMatchedWords = [];
let displayedCount = 0;
const BATCH_SIZE = 100;

let sortType = 'alpha'; // 'alpha' or 'length'
let sortDirection = 'desc'; // 'asc' or 'desc'

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
const sortTypeBtn = document.getElementById('sort-type-btn');
const sortTypeIcon = document.getElementById('sort-type-icon');
const sortDirBtn = document.getElementById('sort-dir-btn');
const sortDirIcon = document.getElementById('sort-dir-icon');

// user input text box
searchInput.addEventListener('input', (e) => {
  const query = e.target.value.trim();

  if (query === '') {
    resultsContainer.innerHTML = `<p class="placeholder-text">Enter a search query for results.</p>`;
    currentMatchedWords = [];
    displayedCount = 0;
    return;
  }

  searchWords(query);
});

// sort type button listener
sortTypeBtn.addEventListener('click', () => {
  sortType = sortType === 'alpha' ? 'length' : 'alpha';
  
  // update icon
  if (sortType === 'alpha') {
    sortTypeIcon.className = 'fa-solid fa-arrow-down-a-z';
    sortTypeBtn.title = 'Current: Alphabetical (Click to switch to Length)';
  } else {
    sortTypeIcon.className = 'fa-solid fa-arrow-down-1-9';
    sortTypeBtn.title = 'Current: Length (Click to switch to Alphabetical)';
  }

  if (currentMatchedWords.length > 0) {
    applySortingAndRender();
  }
});

// sort direction button listener
sortDirBtn.addEventListener('click', () => {
  sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  
  // update icon
  if (sortDirection === 'asc') {
    sortDirIcon.className = 'fa-solid fa-arrow-up';
    sortDirBtn.title = 'Current: Ascending (Click to switch to Descending)';
  } else {
    sortDirIcon.className = 'fa-solid fa-arrow-down';
    sortDirBtn.title = 'Current: Descending (Click to switch to Ascending)';
  }

  if (currentMatchedWords.length > 0) {
    applySortingAndRender();
  }
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

  currentMatchedWords = matchedWords;
  applySortingAndRender();
}

// sorting utility function
function applySortingAndRender() {
  currentMatchedWords.sort((a, b) => {
    let comparison = 0;
    if (sortType === 'alpha') {
      comparison = a.localeCompare(b);
    } else {
      comparison = a.length - b.length;
      if (comparison === 0) {
        comparison = a.localeCompare(b);
      }
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  displayedCount = 0;
  renderResults();
}

// display filtered words in batches (100) with infinite scroll support
function renderResults() {
  if (currentMatchedWords.length === 0) {
    resultsContainer.innerHTML = `<p class="placeholder-text">No matching words found.</p>`;
    return;
  }

  if (displayedCount === 0) {
    let html = `<p style="font-size: 0.85rem; color: var(--text-subtle); margin-bottom: 0.5rem;">Found ${currentMatchedWords.length} matches:</p>`;
    html += `<div class="word-grid" id="word-grid-container"></div>`;
    resultsContainer.innerHTML = html;

    const gridContainer = document.getElementById('word-grid-container');
    gridContainer.addEventListener('scroll', handleGridScroll);
  }

  const gridContainer = document.getElementById('word-grid-container');
  if (!gridContainer) return;

  const nextBatchEnd = Math.min(
    displayedCount + BATCH_SIZE,
    currentMatchedWords.length
  );
  const batchToRender = currentMatchedWords.slice(displayedCount, nextBatchEnd);

  let batchHtml = '';
  batchToRender.forEach((word) => {
    batchHtml += `<button class="word-pill" data-word="${word}">${word}</button>`;
  });

  gridContainer.insertAdjacentHTML('beforeend', batchHtml);
  displayedCount = nextBatchEnd;
  
  gridContainer.querySelectorAll('.word-pill').forEach((btn) => {
    if (!btn.dataset.bound) {
      btn.dataset.bound = 'true';
      btn.addEventListener('click', () => {
        const word = btn.getAttribute('data-word');
        openModal(word);
      });
    }
  });
}

// checks if scrolled near bottom of word list
function handleGridScroll(e) {
  const target = e.target;
  if (target.scrollTop + target.clientHeight >= target.scrollHeight - 30) {
    if (displayedCount < currentMatchedWords.length) {
      renderResults();
    }
  }
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
// Google Spreadsheet ID
const SPREADSHEET_ID = '1gWQv6qg2R_uTyjYNorDK5vWNpjwL1JXDmxdMi5JjZuA';

// Global State
let rawItems = [];           // Technology records (Sheet 1, gid=0)
let filteredItems = [];      // Filtered technology records
let policyItems = [];        // Policy master records (Sheet 2, gid=905656920)
let filteredPolicyItems = [];// Filtered policy master records

let activeFilters = {
  search: '',
  country: '',
  sector: '',
  attribute: '',
  publisher: ''
};

// Current Active View ('gallery' | 'list' | 'overview' | 'analytics')
let currentView = 'gallery';

// Flags for dynamic loading of both Sheets (Tabs)
let masterLoaded = false;
let detailsLoaded = false;
let rawMasterRows = [];
let rawDetailRows = [];

// Chart.js Instances
let chartTechInstance = null;
let chartCountriesInstance = null;
let chartSectorsInstance = null;

// DOM Elements
const loadingIndicator = document.getElementById('loading-indicator');
const errorContainer = document.getElementById('error-container');
const errorMessage = document.getElementById('error-message');
const emptyContainer = document.getElementById('empty-container');

// View Containers
const dataGrid = document.getElementById('data-grid');
const listView = document.getElementById('list-view');
const tableBody = document.getElementById('table-body');
const analyticsView = document.getElementById('analytics-view');

// Filter Inputs
const searchInput = document.getElementById('search-input');
const filterCountry = document.getElementById('filter-country');
const filterSector = document.getElementById('filter-sector');
const filterAttribute = document.getElementById('filter-attribute');
const filterPublisher = document.getElementById('filter-publisher');
const activeFiltersContainer = document.getElementById('active-filters-container');

const statTotal = document.getElementById('stat-total');
const statCountries = document.getElementById('stat-countries');
const statSectors = document.getElementById('stat-sectors');

// Buttons
const btnReset = document.getElementById('btn-reset');
const btnRetry = document.getElementById('btn-retry');
const btnExport = document.getElementById('btn-export');

const detailModal = document.getElementById('detail-modal');
const btnCloseModal = document.getElementById('btn-close-modal');

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  fetchData();
  setupEventListeners();
  setupViewSwitcher();
});

// Setup Event Listeners
function setupEventListeners() {
  // Search input with basic debounce
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      activeFilters.search = e.target.value;
      applyFilters();
    }, 250);
  });

  // Dropdown changes
  filterCountry.addEventListener('change', (e) => {
    activeFilters.country = e.target.value;
    applyFilters();
  });

  // Sector change (Only applies to Technology sheet, but filters corresponding policies too)
  filterSector.addEventListener('change', (e) => {
    activeFilters.sector = e.target.value;
    applyFilters();
  });

  filterAttribute.addEventListener('change', (e) => {
    activeFilters.attribute = e.target.value;
    applyFilters();
  });

  filterPublisher.addEventListener('change', (e) => {
    activeFilters.publisher = e.target.value;
    applyFilters();
  });

  // Buttons
  btnReset.addEventListener('click', resetFilters);
  btnRetry.addEventListener('click', fetchData);
  btnExport.addEventListener('click', handleExport);

  // Modal close handlers
  btnCloseModal.addEventListener('click', () => {
    closeModal();
  });

  // Close modal when clicking on the backdrop
  detailModal.addEventListener('click', (e) => {
    const dialogDimensions = detailModal.getBoundingClientRect();
    if (
      e.clientX < dialogDimensions.left ||
      e.clientX > dialogDimensions.right ||
      e.clientY < dialogDimensions.top ||
      e.clientY > dialogDimensions.bottom
    ) {
      closeModal();
    }
  });
}

// Setup View Switcher Tabs
function setupViewSwitcher() {
  const tabs = document.querySelectorAll('.view-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      currentView = tab.dataset.view;
      switchView();
    });
  });
}

// Switch display of active view container
function switchView() {
  // Hide all views first
  dataGrid.classList.add('hidden');
  listView.classList.add('hidden');
  const policyOverviewGrid = document.getElementById('policy-overview-grid');
  if (policyOverviewGrid) policyOverviewGrid.classList.add('hidden');
  analyticsView.classList.add('hidden');

  const activeItemsCount = (currentView === 'overview') ? filteredPolicyItems.length : filteredItems.length;

  if (activeItemsCount === 0) {
    emptyContainer.classList.remove('hidden');
    return;
  }
  emptyContainer.classList.add('hidden');

  // Show active view
  if (currentView === 'gallery') {
    dataGrid.classList.remove('hidden');
    renderGrid();
  } else if (currentView === 'list') {
    listView.classList.remove('hidden');
    renderList();
  } else if (currentView === 'overview') {
    if (policyOverviewGrid) {
      policyOverviewGrid.classList.remove('hidden');
      renderPolicyOverview();
    }
  } else if (currentView === 'analytics') {
    analyticsView.classList.remove('hidden');
    renderCharts();
  }

  // Update stats display numbers dynamically
  updateStats();
}

// Global Callback for Tab 2: 政策內容總述 (gid=905656920)
window.handleGoogleDataMaster = function(response) {
  try {
    if (!response || response.status !== 'ok') {
      const errReason = response && response.errors && response.errors[0] ? response.errors[0].detailed_message : '未知錯誤';
      throw new Error(errReason);
    }
    rawMasterRows = response.table.rows || [];
    masterLoaded = true;
    checkAndProcess();
  } catch (error) {
    console.error('Processing Master Sheet failed:', error);
    showError('讀取「政策內容總述」失敗：' + error.message);
  }
};

// Global Callback for Tab 1: 各國新興技術與材料應用盤點 (gid=0)
window.handleGoogleDataDetails = function(response) {
  try {
    if (!response || response.status !== 'ok') {
      const errReason = response && response.errors && response.errors[0] ? response.errors[0].detailed_message : '未知錯誤';
      throw new Error(errReason);
    }
    rawDetailRows = response.table.rows || [];
    detailsLoaded = true;
    checkAndProcess();
  } catch (error) {
    console.error('Processing Details Sheet failed:', error);
    showError('讀取「新興技術與材料盤點」失敗：' + error.message);
  }
};

// Check if both sheets are loaded, then combine and display
function checkAndProcess() {
  if (masterLoaded && detailsLoaded) {
    combineData();
    populateDropdowns();
    applyFilters();
    showData();
  }
}

// Fetch Data from Google Sheets using JSONP (bypasses CORS in file:// and local hosts)
function fetchData() {
  showLoading();
  
  masterLoaded = false;
  detailsLoaded = false;
  rawMasterRows = [];
  rawDetailRows = [];

  // 1. Script for Master Sheet (gid=905656920)
  const scriptMaster = document.createElement('script');
  scriptMaster.id = 'gviz-master-script';
  scriptMaster.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=responseHandler:handleGoogleDataMaster&gid=905656920`;
  scriptMaster.onerror = () => {
    showError('無法載入「政策內容總述」資料，請確認網路連線與試算表分享設定。');
  };

  // 2. Script for Details Sheet (gid=0)
  const scriptDetails = document.createElement('script');
  scriptDetails.id = 'gviz-details-script';
  scriptDetails.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=responseHandler:handleGoogleDataDetails&gid=0`;
  scriptDetails.onerror = () => {
    showError('無法載入「各國新興技術與材料應用盤點」資料，請確認網路連線與試算表分享設定。');
  };

  // Clean up any old script tags
  const oldMaster = document.getElementById('gviz-master-script');
  if (oldMaster) oldMaster.remove();
  const oldDetails = document.getElementById('gviz-details-script');
  if (oldDetails) oldDetails.remove();

  document.body.appendChild(scriptMaster);
  document.body.appendChild(scriptDetails);
}

// Helper to get formatted string 'f' first, fallback to raw value 'v'
const getCellVal = (c, idx) => {
  if (!c) return '';
  const cell = c[idx];
  if (!cell) return '';
  if (cell.f !== undefined && cell.f !== null) return String(cell.f).trim();
  if (cell.v !== undefined && cell.v !== null) return String(cell.v).trim();
  return '';
};

// Process rows from both tabs and construct relational items
function combineData() {
  // 1. Populate rawItems (Technology records, Tab 1: gid=0)
  rawItems = rawDetailRows.map((row, index) => {
    const c = row.c;
    if (!c) return null;

    const country = getCellVal(c, 0);
    const name = getCellVal(c, 1);
    if (!name) return null;

    const date = getCellVal(c, 2);
    const sector = getCellVal(c, 3);
    const attribute = getCellVal(c, 4);
    const publisher = getCellVal(c, 5);
    const techAttribute = getCellVal(c, 6); // "材料 / 製程技術"
    const techName = getCellVal(c, 7);      // "材料 / 製程技術 名稱"
    const notes = getCellVal(c, 8);         // "其他備註"

    return {
      id: index,
      country,
      name,
      date,
      sector,
      attribute,
      publisher,
      techAttribute,
      techName,
      notes
    };
  }).filter(item => item !== null);

  // 2. Populate policyItems (Policy Master records, Tab 2: gid=905656920)
  policyItems = rawMasterRows.map((row, index) => {
    const c = row.c;
    if (!c) return null;

    const country = getCellVal(c, 0);
    const name = getCellVal(c, 1);
    if (!name) return null;

    const date = getCellVal(c, 2);
    const attribute = getCellVal(c, 3);
    const publisher = getCellVal(c, 4);
    const description = getCellVal(c, 5); // "內容說明" (F欄位)
    const details = getCellVal(c, 6);     // "其他細節資訊"
    const sourceUrl = getCellVal(c, 7);   // "資料來源/連結"

    // Relate domains/sectors from detail rows (gid=0) matching country & policy name
    const sectors = new Set();
    rawDetailRows.forEach(dRow => {
      const dC = dRow.c;
      if (!dC) return;
      const dCountry = getCellVal(dC, 0);
      const dName = getCellVal(dC, 1);
      if (dCountry === country && dName === name) {
        const dSector = getCellVal(dC, 3);
        if (dSector) sectors.add(dSector);
      }
    });

    return {
      id: index,
      country,
      name,
      date,
      attribute,
      publisher,
      description,
      details,
      sourceUrl,
      sectors: Array.from(sectors),
      sectorString: Array.from(sectors).join(', ')
    };
  }).filter(item => item !== null);
}

// Populate Filter Dropdowns dynamically based on data from Sheet 1 (gid=0)
function populateDropdowns() {
  const countries = new Set();
  const sectors = new Set();
  const attributes = new Set();
  const publishers = new Set();

  rawItems.forEach(item => {
    if (item.country) countries.add(item.country);
    if (item.attribute) attributes.add(item.attribute);
    if (item.publisher) publishers.add(item.publisher);
    if (item.sector && item.sector.trim()) sectors.add(item.sector.trim());
  });

  // Country Dropdown
  filterCountry.innerHTML = '<option value="">全部國家</option>';
  Array.from(countries).sort().forEach(country => {
    const opt = document.createElement('option');
    opt.value = country;
    opt.textContent = country;
    filterCountry.appendChild(opt);
  });

  // Sector Dropdown
  filterSector.innerHTML = '<option value="">全部領域</option>';
  Array.from(sectors).sort().forEach(sector => {
    const opt = document.createElement('option');
    opt.value = sector;
    opt.textContent = sector;
    filterSector.appendChild(opt);
  });

  // Attribute Dropdown
  filterAttribute.innerHTML = '<option value="">全部屬性</option>';
  Array.from(attributes).sort().forEach(attr => {
    const opt = document.createElement('option');
    opt.value = attr;
    opt.textContent = attr;
    filterAttribute.appendChild(opt);
  });

  // Publisher Dropdown
  filterPublisher.innerHTML = '<option value="">全部機構</option>';
  Array.from(publishers).sort().forEach(pub => {
    const opt = document.createElement('option');
    opt.value = pub;
    opt.textContent = pub;
    filterPublisher.appendChild(opt);
  });
}

// Apply Search & Filters to both States
function applyFilters() {
  const searchQuery = activeFilters.search.toLowerCase().trim();

  // 1. Filter Technology Items (Sheet 1)
  filteredItems = rawItems.filter(item => {
    const matchesSearch = !searchQuery ||
      item.name.toLowerCase().includes(searchQuery) ||
      item.country.toLowerCase().includes(searchQuery) ||
      item.sector.toLowerCase().includes(searchQuery) ||
      item.attribute.toLowerCase().includes(searchQuery) ||
      item.publisher.toLowerCase().includes(searchQuery) ||
      item.techAttribute.toLowerCase().includes(searchQuery) ||
      item.techName.toLowerCase().includes(searchQuery) ||
      item.notes.toLowerCase().includes(searchQuery);

    const matchesCountry = !activeFilters.country || item.country === activeFilters.country;
    const matchesSector = !activeFilters.sector || item.sector === activeFilters.sector;
    const matchesAttribute = !activeFilters.attribute || item.attribute === activeFilters.attribute;
    const matchesPublisher = !activeFilters.publisher || item.publisher === activeFilters.publisher;

    return matchesSearch && matchesCountry && matchesSector && matchesAttribute && matchesPublisher;
  });

  // 2. Filter Policy Items (Sheet 2)
  filteredPolicyItems = policyItems.filter(item => {
    const matchesSearch = !searchQuery ||
      item.name.toLowerCase().includes(searchQuery) ||
      item.country.toLowerCase().includes(searchQuery) ||
      item.attribute.toLowerCase().includes(searchQuery) ||
      item.publisher.toLowerCase().includes(searchQuery) ||
      item.description.toLowerCase().includes(searchQuery) ||
      item.details.toLowerCase().includes(searchQuery) ||
      item.sectorString.toLowerCase().includes(searchQuery);

    const matchesCountry = !activeFilters.country || item.country === activeFilters.country;
    const matchesSector = !activeFilters.sector || item.sectors.includes(activeFilters.sector);
    const matchesAttribute = !activeFilters.attribute || item.attribute === activeFilters.attribute;
    const matchesPublisher = !activeFilters.publisher || item.publisher === activeFilters.publisher;

    return matchesSearch && matchesCountry && matchesSector && matchesAttribute && matchesPublisher;
  });

  renderActiveTags();
  switchView(); // Refresh the current view layout & updateStats
}

// Render Active Filter Tags below inputs
function renderActiveTags() {
  activeFiltersContainer.innerHTML = '';

  const addTag = (type, val, label) => {
    const tag = document.createElement('div');
    tag.className = 'filter-tag';
    tag.innerHTML = `
      <span>${label}: ${val}</span>
      <button data-type="${type}">&times;</button>
    `;
    tag.querySelector('button').addEventListener('click', () => {
      removeFilter(type);
    });
    activeFiltersContainer.appendChild(tag);
  };

  if (activeFilters.search) {
    addTag('search', activeFilters.search, '搜尋');
  }
  if (activeFilters.country) {
    addTag('country', activeFilters.country, '國家');
  }
  if (activeFilters.sector) {
    addTag('sector', activeFilters.sector, '領域');
  }
  if (activeFilters.attribute) {
    addTag('attribute', activeFilters.attribute, '屬性');
  }
  if (activeFilters.publisher) {
    addTag('publisher', activeFilters.publisher, '機構');
  }
}

// Remove single filter tag
function removeFilter(type) {
  if (type === 'search') {
    searchInput.value = '';
    activeFilters.search = '';
  } else if (type === 'country') {
    filterCountry.value = '';
    activeFilters.country = '';
  } else if (type === 'sector') {
    filterSector.value = '';
    activeFilters.sector = '';
  } else if (type === 'attribute') {
    filterAttribute.value = '';
    activeFilters.attribute = '';
  } else if (type === 'publisher') {
    filterPublisher.value = '';
    activeFilters.publisher = '';
  }
  applyFilters();
}

// Reset all Filters
function resetFilters() {
  searchInput.value = '';
  filterCountry.value = '';
  filterSector.value = '';
  filterAttribute.value = '';
  filterPublisher.value = '';

  activeFilters = {
    search: '',
    country: '',
    sector: '',
    attribute: '',
    publisher: ''
  };

  applyFilters();
}

// Update Stats Dashboard numbers dynamically based on view context
function updateStats() {
  const uniqueCountries = new Set();
  const uniqueSectors = new Set();

  rawItems.forEach(item => {
    if (item.country) uniqueCountries.add(item.country);
    if (item.sector && item.sector.trim()) uniqueSectors.add(item.sector.trim());
  });

  if (currentView === 'overview') {
    statTotal.textContent = filteredPolicyItems.length;
  } else {
    statTotal.textContent = filteredItems.length;
  }
  statCountries.textContent = uniqueCountries.size;
  statSectors.textContent = uniqueSectors.size;
}

// Render Card Grid HTML (Gallery View) - Based on individual Technology rows (Sheet 1)
function renderGrid() {
  dataGrid.innerHTML = '';

  filteredItems.forEach(item => {
    const card = document.createElement('div');
    card.className = 'policy-card';
    card.addEventListener('click', () => openModal(item, 'tech'));

    const badgeCls = item.techAttribute === '材料' ? 'metal' : 'emerging';

    card.innerHTML = `
      <div class="card-header">
        <div class="card-tags">
          <span class="badge badge-country">${item.country}</span>
          ${item.sector ? `<span class="badge badge-sector">${item.sector}</span>` : ''}
          ${item.attribute ? `<span class="badge badge-attribute">${item.attribute}</span>` : ''}
        </div>
        <span class="card-date">${item.date || '無日期'}</span>
      </div>
      <h3>${item.name}</h3>
      <div class="card-body" style="font-size: 0.9rem; color: #475569; display: flex; flex-direction: column; gap: 6px; margin: 12px 0;">
        <p><strong>🏢 發布機構：</strong>${item.publisher || '—'}</p>
        <p><strong>⚙️ 材料 / 製程技術：</strong><span class="material-chip-summary ${badgeCls}">${item.techAttribute === '材料' ? '🔩' : '⚙️'} ${item.techAttribute || '—'}</span></p>
        <p><strong>🧪 名稱：</strong>${item.techName || '—'}</p>
        ${item.notes ? `<p class="card-desc" style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(0,0,0,0.05);">📝 備註：${item.notes}</p>` : ''}
      </div>
      <div class="card-footer" style="margin-top: 12px; justify-content: flex-end;">
        <span class="view-more-link">
          詳細內容
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </span>
      </div>
    `;

    dataGrid.appendChild(card);
  });
}

// Render Table List (List View) - Based on individual Technology rows (Sheet 1)
function renderList() {
  tableBody.innerHTML = '';

  filteredItems.forEach(item => {
    const tr = document.createElement('tr');
    tr.addEventListener('click', () => openModal(item, 'tech'));
    
    tr.innerHTML = `
      <td><strong>${item.country}</strong></td>
      <td><strong>${item.name}</strong></td>
      <td>${item.date || '無'}</td>
      <td>${item.sector ? `<span class="badge badge-sector">${item.sector}</span>` : '—'}</td>
      <td>${item.attribute ? `<span class="badge badge-attribute">${item.attribute}</span>` : '—'}</td>
      <td>${item.publisher ? `<span class="badge badge-publisher">${item.publisher}</span>` : '—'}</td>
      <td>${item.techAttribute ? `<span class="material-chip-summary ${item.techAttribute === '材料' ? 'metal' : 'emerging'}">${item.techAttribute === '材料' ? '🔩' : '⚙️'} ${item.techAttribute}</span>` : '—'}</td>
      <td>${item.techName || '—'}</td>
      <td><span class="note-truncated" title="${item.notes || ''}">${item.notes || '—'}</span></td>
    `;
    
    tableBody.appendChild(tr);
  });
}

// Render Policy Overview (Consolidated Mode) - Based on Policy Master rows (Sheet 2)
function renderPolicyOverview() {
  const policyOverviewGrid = document.getElementById('policy-overview-grid');
  if (!policyOverviewGrid) return;
  policyOverviewGrid.innerHTML = '';

  filteredPolicyItems.forEach(item => {
    const card = document.createElement('div');
    card.className = 'policy-card overview-card';
    card.addEventListener('click', () => openModal(item, 'policy'));

    card.innerHTML = `
      <div class="card-header">
        <div class="card-tags">
          <span class="badge badge-country">${item.country}</span>
          ${item.attribute ? `<span class="badge badge-attribute">${item.attribute}</span>` : ''}
          ${item.publisher ? `<span class="badge badge-publisher">${item.publisher}</span>` : ''}
        </div>
        <span class="card-date">${item.date || '無日期'}</span>
      </div>
      <h3>${item.name}</h3>
      <p class="card-desc" style="-webkit-line-clamp: 4; margin: 12px 0; color: #475569;">${item.description || '無內容說明'}</p>
      <div class="card-footer">
        <span class="view-more-link">
          查看政策總覽說明 (F欄位)
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </span>
      </div>
    `;

    policyOverviewGrid.appendChild(card);
  });
}

// Render Analytics Charts using Chart.js
function renderCharts() {
  let countMaterial = 0;
  let countProcess = 0;
  const countryCounts = {};
  const sectorCounts = {};

  filteredItems.forEach(item => {
    // 1. Count Materials vs Process Technology from filtered tech rows
    if (item.techAttribute === '材料') {
      countMaterial++;
    } else if (item.techAttribute === '製程技術') {
      countProcess++;
    }

    // 2. Count Country distribution
    if (item.country) {
      countryCounts[item.country] = (countryCounts[item.country] || 0) + 1;
    }

    // 3. Count Sector distribution
    if (item.sector && item.sector.trim()) {
      const s = item.sector.trim();
      sectorCounts[s] = (sectorCounts[s] || 0) + 1;
    }
  });

  // Destroy old charts to prevent duplicate canvases on filter change
  if (chartTechInstance) chartTechInstance.destroy();
  if (chartCountriesInstance) chartCountriesInstance.destroy();
  if (chartSectorsInstance) chartSectorsInstance.destroy();

  // Color Palette Definitions
  const colorsBlue = ['#0284c7', '#38bdf8', '#bae6fd', '#0369a1', '#0ea5e9'];
  const colorsMixed = ['#2563eb', '#7c3aed', '#0284c7', '#f59e0b', '#10b981', '#ec4899', '#64748b'];

  // Chart 1: Technology vs Material種類佔比 (Pie Chart)
  const ctxTech = document.getElementById('chart-tech').getContext('2d');
  chartTechInstance = new Chart(ctxTech, {
    type: 'pie',
    data: {
      labels: ['材料', '製程技術'],
      datasets: [{
        data: [countMaterial, countProcess],
        backgroundColor: ['#0284c7', '#7c3aed'],
        borderWidth: 1,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { family: 'Inter, Noto Sans TC', weight: '600' } }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed || 0;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
              return `${label}: ${value} 筆 (${percentage}%)`;
            }
          }
        }
      }
    }
  });

  // Chart 2: 各國政策數量分佈 (Doughnut Chart)
  const ctxCountries = document.getElementById('chart-countries').getContext('2d');
  const countriesLabels = Object.keys(countryCounts);
  const countriesData = Object.values(countryCounts);
  
  chartCountriesInstance = new Chart(ctxCountries, {
    type: 'doughnut',
    data: {
      labels: countriesLabels,
      datasets: [{
        data: countriesData,
        backgroundColor: colorsBlue.slice(0, countriesLabels.length),
        borderWidth: 1,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { family: 'Inter, Noto Sans TC', weight: '600' } }
        }
      }
    }
  });

  // Chart 3: 各領域別分佈統計 (Horizontal Bar Chart)
  const ctxSectors = document.getElementById('chart-sectors').getContext('2d');
  const sectorsLabels = Object.keys(sectorCounts).sort((a,b) => sectorCounts[b] - sectorCounts[a]);
  const sectorsData = sectorsLabels.map(s => sectorCounts[s]);

  chartSectorsInstance = new Chart(ctxSectors, {
    type: 'bar',
    data: {
      labels: sectorsLabels,
      datasets: [{
        label: '技術數量',
        data: sectorsData,
        backgroundColor: colorsMixed.slice(0, sectorsLabels.length),
        borderRadius: 6,
        borderWidth: 0
      }]
    },
    options: {
      indexAxis: 'y', // Makes the bar chart horizontal
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false // Hide default legend
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { precision: 0, font: { family: 'Inter, Noto Sans TC' } }
        },
        y: {
          grid: { display: false },
          ticks: { font: { family: 'Inter, Noto Sans TC', weight: '600' } }
        }
      }
    }
  });
}

// Open Detail Dialog Modal
function openModal(item, type = 'tech') {
  const modalTags = document.getElementById('modal-tags');
  const modalTitle = document.getElementById('modal-title');
  const modalDate = document.getElementById('modal-date');
  const modalCountry = document.getElementById('modal-country');
  const modalPublisher = document.getElementById('modal-publisher');
  
  const modalDesc = document.getElementById('modal-desc');
  const modalMetal = document.getElementById('modal-metal');
  const modalEmerging = document.getElementById('modal-emerging');
  const modalSource = document.getElementById('modal-source');

  // Clear modal contents first
  modalTitle.textContent = '';
  modalDate.textContent = '無';
  modalCountry.textContent = '無';
  modalPublisher.textContent = '無';
  modalTags.innerHTML = '';
  modalDesc.textContent = '';
  modalMetal.innerHTML = '';
  modalEmerging.textContent = '';
  modalSource.parentElement.parentElement.classList.add('hidden');

  if (type === 'tech') {
    // Populate for Technology Record (Sheet 1, gid=0)
    modalTitle.textContent = item.name;
    modalDate.textContent = item.date || '無';
    modalCountry.textContent = item.country || '無';
    modalPublisher.textContent = item.publisher || '無';

    modalTags.innerHTML = `
      <span class="badge badge-country">${item.country}</span>
      ${item.attribute ? `<span class="badge badge-attribute">${item.attribute}</span>` : ''}
      ${item.publisher ? `<span class="badge badge-publisher">${item.publisher}</span>` : ''}
      ${item.sector ? `<span class="badge badge-sector">${item.sector}</span>` : ''}
    `;

    modalDesc.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.95rem;">
        <p><strong>政策/技術之名稱：</strong>${item.name}</p>
        <p><strong>領域別：</strong>${item.sector || '—'}</p>
        <p><strong>屬性：</strong>${item.attribute || '—'}</p>
        <p><strong>發布機構：</strong>${item.publisher || '—'}</p>
      </div>
    `;
    
    modalMetal.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.95rem;">
        <p><strong>⚙️ 材料 / 製程技術：</strong>${item.techAttribute || '—'}</p>
        <p><strong>🧪 材料 / 製程技術 名稱：</strong>${item.techName || '—'}</p>
      </div>
    `;

    if (item.notes && item.notes.trim()) {
      modalEmerging.parentElement.classList.remove('hidden');
      modalEmerging.parentElement.querySelector('h3').innerHTML = '<span class="section-icon">📑</span> 其他備註';
      modalEmerging.textContent = item.notes;
    } else {
      modalEmerging.parentElement.classList.add('hidden');
    }

  } else if (type === 'policy') {
    // Populate for Policy Master Record (Sheet 2, gid=905656920)
    modalTitle.textContent = item.name;
    modalDate.textContent = item.date || '無';
    modalCountry.textContent = item.country || '無';
    modalPublisher.textContent = item.publisher || '無';

    modalTags.innerHTML = `
      <span class="badge badge-country">${item.country}</span>
      ${item.attribute ? `<span class="badge badge-attribute">${item.attribute}</span>` : ''}
      ${item.publisher ? `<span class="badge badge-publisher">${item.publisher}</span>` : ''}
    `;
    if (item.sectors && item.sectors.length > 0) {
      item.sectors.forEach(s => {
        modalTags.innerHTML += `<span class="badge badge-sector">${s}</span>`;
      });
    }

    // Section 1: Column F - 內容說明 (政策總覽)
    modalDesc.textContent = item.description || '無內容說明。';

    // Section 2: Column G - 其他細節資訊
    if (item.details && item.details.trim()) {
      modalMetal.parentElement.classList.remove('hidden');
      modalMetal.innerHTML = `<p>${item.details}</p>`;
    } else {
      modalMetal.parentElement.classList.add('hidden');
    }

    // Hide emerging section in policy mode
    modalEmerging.parentElement.classList.add('hidden');

    // Section 4: Column H - 資料來源/連結
    if (item.sourceUrl && item.sourceUrl.trim().startsWith('http')) {
      modalSource.parentElement.parentElement.classList.remove('hidden');
      modalSource.href = item.sourceUrl.trim();
      modalSource.textContent = item.sourceUrl.trim().substring(0, 50) + (item.sourceUrl.trim().length > 50 ? '...' : '');
    } else {
      modalSource.parentElement.parentElement.classList.add('hidden');
    }
  }

  // Open the native HTML dialog
  detailModal.showModal();
  document.body.style.overflow = 'hidden'; // Prevent background scrolling
}

// Close Modal
function closeModal() {
  detailModal.close();
  document.body.style.overflow = ''; // Restore background scrolling
}

// Export Current Filtered items to Excel-compatible CSV matching Google Sheet columns A-I
function handleExport() {
  if (filteredItems.length === 0) {
    alert('目前沒有可以匯出的資料！');
    return;
  }

  const headers = ['國家', '政策/技術之名稱', '出版日期', '領域別', '屬性', '發布機構', '材料 / 製程技術', '材料 / 製程技術 名稱', '其他備註'];
  let csvContent = "\uFEFF"; // Add UTF-8 BOM for Microsoft Excel compliance

  // Header row
  csvContent += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + '\n';

  // Data rows
  filteredItems.forEach(item => {
    const row = [
      item.country,
      item.name,
      item.date,
      item.sector,
      item.attribute,
      item.publisher,
      item.techAttribute,
      item.techName,
      item.notes
    ];
    csvContent += row.map(val => {
      const cleanVal = val ? val.replace(/"/g, '""') : '';
      return `"${cleanVal}"`;
    }).join(',') + '\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `各國政策與材料技術盤點匯出_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// UI State Toggles
function showLoading() {
  loadingIndicator.classList.remove('hidden');
  errorContainer.classList.add('hidden');
  emptyContainer.classList.add('hidden');
  dataGrid.classList.add('hidden');
  listView.classList.add('hidden');
  const policyOverviewGrid = document.getElementById('policy-overview-grid');
  if (policyOverviewGrid) policyOverviewGrid.classList.add('hidden');
  analyticsView.classList.add('hidden');
}

function showError(msg) {
  loadingIndicator.classList.add('hidden');
  errorContainer.classList.remove('hidden');
  emptyContainer.classList.add('hidden');
  dataGrid.classList.add('hidden');
  listView.classList.add('hidden');
  const policyOverviewGrid = document.getElementById('policy-overview-grid');
  if (policyOverviewGrid) policyOverviewGrid.classList.add('hidden');
  analyticsView.classList.add('hidden');
  errorMessage.textContent = `錯誤訊息：${msg}。請確認試算表共用設定已設為「知道連結的任何人均可檢視」，且您的網路連線正常。`;
}

function showData() {
  loadingIndicator.classList.add('hidden');
  errorContainer.classList.add('hidden');
}

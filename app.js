// Google Spreadsheet ID
const SPREADSHEET_ID = '1gWQv6qg2R_uTyjYNorDK5vWNpjwL1JXDmxdMi5JjZuA';

// Global State
let rawItems = [];
let filteredItems = [];
let activeFilters = {
  search: '',
  country: '',
  sector: '',
  attribute: '',
  publisher: ''
};

// Current Active View ('gallery' | 'list' | 'analytics')
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
  analyticsView.classList.add('hidden');

  if (filteredItems.length === 0) {
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
  } else if (currentView === 'analytics') {
    analyticsView.classList.remove('hidden');
    renderCharts();
  }
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
    updateStats();
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

// Process rows from both tabs and combine them relationally
function combineData() {
  // 1. Map details (Tab 1: gid=0) by key: "國家|||政策/技術之名稱"
  const detailsMap = {};
  rawDetailRows.forEach(row => {
    const c = row.c;
    if (!c) return;

    const country = getCellVal(c, 0);
    const name = getCellVal(c, 1);
    if (!name) return;

    const key = `${country}|||${name}`;
    if (!detailsMap[key]) {
      detailsMap[key] = {
        sectors: new Set(),
        materials: new Set(),
        materialNames: new Set()
      };
    }

    const sector = getCellVal(c, 3);
    const materialType = getCellVal(c, 6);
    const materialName = getCellVal(c, 7);

    if (sector) detailsMap[key].sectors.add(sector);
    if (materialType) detailsMap[key].materials.add(materialType);
    if (materialName) detailsMap[key].materialNames.add(materialName);
  });

  // 2. Map and enrich Master items (Tab 2: gid=905656920)
  rawItems = rawMasterRows.map((row, index) => {
    const c = row.c;
    if (!c) return null;

    const country = getCellVal(c, 0);
    const name = getCellVal(c, 1);
    if (!name) return null;

    const date = getCellVal(c, 2);
    const attribute = getCellVal(c, 3);
    const publisher = getCellVal(c, 4);
    const description = getCellVal(c, 5);
    const details = getCellVal(c, 6); // "其他細節資訊"
    const sourceUrl = getCellVal(c, 7);

    // Retrieve joined details
    const key = `${country}|||${name}`;
    const policyDetails = detailsMap[key] || {
      sectors: new Set(),
      materials: new Set(),
      materialNames: new Set()
    };

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
      // Relational arrays
      sectors: Array.from(policyDetails.sectors),
      sectorString: Array.from(policyDetails.sectors).join(', '),
      materials: Array.from(policyDetails.materials),
      materialNames: Array.from(policyDetails.materialNames)
    };
  }).filter(item => item !== null);
}

// Populate Filter Dropdowns dynamically based on data
function populateDropdowns() {
  const countries = new Set();
  const sectors = new Set();
  const attributes = new Set();
  const publishers = new Set();

  rawItems.forEach(item => {
    if (item.country) countries.add(item.country);
    if (item.attribute) attributes.add(item.attribute);
    if (item.publisher) publishers.add(item.publisher);
    item.sectors.forEach(s => {
      const trimmed = s.trim();
      if (trimmed) sectors.add(trimmed);
    });
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

// Apply Search & Filters to State
function applyFilters() {
  const searchQuery = activeFilters.search.toLowerCase().trim();

  filteredItems = rawItems.filter(item => {
    // Search query matches in name, description, details, publisher, sectors, and material names
    const matchesSearch = !searchQuery ||
      item.name.toLowerCase().includes(searchQuery) ||
      item.description.toLowerCase().includes(searchQuery) ||
      item.details.toLowerCase().includes(searchQuery) ||
      item.publisher.toLowerCase().includes(searchQuery) ||
      item.sectorString.toLowerCase().includes(searchQuery) ||
      item.materialNames.join(' ').toLowerCase().includes(searchQuery);

    const matchesCountry = !activeFilters.country || item.country === activeFilters.country;
    const matchesSector = !activeFilters.sector || item.sectors.includes(activeFilters.sector);
    const matchesAttribute = !activeFilters.attribute || item.attribute === activeFilters.attribute;
    const matchesPublisher = !activeFilters.publisher || item.publisher === activeFilters.publisher;

    return matchesSearch && matchesCountry && matchesSector && matchesAttribute && matchesPublisher;
  });

  renderActiveTags();
  updateStats();
  switchView(); // Refresh the current view
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

// Update Stats Dashboard numbers
function updateStats() {
  const uniqueCountries = new Set();
  const uniqueSectors = new Set();

  rawItems.forEach(item => {
    if (item.country) uniqueCountries.add(item.country);
    item.sectors.forEach(s => {
      const trimmed = s.trim();
      if (trimmed) uniqueSectors.add(trimmed);
    });
  });

  statTotal.textContent = filteredItems.length;
  statCountries.textContent = uniqueCountries.size;
  statSectors.textContent = uniqueSectors.size;
}

// Render Card Grid HTML (Gallery View)
function renderGrid() {
  dataGrid.innerHTML = '';

  filteredItems.forEach(item => {
    const card = document.createElement('div');
    card.className = 'policy-card';
    card.addEventListener('click', () => openModal(item));

    // Render sector tags (limit to 3, show +X if more)
    let sectorTagsHTML = item.sectors.slice(0, 3).map(s => `<span class="badge badge-sector">${s}</span>`).join('');
    if (item.sectors.length > 3) {
      sectorTagsHTML += `<span class="badge badge-sector">+${item.sectors.length - 3}</span>`;
    }

    // Render materials summary
    const materialSummaryHTML = item.materials.map(m => {
      const cls = m === '材料' ? 'metal' : 'emerging';
      return `<span class="material-chip-summary ${cls}">${m === '材料' ? '🔩' : '⚙️'} ${m}</span>`;
    }).join(' ');

    card.innerHTML = `
      <div class="card-header">
        <div class="card-tags">
          <span class="badge badge-country">${item.country}</span>
          ${item.attribute ? `<span class="badge badge-attribute">${item.attribute}</span>` : ''}
          ${item.publisher ? `<span class="badge badge-publisher">${item.publisher}</span>` : ''}
          ${sectorTagsHTML}
        </div>
        <span class="card-date">${item.date || '無日期'}</span>
      </div>
      <h3>${item.name}</h3>
      <p class="card-desc">${item.description || '點擊查看詳細說明'}</p>
      <div class="card-footer">
        <div class="material-icons-summary">
          ${materialSummaryHTML}
        </div>
        <span class="view-more-link">
          詳細內容
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </span>
      </div>
    `;

    dataGrid.appendChild(card);
  });
}

// Render Table List (List View)
function renderList() {
  tableBody.innerHTML = '';

  filteredItems.forEach(item => {
    const tr = document.createElement('tr');
    tr.addEventListener('click', () => openModal(item));

    const sectorsHTML = item.sectors.map(s => `<span class="badge badge-sector" style="margin-right: 2px;">${s}</span>`).join('');
    
    tr.innerHTML = `
      <td><strong>${item.country}</strong></td>
      <td><strong>${item.name}</strong></td>
      <td>${item.date || '無'}</td>
      <td>${sectorsHTML}</td>
      <td>${item.attribute ? `<span class="badge badge-attribute">${item.attribute}</span>` : '—'}</td>
      <td>${item.publisher ? `<span class="badge badge-publisher">${item.publisher}</span>` : '—'}</td>
    `;
    
    tableBody.appendChild(tr);
  });
}

// Render Analytics Charts using Chart.js
function renderCharts() {
  // 1. Gather Tech vs Material Counts from Raw inventory rows
  const activePolicyNames = new Set(filteredItems.map(item => item.name));
  let countMaterial = 0;
  let countProcess = 0;
  
  rawDetailRows.forEach(row => {
    const c = row.c;
    if (!c) return;
    const policyName = getCellVal(c, 1);
    if (activePolicyNames.has(policyName)) {
      const type = getCellVal(c, 6);
      if (type === '材料') countMaterial++;
      else if (type === '製程技術') countProcess++;
    }
  });

  // 2. Gather Country distribution
  const countryCounts = {};
  filteredItems.forEach(item => {
    countryCounts[item.country] = (countryCounts[item.country] || 0) + 1;
  });

  // 3. Gather Sector distribution
  const sectorCounts = {};
  filteredItems.forEach(item => {
    item.sectors.forEach(s => {
      if (s.trim()) {
        sectorCounts[s] = (sectorCounts[s] || 0) + 1;
      }
    });
  });

  // Destroy old charts to prevent duplicate canvases on filter change
  if (chartTechInstance) chartTechInstance.destroy();
  if (chartCountriesInstance) chartCountriesInstance.destroy();
  if (chartSectorsInstance) chartSectorsInstance.destroy();

  // Color Palette Definitions
  const colorsBlue = ['#0284c7', '#38bdf8', '#bae6fd'];
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
        label: '政策與技術數量',
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
function openModal(item) {
  const modalTags = document.getElementById('modal-tags');
  const modalTitle = document.getElementById('modal-title');
  const modalDate = document.getElementById('modal-date');
  const modalCountry = document.getElementById('modal-country');
  const modalPublisher = document.getElementById('modal-publisher');
  
  const modalDesc = document.getElementById('modal-desc');
  const modalMetal = document.getElementById('modal-metal');
  const modalEmerging = document.getElementById('modal-emerging');
  const modalSource = document.getElementById('modal-source');

  // Populate basic text
  modalTitle.textContent = item.name;
  modalDate.textContent = item.date || '無';
  modalCountry.textContent = item.country || '無';
  modalPublisher.textContent = item.publisher || '無';

  // Render Tags
  modalTags.innerHTML = `
    <span class="badge badge-country">${item.country}</span>
    ${item.attribute ? `<span class="badge badge-attribute">${item.attribute}</span>` : ''}
    ${item.publisher ? `<span class="badge badge-publisher">${item.publisher}</span>` : ''}
  `;
  item.sectors.forEach(s => {
    modalTags.innerHTML += `<span class="badge badge-sector">${s}</span>`;
  });

  // Section 1: Description
  modalDesc.textContent = item.description || '無詳細說明。';
  
  // Section 2: Associated Domains & Materials (highlighted blue box)
  let metalHTML = '';
  if (item.sectors && item.sectors.length > 0) {
    metalHTML += `<strong>🎯 關注領域：</strong>${item.sectors.join('、')}<br><br>`;
  }
  if (item.materials && item.materials.length > 0) {
    metalHTML += `<strong>🛠 技術屬性：</strong>${item.materials.join('、')}<br>`;
  }
  const cleanMaterialNames = item.materialNames.filter(name => name.trim().length > 0);
  if (cleanMaterialNames.length > 0) {
    metalHTML += `<br><strong>🧪 具體應用材料/技術名稱：</strong>${cleanMaterialNames.join('、')}<br>`;
  }
  if (!metalHTML) {
    metalHTML = '無關聯領域或材料技術資料。';
  }
  modalMetal.innerHTML = metalHTML;

  // Section 3: Detailed Inventory & Material Trends (highlighted purple box)
  if (item.details && item.details.trim()) {
    modalEmerging.parentElement.classList.remove('hidden');
    modalEmerging.textContent = item.details;
  } else {
    modalEmerging.parentElement.classList.add('hidden');
  }

  // Source URL Setup
  if (item.sourceUrl && item.sourceUrl.trim().startsWith('http')) {
    modalSource.parentElement.parentElement.classList.remove('hidden');
    modalSource.href = item.sourceUrl.trim();
    modalSource.textContent = item.sourceUrl.trim().substring(0, 50) + (item.sourceUrl.trim().length > 50 ? '...' : '');
  } else {
    modalSource.parentElement.parentElement.classList.add('hidden');
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

// Export Current Filtered items to Excel-compatible CSV
function handleExport() {
  if (filteredItems.length === 0) {
    alert('目前沒有可以匯出的資料！');
    return;
  }

  const headers = ['國家', '政策/技術之名稱', '出版日期', '屬性', '發布機構', '領域別', '材料 / 製程技術', '具體應用材料名稱', '內容說明', '詳細盤點與材料趨勢', '資料來源/連結'];
  let csvContent = "\uFEFF"; // Add UTF-8 BOM for Microsoft Excel compliance

  // Header row
  csvContent += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + '\n';

  // Data rows
  filteredItems.forEach(item => {
    const row = [
      item.country,
      item.name,
      item.date,
      item.attribute,
      item.publisher,
      item.sectors.join(', '),
      item.materials.join(', '),
      item.materialNames.join(', '),
      item.description,
      item.details,
      item.sourceUrl
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
  link.setAttribute("download", `各國政策與材料技術彙整匯出_${new Date().toISOString().slice(0,10)}.csv`);
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
  analyticsView.classList.add('hidden');
}

function showError(msg) {
  loadingIndicator.classList.add('hidden');
  errorContainer.classList.remove('hidden');
  emptyContainer.classList.add('hidden');
  dataGrid.classList.add('hidden');
  listView.classList.add('hidden');
  analyticsView.classList.add('hidden');
  errorMessage.textContent = `錯誤訊息：${msg}。請確認試算表共用設定已設為「知道連結的任何人均可檢視」，且您的網路連線正常。`;
}

function showData() {
  loadingIndicator.classList.add('hidden');
  errorContainer.classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
    // State
    let currentLang = localStorage.getItem('lang') || 'zh';
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    let currentTheme = localStorage.getItem('theme') || (systemDark ? 'dark' : 'light');

    // Data Containers
    let announcementsData = [];
    let roadmapDataMap = {};

    // DOM Elements
    const langToggle = document.getElementById('lang-toggle');
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = themeToggle.querySelector('span');
    const accordionHeaders = document.querySelectorAll('.accordion-header');

    // Initialization
    applyTheme(currentTheme);
    setupAccordion();
    initDefaultState();

    // Load Data
    loadData();

    // Event Listeners
    langToggle.addEventListener('click', () => {
        currentLang = currentLang === 'zh' ? 'en' : 'zh';
        localStorage.setItem('lang', currentLang);
        applyLanguage(currentLang);
        renderRoadmap(currentLang);
        renderAnnouncements(currentLang);
    });

    themeToggle.addEventListener('click', () => {
        currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', currentTheme);
        applyTheme(currentTheme);
    });

    async function loadData() {
        try {
            await Promise.all([fetchAnnouncements(), fetchRoadmap()]);
            renderAnnouncements(currentLang);
            renderRoadmap(currentLang);
            applyLanguage(currentLang); // Update dynamic voting buttons after config load if needed, mainly for static text here
        } catch (e) {
            console.error("Failed to load data:", e);
        }
    }

    async function fetchAnnouncements() {
        try {
            const response = await fetch('data/announcements.md');
            if (!response.ok) throw new Error('Network response was not ok');
            const text = await response.text();
            announcementsData = parseAnnouncements(text);
        } catch (error) {
            console.warn("Could not fetch announcements.md (likely local CORS):", error);
            // Fallback or empty
        }
    }

    async function fetchRoadmap() {
        try {
            const response = await fetch('data/roadmap.md');
            if (!response.ok) throw new Error('Network response was not ok');
            const text = await response.text();
            roadmapDataMap = parseRoadmap(text);
        } catch (error) {
            console.warn("Could not fetch roadmap.md (likely local CORS):", error);
        }
    }

    // parsers
    function parseAnnouncements(text) {
        const items = [];
        const blocks = text.split('---').map(b => b.trim()).filter(b => b.length > 0);

        blocks.forEach(block => {
            const lines = block.split('\n');
            const meta = {};
            let contentEn = '';
            let contentZh = '';
            let parsingMode = null; // 'EN' or 'ZH'

            lines.forEach(line => {
                const trimmed = line.trim();
                // Metadata
                if (trimmed.startsWith('Meta:')) {
                    const metaParts = trimmed.substring(5).split(';');
                    metaParts.forEach(part => {
                        const [key, val] = part.split('=').map(s => s.trim());
                        if (key && val) meta[key] = val;
                    });
                }
                // Content markers
                else if (trimmed.startsWith('[EN]')) {
                    parsingMode = 'EN';
                    const content = line.substring(line.indexOf('[EN]') + 4).trim();
                    if (content) contentEn += content + '\n';
                }
                else if (trimmed.startsWith('[ZH]')) {
                    parsingMode = 'ZH';
                    const content = line.substring(line.indexOf('[ZH]') + 4).trim();
                    if (content) contentZh += content + '\n';
                }
                else if (trimmed.startsWith('<!--')) {
                    // Ignore comments
                }
                else {
                    if (parsingMode === 'EN') contentEn += line + '\n';
                    if (parsingMode === 'ZH') contentZh += line + '\n';
                }
            });

            if (Object.keys(meta).length > 0) {
                items.push({
                    date: meta.date || '',
                    type: meta.type || 'info',
                    active: meta.active === 'true',
                    title: {
                        en: meta.title_en || '',
                        zh: meta.title_zh || ''
                    },
                    content: {
                        en: contentEn.trim(),
                        zh: contentZh.trim()
                    }
                });
            }
        });
        return items;
    }

    function parseRoadmap(text) {
        const data = {
            current: { title: { en: '', zh: '' }, items: [] },
            next: { title: { en: '', zh: '' }, items: [] },
            pre: { title: { en: '', zh: '' }, items: [] }
        };

        let currentSectionKey = null;
        let currentItem = null;
        let parsingMode = null; // 'EN' or 'ZH'

        const lines = text.split('\n');

        lines.forEach(line => {
            const trimmed = line.trim();

            if (trimmed.startsWith('<!--')) return; // Ignore comments

            // Section Header: # key
            if (line.startsWith('# ')) {
                const key = line.substring(2).trim();
                if (data[key]) {
                    currentSectionKey = key;
                }
            }
            // Section Meta: Meta: ...
            else if (line.startsWith('Meta:') && currentSectionKey) {
                const metaParts = line.substring(5).split(';');
                metaParts.forEach(part => {
                    const [key, val] = part.split('=').map(s => s.trim());
                    if (key === 'title_en') data[currentSectionKey].title.en = val;
                    if (key === 'title_zh') data[currentSectionKey].title.zh = val;
                });
            }
            // Item Header: ## [status] TitleEn ||| TitleZh
            else if (line.startsWith('## ') && currentSectionKey) {
                const content = line.substring(3).trim();
                const statusMatch = content.match(/^\[(.*?)\]/);
                if (statusMatch) {
                    const status = statusMatch[1];
                    const titles = content.substring(statusMatch[0].length).trim().split('|||');
                    const titleEn = titles[0] ? titles[0].trim() : '';
                    const titleZh = titles[1] ? titles[1].trim() : titleEn;

                    currentItem = {
                        status: status,
                        title: { en: titleEn, zh: titleZh },
                        desc: { en: '', zh: '' }
                    };
                    data[currentSectionKey].items.push(currentItem);
                }
            }
            // Description markers
            else if (trimmed.startsWith('[EN]')) {
                parsingMode = 'EN';
                const content = line.substring(line.indexOf('[EN]') + 4).trim();
                if (currentItem && content) currentItem.desc.en += content + '\n';
            }
            else if (trimmed.startsWith('[ZH]')) {
                parsingMode = 'ZH';
                const content = line.substring(line.indexOf('[ZH]') + 4).trim();
                if (currentItem && content) currentItem.desc.zh += content + '\n';
            }
            else if (currentItem) {
                if (parsingMode === 'EN') currentItem.desc.en += line + '\n';
                if (parsingMode === 'ZH') currentItem.desc.zh += line + '\n';
            }
        });

        // Trim descriptions
        Object.values(data).forEach(section => {
            section.items.forEach(item => {
                item.desc.en = item.desc.en.trim();
                item.desc.zh = item.desc.zh.trim();
            });
        });

        return data;
    }

    // Functions
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        themeIcon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
    }

    function applyLanguage(lang) {
        const textElements = document.querySelectorAll('[data-i18n]');
        textElements.forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[lang] && translations[lang][key]) {
                el.textContent = translations[lang][key];
            }
        });

        // Update voting button text if active
        if (typeof appConfig !== 'undefined' && appConfig.voting && appConfig.voting.hasNewVote) {
            const voteBtn = document.querySelector('#accordion-voting .button');
            if (voteBtn && appConfig.voting.title && appConfig.voting.title[lang]) {
                voteBtn.textContent = appConfig.voting.title[lang];
            }
        }

        document.documentElement.lang = lang;
    }

    function setupAccordion() {
        accordionHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const item = header.parentElement;
                const isActive = item.classList.contains('active');

                // Toggle state (Allow multiple open)
                if (isActive) {
                    item.classList.remove('active');
                    header.setAttribute('aria-expanded', 'false');
                } else {
                    item.classList.add('active');
                    header.setAttribute('aria-expanded', 'true');
                }
            });
        });
    }

    function initDefaultState() {
        // Announcements always open
        const announce = document.getElementById('accordion-announcements');
        if (announce) {
            announce.classList.add('active');
            announce.querySelector('.accordion-header').setAttribute('aria-expanded', 'true');
        }

        // Issues and Opinions always open by default
        const issues = document.getElementById('accordion-issues');
        if (issues) {
            issues.classList.add('active');
            issues.querySelector('.accordion-header').setAttribute('aria-expanded', 'true');
        }

        const opinions = document.getElementById('accordion-opinions');
        if (opinions) {
            opinions.classList.add('active');
            opinions.querySelector('.accordion-header').setAttribute('aria-expanded', 'true');
        }

        // Voting State configuration
        if (typeof appConfig !== 'undefined' && appConfig.voting) {
            const votingSection = document.getElementById('accordion-voting');
            if (votingSection) {
                const voteBtn = votingSection.querySelector('.button');

                if (appConfig.voting.hasNewVote) {
                    // Expand if new vote
                    votingSection.classList.add('active');
                    votingSection.querySelector('.accordion-header').setAttribute('aria-expanded', 'true');

                    // Update button
                    voteBtn.disabled = false;
                    voteBtn.href = appConfig.voting.voteLink || '#';
                    voteBtn.target = "_blank";
                    voteBtn.classList.remove('tonal');
                    voteBtn.classList.add('filled');
                    voteBtn.setAttribute('data-vote-active', 'true');
                } else {
                    voteBtn.disabled = true;
                    voteBtn.removeAttribute('href');
                }
            }
        }
    }

    function renderAnnouncements(lang) {
        const container = document.getElementById('announcements-container');
        if (!container) return;

        container.innerHTML = '';

        if (!announcementsData || announcementsData.length === 0) {
            // Wait for fetch, or show skeleton? 
            // If empty after fetch, show empty message
            // For now, if empty, assume loading or local error
            return;
        }

        // Filter active
        const activeNews = announcementsData.filter(a => a.active);

        if (activeNews.length === 0) {
            container.innerHTML = `<p style="opacity:0.6; font-style:italic;">${lang === 'zh' ? '暂无公告' : 'No new announcements'}</p>`;
            return;
        }

        activeNews.forEach(news => {
            const div = document.createElement('div');
            div.className = `announcement-card ${news.type}`;
            div.style.marginBottom = '16px';
            div.style.padding = '12px';
            div.style.backgroundColor = 'var(--surface)';
            div.style.borderRadius = '8px';
            div.style.borderLeft = '4px solid var(--primary)';

            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                    <strong style="color:var(--primary); font-size:0.9rem;">${news.date}</strong>
                    <span class="material-symbols-outlined" style="font-size:18px;">info</span>
                </div>
                <h3 style="margin:4px 0; font-size:1rem; color:var(--on-surface);">${news.title[lang]}</h3>
                <div style="margin:4px 0; font-size:0.9rem; opacity:0.9; line-height:1.4;" class="markdown-content">
                    ${marked.parse(news.content[lang])}
                </div>
            `;
            container.appendChild(div);
        });
    }

    function renderRoadmap(lang) {
        const roadmapList = document.getElementById('roadmap-list');
        if (!roadmapList) return;

        roadmapList.innerHTML = '';

        if (!roadmapDataMap || Object.keys(roadmapDataMap).length === 0) return;

        // Helper to render a section
        const renderSection = (key, data) => {
            if (!data) return;

            // Section Header
            const header = document.createElement('li');
            header.className = 'roadmap-section-header';
            header.style.marginTop = '16px';
            header.style.marginBottom = '8px';
            header.innerHTML = `<h4 style="margin:0; color:var(--primary); font-size:0.9rem; text-transform:uppercase; letter-spacing:1px;">${data.title[lang]}</h4>`;
            roadmapList.appendChild(header);

            data.items.forEach(item => {
                const li = document.createElement('li');
                li.className = `roadmap-item ${item.status}`;

                let iconName = 'check_box_outline_blank'; // Default unchecked
                if (item.status === 'done') iconName = 'check_box';
                else if (item.status === 'in-progress') iconName = 'indeterminate_check_box'; // Or 'hourglass_empty'
                else if (item.status === 'testing') iconName = 'biotech'; // Special case

                li.innerHTML = `
                    <span class="status-icon material-symbols-outlined">${iconName}</span>
                    <div class="roadmap-content">
                        <h3>${item.title[lang]}</h3>
                        <div class="markdown-content">${marked.parse(item.desc[lang])}</div>
                    </div>
                `;
                roadmapList.appendChild(li);
            });
        };

        renderSection('current', roadmapDataMap.current);
        renderSection('next', roadmapDataMap.next);
        renderSection('pre', roadmapDataMap.pre);
    }
});

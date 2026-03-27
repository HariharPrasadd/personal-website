// Function to generate navigation header
function generateNavigation() {
    // Detect path depth - check if we're in a subdirectory
    const path = window.location.pathname;
    const isInSubdirectory = path.includes('/pages/');
    
    // Set path prefix based on location
    const pathPrefix = isInSubdirectory ? '../../' : '';
    
    // Generate navigation HTML
    const navHTML = `
        <div class="navigation" id="navigation">
            <div class="plus-menu">
                <span class="horizontal"></span>
                <span class="vertical"></span>
            </div>
            <div class="nav-links">
                <a href="${pathPrefix}index.html">Home</a>
                <a href="${pathPrefix}about.html">About</a>
                <a href="${pathPrefix}books.html">Books</a>
                <a href="${pathPrefix}notes.html">Notes</a>
                <a href="${pathPrefix}blog.html">Blog</a>
                <a href="${pathPrefix}projects.html">Projects</a>
                <a href="${pathPrefix}contact.html">Contact</a>
            </div>
        </div>
    `;
    
    return navHTML;
}

// Inject navigation into placeholder
function injectNavigation() {
    const placeholder = document.getElementById('navigation-placeholder');
    if (placeholder) {
        placeholder.outerHTML = generateNavigation();
    }
}

function initExternalLinks() {
    const links = document.querySelectorAll('a[href]');

    links.forEach((link) => {
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#')) {
            return;
        }

        let url;
        try {
            url = new URL(href, window.location.href);
        } catch {
            return;
        }

        if (url.origin !== window.location.origin) {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        }
    });
}

function initFootnotePreviews() {
    const footnoteRefs = document.querySelectorAll('.footnote-ref a[href^="#fn"]');
    if (!footnoteRefs.length) {
        return;
    }

    const popup = document.createElement('div');
    popup.className = 'footnote-popup';
    popup.setAttribute('aria-hidden', 'true');
    document.body.appendChild(popup);

    function positionPopup(reference) {
        const rect = reference.getBoundingClientRect();
        const popupRect = popup.getBoundingClientRect();
        const margin = 12;
        let top = rect.bottom + margin;
        let left = rect.left;

        if (left + popupRect.width > window.innerWidth - margin) {
            left = window.innerWidth - popupRect.width - margin;
        }

        if (left < margin) {
            left = margin;
        }

        if (top + popupRect.height > window.innerHeight - margin) {
            top = rect.top - popupRect.height - margin;
        }

        if (top < margin) {
            top = margin;
        }

        popup.style.top = `${top}px`;
        popup.style.left = `${left}px`;
    }

    function showPopup(reference) {
        const footnote = document.querySelector(reference.getAttribute('href'));
        if (!footnote) {
            return;
        }

        const previewContent = footnote.cloneNode(true);
        previewContent.querySelectorAll('.footnote-backref').forEach((backref) => backref.remove());
        popup.innerHTML = previewContent.innerHTML.trim();
        popup.classList.add('is-visible');
        popup.setAttribute('aria-hidden', 'false');
        positionPopup(reference);
    }

    function hidePopup() {
        popup.classList.remove('is-visible');
        popup.setAttribute('aria-hidden', 'true');
    }

    footnoteRefs.forEach((reference) => {
        reference.addEventListener('mouseenter', () => showPopup(reference));
        reference.addEventListener('focus', () => showPopup(reference));
        reference.addEventListener('mouseleave', hidePopup);
        reference.addEventListener('blur', hidePopup);
    });

    window.addEventListener('scroll', hidePopup, { passive: true });
    window.addEventListener('resize', hidePopup);
}

document.addEventListener('DOMContentLoaded', function() {
    // Inject navigation first
    injectNavigation();
    initExternalLinks();
    initFootnotePreviews();
    
    // Then set up menu toggle functionality
    const plusMenu = document.querySelector('.plus-menu');
    const navLinks = document.querySelector('.nav-links');
    
    if (plusMenu) {
        plusMenu.addEventListener('click', function() {
            plusMenu.classList.toggle('active');
            navLinks.classList.toggle('active');
        });
    }
    
    // Close menu when clicking outside
    document.addEventListener('click', function(event) {
        if (!event.target.closest('.nav-links') && !event.target.closest('.plus-menu')) {
            if (navLinks.classList.contains('active')) {
                navLinks.classList.remove('active');
                plusMenu.classList.remove('active');
            }
        }
    });
});

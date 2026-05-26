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
                <a href="${pathPrefix}socials.html">Socials</a>
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

function initPeekPreviews() {
    const peekRefs = document.querySelectorAll('.peek-ref');
    if (!peekRefs.length) {
        return;
    }

    const popup = document.createElement('div');
    let activeReference = null;
    const popupHoverPadding = 10;
    const referenceHoverPadding = 8;
    popup.className = 'peek-popup';
    popup.setAttribute('aria-hidden', 'true');
    document.body.appendChild(popup);

    function isWithinExpandedRect(pointX, pointY, rect, padding = 0) {
        return (
            pointX >= rect.left - padding &&
            pointX <= rect.right + padding &&
            pointY >= rect.top - padding &&
            pointY <= rect.bottom + padding
        );
    }

    function positionPopup(reference) {
        const rect = reference.getBoundingClientRect();
        const margin = 16;
        
        // Reset placement so measurement uses the popup's natural size, not a stale position.
        popup.style.top = '0px';
        popup.style.left = '0px';

        const popupRect = popup.getBoundingClientRect();
        let top = rect.bottom + margin;
        let left = rect.left;

        // Keep the card inside the viewport so the interaction feels deliberate instead of jumpy.
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
        const path = reference.dataset.peek || '';
        if (!path) {
            return;
        }

        activeReference = reference;
        popup.innerHTML = `<code>${path}</code>`;

        // Show first so the popup has real dimensions before we clamp it into the viewport.
        popup.classList.add('is-visible');
        popup.setAttribute('aria-hidden', 'false');
        positionPopup(reference);
    }

    function hidePopup() {
        activeReference = null;
        popup.classList.remove('is-visible');
        popup.setAttribute('aria-hidden', 'true');
    }

    peekRefs.forEach((reference) => {
        reference.addEventListener('mouseenter', () => showPopup(reference));
        reference.addEventListener('focus', () => showPopup(reference));
    });

    document.addEventListener('pointermove', (event) => {
        if (!activeReference) {
            return;
        }

        const popupRect = popup.getBoundingClientRect();
        const referenceRect = activeReference.getBoundingClientRect();
        const withinPopup = isWithinExpandedRect(event.clientX, event.clientY, popupRect, popupHoverPadding);
        const withinReference = isWithinExpandedRect(event.clientX, event.clientY, referenceRect, referenceHoverPadding);
        const referenceFocused = document.activeElement === activeReference;

        // A slightly inflated hover box makes the popup feel forgiving near the edges.
        if (!withinPopup && !withinReference && !referenceFocused) {
            hidePopup();
        }
    }, { passive: true });

    document.addEventListener('pointerdown', (event) => {
        if (!activeReference) {
            return;
        }

        // Keep the popup open for selection unless the click is fully outside the popup and triggers.
        if (popup.contains(event.target) || event.target.closest('.peek-ref')) {
            return;
        }

        hidePopup();
    });

    window.addEventListener('scroll', () => {
        if (activeReference) {
            positionPopup(activeReference);
        }
    }, { passive: true });

    window.addEventListener('resize', () => {
        if (activeReference) {
            positionPopup(activeReference);
        }
    });
}

function initCodeBlocks() {
    const codeBlocks = document.querySelectorAll('.code-block');
    const copyIcon = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="9" width="10" height="10" rx="2"></rect>
            <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"></path>
        </svg>
    `;
    const checkIcon = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 13l4 4L19 7"></path>
        </svg>
    `;

    function escapeHtml(value) {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function wrapToken(type, value) {
        return `<span class="token-${type}">${escapeHtml(value)}</span>`;
    }

    function highlightJavaScript(source) {
        const globalNames = new Set(['console', 'window', 'document', 'navigator', 'Math', 'JSON']);
        const patterns = [
            { type: 'comment', regex: /\/\/[^\n]*/y },
            { type: 'string', regex: /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/y },
            { type: 'number', regex: /\b\d+(?:\.\d+)?\b/y },
            { type: 'keyword-control', regex: /\b(?:import|from|export)\b/y },
            { type: 'boolean', regex: /\b(?:true|false|null|undefined)\b/y },
            { type: 'keyword', regex: /\b(?:async|await|default|return|if|else|for|while|try|catch|throw|new|class|extends|function|const|let|var)\b/y },
            { type: 'class', regex: /\b[A-Z][A-Za-z0-9_$]*\b/y },
            { type: 'key', regex: /\b[A-Za-z_$][\w$]*(?=\s*:)/y },
            { type: 'method', regex: /\.[A-Za-z_$][\w$]*(?=\s*\()/y },
            { type: 'property', regex: /\.[A-Za-z_$][\w$]*/y },
            { type: 'function', regex: /\b[A-Za-z_$][\w$]*(?=\s*\()/y },
            { type: 'operator', regex: /=>|===|!==|==|!=|<=|>=|\+\+|--|&&|\|\||[=+\-*/<>!%]/y },
            { type: 'punctuation', regex: /[{}[\]().,;:]/y },
            { type: 'variable', regex: /\b[A-Za-z_$][\w$]*\b/y }
        ];

        let cursor = 0;
        let highlighted = '';

        while (cursor < source.length) {
            let matched = false;

            for (const pattern of patterns) {
                pattern.regex.lastIndex = cursor;
                const match = pattern.regex.exec(source);

                if (match && match.index === cursor) {
                    let value = match[0];
                    let type = pattern.type;

                    // Dot access is split so punctuation stays muted while the member gets its token color.
                    if (type === 'method' || type === 'property') {
                        highlighted += wrapToken('punctuation', '.');
                        value = value.slice(1);
                    }

                    if (type === 'variable' && globalNames.has(value)) {
                        type = 'global';
                    }

                    highlighted += wrapToken(type, value);
                    cursor += match[0].length;
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                highlighted += wrapToken('plain', source[cursor]);
                cursor += 1;
            }
        }

        return highlighted;
    }

    function highlightHtml(source) {
        return escapeHtml(source)
            .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="token-comment">$1</span>')
            .replace(/(&lt;\/?)([A-Za-z][\w-]*)(.*?)(\/?&gt;)/g, (match, open, tagName, attrs, close) => {
                const highlightedAttrs = attrs.replace(/([A-Za-z_:][\w:.-]*)(=)("[^"]*"|'[^']*')/g, (attrMatch, name, equals, value) => {
                    return `<span class="token-attribute">${name}</span><span class="token-punctuation">${equals}</span><span class="token-string">${value}</span>`;
                });

                return `${wrapToken('punctuation', open)}${wrapToken('tag', tagName)}${highlightedAttrs}${wrapToken('punctuation', close)}`;
            });
    }

    function highlightCode(source, language) {
        if (language === 'javascript' || language === 'js') {
            return highlightJavaScript(source);
        }

        if (language === 'html') {
            return highlightHtml(source);
        }

        return wrapToken('plain', source);
    }

    codeBlocks.forEach((codeBlock) => {
        if (codeBlock.dataset.enhanced === 'true') {
            return;
        }

        const pre = codeBlock.querySelector('pre');
        const code = codeBlock.querySelector('code');
        if (!pre || !code) {
            return;
        }

        const language = codeBlock.dataset.language || 'code';
        const rawSource = code.textContent.replace(/^\n/, '').replace(/\n\s*$/, '');
        const header = document.createElement('div');
        header.className = 'code-block__header';

        const meta = document.createElement('div');
        meta.className = 'code-block__meta';

        const label = document.createElement('span');
        label.className = 'code-block__label';
        label.textContent = language;

        // The copy affordance makes the primitive useful before adding heavier tooling.
        const copyButton = document.createElement('button');
        copyButton.className = 'code-block__copy';
        copyButton.type = 'button';
        copyButton.setAttribute('aria-label', `Copy ${language} code`);
        copyButton.innerHTML = copyIcon;

        copyButton.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(rawSource);
                copyButton.innerHTML = checkIcon;
                copyButton.classList.add('is-copied');

                window.setTimeout(() => {
                    copyButton.innerHTML = copyIcon;
                    copyButton.classList.remove('is-copied');
                }, 1800);
            } catch {
                window.setTimeout(() => {
                    copyButton.innerHTML = copyIcon;
                }, 1800);
            }
        });

        meta.appendChild(label);
        header.appendChild(meta);
        header.appendChild(copyButton);
        codeBlock.prepend(header);
        code.innerHTML = highlightCode(rawSource, language.toLowerCase());
        codeBlock.dataset.enhanced = 'true';
    });
}

document.addEventListener('DOMContentLoaded', function() {
    // Inject navigation first
    injectNavigation();
    initExternalLinks();
    initFootnotePreviews();
    initPeekPreviews();
    initCodeBlocks();
    
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

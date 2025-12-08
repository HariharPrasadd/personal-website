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

document.addEventListener('DOMContentLoaded', function() {
    // Inject navigation first
    injectNavigation();
    
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
document.addEventListener('DOMContentLoaded', function() {
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
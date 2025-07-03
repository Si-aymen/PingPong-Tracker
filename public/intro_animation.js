// This file can be used for more complex JavaScript-driven animations if needed.
// For this specific animation, most of the logic is handled by CSS @keyframes.
// This file is included for completeness and future expansion.

// Example: If you wanted to dynamically adjust animation speed or ball physics
// based on window size, you could add that logic here.
document.addEventListener('DOMContentLoaded', () => {
    const ball = document.querySelector('.ball');
    const table = document.querySelector('.table');

    // You could add logic here to dynamically adjust animation properties
    // based on the parent iframe's size or other factors if CSS alone isn't enough.
    // For now, the CSS handles all the animation.

    // Example: Log a message when the animation starts (for debugging)
    console.log('Intro animation loaded and running.');
});

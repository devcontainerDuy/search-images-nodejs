// ============ STARRY UNIVERSE EFFECTS ============
function createStarsUniverse() {
    const starsContainer = document.getElementById("starsContainer");
    if (!starsContainer) return;

    // Create static stars
    function createStars() {
        const starCount = 150;
        for (let i = 0; i < starCount; i++) {
            const star = document.createElement("div");
            star.className = "star";

            // Random size
            const sizes = ["small", "medium", "large"];
            const randomSize = sizes[Math.floor(Math.random() * sizes.length)];
            star.classList.add(randomSize);

            // Random position
            star.style.left = Math.random() * 100 + "%";
            star.style.top = Math.random() * 100 + "%";

            // Random animation delay
            star.style.animationDelay = Math.random() * 2 + "s";

            starsContainer.appendChild(star);
        }
    }

    // Create shooting stars
    function createShootingStar() {
        const shootingStar = document.createElement("div");
        shootingStar.className = "shooting-star";

        // Random starting position (top area)
        shootingStar.style.left = Math.random() * 100 + "%";
        shootingStar.style.top = Math.random() * 40 + "%";

        // Random size for shooting star
        const width = 40 + Math.random() * 60; // 40-100px
        shootingStar.style.width = width + "px";

        // Random duration
        const duration = 1.5 + Math.random() * 2; // 1.5-3.5 seconds
        shootingStar.style.animationDuration = duration + "s";

        // Random opacity
        shootingStar.style.opacity = 0.6 + Math.random() * 0.4; // 0.6-1.0

        starsContainer.appendChild(shootingStar);

        // Remove after animation
        setTimeout(() => {
            if (shootingStar.parentNode) {
                shootingStar.parentNode.removeChild(shootingStar);
            }
        }, duration * 1000);
    }

    // Create multiple shooting stars at once
    function createShootingStarBurst() {
        const burstCount = 2 + Math.floor(Math.random() * 3); // 2-4 stars
        for (let i = 0; i < burstCount; i++) {
            setTimeout(() => createShootingStar(), i * 200); // Stagger by 200ms
        }
    }

    // Create nebula clouds
    function createNebula() {
        const nebulaCount = 5;
        const nebulaTypes = ["purple", "blue", "pink"];

        for (let i = 0; i < nebulaCount; i++) {
            const nebula = document.createElement("div");
            nebula.className = "nebula";

            // Random type
            const randomType = nebulaTypes[Math.floor(Math.random() * nebulaTypes.length)];
            nebula.classList.add(randomType);

            // Random size and position
            const size = 200 + Math.random() * 300; // 200-500px
            nebula.style.width = size + "px";
            nebula.style.height = size + "px";
            nebula.style.left = Math.random() * 100 + "%";
            nebula.style.top = Math.random() * 100 + "%";

            // Random animation delay
            nebula.style.animationDelay = Math.random() * 20 + "s";

            starsContainer.appendChild(nebula);
        }
    }

    // Initialize universe
    createStars();
    createNebula();

    // Create shooting stars more frequently and dynamically
    // Single shooting stars every 1-3 seconds
    setInterval(createShootingStar, 1000 + Math.random() * 2000);

    // Shooting star bursts every 5-8 seconds
    setInterval(createShootingStarBurst, 5000 + Math.random() * 3000);

    // Additional frequent single stars for more activity
    setInterval(createShootingStar, 800 + Math.random() * 1500);
}

// ============ CUSTOM CURSOR EFFECTS ============
function initCustomCursor() {
    // Create cursor elements
    const cursorDot = document.createElement("div");
    const cursorOutline = document.createElement("div");

    cursorDot.className = "cursor-dot";
    cursorOutline.className = "cursor-outline";

    document.body.appendChild(cursorDot);
    document.body.appendChild(cursorOutline);

    let mouseX = 0;
    let mouseY = 0;
    let outlineX = 0;
    let outlineY = 0;

    // Mouse movement tracking
    document.addEventListener("mousemove", (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;

        // Update dot position immediately
        cursorDot.style.left = mouseX + "px";
        cursorDot.style.top = mouseY + "px";

        // Create trail effect
        createTrail(mouseX, mouseY);
    });

    // Smooth outline following
    function animateOutline() {
        outlineX += (mouseX - outlineX) * 0.1;
        outlineY += (mouseY - outlineY) * 0.1;

        cursorOutline.style.left = outlineX + "px";
        cursorOutline.style.top = outlineY + "px";

        requestAnimationFrame(animateOutline);
    }
    animateOutline();

    // Create trail particles
    function createTrail(x, y) {
        if (Math.random() > 0.7) {
            // Only create trail sometimes for performance
            const trail = document.createElement("div");
            trail.className = "cursor-trail";
            trail.style.left = x + "px";
            trail.style.top = y + "px";
            document.body.appendChild(trail);

            // Remove trail after animation
            setTimeout(() => {
                if (trail.parentNode) {
                    trail.parentNode.removeChild(trail);
                }
            }, 500);
        }
    }

    // Hover effects on interactive elements
    const interactiveElements = "button, a, input, textarea, select, .btn, .item, .tag, .page-btn, .similar-btn, .delete-btn";

    document.addEventListener("mouseover", (e) => {
        if (e.target.matches(interactiveElements)) {
            cursorDot.classList.add("hover");
            cursorOutline.classList.add("hover");
        }
    });

    document.addEventListener("mouseout", (e) => {
        if (e.target.matches(interactiveElements)) {
            cursorDot.classList.remove("hover");
            cursorOutline.classList.remove("hover");
        }
    });

    // Text selection cursor
    const textElements = "p, span, div, h1, h2, h3, h4, h5, h6, label";

    document.addEventListener("mouseover", (e) => {
        if (e.target.matches(textElements) && !e.target.matches(interactiveElements)) {
            cursorDot.classList.add("text");
            cursorOutline.classList.add("text");
        }
    });

    document.addEventListener("mouseout", (e) => {
        if (e.target.matches(textElements)) {
            cursorDot.classList.remove("text");
            cursorOutline.classList.remove("text");
        }
    });

    // Click effects
    document.addEventListener("mousedown", () => {
        cursorDot.classList.add("click");
        cursorOutline.classList.add("click");

        // Create click ripple effect
        createClickRipple(mouseX, mouseY);
    });

    document.addEventListener("mouseup", () => {
        setTimeout(() => {
            cursorDot.classList.remove("click");
            cursorOutline.classList.remove("click");
        }, 300);
    });

    // Create click ripple effect
    function createClickRipple(x, y) {
        const ripple = document.createElement("div");
        ripple.style.position = "fixed";
        ripple.style.left = x + "px";
        ripple.style.top = y + "px";
        ripple.style.width = "0px";
        ripple.style.height = "0px";
        ripple.style.borderRadius = "50%";
        ripple.style.border = "2px solid rgba(252, 70, 107, 0.6)";
        ripple.style.pointerEvents = "none";
        ripple.style.zIndex = "9996";
        ripple.style.transform = "translate(-50%, -50%)";
        ripple.style.animation = "cursor-ripple 0.6s ease forwards";

        document.body.appendChild(ripple);

        setTimeout(() => {
            if (ripple.parentNode) {
                ripple.parentNode.removeChild(ripple);
            }
        }, 600);
    }

    // Hide cursor when mouse leaves window
    document.addEventListener("mouseleave", () => {
        cursorDot.style.opacity = "0";
        cursorOutline.style.opacity = "0";
    });

    document.addEventListener("mouseenter", () => {
        cursorDot.style.opacity = "1";
        cursorOutline.style.opacity = "1";
    });
}

// Initialize everything when page loads
document.addEventListener("DOMContentLoaded", () => {
    createStarsUniverse();
    initCustomCursor();
});

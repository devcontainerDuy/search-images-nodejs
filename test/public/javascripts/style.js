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

// ============ FIREWORKS CELEBRATION EFFECTS ============
function createFireworksCelebration() {
    const fireworksContainer = document.getElementById('fireworksContainer');
    if (!fireworksContainer) return;

    // Show celebration message
    const message = document.createElement('div');
    message.className = 'celebration-message';
    message.innerHTML = '🎉 Upload thành công! 🎊';
    document.body.appendChild(message);

    // Remove message after animation
    setTimeout(() => {
        if (message.parentNode) {
            message.parentNode.removeChild(message);
        }
    }, 2000);

    // Create multiple fireworks
    const fireworkCount = 8;
    const colors = ['firework-red', 'firework-blue', 'firework-green', 'firework-yellow', 
                   'firework-purple', 'firework-pink', 'firework-orange', 'firework-cyan'];
    
    for (let i = 0; i < fireworkCount; i++) {
        setTimeout(() => {
            createFirework(fireworksContainer, colors);
        }, i * 200); // Stagger fireworks
    }

    // Additional random fireworks for 3 seconds
    const randomFireworks = setInterval(() => {
        if (Math.random() > 0.7) {
            createFirework(fireworksContainer, colors);
        }
    }, 150);

    setTimeout(() => {
        clearInterval(randomFireworks);
    }, 3000);
}

function createFirework(container, colors) {
    const firework = document.createElement('div');
    firework.className = 'firework';
    
    // Random color
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    firework.classList.add(randomColor);
    
    // Random starting position (bottom of screen)
    const startX = 20 + Math.random() * 60; // 20% to 80% of screen width
    firework.style.left = startX + '%';
    firework.style.bottom = '0px';
    
    container.appendChild(firework);
    
    // Create trailing effect
    createFireworkTrail(firework, randomColor);
    
    // Launch animation
    firework.style.animation = `firework-launch ${1 + Math.random() * 0.5}s ease-out forwards`;
    
    // Explode after reaching peak
    setTimeout(() => {
        explodeFirework(firework, container, randomColor);
    }, (1 + Math.random() * 0.5) * 1000);
}

function createFireworkTrail(firework, colorClass) {
    const trail = document.createElement('div');
    trail.className = `firework-trail ${colorClass}`;
    trail.style.left = firework.style.left;
    trail.style.bottom = '0px';
    
    firework.parentNode.appendChild(trail);
    
    // Trail follows firework
    const followTrail = setInterval(() => {
        const fireworkRect = firework.getBoundingClientRect();
        trail.style.left = (fireworkRect.left + fireworkRect.width / 2) + 'px';
        trail.style.top = (fireworkRect.top + fireworkRect.height) + 'px';
    }, 16);
    
    // Stop trail and fade out
    setTimeout(() => {
        clearInterval(followTrail);
        trail.style.animation = 'firework-trail-fade 0.5s ease-out forwards';
        setTimeout(() => {
            if (trail.parentNode) {
                trail.parentNode.removeChild(trail);
            }
        }, 500);
    }, 1000);
}

function explodeFirework(firework, container, colorClass) {
    const rect = firework.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Remove the main firework
    if (firework.parentNode) {
        firework.parentNode.removeChild(firework);
    }
    
    // Create explosion burst
    const burst = document.createElement('div');
    burst.className = `firework-burst ${colorClass}`;
    burst.style.left = centerX + 'px';
    burst.style.top = centerY + 'px';
    burst.style.animation = 'firework-explode 1s ease-out forwards';
    
    container.appendChild(burst);
    
    // Create particles
    const particleCount = 15 + Math.random() * 10;
    for (let i = 0; i < particleCount; i++) {
        createFireworkParticle(container, centerX, centerY, colorClass);
    }
    
    // Remove burst after animation
    setTimeout(() => {
        if (burst.parentNode) {
            burst.parentNode.removeChild(burst);
        }
    }, 1000);
}

function createFireworkParticle(container, centerX, centerY, colorClass) {
    const particle = document.createElement('div');
    particle.className = `firework-particle ${colorClass}`;
    particle.style.left = centerX + 'px';
    particle.style.top = centerY + 'px';
    
    // Random direction and distance
    const angle = Math.random() * Math.PI * 2;
    const distance = 50 + Math.random() * 100;
    const randomX = Math.cos(angle) * distance;
    const randomY = Math.sin(angle) * distance;
    
    // Set CSS custom properties for animation
    particle.style.setProperty('--random-x', randomX + 'px');
    particle.style.setProperty('--random-y', randomY + 'px');
    
    // Apply animation
    particle.style.animation = `firework-particle-fly ${1 + Math.random() * 0.5}s ease-out forwards`;
    
    container.appendChild(particle);
    
    // Remove particle after animation
    setTimeout(() => {
        if (particle.parentNode) {
            particle.parentNode.removeChild(particle);
        }
    }, 1500);
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

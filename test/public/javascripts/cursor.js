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

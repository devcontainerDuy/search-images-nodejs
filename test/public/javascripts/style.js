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

// Initialize starry universe when page loads
document.addEventListener("DOMContentLoaded", createStarsUniverse);

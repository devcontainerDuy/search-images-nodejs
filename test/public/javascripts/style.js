// ============ STARRY UNIVERSE EFFECTS - PERFORMANCE OPTIMIZED ============
function createStarsUniverse() {
    const starsContainer = document.getElementById("starsContainer");
    if (!starsContainer) return;

    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const powerSaver = !!window.__powerSaver || prefersReducedMotion;

    // Pre-create star elements pool for better performance
    const starPool = {
        small: [],
        medium: [],
        large: []
    };

    // Create static stars with optimized rendering
    function createStars() {
        const starCount = powerSaver ? 60 : 100; // Reduced but still beautiful
        const fragment = document.createDocumentFragment(); // Use fragment for batch DOM insertion
        
        for (let i = 0; i < starCount; i++) {
            const star = document.createElement("div");
            star.className = "star";

            // Weighted random for more small stars (better performance)
            const rand = Math.random();
            const size = rand < 0.6 ? "small" : rand < 0.85 ? "medium" : "large";
            star.classList.add(size);

            // Use CSS custom properties for position (better for GPU)
            star.style.setProperty('--x', Math.random() * 100 + '%');
            star.style.setProperty('--y', Math.random() * 100 + '%');
            star.style.left = 'var(--x)';
            star.style.top = 'var(--y)';

            // Staggered animation delays for natural feel
            star.style.animationDelay = (Math.random() * 3) + "s";
            star.style.animationDuration = (powerSaver ? 3 : 2) + Math.random() * (powerSaver ? 2.5 : 2) + "s";
            star.style.willChange = 'transform, opacity';

            fragment.appendChild(star);
        }
        
        starsContainer.appendChild(fragment); // Single DOM update
    }

    // Optimized shooting star creation with object pooling
    const shootingStarPool = [];
    const maxShootingStars = powerSaver ? 3 : 5;
    
    // Pre-create shooting star pool
    for (let i = 0; i < maxShootingStars; i++) {
        const star = document.createElement("div");
        star.className = "shooting-star";
        star.style.display = "none";
        starsContainer.appendChild(star);
        shootingStarPool.push(star);
    }
    
    let poolIndex = 0;
    
    function createShootingStar() {
        const shootingStar = shootingStarPool[poolIndex];
        if (!shootingStar) return;
        
        // Reset and configure
        shootingStar.style.display = "block";
        shootingStar.style.left = Math.random() * 100 + "%";
        shootingStar.style.top = Math.random() * 40 + "%";
        
        const width = 40 + Math.random() * 60;
        shootingStar.style.width = width + "px";
        
        const duration = (powerSaver ? 2.2 : 1.8) + Math.random() * (powerSaver ? 1.2 : 1.5); // Slightly longer for smoother feel
        shootingStar.style.animationDuration = duration + "s";
        shootingStar.style.opacity = 0.7 + Math.random() * 0.3;
        
        // Reset animation
        shootingStar.style.animation = "none";
        shootingStar.offsetHeight; // Force reflow
        shootingStar.style.animation = `shooting ${duration}s linear forwards`;
        
        poolIndex = (poolIndex + 1) % maxShootingStars;
        
        // Hide after animation
        setTimeout(() => {
            shootingStar.style.display = "none";
        }, duration * 1000);
    }

    // Optimized nebula creation with reduced count but maintained beauty
    function createNebula() {
        const nebulaCount = 3; // Quality over quantity
        const nebulaTypes = ["purple", "blue", "pink"];
        const fragment = document.createDocumentFragment();

        for (let i = 0; i < nebulaCount; i++) {
            const nebula = document.createElement("div");
            nebula.className = "nebula";
            nebula.classList.add(nebulaTypes[i % nebulaTypes.length]);

            // Strategic positioning for better visual impact
            const positions = [
                { left: "20%", top: "30%" },
                { left: "70%", top: "60%" },
                { left: "40%", top: "80%" }
            ];
            
            const pos = positions[i];
            const size = 180 + Math.random() * 150; // Smaller but still visible
            
            nebula.style.width = size + "px";
            nebula.style.height = size + "px";
            nebula.style.left = pos.left;
            nebula.style.top = pos.top;
            nebula.style.animationDelay = (i * 8) + "s"; // Staggered starts
            nebula.style.animationDuration = (25 + Math.random() * 10) + "s";

            fragment.appendChild(nebula);
        }
        
        starsContainer.appendChild(fragment);
    }

    // Smart shooting star scheduling - maintains visual appeal with less CPU
    let isActive = true;
    const scheduleShootingStars = () => {
        if (!isActive) return;
        
        // Adaptive timing based on page visibility
        const isVisible = !document.hidden;
        const baseDelay = isVisible ? (powerSaver ? 3500 : 2500) : 6000; // Slower when tab not visible
        
        createShootingStar();
        
        setTimeout(scheduleShootingStars, baseDelay + Math.random() * 2000);
    };
    
    const scheduleBurst = () => {
        if (!isActive) return;
        
        // Create 2-3 shooting stars in quick succession
        const burstCount = powerSaver ? 2 : (2 + Math.floor(Math.random() * 2));
        for (let i = 0; i < burstCount; i++) {
            setTimeout(() => createShootingStar(), i * 300);
        }
        
        setTimeout(scheduleBurst, (powerSaver ? 11000 : 8000) + Math.random() * 4000);
    };

    // Initialize with performance monitoring
    createStars();
    if (!prefersReducedMotion) createNebula();
    
    // Start shooting star cycles
    setTimeout(scheduleShootingStars, 1000);
    setTimeout(scheduleBurst, 4000);
    
    // Cleanup function for performance management
    window.pauseStarEffects = () => { isActive = false; };
    window.resumeStarEffects = () => { 
        isActive = true; 
        scheduleShootingStars(); 
        scheduleBurst(); 
    };
    
    // Auto-pause when tab not visible
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            window.pauseStarEffects();
        } else {
            setTimeout(() => window.resumeStarEffects(), 500);
        }
    });
}

// ============ FIREWORKS CELEBRATION EFFECTS ============
function createFireworksCelebration() {
    const fireworksContainer = document.getElementById('fireworksContainer');
    if (!fireworksContainer) return;

    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const powerSaver = !!window.__powerSaver || prefersReducedMotion;

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
    const fireworkCount = powerSaver ? 4 : 8;
    const colors = ['firework-red', 'firework-blue', 'firework-green', 'firework-yellow', 
                   'firework-purple', 'firework-pink', 'firework-orange', 'firework-cyan'];
    
    for (let i = 0; i < fireworkCount; i++) {
        setTimeout(() => {
            createFirework(fireworksContainer, colors);
        }, i * 200); // Stagger fireworks
    }

    // Additional random fireworks for 3 seconds
    const randomFireworks = setInterval(() => {
        if (Math.random() > (powerSaver ? 0.85 : 0.7)) {
            createFirework(fireworksContainer, colors);
        }
    }, powerSaver ? 220 : 150);

    setTimeout(() => {
        clearInterval(randomFireworks);
    }, 3000);
}

let __fwActiveCount = 0;
const __fwMaxActive = 10; // cap concurrent DOM elements

function createFirework(container, colors) {
    if (__fwActiveCount >= __fwMaxActive) return;
    __fwActiveCount++;
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
    let last = 0;
    let stopped = false;
    function followTrail(ts) {
        if (stopped) return;
        if (!last || ts - last >= 33) { // ~30fps
            const fireworkRect = firework.getBoundingClientRect();
            trail.style.left = (fireworkRect.left + fireworkRect.width / 2) + 'px';
            trail.style.top = (fireworkRect.top + fireworkRect.height) + 'px';
            last = ts;
        }
        requestAnimationFrame(followTrail);
    }
    requestAnimationFrame(followTrail);
    
    // Stop trail and fade out
    setTimeout(() => {
        stopped = true;
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
        __fwActiveCount = Math.max(0, __fwActiveCount - 1);
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

// ============ OPTIMIZED CUSTOM CURSOR EFFECTS ============
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

// ============ SMART INITIALIZATION WITH PERFORMANCE MONITORING ============
document.addEventListener("DOMContentLoaded", () => {
    // Performance detection
    const performanceInfo = {
        cores: navigator.hardwareConcurrency || 2,
        memory: navigator.deviceMemory || 2,
        isHighPerf: (navigator.hardwareConcurrency >= 4) && (navigator.deviceMemory >= 4)
    };
    
    console.log('🚀 Performance Info:', performanceInfo);
    
    // Always initialize core features
    createStarsUniverse();
    initCustomCursor();
    
    // Smart performance toggle
    const toggleBtn = document.createElement('button');
    toggleBtn.innerHTML = performanceInfo.isHighPerf ? '⚡ High Performance' : '🔋 Power Saver';
    toggleBtn.style.cssText = `
        position: fixed;
        top: 15px;
        right: 15px;
        z-index: 10;
        padding: 8px 16px;
        font-size: 12px;
        font-weight: 600;
        opacity: 0.8;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 20px;
        cursor: pointer;
        backdrop-filter: blur(10px);
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
        transition: all 0.3s ease;
    `;
    
    let isOptimized = !performanceInfo.isHighPerf; // Auto-optimize on lower-end devices
    
    toggleBtn.addEventListener('click', () => {
        isOptimized = !isOptimized;
        
        if (isOptimized) {
            // Power saver mode
            window.pauseStarEffects();
            document.body.style.animationDuration = '20s'; // Slower background
            toggleBtn.innerHTML = '🔋 Power Saver';
            toggleBtn.style.background = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';
        } else {
            // High performance mode
            window.resumeStarEffects();
            document.body.style.animationDuration = '12s'; // Normal background
            toggleBtn.innerHTML = '⚡ High Performance';
            toggleBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        }
    });
    
    toggleBtn.addEventListener('mouseenter', () => {
        toggleBtn.style.transform = 'translateY(-2px) scale(1.05)';
        toggleBtn.style.opacity = '1';
    });
    
    toggleBtn.addEventListener('mouseleave', () => {
        toggleBtn.style.transform = 'translateY(0) scale(1)';
        toggleBtn.style.opacity = '0.8';
    });
    
    document.body.appendChild(toggleBtn);
    
    // Auto-optimize if performance is detected as low
    if (isOptimized) {
        setTimeout(() => toggleBtn.click(), 1000);
    }
    
    // FPS monitoring (optional - only in dev mode)
    if (window.location.hostname === 'localhost') {
        let frameCount = 0;
        let lastTime = performance.now();
        
        function measureFPS() {
            frameCount++;
            const currentTime = performance.now();
            
            if (currentTime - lastTime >= 1000) {
                const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
                console.log(`🎯 FPS: ${fps}`);
                
                // Auto-optimize if FPS is too low
                if (fps < 30 && !isOptimized) {
                    console.warn('⚠️ Low FPS detected, auto-optimizing...');
                    toggleBtn.click();
                }
                
                frameCount = 0;
                lastTime = currentTime;
            }
            
            requestAnimationFrame(measureFPS);
        }
        
        requestAnimationFrame(measureFPS);
    }
    
    console.log('✨ All effects initialized successfully!');
});

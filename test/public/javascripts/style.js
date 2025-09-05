// ============ STARRY UNIVERSE EFFECTS - PERFORMANCE OPTIMIZED ============
function createStarsUniverse() {
    const starsContainer = document.getElementById("starsContainer");
    if (!starsContainer) return;

    // Pre-create star elements pool for better performance
    const starPool = {
        small: [],
        medium: [],
        large: []
    };

    // Create static stars with optimized rendering
    function createStars() {
        const starCount = 100; // Reduced but still beautiful
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
            star.style.animationDuration = (2 + Math.random() * 2) + "s";

            fragment.appendChild(star);
        }
        
        starsContainer.appendChild(fragment); // Single DOM update
    }

    // Optimized shooting star creation with object pooling
    const shootingStarPool = [];
    const maxShootingStars = 5;
    
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
        
        const duration = 1.8 + Math.random() * 1.5; // Slightly longer for smoother feel
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
        const baseDelay = isVisible ? 2500 : 5000; // Slower when tab not visible
        
        createShootingStar();
        
        setTimeout(scheduleShootingStars, baseDelay + Math.random() * 2000);
    };
    
    const scheduleBurst = () => {
        if (!isActive) return;
        
        // Create 2-3 shooting stars in quick succession
        const burstCount = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < burstCount; i++) {
            setTimeout(() => createShootingStar(), i * 300);
        }
        
        setTimeout(scheduleBurst, 8000 + Math.random() * 4000);
    };

    // Initialize with performance monitoring
    createStars();
    createNebula();
    
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

// ============ OPTIMIZED CUSTOM CURSOR EFFECTS ============
// function initCustomCursor() {
//     // Remove any existing cursors to prevent duplicates
//     document.querySelectorAll('.cursor-dot, .cursor-outline').forEach(el => el.remove());
    
//     // Create cursor elements
//     const cursorDot = document.createElement("div");
//     const cursorOutline = document.createElement("div");

//     cursorDot.className = "cursor-dot";
//     cursorOutline.className = "cursor-outline";

//     document.body.appendChild(cursorDot);
//     document.body.appendChild(cursorOutline);

//     let mouseX = 0;
//     let mouseY = 0;
//     let outlineX = 0;
//     let outlineY = 0;
//     let lastTrailTime = 0;

//     // Pre-create trail pool for better performance
//     const trailPool = [];
//     const maxTrails = 10;
    
//     for (let i = 0; i < maxTrails; i++) {
//         const trail = document.createElement("div");
//         trail.className = "cursor-trail";
//         trail.style.display = "none";
//         document.body.appendChild(trail);
//         trailPool.push(trail);
//     }
    
//     let trailIndex = 0;

//     // Optimized mouse movement with requestAnimationFrame throttling
//     let rafId = null;
    
//     document.addEventListener("mousemove", (e) => {
//         mouseX = e.clientX;
//         mouseY = e.clientY;

//         // Use transform for hardware acceleration
//         cursorDot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;

//         // Throttled trail creation - only every 50ms for smooth but efficient trails
//         const currentTime = performance.now();
//         if (currentTime - lastTrailTime > 50 && Math.random() > 0.7) {
//             createTrail(mouseX, mouseY);
//             lastTrailTime = currentTime;
//         }
//     });

//     // Optimized outline following with reduced update frequency
//     function animateOutline() {
//         const smoothing = 0.12; // Slightly faster for responsiveness
//         outlineX += (mouseX - outlineX) * smoothing;
//         outlineY += (mouseY - outlineY) * smoothing;

//         // Use transform3d for better performance
//         cursorOutline.style.transform = `translate3d(${outlineX}px, ${outlineY}px, 0)`;

//         rafId = requestAnimationFrame(animateOutline);
//     }
//     animateOutline();

//     // Efficient trail creation using object pool
//     function createTrail(x, y) {
//         const trail = trailPool[trailIndex];
//         trail.style.display = "block";
//         trail.style.transform = `translate3d(${x}px, ${y}px, 0)`;
//         trail.style.opacity = "0.6";
        
//         // Reset and restart animation efficiently
//         trail.style.animation = "none";
//         trail.offsetHeight; // Force reflow
//         trail.style.animation = "trail-fade 0.4s ease-out forwards";
        
//         trailIndex = (trailIndex + 1) % maxTrails;
        
//         // Hide after animation
//         setTimeout(() => {
//             trail.style.display = "none";
//         }, 400);
//     }

//     // Hover effects on interactive elements
//     const interactiveElements = "button, a, input, textarea, select, .btn, .item, .tag, .page-btn, .similar-btn, .delete-btn";

//     document.addEventListener("mouseover", (e) => {
//         if (e.target.matches(interactiveElements)) {
//             cursorDot.classList.add("hover");
//             cursorOutline.classList.add("hover");
//         }
//     });

//     document.addEventListener("mouseout", (e) => {
//         if (e.target.matches(interactiveElements)) {
//             cursorDot.classList.remove("hover");
//             cursorOutline.classList.remove("hover");
//         }
//     });

//     // Text selection cursor
//     const textElements = "p, span, div, h1, h2, h3, h4, h5, h6, label";

//     document.addEventListener("mouseover", (e) => {
//         if (e.target.matches(textElements) && !e.target.matches(interactiveElements)) {
//             cursorDot.classList.add("text");
//             cursorOutline.classList.add("text");
//         }
//     });

//     document.addEventListener("mouseout", (e) => {
//         if (e.target.matches(textElements)) {
//             cursorDot.classList.remove("text");
//             cursorOutline.classList.remove("text");
//         }
//     });

//     // Optimized click ripple with object pooling
//     const ripplePool = [];
//     const maxRipples = 5;
    
//     for (let i = 0; i < maxRipples; i++) {
//         const ripple = document.createElement("div");
//         ripple.style.position = "fixed";
//         ripple.style.borderRadius = "50%";
//         ripple.style.border = "2px solid rgba(252, 70, 107, 0.6)";
//         ripple.style.pointerEvents = "none";
//         ripple.style.zIndex = "9996";
//         ripple.style.display = "none";
//         document.body.appendChild(ripple);
//         ripplePool.push(ripple);
//     }
    
//     let rippleIndex = 0;

//     // Click effects with improved performance
//     document.addEventListener("mousedown", () => {
//         cursorDot.classList.add("click");
//         cursorOutline.classList.add("click");
//         createClickRipple(mouseX, mouseY);
//     });

//     document.addEventListener("mouseup", () => {
//         setTimeout(() => {
//             cursorDot.classList.remove("click");
//             cursorOutline.classList.remove("click");
//         }, 200); // Slightly faster for snappier feel
//     });

//     // Efficient click ripple using pool
//     function createClickRipple(x, y) {
//         const ripple = ripplePool[rippleIndex];
//         ripple.style.display = "block";
//         ripple.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(0)`;
//         ripple.style.width = "0px";
//         ripple.style.height = "0px";
//         ripple.style.opacity = "1";
        
//         // Reset and start animation
//         ripple.style.animation = "none";
//         ripple.offsetHeight; // Force reflow
//         ripple.style.animation = "cursor-ripple 0.5s ease forwards";
        
//         rippleIndex = (rippleIndex + 1) % maxRipples;
        
//         setTimeout(() => {
//             ripple.style.display = "none";
//         }, 500);
//     }

//     // Hide cursor when mouse leaves window
//     document.addEventListener("mouseleave", () => {
//         cursorDot.style.opacity = "0";
//         cursorOutline.style.opacity = "0";
//     });

//     document.addEventListener("mouseenter", () => {
//         cursorDot.style.opacity = "1";
//         cursorOutline.style.opacity = "1";
//     });
// }

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
        z-index: 10000;
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

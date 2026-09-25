const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!reduceMotion) {
  const yarn = document.getElementById("yarnBall");
  const cat = document.getElementById("followingCat");
  const catSprite = document.getElementById("catSprite");

  if (yarn && cat && catSprite) {
    const target = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
    const follower = { ...target };
    let frameId;
    let lastSpriteChange = 0;
    let spriteFrame = 0;
    const sprites = [
      "/assets/cat-sprites/gato1-alineado.png",
      "/assets/cat-sprites/gato2-alineado.png",
    ];

    function actualizarSprite(now, moving) {
      if (moving && now - lastSpriteChange > 170) {
        spriteFrame = (spriteFrame + 1) % sprites.length;
        lastSpriteChange = now;
      }
      if (!moving) {
        spriteFrame = 0;
      }
      const nextSprite = sprites[spriteFrame];
      if (catSprite.getAttribute("src") !== nextSprite) {
        catSprite.src = nextSprite;
      }
    }

    function render(now) {
      const distanceX = target.x - follower.x;
      const distanceY = target.y - follower.y;
      const distance = Math.hypot(distanceX, distanceY);
      const maxStep = 1.8;

      if (distance > 1) {
        const step = Math.min(maxStep, distance * 0.035);
        follower.x += (distanceX / distance) * step;
        follower.y += (distanceY / distance) * step;
      }

      const moving = distance > 8;
      cat.classList.toggle("running", moving);
      const angle = Math.atan2(distanceY, distanceX) * (180 / Math.PI);
      actualizarSprite(now, moving);

      yarn.style.transform = `translate3d(${target.x}px, ${target.y}px, 0) translate(-50%, -50%)`;
      cat.style.transform = `translate3d(${follower.x}px, ${follower.y}px, 0) translate(-50%, -50%) rotate(${angle}deg)`;
      frameId = requestAnimationFrame(render);
    }

    function seguirCursor(event) {
      target.x = event.clientX;
      target.y = event.clientY;
      yarn.classList.add("visible");
      cat.classList.add("visible");
    }

    window.addEventListener("pointermove", seguirCursor, { passive: true });
    window.addEventListener("mousemove", seguirCursor, { passive: true });

    function ocultarJuego() {
      yarn.classList.remove("visible");
      cat.classList.remove("visible");
    }

    document.documentElement.addEventListener("mouseleave", ocultarJuego);

    frameId = requestAnimationFrame(render);
    window.addEventListener("pagehide", () => cancelAnimationFrame(frameId), { once: true });
  }
}

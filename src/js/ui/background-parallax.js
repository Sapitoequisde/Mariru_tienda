const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!reduceMotion && !("ontouchstart" in window)) {
  let framePending = false;
  let pointerX = 0;
  let pointerY = 0;

  function actualizarFondo() {
    document.documentElement.style.setProperty("--parallax-x", `${pointerX}px`);
    document.documentElement.style.setProperty("--parallax-y", `${pointerY}px`);
    framePending = false;
  }

  window.addEventListener("pointermove", (event) => {
    pointerX = ((event.clientX / window.innerWidth) - 0.5) * 10;
    pointerY = ((event.clientY / window.innerHeight) - 0.5) * 10;

    if (!framePending) {
      framePending = true;
      requestAnimationFrame(actualizarFondo);
    }
  }, { passive: true });
}

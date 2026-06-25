(function () {
  const carousels = document.querySelectorAll("[data-comparison-carousel]");

  carousels.forEach((carousel) => {
    const track = carousel.querySelector("[data-carousel-track]");
    const slides = Array.from(carousel.querySelectorAll(".comparison-carousel-slide"));
    const dots = Array.from(carousel.querySelectorAll("[data-carousel-dot]"));
    const prevBtn = carousel.querySelector("[data-carousel-prev]");
    const nextBtn = carousel.querySelector("[data-carousel-next]");
    const videos = slides.map((slide) => slide.querySelector("video"));
    let activeIndex = 0;

    function normalizeIndex(index) {
      const slideCount = slides.length;
      return ((index % slideCount) + slideCount) % slideCount;
    }

    function pauseInactiveVideos() {
      videos.forEach((video, index) => {
        if (!video || index === activeIndex) {
          return;
        }
        video.pause();
      });
    }

    function updateCarousel(nextIndex) {
      activeIndex = normalizeIndex(nextIndex);

      slides.forEach((slide, index) => {
        slide.classList.toggle("is-active", index === activeIndex);
        slide.setAttribute("aria-hidden", index === activeIndex ? "false" : "true");
      });

      dots.forEach((dot, index) => {
        const isActive = index === activeIndex;
        dot.classList.toggle("is-active", isActive);
        dot.setAttribute("aria-current", isActive ? "true" : "false");
      });

      pauseInactiveVideos();
    }

    prevBtn?.addEventListener("click", function () {
      updateCarousel(activeIndex - 1);
    });

    nextBtn?.addEventListener("click", function () {
      updateCarousel(activeIndex + 1);
    });

    dots.forEach((dot, index) => {
      dot.addEventListener("click", function () {
        updateCarousel(index);
      });
    });

    carousel.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        updateCarousel(activeIndex - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        updateCarousel(activeIndex + 1);
      }
    });

    updateCarousel(0);
  });
})();

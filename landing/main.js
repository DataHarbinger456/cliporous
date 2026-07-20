const SHOTS = [
  {
    file: "source.png",
    title: "Source",
    caption: "Choose short clips or long-form output, then drop a local video or paste a supported URL.",
    width: 1432,
    height: 900,
  },
  {
    file: "processing.png",
    title: "Shape",
    caption: "Follow the transcript, moment discovery, story composition, framing, and styling stages as they finish.",
    width: 1432,
    height: 900,
  },
  {
    file: "review.png",
    title: "Review",
    caption: "Compare candidates, preview the rendered edit, and make explicit approve or reject decisions.",
    width: 1432,
    height: 900,
  },
];

const gallery = document.querySelector("[data-gallery]");
const lightbox = document.querySelector("[data-lightbox]");
const lightboxImage = document.querySelector("[data-lightbox-img]");
const lightboxCaption = document.querySelector("[data-lightbox-caption]");
const closeButton = document.querySelector("[data-lightbox-close]");
const previousButton = document.querySelector("[data-lightbox-prev]");
const nextButton = document.querySelector("[data-lightbox-next]");

let activeShot = 0;
let triggerButton = null;

function setLightboxShot(index) {
  activeShot = (index + SHOTS.length) % SHOTS.length;
  const shot = SHOTS[activeShot];
  lightboxImage.src = `assets/screens/${shot.file}`;
  lightboxImage.alt = `${shot.title}. ${shot.caption}`;
  lightboxCaption.textContent = `${shot.title}: ${shot.caption}`;
}

function openLightbox(index, trigger) {
  if (!lightbox) return;
  triggerButton = trigger;
  setLightboxShot(index);
  lightbox.showModal();
  closeButton?.focus();
}

function closeLightbox() {
  if (!lightbox?.open) return;
  lightbox.close();
}

function buildGallery() {
  if (!gallery) return;

  SHOTS.forEach((shot, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "shot";
    button.setAttribute("aria-label", `Open ${shot.title} screen`);
    button.addEventListener("click", () => openLightbox(index, button));

    const image = document.createElement("img");
    image.src = `assets/screens/${shot.file}`;
    image.alt = `${shot.title}. ${shot.caption}`;
    image.loading = "lazy";
    image.width = shot.width;
    image.height = shot.height;

    const caption = document.createElement("span");
    caption.className = "shot-caption";

    const title = document.createElement("strong");
    title.textContent = shot.title;
    caption.append(title, document.createTextNode(shot.caption));
    button.append(image, caption);
    gallery.append(button);
  });
}

function wireLightbox() {
  if (!lightbox) return;

  closeButton?.addEventListener("click", closeLightbox);
  previousButton?.addEventListener("click", () => setLightboxShot(activeShot - 1));
  nextButton?.addEventListener("click", () => setLightboxShot(activeShot + 1));

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) closeLightbox();
  });

  lightbox.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setLightboxShot(activeShot - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setLightboxShot(activeShot + 1);
    }
  });

  lightbox.addEventListener("close", () => {
    triggerButton?.focus();
    triggerButton = null;
  });
}

buildGallery();
wireLightbox();

let map;
let currentQuestion = 0;
let correctCount = 0;
let incorrectCount = 0;
const boundsDelta = 0.0003; // ~33m latitude-wise near the equator
let viewportRectangle;
let keydownHandlerAttached = false;
let finalPopupShown = false;
let outdoorMarker;
let outdoorInfoWindow;

const HIGH_SCORE_KEY = "mapQuizBestTime";
let startTime = null;
let timerInterval = null;
let bestTime = null;

// Define your quiz locations here
// Replace these bounds with the real rectangles for your campus
const quizLocations = [
  {
    name: "BookStore",
    bounds: {
      north: 34.23782495277561,
      south: 34.23702661500686,
      east:  -118.5276913862042,
      west:  -118.52872642095618
    },
  },
  {
    name: "Bayramian Hall",
    bounds: {
      north: 34.240809406975764, 
      south: 34.23992289177611, 
      east: -118.53015731588901,
      west: -118.53150544376155,
    },
  },
  {
    name: "Jacaranda Hall",
    bounds: {
      north: 34.24189519792736,
      south: 34.24104150455889, 
      east: -118.52787815034581,
      west:  -118.52960789770091,
    },
  },
  {
    name: "Matadome",
    bounds: {
      north: 34.24215436838169,
      south: 34.2413667221461,
      east: -118.5262,
      west: -118.5268,
    },
  },
  {
    name: "Outdoor Adventures",
    bounds: {
      north: 34.24061391805083,
      south: 34.240015964133796, 
      east: -118.52492785068543,
      west:  -118.52540577169712,
    },
  },
];

// Called by Google Maps when the JS API loads
function initMap() {
  // Center the map roughly on campus (replace with your own center)
  const center = { lat: 34.2402, lng: -118.5283 };

  // Start timer when the quiz begins
startTime = performance.now();
timerInterval = setInterval(updateTimer, 100);

// Load high score from localStorage (if any)
const stored = localStorage.getItem(HIGH_SCORE_KEY);
if (stored) {
  bestTime = parseFloat(stored);
}
updateHighScoreDisplay();

  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 17,
    center,
    mapTypeId: "roadmap",
    // Keep the map at a fixed zoom level and disable zoom interactions
    minZoom: 17,
    maxZoom: 21,
    disableDoubleClickZoom: true,
    zoomControl: false,
    scrollwheel: false,
    keyboardShortcuts: false,
    // Prevent any panning/dragging
    draggable: false,
    gestureHandling: "none",
    // Remove all UI and disable place info
    disableDefaultUI: true,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
    rotateControl: false,
    scaleControl: false,
    clickableIcons: false,
    // Hide labels, icons, POIs, roads, transit, admin layers
    styles: [
      { elementType: "labels", stylers: [{ visibility: "off" }] },
      { featureType: "poi", stylers: [{ visibility: "on" }] },
      { featureType: "transit", stylers: [{ visibility: "on" }] },
      { featureType: "road", stylers: [{ visibility: "on" }] },
      { featureType: "administrative", stylers: [{ visibility: "on" }] },
      { elementType: "labels.icon", stylers: [{ visibility: "off"}] }
    ],
  });

  // Create a rectangle that reflects the current viewport bounds
  viewportRectangle = new google.maps.Rectangle({
    strokeColor: "#FF0000",
    strokeOpacity: 0.8,
    strokeWeight: 2,
    fillColor: "#FF0000",
    fillOpacity: 0.0,
    clickable: false,
    map,
  });

  // Initialize the rectangle once bounds are first available
  map.addListener("idle", () => {
    const b = map.getBounds();
    if (b) {
      viewportRectangle.setOptions({ bounds: b });
    }
  });

  // Update the rectangle to the (pre-zoom) bounds whenever zoom changes
  map.addListener("zoom_changed", () => {
    const b = map.getBounds();
    if (b) {
      viewportRectangle.setOptions({ bounds: b });
    }
  });

  // Double-click handler: answer only (no zoom here)
  map.addListener("dblclick", (e) => {
    handleAnswer(e.latLng);
  });

  //REQUIREMENT FOR RECTANGLE ZOOM
  // Keyboard '+' zoom-in handler
  if (!keydownHandlerAttached) {
    window.addEventListener("keydown", (ev) => {
      const isPlusKey =
        ev.key === "+" ||
        (ev.key === "=" && ev.shiftKey) ||
        ev.code === "NumpadAdd";
      if (!isPlusKey) return;
      ev.preventDefault();
      const currentZoom = map.getZoom() || 17;
      const nextZoom = Math.min(currentZoom + 1, 21);
      map.setZoom(nextZoom);
    });
    keydownHandlerAttached = true;
  }

  // Prompt the first question
  showCurrentQuestionPopup();

  // Highlight the first question as active
  const firstLi = document.getElementById(`q-${currentQuestion}`);
  if (firstLi) firstLi.classList.add("active");
}

function handleAnswer(latLng) {
  // No more questions left
  if (currentQuestion >= quizLocations.length) return;

  const q = quizLocations[currentQuestion];

  // Log click coordinates and a suggested bounds snippet (especially useful for BookStore)
  const clickedLat = latLng.lat();
  const clickedLng = latLng.lng();
  console.log("Double-click at:", clickedLat, clickedLng);
  if (currentQuestion === 0) {
    const suggested = {
      north: clickedLat + boundsDelta,
      south: clickedLat - boundsDelta,
      east: clickedLng + boundsDelta,
      west: clickedLng - boundsDelta,
    };
    console.log("Suggested BookStore bounds:", suggested);
  }

  const inBounds =
    latLng.lat() <= q.bounds.north &&
    latLng.lat() >= q.bounds.south &&
    latLng.lng() <= q.bounds.east &&
    latLng.lng() >= q.bounds.west;

  // Color: green if correct, red if wrong
  const color = inBounds ? "#00AA00" : "#FF0000";
  const fillOpacity = inBounds ? 0.25 : 0.35;

  // Draw the rectangle for this question
  new google.maps.Rectangle({
    strokeColor: color,
    strokeOpacity: 0.8,
    strokeWeight: 2,
    fillColor: color,
    fillOpacity,
    map,
    bounds: q.bounds,
  });

  const li = document.getElementById(`q-${currentQuestion}`);
  if (li) {
    li.classList.remove("active");
    li.textContent = `Where is ${q.name}??`;
  }

  const feedbackEl = document.getElementById(`fb-${currentQuestion}`);
  if (feedbackEl) {
    feedbackEl.textContent = inBounds
      ? "Your answer is correct!!"
      : "Sorry wrong location.";
    feedbackEl.classList.remove("correct", "incorrect");
    feedbackEl.classList.add(inBounds ? "correct" : "incorrect");
  }

  if (inBounds) {
    correctCount++;
  } else {
    incorrectCount++;
  }

  currentQuestion++;
  updateScore();

  // Prompt the next question, if any
  if (currentQuestion < quizLocations.length) {
    showCurrentQuestionPopup();
    const nextLi = document.getElementById(`q-${currentQuestion}`);
    if (nextLi) nextLi.classList.add("active");
  }
}

function updateScore() {
  if (currentQuestion === quizLocations.length) {
    const scoreEl = document.getElementById("score");
    scoreEl.textContent = `${correctCount} Correct, ${incorrectCount} Incorrect`;

    // After finishing all questions, show an info window for Outdoor Adventures
    if (!finalPopupShown) {
      const last = quizLocations[quizLocations.length - 1];
      const centerLat =
        (last.bounds.north + last.bounds.south) / 2;
      const centerLng =
        (last.bounds.east + last.bounds.west) / 2;
      const position = { lat: centerLat, lng: centerLng };

      outdoorMarker = new google.maps.Marker({
        position,
        map,
        title: last.name,
      });
//Requirment INFO WINDOW
      const contentHtml = `<div>
  <h1 style="margin:0 0 6px 0;">${last.name}</h1>
  <div>This is the Outdoor Adventures! This place is not well known on campus. You can get 
  to go on trips and rent our camping gear here for cheap prices! Only for students and CSUN workers! Here is the location for ${last.name}.</div>
</div>`;

      outdoorInfoWindow = new google.maps.InfoWindow({
        content: contentHtml,
        ariaLabel: last.name,
      });

      outdoorInfoWindow.open({
        anchor: outdoorMarker,
        map,
      });

      finalPopupShown = true;
    }
  }


  if (currentQuestion === quizLocations.length) {
  // Stop timer
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  let finalTimeSeconds = 0;
  if (startTime != null) {
    finalTimeSeconds = (performance.now() - startTime) / 1000;
  }

  const timerEl = document.getElementById("timer");
  if (timerEl) {
    timerEl.textContent = `Final Time: ${finalTimeSeconds.toFixed(1)} seconds`;
  }

  // Update high score
  tryUpdateHighScore(finalTimeSeconds);
}

}

function updateTimer() {
  if (!startTime) return;
  const now = performance.now();
  const elapsedSeconds = (now - startTime) / 1000;
  const timerEl = document.getElementById("timer");
  if (timerEl) {
    timerEl.textContent = `Time: ${elapsedSeconds.toFixed(1)} seconds`;
  }
}

function showCurrentQuestionPopup() {
  const promptEl = document.getElementById("prompt");
  if (!promptEl) return;
  if (currentQuestion < quizLocations.length) {
    const q = quizLocations[currentQuestion];
    promptEl.textContent = `Please double click on the map the location of: ${q.name}`;
  } else {
    promptEl.textContent = "Quiz complete!";
  }
}

function updateHighScoreDisplay() {
  const hsEl = document.getElementById("high-score");
  if (!hsEl) return;

  if (bestTime == null) {
    hsEl.textContent = "High Score: --";
  } else {
    hsEl.textContent = `High Score (all correct): ${bestTime.toFixed(1)} seconds`;
  }
}

function tryUpdateHighScore(elapsedSeconds) {
  const hsEl = document.getElementById("high-score");
  if (incorrectCount > 0) {
    // Only record high scores when all answers are correct
    if (hsEl) {
      hsEl.textContent =
        "High Score: only recorded when all answers are correct.";
    }
    return;
  }

  if (bestTime == null || elapsedSeconds < bestTime) {
    bestTime = elapsedSeconds;
    localStorage.setItem(HIGH_SCORE_KEY, bestTime.toString());
  }

  updateHighScoreDisplay();
}


// Expose initMap globally for the callback
window.initMap = initMap;

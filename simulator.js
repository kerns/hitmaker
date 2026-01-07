// simulator.js
// Core traffic simulation engine
// Simulates realistic web traffic with diverse user agents, locations, IPs, and referers

// ============================================================================
// Configuration
// ============================================================================

/**
 * Get configuration from environment variables with sensible defaults
 */
export function getConfig() {
  let urlParams = [];
  try {
    urlParams = process.env.URL_PARAMS ? JSON.parse(process.env.URL_PARAMS) : [];
  } catch (e) {
    console.warn("Failed to parse URL_PARAMS:", e.message);
  }
  
  return {
    MIN_PER_MIN: Number(process.env.MIN_PER_MIN || 1),
    MAX_PER_MIN: Number(process.env.MAX_PER_MIN || 100),
    CONCURRENT: Number(process.env.CONCURRENT || 1),
    METHOD: process.env.METHOD || "GET",
    TIMEOUT_MS: Number(process.env.TIMEOUT_MS || 8000),
    DEVICE_RATIO: Number(process.env.DEVICE_RATIO || 50), // 50% desktop by default
    MIN_ACTIVE: Number(process.env.MIN_ACTIVE || 5),
    MAX_ACTIVE: Number(process.env.MAX_ACTIVE || 25),
    IDLE_ODDS: Number(process.env.IDLE_ODDS || 0.5), // 50% chance
    MIN_IDLE: Number(process.env.MIN_IDLE || 2),
    MAX_IDLE: Number(process.env.MAX_IDLE || 45),
    UNIQUE_IP_PROB: Number(process.env.UNIQUE_IP_PROB || 0.95), // 95% unique visitors
    URL_PARAMS: urlParams,
  };
}

// ============================================================================
// Data Sources for Realistic Traffic Simulation
// ============================================================================

/**
 * Desktop user agents
 */
const DESKTOP_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0",
];

/**
 * Mobile user agents (includes phones and tablets)
 */
const MOBILE_USER_AGENTS = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 13; SM-X906C) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

const ACCEPT_LANGS = [
  "en-US,en;q=0.9",
  "en-GB,en;q=0.9",
  "da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7",
  "fr-FR,fr;q=0.9,en-US;q=0.8",
];

const REFERERS = [
  "https://facebook.com/",
  "https://twitter.com/",
  "https://linkedin.com/",
  "https://google.com/",
  "https://reddit.com/",
  "https://youtube.com/",
  "https://discord.com/",
  "https://slack.com/",
  "https://whatsapp.com/",
  "https://tiktok.com/",
  "https://pinterest.com/",
  "https://telegram.org/",
  "https://weibo.com/",
];

/**
 * Vercel geolocation headers simulation
 * Mix of US, Danish, and other international locations
 */
const LOCATIONS = [
  // US locations (with state codes)
  {
    country: "US",
    city: "The%20Dalles",
    region: "OR",
    latitude: "45.5946",
    longitude: "-121.1787",
  },
  {
    country: "US",
    city: "Atlanta",
    region: "GA",
    latitude: "33.7490",
    longitude: "-84.3880",
  },
  {
    country: "US",
    city: "New%20York",
    region: "NY",
    latitude: "40.7128",
    longitude: "-74.0060",
  },
  {
    country: "US",
    city: "San%20Francisco",
    region: "CA",
    latitude: "37.7749",
    longitude: "-122.4194",
  },
  // Danish locations (with numeric region codes)
  {
    country: "DK",
    city: "Copenhagen",
    region: "84",
    latitude: "55.6761",
    longitude: "12.5683",
  },
  {
    country: "DK",
    city: "Aarhus",
    region: "82",
    latitude: "56.1629",
    longitude: "10.2039",
  },
  // Other international locations
  {
    country: "DE",
    city: "Munich",
    region: "BY",
    latitude: "48.1351",
    longitude: "11.5820",
  },
  {
    country: "GB",
    city: "London",
    region: "ENG",
    latitude: "51.5074",
    longitude: "-0.1278",
  },
  {
    country: "FR",
    city: "Paris",
    region: "IDF",
    latitude: "48.8566",
    longitude: "2.3522",
  },
];

/**
 * First octet ranges that look realistic per country (avoid reserved ranges)
 * Each country gets multiple first-octet options for variety
 */
const IP_FIRST_OCTETS = {
  US: [
    3, 8, 13, 18, 23, 34, 35, 44, 50, 52, 54, 63, 64, 65, 66, 67, 68, 69, 70,
    71, 72, 73, 74, 75, 76, 96, 97, 98, 99, 100, 104, 107, 108, 128, 129, 130,
    131, 132, 134, 135, 136, 137, 138, 139, 140, 142, 143, 144, 147, 148, 149,
    150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164,
    165, 166, 167, 168, 170, 171, 172, 173, 174, 184, 198, 199, 204, 205, 206,
    207, 208, 209,
  ],
  DK: [
    2, 5, 31, 37, 46, 77, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92,
    93, 94, 95, 109, 176, 178, 185, 188, 193, 194, 195, 212, 213,
  ],
  DE: [
    2, 5, 31, 37, 46, 62, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89,
    91, 92, 93, 94, 95, 109, 134, 138, 141, 145, 146, 176, 178, 185, 188, 193,
    194, 195, 212, 213, 217,
  ],
  GB: [
    2, 5, 31, 37, 46, 51, 62, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88,
    89, 90, 91, 92, 93, 94, 95, 109, 176, 178, 185, 188, 193, 194, 195, 212,
    213, 217,
  ],
  FR: [
    2, 5, 31, 37, 46, 62, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89,
    90, 91, 92, 93, 94, 95, 109, 176, 178, 185, 188, 193, 194, 195, 212, 213,
    217,
  ],
};

// ============================================================================
// Utility Functions
// ============================================================================

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Generate a simulated IP address for a given country code
 * Generates fully random IPs for massive uniqueness
 * The redirect service normalizes to /24 subnet, so first 3 octets matter for uniqueness
 */
function generateFakeIp(countryCode, usedIps, uniqueIpProb) {
  // Decide if this should be a unique IP or potentially a repeat
  if (Math.random() < uniqueIpProb || usedIps.size === 0) {
    // Generate a completely unique IP
    const firstOctets = IP_FIRST_OCTETS[countryCode] || IP_FIRST_OCTETS.US;
    const octet1 = randChoice(firstOctets);
    const octet2 = randInt(0, 255);
    const octet3 = randInt(0, 255);
    const octet4 = randInt(1, 254);

    const ip = `${octet1}.${octet2}.${octet3}.${octet4}`;

    // Store the /24 subnet (what gets normalized) for potential reuse
    const subnet = `${octet1}.${octet2}.${octet3}`;
    usedIps.add(subnet);

    return ip;
  } else {
    // Return a previously used subnet (simulates repeat visitor)
    const subnets = Array.from(usedIps);
    const subnet = randChoice(subnets);
    return `${subnet}.${randInt(1, 254)}`;
  }
}

// ============================================================================
// Simulator Class
// ============================================================================

/**
 * TrafficSimulator - simulates realistic web traffic to a target URL
 */
export class TrafficSimulator {
  constructor(targetUrl, config = {}) {
    // Validate URL
    try {
      new URL(targetUrl);
    } catch {
      throw new Error(`Invalid URL provided: ${targetUrl}`);
    }

    this.targetUrl = targetUrl;
    this.config = { ...getConfig(), ...config };
    this.usedIps = new Set();
    this.hitCounter = 0;
    this.workers = [];
    this.isRunning = false;
  }

  /**
   * Execute a single HTTP request with simulated headers
   */
  async doHit(workerId) {
    const hitNumber = ++this.hitCounter;
    // Pick user agent based on device ratio (% desktop vs mobile)
    const isDesktop = Math.random() * 100 < this.config.DEVICE_RATIO;
    const ua = randChoice(isDesktop ? DESKTOP_USER_AGENTS : MOBILE_USER_AGENTS);
    const al = randChoice(ACCEPT_LANGS);
    const ref = randChoice(REFERERS);
    const location = randChoice(LOCATIONS);
    const cacheBust = Math.random().toString(36).slice(2, 9);

    // Generate a unique fake IP for this request
    const fakeIp = generateFakeIp(
      location.country,
      this.usedIps,
      this.config.UNIQUE_IP_PROB,
    );

    // Build URL with cache bust and dynamic URL parameters
    const sep = this.targetUrl.includes("?") ? "&" : "?";
    let url = `${this.targetUrl}${sep}r=${cacheBust}`;
    
    // Add URL parameters based on their probability
    const appliedParams = [];
    this.config.URL_PARAMS.forEach((param) => {
      if (Math.random() * 100 < param.probability) {
        if (param.value) {
          url += `&${param.key}=${param.value}`;
        } else {
          url += `&${param.key}`;
        }
        appliedParams.push(param.key);
      }
    });

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.TIMEOUT_MS,
    );

    try {
      const res = await fetch(url, {
        method: this.config.METHOD,
        signal: controller.signal,
        headers: {
          "User-Agent": ua,
          "Accept-Language": al,
          Referer: ref,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          // Simulate client IP - this is what the redirect service uses for uniqueness
          "x-forwarded-for": fakeIp,
          "x-real-ip": fakeIp,
          // Simulate Vercel geolocation headers
          "x-vercel-ip-country": location.country,
          "x-vercel-ip-city": location.city,
          "x-vercel-ip-country-region": location.region,
          "x-vercel-ip-latitude": location.latitude,
          "x-vercel-ip-longitude": location.longitude,
        },
      });

      console.log(
        new Date().toISOString(),
        `W${workerId}`,
        `#${hitNumber}`,
        res.status,
        `${decodeURIComponent(location.city)}, ${location.region}, ${location.country}`,
        fakeIp,
        ua.split(" ")[0],
        appliedParams.length > 0 ? `[${appliedParams.join(",")}]` : "",
      );

      return { success: true, status: res.status, hitNumber };
    } catch (err) {
      console.warn(
        new Date().toISOString(),
        `W${workerId}`,
        `#${hitNumber}`,
        "ERROR",
        err.message,
      );
      return { success: false, error: err.message, hitNumber };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Active phase - make requests at a random rate
   */
  async activePhase(workerId, minutes) {
    const rate = randInt(this.config.MIN_PER_MIN, this.config.MAX_PER_MIN);
    console.log(
      new Date().toISOString(),
      `W${workerId}`,
      `ACTIVE for ${minutes} min @ ~${rate}/min`,
    );

    const end = Date.now() + minutes * 60 * 1000;
    while (Date.now() < end && this.isRunning) {
      await this.doHit(workerId);

      // interval per request in ms
      const base = 60000 / rate;
      const jitter = Math.round(base * (Math.random() * 0.2 - 0.1)); // ±10%
      await sleep(Math.max(100, base + jitter));
    }
  }

  /**
   * Idle phase - sleep for a random duration
   */
  async idlePhase(workerId, minutes) {
    console.log(
      new Date().toISOString(),
      `W${workerId}`,
      `IDLE for ${minutes} min`,
    );
    await sleep(minutes * 60 * 1000);
  }

  /**
   * Worker loop - alternates between active and idle phases
   */
  async workerLoop(id) {
    while (this.isRunning) {
      // active phase
      const activeMinutes = randInt(
        this.config.MIN_ACTIVE,
        this.config.MAX_ACTIVE,
      );
      await this.activePhase(id, activeMinutes);

      // transition
      if (Math.random() < this.config.IDLE_ODDS && this.isRunning) {
        const idleMinutes = randInt(
          this.config.MIN_IDLE,
          this.config.MAX_IDLE,
        );
        await this.idlePhase(id, idleMinutes);
      }
    }
  }

  /**
   * Start the simulator
   */
  async start() {
    if (this.isRunning) {
      console.warn("Simulator is already running");
      return;
    }

    this.isRunning = true;
    console.log(`Starting traffic simulator for ${this.targetUrl}`);
    console.log("Config:", this.config);

    for (let i = 0; i < this.config.CONCURRENT; i++) {
      const worker = this.workerLoop(i + 1).catch((e) =>
        console.error(`Worker ${i + 1} crashed:`, e),
      );
      this.workers.push(worker);
      await sleep(200); // stagger startup
    }
  }

  /**
   * Stop the simulator
   */
  stop() {
    this.isRunning = false;
    console.log("Stopping simulator...");
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      hitCounter: this.hitCounter,
      uniqueIps: this.usedIps.size,
      isRunning: this.isRunning,
    };
  }
}

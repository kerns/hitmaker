// config.js
// Configuration management with persistent storage

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CONFIG_DIR = join(homedir(), ".hitmaker");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  MIN_PER_MIN: 1,
  MAX_PER_MIN: 15,
  CONCURRENT: 1,
  TIMEOUT_MS: 15000,
  DEVICE_RATIO: 50, // 50 = 50% desktop, 50% mobile
  ACTIVE_MIN_MINUTES: 5,
  ACTIVE_MAX_MINUTES: 25,
  INACTIVITY_PROB: 0.5,
  INACTIVITY_MIN_MINUTES: 2,
  INACTIVITY_MAX_MINUTES: 45,
  UNIQUE_IP_PROB: 0.95,
  URL_PARAMS: [
    { key: "qr", value: "", probability: 5 }, // 5% chance, just adds ?qr
  ],
};

/**
 * Load saved configuration from disk
 */
export function loadConfig() {
  if (existsSync(CONFIG_FILE)) {
    try {
      const saved = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
      return { ...DEFAULT_CONFIG, ...saved };
    } catch (err) {
      console.warn("Failed to load config, using defaults:", err.message);
      return { ...DEFAULT_CONFIG };
    }
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Save configuration to disk
 */
export function saveConfig(config) {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (err) {
    console.error("Failed to save config:", err.message);
    return false;
  }
}

/**
 * Merge saved config with environment variables
 * Priority: env vars > saved config > defaults
 */
export function getConfig() {
  const saved = loadConfig();
  
  return {
    MIN_PER_MIN: Number(process.env.MIN_PER_MIN || saved.MIN_PER_MIN),
    MAX_PER_MIN: Number(process.env.MAX_PER_MIN || saved.MAX_PER_MIN),
    CONCURRENT: Number(process.env.CONCURRENT || saved.CONCURRENT),
    TIMEOUT_MS: Number(process.env.TIMEOUT_MS || saved.TIMEOUT_MS),
    DEVICE_RATIO: Number(process.env.DEVICE_RATIO || saved.DEVICE_RATIO),
    ACTIVE_MIN_MINUTES: Number(process.env.ACTIVE_MIN_MINUTES || saved.ACTIVE_MIN_MINUTES),
    ACTIVE_MAX_MINUTES: Number(process.env.ACTIVE_MAX_MINUTES || saved.ACTIVE_MAX_MINUTES),
    INACTIVITY_PROB: Number(process.env.INACTIVITY_PROB || saved.INACTIVITY_PROB),
    INACTIVITY_MIN_MINUTES: Number(process.env.INACTIVITY_MIN_MINUTES || saved.INACTIVITY_MIN_MINUTES),
    INACTIVITY_MAX_MINUTES: Number(process.env.INACTIVITY_MAX_MINUTES || saved.INACTIVITY_MAX_MINUTES),
    UNIQUE_IP_PROB: Number(process.env.UNIQUE_IP_PROB || saved.UNIQUE_IP_PROB),
    URL_PARAMS: saved.URL_PARAMS || DEFAULT_CONFIG.URL_PARAMS,
  };
}

/**
 * Config field definitions for the UI
 */
export const CONFIG_FIELDS = [
  {
    key: "MIN_PER_MIN",
    label: "Min Hits/Min",
    type: "number",
    min: 1,
    max: 1000,
    step: 1,
    format: (v) => v.toString(),
  },
  {
    key: "MAX_PER_MIN",
    label: "Max Hits/Min",
    type: "number",
    min: 1,
    max: 1000,
    step: 1,
    format: (v) => v.toString(),
  },
  {
    key: "CONCURRENT",
    label: "Concurrent Workers",
    type: "number",
    min: 1,
    max: 10,
    step: 1,
    format: (v) => v.toString(),
  },
  {
    key: "DEVICE_RATIO",
    label: "Desktop %",
    type: "slider",
    min: 0,
    max: 100,
    step: 5,
    format: (v) => `${v}% desktop / ${100 - v}% mobile`,
  },
  {
    key: "UNIQUE_IP_PROB",
    label: "Unique IP %",
    type: "slider",
    min: 0,
    max: 1,
    step: 0.05,
    format: (v) => `${(v * 100).toFixed(0)}%`,
  },
  {
    key: "TIMEOUT_MS",
    label: "Timeout (ms)",
    type: "number",
    min: 1000,
    max: 60000,
    step: 1000,
    format: (v) => `${v}ms`,
  },
  {
    key: "URL_PARAMS",
    label: "URL Parameters",
    type: "special",
    format: (v) => `${v.length} configured`,
  },
];


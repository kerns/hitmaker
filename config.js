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
  METHOD: "GET",
  TIMEOUT_MS: 15000,
  DEVICE_RATIO: 50, // 50 = 50% desktop, 50% mobile
  MIN_ACTIVE: 5,
  MAX_ACTIVE: 25,
  IDLE_ODDS: 0.5,
  MIN_IDLE: 2,
  MAX_IDLE: 45,
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
    METHOD: process.env.METHOD || saved.METHOD || DEFAULT_CONFIG.METHOD,
    TIMEOUT_MS: Number(process.env.TIMEOUT_MS || saved.TIMEOUT_MS),
    DEVICE_RATIO: Number(process.env.DEVICE_RATIO || saved.DEVICE_RATIO),
    MIN_ACTIVE: Number(process.env.MIN_ACTIVE || saved.MIN_ACTIVE),
    MAX_ACTIVE: Number(process.env.MAX_ACTIVE || saved.MAX_ACTIVE),
    IDLE_ODDS: Number(process.env.IDLE_ODDS || saved.IDLE_ODDS),
    MIN_IDLE: Number(process.env.MIN_IDLE || saved.MIN_IDLE),
    MAX_IDLE: Number(process.env.MAX_IDLE || saved.MAX_IDLE),
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
    key: "METHOD",
    label: "HTTP Method",
    type: "select",
    options: ["GET", "HEAD", "POST"],
    format: (v) => v,
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
  // Activity Pattern section
  {
    type: "separator",
    label: "Activity Pattern",
  },
  {
    key: "MIN_ACTIVE",
    label: "Minimum Active",
    type: "number",
    min: 1,
    max: 120,
    step: 1,
    format: (v) => `${v} min`,
  },
  {
    key: "MAX_ACTIVE",
    label: "Maximum Active",
    type: "number",
    min: 1,
    max: 120,
    step: 1,
    format: (v) => `${v} min`,
  },
  {
    key: "IDLE_ODDS",
    label: "Idle Chance",
    type: "slider",
    min: 0,
    max: 1,
    step: 0.05,
    format: (v) => `${(v * 100).toFixed(0)}%`,
  },
  {
    key: "MIN_IDLE",
    label: "Minimum Idle",
    type: "number",
    min: 1,
    max: 120,
    step: 1,
    format: (v) => `${v} min`,
  },
  {
    key: "MAX_IDLE",
    label: "Maximum Idle",
    type: "number",
    min: 1,
    max: 2880,
    step: 1,
    format: (v) => `${v} min`,
  },
];


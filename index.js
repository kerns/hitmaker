#!/usr/bin/env node
// index.js
// Hitmaker - A realistic web traffic simulator with beautiful terminal UI
// Spawns multiple instances of the simulator as child processes for multi-link testing

import { fork } from "child_process";
import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import logUpdate from "log-update";
import chalk from "chalk";
import readline from "readline";
import { getConfig, saveConfig, CONFIG_FIELDS } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the simulator worker
const WORKER_PATH = join(__dirname, "worker.js");

// Load config (saved settings + env vars)
let CONFIG = getConfig();

const UPDATE_INTERVAL = 500;
const STARTUP_DELAY = 1000; // 1 second between starting each process

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if a string is a valid URL
 */
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract a human-readable name from a URL
 */
function extractNameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    return pathParts[pathParts.length - 1] || parsed.hostname;
  } catch {
    return url.slice(0, 30);
  }
}

/**
 * Check if input looks like a URL
 */
function looksLikeUrl(input) {
  return (
    input.startsWith("http://") ||
    input.startsWith("https://") ||
    input.startsWith("localhost")
  );
}

/**
 * Parse a text file containing URLs (one per line)
 * Lines starting with # are treated as comments
 */
function parseTextFile(filePath) {
  if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
  const content = readFileSync(filePath, "utf-8");
  const links = [];
  for (const line of content.split("\n")) {
    const url = line.trim();
    if (!url || url.startsWith("#")) continue;
    if (isValidUrl(url)) links.push({ url, name: extractNameFromUrl(url) });
  }
  return links;
}

/**
 * Parse command line arguments into an array of links
 * Supports:
 * - Single URL
 * - Multiple URLs
 * - Text file paths
 */
function parseInput(args) {
  const links = [];
  for (const arg of args) {
    if (looksLikeUrl(arg)) {
      const url = arg.startsWith("localhost") ? `http://${arg}` : arg;
      if (isValidUrl(url)) links.push({ url, name: extractNameFromUrl(url) });
    } else if (existsSync(arg)) {
      links.push(...parseTextFile(arg));
    } else {
      console.error(`Warning: "${arg}" skipped (not a valid URL or file).`);
    }
  }
  return links;
}

/**
 * Pad a string to a specific width
 */
function pad(str, width) {
  const s = String(str);
  return s.length >= width
    ? s.slice(0, width)
    : s + " ".repeat(width - s.length);
}

// ============================================================================
// Process Management
// ============================================================================

/**
 * Spawn a worker process to simulate traffic for a single URL
 */
function spawnWorker(url, stats, onOutput) {
  const child = fork(WORKER_PATH, [url], {
    env: {
      ...process.env,
      MIN_PER_MIN: String(CONFIG.MIN_PER_MIN),
      MAX_PER_MIN: String(CONFIG.MAX_PER_MIN),
      CONCURRENT: String(CONFIG.CONCURRENT),
      METHOD: String(CONFIG.METHOD),
      TIMEOUT_MS: String(CONFIG.TIMEOUT_MS),
      DEVICE_RATIO: String(CONFIG.DEVICE_RATIO),
      MIN_ACTIVE: String(CONFIG.MIN_ACTIVE),
      MAX_ACTIVE: String(CONFIG.MAX_ACTIVE),
      IDLE_ODDS: String(CONFIG.IDLE_ODDS),
      MIN_IDLE: String(CONFIG.MIN_IDLE),
      MAX_IDLE: String(CONFIG.MAX_IDLE),
      UNIQUE_IP_PROB: String(CONFIG.UNIQUE_IP_PROB),
      URL_PARAMS: JSON.stringify(CONFIG.URL_PARAMS),
    },
    stdio: ["pipe", "pipe", "pipe", "ipc"],
    silent: true,
  });

  // Parse stdout for hit counting
  child.stdout.on("data", (data) => {
    const lines = data.toString().split("\n");
    for (const line of lines) {
      // Count successful hits (HTTP 200, 3xx redirects)
      if (
        line.includes(" 200 ") ||
        line.includes(" 301 ") ||
        line.includes(" 302 ") ||
        line.includes(" 307 ") ||
        line.includes(" 308 ")
      ) {
        stats.hits++;
        stats.lastHit = Date.now();
        stats.status = "active";
      }
      // Extract current rate from ACTIVE messages
      if (line.includes("ACTIVE")) {
        const rateMatch = line.match(/~(\d+)\/min/);
        if (rateMatch) stats.currentRate = parseInt(rateMatch[1]);
        stats.status = "active";
      }
      // Track idle phases
      if (line.includes("IDLE")) {
        stats.status = "idle";
        stats.currentRate = 0;
      }
      // Count errors
      if (line.includes("ERROR")) {
        stats.errors++;
      }
      onOutput(line);
    }
  });

  child.stderr.on("data", (data) => {
    stats.errors++;
    onOutput(data.toString());
  });

  child.on("exit", (code) => {
    stats.status = code === 0 ? "stopped" : "crashed";
  });

  return child;
}

// ============================================================================
// Terminal UI
// ============================================================================

/**
 * Status indicator styles
 */
const STATUS = {
  starting: { icon: "◌", color: chalk.blue },
  active: { icon: "●", color: chalk.green },
  idle: { icon: "○", color: chalk.gray },
  paused: { icon: "◐", color: chalk.yellow },
  stopped: { icon: "◼", color: chalk.gray },
  crashed: { icon: "✗", color: chalk.red },
};

/**
 * Render the interactive dashboard
 */
function renderDashboard(links, statsArray, processes, selectedIndex, logs) {
  const totalHits = statsArray.reduce((sum, s) => sum + s.hits, 0);
  const running = processes.filter((p) => p && !p.killed).length;
  const lines = [];

  // Space above dashboard
  lines.push("");

  // Header with summary stats
  lines.push(
    chalk.bgCyan.black.bold(" 💥 HITMAKER ") +
      chalk.gray(
        ` Running: ${running}/${links.length} │ Total Hits: ${totalHits}`,
      ),
  );

  // Table header
  lines.push("");
  lines.push(
    chalk.gray("    ") +
      chalk.gray(pad("NAME", 18)) +
      chalk.gray(pad("HITS", 8)) +
      chalk.gray(pad("RATE", 10)) +
      chalk.gray(pad("ERRORS", 8)) +
      chalk.gray("URL"),
  );
  lines.push(chalk.gray("─".repeat(79)));

  // Calculate visible range (with scrolling support)
  const terminalRows = process.stdout.rows || 24;
  const maxVisible = Math.min(links.length, Math.max(5, terminalRows - 16));
  const startIdx = Math.max(
    0,
    Math.min(
      selectedIndex - Math.floor(maxVisible / 2),
      links.length - maxVisible,
    ),
  );

  // Render each link row
  for (let i = startIdx; i < startIdx + maxVisible && i < links.length; i++) {
    const link = links[i];
    const stat = statsArray[i];
    const isSelected = i === selectedIndex;
    const status = STATUS[stat.status] || STATUS.starting;

    const selector = isSelected ? chalk.cyan("▸ ") : "  ";
    const statusIcon = status.color(status.icon + " ");
    const name = isSelected
      ? chalk.white(pad(link.name.slice(0, 16), 18))
      : chalk.gray(pad(link.name.slice(0, 16), 18));
    const hits = chalk.yellow(pad(stat.hits, 8));
    const rate = stat.currentRate
      ? chalk.green(pad(`${stat.currentRate}/min`, 10))
      : chalk.gray(pad("-", 10));
    const errors =
      stat.errors > 0
        ? chalk.red(pad(stat.errors, 8))
        : chalk.gray(pad("0", 8));
    const url = chalk.blue(link.url.slice(0, 30));

    lines.push(selector + statusIcon + name + hits + rate + errors + url);
  }

  // Show scroll indicator if there are more links
  if (links.length > maxVisible) {
    lines.push(
      chalk.gray(`  ... ${links.length - maxVisible} more (↑/↓ to scroll)`),
    );
  }

  // Recent output logs
  lines.push("");
  lines.push(chalk.gray("─".repeat(79)));
  lines.push(chalk.gray.bold(" Recent Output"));
  const recentLogs = logs.slice(-3);
  for (const log of recentLogs) {
    lines.push(chalk.gray(`  ${log.slice(0, 75)}`));
  }

  // Keyboard shortcuts help
  lines.push("");
  lines.push("  " + chalk.white("↑/↓") + chalk.gray(" Navigate │ ") + chalk.white("K") + chalk.gray(" Kill/Restart │ ") + chalk.white("C") + chalk.gray(" Config │ ") + chalk.white("Q") + chalk.gray(" Quit"));

  return lines.join("\n");
}

/**
 * Render the configuration modal
 */
function renderConfigModal(config, selectedField, isEditing, textInput) {
  const lines = [];
  const width = 60;

  // Title
  lines.push("");
  lines.push(chalk.bgYellow.black.bold(" ⚙️  Configuration ".padEnd(width)));
  lines.push("");

  // Config fields
  CONFIG_FIELDS.forEach((field, index) => {
    // Handle separator (section header)
    if (field.type === "separator") {
      lines.push("");
      lines.push(chalk.yellow.bold(`  ── ${field.label} ──`));
      return;
    }

    const isSelected = index === selectedField;
    const value = config[field.key];
    const formattedValue = field.format(value);

    const prefix = isSelected ? chalk.cyan("▸ ") : "  ";
    const label = isSelected
      ? chalk.white(field.label.padEnd(20))
      : chalk.gray(field.label.padEnd(20));

    let valueDisplay;
    if (isSelected && isEditing) {
      if (field.type === "number") {
        // Text input for numbers - show current value as hint
        const hint = textInput || `(current: ${value})`;
        valueDisplay = chalk.bgWhite.black(` ${hint}_ `);
      } else if (field.type === "select") {
        // Show current selection with arrows
        valueDisplay = chalk.bgWhite.black(` ◀ ${formattedValue} ▶ `);
      } else {
        // Slider for non-number fields
        valueDisplay = chalk.bgWhite.black(` ${formattedValue} `);
      }
    } else if (isSelected) {
      valueDisplay = chalk.cyan(`[ ${formattedValue} ]`);
    } else {
      valueDisplay = chalk.gray(formattedValue);
    }

    lines.push(prefix + label + " " + valueDisplay);
  });

  // Instructions
  lines.push("");
  lines.push(chalk.gray("─".repeat(width)));
  if (isEditing) {
    const field = CONFIG_FIELDS[selectedField];
    if (field.type === "number") {
      lines.push("  " + chalk.gray("Type number") + "  " + chalk.white("Enter") + chalk.gray(" Save") + "  " + chalk.white("Esc") + chalk.gray(" Cancel"));
    } else if (field.type === "special") {
      lines.push("  " + chalk.white("Enter") + chalk.gray(" to manage") + "  " + chalk.white("Esc") + chalk.gray(" Cancel"));
    } else {
      lines.push("  " + chalk.white("◀/▶") + chalk.gray(" Adjust") + "  " + chalk.white("Enter") + chalk.gray(" Save") + "  " + chalk.white("Esc") + chalk.gray(" Cancel"));
    }
  } else {
    lines.push(
      "  " + chalk.white("↑/↓") + chalk.gray(" Navigate") + "  " + chalk.white("Enter") + chalk.gray(" Edit") + "  " + chalk.white("S") + chalk.gray(" Save & Apply") + "  " + chalk.white("Esc") + chalk.gray(" Cancel"),
    );
  }
  lines.push("");

  return lines.join("\n");
}

/**
 * Render the URL parameters editor
 */
function renderURLParamsEditor(
  params,
  selectedParam,
  editMode,
  editField,
  editValue,
) {
  const lines = [];
  const width = 70;

  // Title
  lines.push("");
  lines.push(chalk.bgCyan.black.bold(" 🔗 URL Parameters ".padEnd(width)));
  lines.push("");

  if (params.length === 0) {
    lines.push(chalk.gray("  No parameters configured"));
    lines.push("");
  } else {
    // Header
    lines.push(
      chalk.gray("    ") +
        chalk.gray("KEY".padEnd(20)) +
        chalk.gray("VALUE".padEnd(25)) +
        chalk.gray("PROB"),
    );
    lines.push(chalk.gray("─".repeat(width)));

    // Parameters
    params.forEach((param, index) => {
      const isSelected = index === selectedParam;
      const prefix = isSelected ? chalk.cyan("▸ ") : "  ";

      let keyDisplay, valueDisplay, probDisplay;

      if (isSelected && editMode) {
        keyDisplay =
          editField === "key"
            ? chalk.bgWhite.black(` ${editValue}_ `.padEnd(20))
            : chalk.white(param.key.padEnd(20));
        valueDisplay =
          editField === "value"
            ? chalk.bgWhite.black(` ${editValue}_ `.padEnd(25))
            : chalk.white((param.value || "(none)").padEnd(25));
        probDisplay =
          editField === "probability"
            ? chalk.bgWhite.black(` ${editValue}%_ `)
            : chalk.white(`${param.probability}%`);
      } else if (isSelected) {
        keyDisplay = chalk.cyan(param.key.padEnd(20));
        valueDisplay = chalk.cyan((param.value || "(none)").padEnd(25));
        probDisplay = chalk.cyan(`${param.probability}%`);
      } else {
        keyDisplay = chalk.gray(param.key.padEnd(20));
        valueDisplay = chalk.gray((param.value || "(none)").padEnd(25));
        probDisplay = chalk.gray(`${param.probability}%`);
      }

      lines.push(prefix + keyDisplay + valueDisplay + probDisplay);
    });
  }

  // Instructions
  lines.push("");
  lines.push(chalk.gray("─".repeat(width)));
  if (editMode) {
    lines.push(
      "  " + chalk.gray("Type value") + "  " + chalk.white("Tab") + chalk.gray(" Next field") + "  " + chalk.white("Enter") + chalk.gray(" Save") + "  " + chalk.white("Esc") + chalk.gray(" Cancel"),
    );
  } else {
    lines.push(
      "  " + chalk.white("↑/↓") + chalk.gray(" Navigate") + "  " + chalk.white("Enter") + chalk.gray(" Edit") + "  " + chalk.white("+") + chalk.gray(" Add") + "  " + chalk.white("-") + chalk.gray(" Delete") + "  " + chalk.white("Esc") + chalk.gray(" Back"),
    );
  }
  lines.push("");

  return lines.join("\n");
}

// ============================================================================
// Interactive Mode
// ============================================================================

/**
 * Run the interactive multi-link simulator
 */
async function runInteractive(links) {
  console.log(
    chalk.cyan(`💥 Starting Hitmaker with ${links.length} link(s)...`),
  );

  if (!existsSync(WORKER_PATH)) {
    console.error(chalk.red(`Error: worker.js not found at ${WORKER_PATH}`));
    process.exit(1);
  }

  // Initialize stats for each link
  const statsArray = links.map(() => ({
    hits: 0,
    errors: 0,
    status: "starting",
    currentRate: 0,
    lastHit: null,
  }));

  const processes = [];
  const logs = [];
  let selectedIndex = 0;

  // Config modal state
  let showConfigModal = false;
  let configModalSelectedField = 0;
  let configModalIsEditing = false;
  let configModalTextInput = "";
  let configModalDraft = { ...CONFIG };

  // URL params editor state
  let showURLParamsEditor = false;
  let urlParamsSelectedIndex = 0;
  let urlParamsEditMode = false;
  let urlParamsEditField = "key"; // "key", "value", "probability"
  let urlParamsEditValue = "";

  const addLog = (line) => {
    if (line.trim()) {
      logs.push(line.trim());
      if (logs.length > 50) logs.shift();
    }
  };

  // Stagger process startup to avoid overwhelming the target
  for (let i = 0; i < links.length; i++) {
    await new Promise((r) => setTimeout(r, STARTUP_DELAY));
    const child = spawnWorker(links[i].url, statsArray[i], addLog);
    processes.push(child);
    addLog(`[${links[i].name}] Process started (PID: ${child.pid})`);
  }

  // Render function - call this whenever state changes
  const render = () => {
    if (showURLParamsEditor) {
      logUpdate(
        renderURLParamsEditor(
          configModalDraft.URL_PARAMS,
          urlParamsSelectedIndex,
          urlParamsEditMode,
          urlParamsEditField,
          urlParamsEditValue,
        ),
      );
    } else if (showConfigModal) {
      logUpdate(
        renderConfigModal(
          configModalDraft,
          configModalSelectedField,
          configModalIsEditing,
          configModalTextInput,
        ),
      );
    } else {
      logUpdate(
        renderDashboard(links, statsArray, processes, selectedIndex, logs),
      );
    }
  };

  // Setup keyboard input handling
  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);

    process.stdin.on("keypress", (str, key) => {
      // URL params editor is open
      if (showURLParamsEditor) {
        if (key.name === "escape") {
          if (urlParamsEditMode) {
            urlParamsEditMode = false;
            urlParamsEditValue = "";
          } else {
            showURLParamsEditor = false;
            showConfigModal = true;
          }
          render();
          return;
        }

        if (urlParamsEditMode) {
          // Editing a URL param field
          if (key.name === "tab") {
            // Move to next field
            const fields = ["key", "value", "probability"];
            const currentIdx = fields.indexOf(urlParamsEditField);
            urlParamsEditField = fields[(currentIdx + 1) % fields.length];
            urlParamsEditValue = "";
          } else if (key.name === "return") {
            // Save the param
            const param = configModalDraft.URL_PARAMS[urlParamsSelectedIndex];
            if (urlParamsEditField === "key") {
              param.key = urlParamsEditValue || param.key;
            } else if (urlParamsEditField === "value") {
              param.value = urlParamsEditValue;
            } else if (urlParamsEditField === "probability") {
              const prob = parseInt(urlParamsEditValue);
              if (!isNaN(prob))
                param.probability = Math.max(0, Math.min(100, prob));
            }
            urlParamsEditMode = false;
            urlParamsEditValue = "";
          } else if (key.name === "backspace") {
            urlParamsEditValue = urlParamsEditValue.slice(0, -1);
          } else if (str && str.length === 1 && !key.ctrl && !key.meta) {
            urlParamsEditValue += str;
          }
          render();
        } else {
          // Navigating URL params
          if (key.name === "up") {
            urlParamsSelectedIndex = Math.max(0, urlParamsSelectedIndex - 1);
          } else if (key.name === "down") {
            urlParamsSelectedIndex = Math.min(
              configModalDraft.URL_PARAMS.length - 1,
              urlParamsSelectedIndex + 1,
            );
          } else if (key.name === "return") {
            if (configModalDraft.URL_PARAMS.length > 0) {
              urlParamsEditMode = true;
              urlParamsEditField = "key";
              urlParamsEditValue = "";
            }
          } else if (str === "+" || str === "=") {
            // Add new param
            configModalDraft.URL_PARAMS.push({
              key: "param",
              value: "",
              probability: 10,
            });
            urlParamsSelectedIndex = configModalDraft.URL_PARAMS.length - 1;
          } else if (str === "-" && configModalDraft.URL_PARAMS.length > 0) {
            // Delete selected param
            configModalDraft.URL_PARAMS.splice(urlParamsSelectedIndex, 1);
            urlParamsSelectedIndex = Math.min(
              urlParamsSelectedIndex,
              configModalDraft.URL_PARAMS.length - 1,
            );
          }
          render();
        }
        return;
      }

      // Config modal is open
      if (showConfigModal) {
        if (configModalIsEditing) {
          // Editing a value
          const field = CONFIG_FIELDS[configModalSelectedField];

          if (field.type === "special" && field.key === "URL_PARAMS") {
            // Open URL params editor
            showURLParamsEditor = true;
            showConfigModal = false;
            urlParamsSelectedIndex = 0;
            urlParamsEditMode = false;
            configModalIsEditing = false;
            render();
            return;
          }

          if (field.type === "number") {
            // Text input mode
            if (key.name === "return") {
              const num = parseInt(configModalTextInput);
              if (!isNaN(num)) {
                configModalDraft[field.key] = Math.max(
                  field.min,
                  Math.min(field.max, num),
                );
              }
              configModalIsEditing = false;
              configModalTextInput = "";
            } else if (key.name === "escape") {
              configModalIsEditing = false;
              configModalTextInput = "";
            } else if (key.name === "backspace") {
              configModalTextInput = configModalTextInput.slice(0, -1);
            } else if (str && str.length === 1 && str >= "0" && str <= "9") {
              configModalTextInput += str;
            }
            render();
          } else if (field.type === "select") {
            // Select mode - cycle through options
            const options = field.options;
            const currentIndex = options.indexOf(configModalDraft[field.key]);
            if (key.name === "left") {
              const newIndex = (currentIndex - 1 + options.length) % options.length;
              configModalDraft[field.key] = options[newIndex];
            } else if (key.name === "right") {
              const newIndex = (currentIndex + 1) % options.length;
              configModalDraft[field.key] = options[newIndex];
            } else if (key.name === "return") {
              configModalIsEditing = false;
            } else if (key.name === "escape") {
              configModalIsEditing = false;
              configModalDraft[field.key] = CONFIG[field.key]; // Revert
            }
            render();
          } else {
            // Slider mode
            if (key.name === "left") {
              configModalDraft[field.key] = Math.max(
                field.min,
                configModalDraft[field.key] - field.step,
              );
            } else if (key.name === "right") {
              configModalDraft[field.key] = Math.min(
                field.max,
                configModalDraft[field.key] + field.step,
              );
            } else if (key.name === "return") {
              configModalIsEditing = false;
            } else if (key.name === "escape") {
              configModalIsEditing = false;
              configModalDraft[field.key] = CONFIG[field.key]; // Revert
            }
            render();
          }
        } else {
          // Navigating fields
          if (key.name === "up") {
            let newIndex = configModalSelectedField - 1;
            // Skip separator fields
            while (newIndex >= 0 && CONFIG_FIELDS[newIndex].type === "separator") {
              newIndex--;
            }
            if (newIndex >= 0) {
              configModalSelectedField = newIndex;
            }
          } else if (key.name === "down") {
            let newIndex = configModalSelectedField + 1;
            // Skip separator fields
            while (newIndex < CONFIG_FIELDS.length && CONFIG_FIELDS[newIndex].type === "separator") {
              newIndex++;
            }
            if (newIndex < CONFIG_FIELDS.length) {
              configModalSelectedField = newIndex;
            }
          } else if (key.name === "return") {
            const field = CONFIG_FIELDS[configModalSelectedField];
            if (field.type !== "separator") {
              configModalIsEditing = true;
              if (field.type === "number") {
                configModalTextInput = ""; // Start with empty field
              }
            }
          } else if (key.name === "s") {
            // Save and apply
            CONFIG = { ...configModalDraft };
            if (saveConfig(CONFIG)) {
              addLog("✓ Configuration saved");
              // Restart all processes with new config
              processes.forEach((p, i) => {
                if (p && !p.killed) {
                  p.kill();
                  setTimeout(() => {
                    const child = spawnWorker(
                      links[i].url,
                      statsArray[i],
                      addLog,
                    );
                    processes[i] = child;
                    statsArray[i].status = "starting";
                  }, 500);
                }
              });
            }
            showConfigModal = false;
            configModalIsEditing = false;
          } else if (key.name === "escape") {
            // Close config modal
            showConfigModal = false;
            configModalIsEditing = false;
            configModalTextInput = "";
            configModalDraft = { ...CONFIG };
          }
          render();
        }
        return;
      }

      // Normal mode (not in config)
      // Quit
      if (key.name === "q" || (key.ctrl && key.name === "c")) {
        logUpdate.clear();
        console.log(chalk.yellow("🛑 Shutting down all processes..."));
        processes.forEach((p) => p && p.kill());
        console.log("\n📊 All The Hits:");
        console.log("");
        links.forEach((link, i) => {
          const name = pad(link.name, 20);
          const hits = pad(`Hits: ${statsArray[i].hits}`, 15);
          const errors = `Errors: ${statsArray[i].errors}`;
          console.log(`  ${name}${hits}${errors}`);
        });
        process.exit(0);
      }

      // Open config modal
      if (key.name === "c") {
        showConfigModal = true;
        configModalSelectedField = 0;
        configModalIsEditing = false;
        configModalDraft = { ...CONFIG };
        render();
        return;
      }

      // Navigation
      if (key.name === "up") selectedIndex = Math.max(0, selectedIndex - 1);
      if (key.name === "down")
        selectedIndex = Math.min(links.length - 1, selectedIndex + 1);

      // Kill/Restart selected process
      if (key.name === "k") {
        const p = processes[selectedIndex];
        if (p && !p.killed) {
          p.kill();
          statsArray[selectedIndex].status = "stopped";
          addLog(`[${links[selectedIndex].name}] Killed`);
        } else {
          // Restart
          const child = spawnWorker(
            links[selectedIndex].url,
            statsArray[selectedIndex],
            addLog,
          );
          processes[selectedIndex] = child;
          statsArray[selectedIndex].status = "starting";
          statsArray[selectedIndex].hits = 0;
          statsArray[selectedIndex].errors = 0;
          addLog(
            `[${links[selectedIndex].name}] Restarted (PID: ${child.pid})`,
          );
        }
      }

      // Render after any navigation or action
      render();
    });
  }

  // Initial render
  render();

  // Stats update loop - only update dashboard when not in config/editing
  setInterval(() => {
    if (!showConfigModal && !showURLParamsEditor) {
      render();
    }
  }, 1000); // Update stats every second when viewing dashboard
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  // Show help if no arguments
  if (args.length === 0) {
    console.log(chalk.cyan.bold("\n💥 Hitmaker – Making the hits!\n"));
    console.log(chalk.white("Usage:"));
    console.log(chalk.gray("  hitmaker <url>                    # Single URL"));
    console.log(
      chalk.gray("  hitmaker <url1> <url2> ...        # Multiple URLs"),
    );
    console.log(
      chalk.gray("  hitmaker <file.txt>               # Text file with URLs"),
    );
    console.log(
      chalk.gray("  hitmaker <url> <file.txt> <url2>  # Mix and match\n"),
    );

    console.log(chalk.white("Text File Format:"));
    console.log(chalk.gray("  One URL per line, # for comments\n"));

    console.log(chalk.white("Configuration:"));
    console.log(
      chalk.gray("  Press C while running to open interactive config"),
    );
    console.log(
      chalk.gray(
        "  Configure: traffic rate, device ratio, URL params, and more",
      ),
    );
    console.log(
      chalk.gray(
        "  Settings persist between sessions in ~/.hitmaker/config.json\n",
      ),
    );

    console.log(chalk.white("Examples:"));
    console.log(chalk.gray("  hitmaker https://example.com/link"));
    console.log(chalk.gray("  hitmaker links.txt"));
    console.log(
      chalk.gray("  MIN_PER_MIN=10 MAX_PER_MIN=50 hitmaker links.txt\n"),
    );

    console.log(chalk.white("Keyboard Controls:"));
    console.log("  " + chalk.white("↑/↓") + chalk.gray("  Navigate between links"));
    console.log("  " + chalk.white("K") + chalk.gray("    Kill/Restart selected process"));
    console.log("  " + chalk.white("C") + chalk.gray("    Open configuration"));
    console.log("  " + chalk.white("Q") + chalk.gray("    Quit all processes\n"));

    process.exit(0);
  }

  // Parse input arguments
  const links = parseInput(args);
  if (links.length === 0) {
    console.error(chalk.red("❌ No valid links found.\n"));
    console.log(chalk.gray("Make sure URLs are valid or files exist."));
    process.exit(1);
  }

  console.log(chalk.green(`\n🔍 Found ${links.length} link(s) to simulate`));

  // Start interactive mode
  await runInteractive(links);
}

main();
